# libbitcoinpqc-bindings development tasks.
# Run `just` to list recipes.
#
# Hermetic here means: declared inputs drive rebuilds (Cargo rerun-if-changed,
# CMake cache FORCE pins, pinned submodule tags) — not deleting artifacts until
# things work. `just test` trusts those mechanisms. GitHub Actions still scrubs
# a few rust-cache paths before Rust jobs; that's a cache-restore workaround,
# not part of the local build model.
#
# Full hermetic gate (Nix): `just hermetic` or `nix flake check -L` — composes
# libbitcoinpqc's flake (C ctest, pins, …) plus Rust/fuzz/vector checks.

set shell := ["bash", "-euo", "pipefail", "-c"]

emsdk_version := "6.0.2"
emsdk_home := env_var_or_default("EMSDK", env_var("HOME") + "/emsdk")

nix := "nix --option warn-dirty false"

default:
    @just --list

# ── Nix (hermetic) ───────────────────────────────────────────────────────────

# Composed flake gate: upstream libbitcoinpqc checks + bindings Rust/fuzz/vectors.
hermetic:
    {{nix}} flake check -L

# Enter dev shell (prebuilt C lib from flake; cargo uses LIBBITCOINPQC_PREFIX).
shell:
    {{nix}} develop

# ── Test suites ──────────────────────────────────────────────────────────────

# All bindings test suites (no git gates; safe with uncommitted WIP).
test: submodule-check rust c-lib python nodejs wasm
    @echo ""
    @echo "=== all tests passed ==="

# Like `test`, plus Emscripten (needs emsdk at ~/emsdk or $EMSDK).
test-all: test emscripten
    @echo ""
    @echo "=== all tests (incl. emscripten) passed ==="

# Full CI gate before merge/push.
ci: submodule-check vectors-in-sync no-skipped-tests test-all
    @echo ""
    @echo "=== CI gate passed ==="

check: ci

# ── Preconditions ────────────────────────────────────────────────────────────

submodule-check:
    #!/usr/bin/env bash
    set -euo pipefail
    test -f libbitcoinpqc/CMakeLists.txt || {
      echo "libbitcoinpqc submodule not initialized." >&2
      echo "Run: git submodule update --init --recursive" >&2
      exit 1
    }

# ── CI gates ─────────────────────────────────────────────────────────────────

vectors-in-sync:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "=== golden vectors in sync ==="
    # Match Makefile: C headers go to standalone upstream when present (local dev).
    if [ -d "$HOME/Projects/surmount/libbitcoinpqc/.git" ]; then
      export LIBBITCOINPQC_SRC="$HOME/Projects/surmount/libbitcoinpqc"
      c_lib_repo="$LIBBITCOINPQC_SRC"
    else
      c_lib_repo="libbitcoinpqc"
    fi
    make sync-vectors
    bindings_paths=(
      tests/vectors
      python/tests/slh_dsa_sha2_golden_vectors.py
      python/tests/ml_dsa_44_golden_vectors.py
      python/tests/secp256k1_bip340_golden_vectors.py
      nodejs/tests/slh_dsa_sha2_golden_vectors.js
      nodejs/tests/slh_dsa_sha2_golden_vectors.d.ts
      nodejs/tests/ml_dsa_44_golden_vectors.js
      nodejs/tests/ml_dsa_44_golden_vectors.d.ts
      nodejs/tests/secp256k1_bip340_golden_vectors.js
      nodejs/tests/secp256k1_bip340_golden_vectors.d.ts
      wasm/test/slh_dsa_sha2_golden_vectors.js
      wasm/test/ml_dsa_44_golden_vectors.js
      wasm/test/secp256k1_bip340_golden_vectors.js
    )
    git diff --exit-code -- "${bindings_paths[@]}"
    git -C "$c_lib_repo" diff --exit-code -- tests/vectors

no-skipped-tests:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "=== no skipped/ignored tests in E2E trees ==="
    if ! command -v rg >/dev/null 2>&1; then
      echo "ripgrep (rg) required for this gate" >&2
      exit 1
    fi
    set +e
    rg '#\[ignore|it\.skip|describe\.skip|test\.skip|@unittest\.skip|@pytest\.mark\.skip' \
      tests/ python/tests nodejs/tests wasm/test
    code=$?
    set -e
    case "$code" in
      0)
        echo "Skipped/ignored tests found in E2E trees" >&2
        exit 1
        ;;
      1)
        echo "gate passed: no skipped/ignored tests"
        ;;
      *)
        echo "ripgrep failed with exit code $code" >&2
        exit "$code"
        ;;
    esac

# ── Rust ─────────────────────────────────────────────────────────────────────

rust: rust-lint rust-test fuzz-check

rust-lint:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "=== rust fmt ==="
    cargo fmt -- --check
    echo "=== rust clippy ==="
    cargo clippy -- -D warnings

rust-test:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "=== rust tests (single-threaded) ==="
    cargo test -- --test-threads=1
    echo "=== rust serde tests (single-threaded) ==="
    cargo test --features serde -- --test-threads=1

fuzz-check:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "=== fuzz workspace check ==="
    (cd fuzz && cargo check)

# ── C library ────────────────────────────────────────────────────────────────

c-lib:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "=== C library ctest (golden vectors) ==="
    make c-lib-test

# ── Python ───────────────────────────────────────────────────────────────────

python:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "=== build C library for Python tests ==="
    make c-lib
    echo "=== python unittest ==="
    cd python && python3 -m unittest discover -s tests -v

# ── Node.js ──────────────────────────────────────────────────────────────────

nodejs:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "=== nodejs build + jest ==="
    cd nodejs
    npm ci --ignore-scripts
    npm run build
    npm test

# ── WebAssembly ──────────────────────────────────────────────────────────────

wasm:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "=== wasm32 check ==="
    cargo check --target wasm32-unknown-unknown
    echo "=== wasm-pack integration tests ==="
    make wasm-test

emscripten:
    #!/usr/bin/env bash
    set -euo pipefail
    emsdk_env="{{emsdk_home}}/emsdk_env.sh"
    if [ ! -f "$emsdk_env" ]; then
      echo "Emscripten SDK not found at {{emsdk_home}}" >&2
      echo "Install with:" >&2
      echo "  git clone https://github.com/emscripten-core/emsdk.git {{emsdk_home}}" >&2
      echo "  cd {{emsdk_home}} && ./emsdk install {{emsdk_version}} && ./emsdk activate {{emsdk_version}}" >&2
      exit 1
    fi
    echo "=== emscripten wasm build + tests ==="
    # shellcheck disable=SC1090
    source "$emsdk_env"
    cd wasm
    npm ci
    npm run build
    npm test

# ── Quick subsets ────────────────────────────────────────────────────────────

# Rust integration tests only (skip bindings / wasm / emscripten).
test-rust: submodule-check rust