# libbitcoinpqc-bindings development tasks.
# Run `just` to list recipes.
#
# Hermetic here means: declared inputs drive rebuilds (Cargo rerun-if-changed,
# CMake cache FORCE pins, pinned submodule tags) — not deleting artifacts until
# things work. `just test` trusts those mechanisms.
#
# `just ci` mirrors every blocking GitHub Actions job on this host (see
# .github/workflows/ci.yml): vectors-in-sync, no-skipped-tests, Rust fmt/clippy/
# build/tests/fuzz-check, c-lib-test, python-test, nodejs-test, wasm-test,
# emscripten-wasm-test. It also scrubs rust-cache cmake artifacts like CI.
# vectors-in-sync checks only golden-vector paths (CI uses a clean tree).
# Not replicated locally: macOS matrix legs (build-matrix, python-test,
# nodejs-test), and the main-branch benchmark job (continue-on-error).
#
# Full hermetic gate (Nix): `just hermetic` or `nix flake check -L` — composes
# libbitcoinpqc's flake (C ctest, pins, …) plus Rust/fuzz/vector checks.

set shell := ["bash", "-euo", "pipefail", "-c"]

nix := "nix --option warn-dirty false"

default:
    @just --list

# ── Nix (hermetic) ───────────────────────────────────────────────────────────

# Composed flake gate: upstream C lib, Rust/fmt/clippy/tests, fuzz, bench,
# vectors, python, nodejs, wasm, and wasm-pack checks.
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

# Like `test`, plus Emscripten (requires `emcc` on PATH).
test-all: test emscripten
    @echo ""
    @echo "=== all tests (incl. emscripten) passed ==="

# Full CI gate before merge/push (mirrors .github/workflows/ci.yml on this host).
ci: submodule-check vectors-in-sync no-skipped-tests ci-rust c-lib python nodejs wasm emscripten
    @echo ""
    @echo "=== CI gate passed ==="

check: ci

# Main-branch benchmark job (informational in CI; optional locally).
ci-benchmark: submodule-check rust-cache-scrub
    #!/usr/bin/env bash
    set -euo pipefail
    echo "=== rust benchmarks (informational) ==="
    CI=true cargo bench --features bench -- --noplot

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
    # CI has no standalone upstream checkout; always sync C headers into the submodule.
    # (make sync-vectors prefers a local standalone upstream when present.)
    export LIBBITCOINPQC_SRC="$(pwd)/libbitcoinpqc"
    python3 scripts/sync-golden-vectors.py
    # Algorithm golden artifacts only (P2MR JSON under tests/vectors/p2mr is hand-maintained).
    bindings_paths=(
      tests/vectors/fixtures
      tests/vectors/rust
      tests/vectors/python
      tests/vectors/nodejs
      tests/vectors/wasm
    )
    c_vectors="tests/vectors"
    # CI uses a clean checkout (full-tree git diff). Locally, scope to vector
    # artifacts so unrelated WIP does not fail this gate.
    # After regenerate: no unstaged content drift, and no untracked files under
    # algorithm vector paths (staged adds/modifies are OK while preparing a commit).
    git diff --exit-code -- "${bindings_paths[@]}"
    untracked=$(git status --porcelain -- "${bindings_paths[@]}" | grep '^??' || true)
    test -z "$untracked"
    git -C libbitcoinpqc diff --exit-code -- "$c_vectors"
    sub_untracked=$(git -C libbitcoinpqc status --porcelain -- "$c_vectors" | grep '^??' || true)
    test -z "$sub_untracked"

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

# Rust checks without rust-cache scrub (faster local iteration).
rust: rust-lint rust-build rust-test fuzz-check

# Rust job as CI runs it (scrub + fmt + clippy + build + tests + fuzz check).
ci-rust: rust-cache-scrub rust-lint rust-build rust-test fuzz-check

# rust-cache can restore cmake build-script trees whose internal state no longer
# matches libbitcoinpqc/; scrub before compile (CI does this before Rust/wasm jobs).
rust-cache-scrub:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "=== scrub stale cmake artifacts from rust-cache ==="
    rm -rf target/*/build/bitcoinpqc-*
    rm -f target/*/deps/libbitcoinpqc*
    rm -f target/*/deps/algorithm_tests-*
    rm -f target/*/deps/serialization_tests-*

# Nightly libFuzzer smoke on all five targets (2s each). Requires: rustup nightly, cargo-fuzz.
fuzz-smoke:
    #!/usr/bin/env bash
    set -euo pipefail
    if ! rustc +nightly --version >/dev/null 2>&1; then
      echo "cargo-fuzz requires a nightly Rust toolchain." >&2
      echo "Install with: rustup toolchain install nightly" >&2
      exit 1
    fi
    if ! command -v cargo-fuzz >/dev/null 2>&1; then
      echo "cargo-fuzz not found." >&2
      echo "Install with: cargo install cargo-fuzz" >&2
      exit 1
    fi
    targets=(keypair_generation sign_verify cross_algorithm key_parsing signature_parsing)
    for target in "${targets[@]}"; do
      echo "=== fuzz smoke: $target ==="
      cargo +nightly fuzz run "$target" -- -max_total_time=2
    done

rust-lint:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "=== rust fmt ==="
    cargo fmt -- --check
    echo "=== rust clippy ==="
    cargo clippy -- -D warnings

rust-build:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "=== rust build ==="
    cargo build --verbose

rust-test:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "=== rust tests (single-threaded) ==="
    cargo test --verbose -- --test-threads=1
    echo "=== rust serde tests (single-threaded) ==="
    cargo test --features serde --verbose -- --test-threads=1

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

# Emscripten package build/tests. Expects `emcc` on PATH (system package, nix, etc.).
# No emsdk activation or version pin — use whatever Emscripten you have installed.
emscripten:
    #!/usr/bin/env bash
    set -euo pipefail
    # Arch: emcc lives in /usr/lib/emscripten (not always on fish/npm PATH).
    if ! command -v emcc >/dev/null 2>&1 && [ -x /usr/lib/emscripten/emcc ]; then
      export PATH="/usr/lib/emscripten:${PATH}"
    fi
    if ! command -v emcc >/dev/null 2>&1; then
      echo "emcc not found on PATH." >&2
      echo "Install Emscripten so emcc is available (distro package, nix, etc.)." >&2
      echo "  e.g. pacman -S emscripten && fish_add_path /usr/lib/emscripten" >&2
      exit 1
    fi
    echo "=== emscripten wasm build + tests ==="
    emcc --version | head -1
    cd wasm
    npm ci
    npm run build
    npm test

# ── Quick subsets ────────────────────────────────────────────────────────────

# Rust integration tests only (skip bindings / wasm / emscripten).
test-rust: submodule-check rust