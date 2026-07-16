{
  description = "libbitcoinpqc-bindings — Rust/Python/Node/WASM bindings for libbitcoinpqc";

  inputs = {
    # Compose the C library flake. Rev must match the libbitcoinpqc submodule
    # gitlink (git submodule status libbitcoinpqc); flake.lock pins for CI.
    libbitcoinpqc.url = "github:cryptoquick/libbitcoinpqc/053e954534b13c1dbdc8ef4f9ae4d93bb301bab6";

    # Share the upstream toolchain pins.
    nixpkgs.follows = "libbitcoinpqc/nixpkgs";
    flake-parts.follows = "libbitcoinpqc/flake-parts";
    systems.follows = "libbitcoinpqc/systems";
  };

  outputs = inputs @ {
    self,
    libbitcoinpqc,
    nixpkgs,
    flake-parts,
    systems,
    ...
  }:
    flake-parts.lib.mkFlake {inherit inputs;} {
      systems = import systems;

      perSystem = {
        config,
        pkgs,
        system,
        ...
      }: let
        inherit (pkgs) lib;

        libbitcoinpqcDrv = libbitcoinpqc.packages.${system}.libbitcoinpqc;
        upstreamChecks = libbitcoinpqc.checks.${system};

        # builtins.path (not cleanSource) so checked-out submodule files are visible
        # to Nix even though git ls-files only records the gitlink.
        src = builtins.path {
          path = ./.;
          name = "libbitcoinpqc-bindings";
          filter = path: type: let
            base = baseNameOf path;
          in
            !(base == "build" && type == "directory")
            && !(base == "target" && type == "directory")
            && !(base == "result" || lib.hasPrefix "result-" base)
            && !(base == "node_modules" && type == "directory")
            && !(base == ".git" && type == "directory");
        };

        rustCommon = {
          inherit src;
          pname = "bitcoinpqc";
          version = "0.4.0";
          cargoLock = {
            lockFile = ./Cargo.lock;
            outputHashes = {
              # Fuzz workspace lock has no git deps; hash pins vendor fetch if added later.
            };
          };
          nativeBuildInputs = with pkgs; [
            pkg-config
            clang
            libclang
            libbitcoinpqcDrv
          ];
          buildInputs = [libbitcoinpqcDrv];
          env = {
            LIBBITCOINPQC_PREFIX = libbitcoinpqcDrv;
            LIBCLANG_PATH = "${pkgs.libclang.lib}/lib";
            BINDGEN_EXTRA_CLANG_ARGS = "-I${libbitcoinpqcDrv}/include";
          };
          # libbitcoinpqc is not thread-safe under parallel integration tests.
          checkPhase = ''
            runHook preCheck
            cargo test --offline -- --test-threads=1
            cargo test --offline --features serde -- --test-threads=1
            runHook postCheck
          '';
        };

        bitcoinpqc = pkgs.rustPlatform.buildRustPackage (rustCommon
          // {
            meta = with lib; {
              description = "Tapscript signature algorithms for Bitcoin P2MR (BIP 360)";
              homepage = "https://github.com/bitcoin/libbitcoinpqc";
              license = licenses.mit;
              platforms = platforms.unix;
            };
          });

        vectors-in-sync =
          pkgs.runCommand "bitcoinpqc-vectors-in-sync" {
            nativeBuildInputs = [pkgs.python3 pkgs.diffutils];
            inherit src;
          } ''
            set -euo pipefail
            work=$(mktemp -d)
            cp -r "$src/." "$work/"
            chmod -R u+w "$work"
            cd "$work"
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
            snapshot() {
              find "''${bindings_paths[@]}" -type f 2>/dev/null | LC_ALL=C sort | while read -r path; do
                echo "==$path=="
                cat "$path"
              done
            }
            before=$(mktemp)
            after=$(mktemp)
            snapshot > "$before"
            python3 scripts/sync-golden-vectors.py
            snapshot > "$after"
            if ! cmp -s "$before" "$after"; then
              echo "golden vectors out of sync with tests/fixtures/ (run: make sync-vectors)" >&2
              diff -u "$before" "$after" >&2 || true
              exit 1
            fi
            mkdir -p $out
            echo ok > $out/result
          '';

        no-skipped-tests =
          pkgs.runCommand "bitcoinpqc-no-skipped-tests" {
            nativeBuildInputs = [pkgs.ripgrep];
            inherit src;
          } ''
            set -euo pipefail
            cd "$src"
            set +e
            rg '#\[ignore|it\.skip|describe\.skip|test\.skip|@unittest\.skip|@pytest\.mark\.skip' \
              tests/ python/tests nodejs/tests wasm/test
            code=$?
            set -e
            case "$code" in
              0)
                echo "skipped/ignored tests found in E2E trees" >&2
                exit 1
                ;;
              1) ;;
              *)
                echo "ripgrep failed with exit code $code" >&2
                exit "$code"
                ;;
            esac
            mkdir -p $out
            echo ok > $out/result
          '';

        fmt-check =
          pkgs.runCommand "bitcoinpqc-bindings-fmt" {
            nativeBuildInputs = [pkgs.alejandra];
          } ''
            set -euo pipefail
            alejandra --check ${src}/flake.nix
            mkdir -p $out
            echo ok > $out/result
          '';

        # flake.nix github input rev documents the composed C library pin.
        input-pin-sync =
          pkgs.runCommand "bitcoinpqc-input-pin-sync" {
            nativeBuildInputs = [pkgs.gnugrep];
            inherit src;
          } ''
            set -euo pipefail
            grep -q '053e954534b13c1dbdc8ef4f9ae4d93bb301bab6' "$src/flake.nix"
            mkdir -p $out
            echo ok > $out/result
          '';
      in {
        packages = {
          default = bitcoinpqc;
          inherit bitcoinpqc;
          libbitcoinpqc = libbitcoinpqcDrv;
        };

        checks = {
          # Upstream C library gate (ctest, naming, install smoke, secp pin, …).
          inherit (upstreamChecks) libbitcoinpqc fmt naming install-smoke pin-sync;
          # Bindings-owned gates.
          bindings-fmt = fmt-check;
          input-pin-sync = input-pin-sync;
          rust = bitcoinpqc;
          vectors-in-sync = vectors-in-sync;
          no-skipped-tests = no-skipped-tests;
        };

        devShells.default = pkgs.mkShell {
          inputsFrom = [libbitcoinpqcDrv bitcoinpqc];
          packages = with pkgs; [
            rustc
            cargo
            rustfmt
            clippy
            rust-analyzer
            just
            alejandra
            ripgrep
            python3
            nodejs_22
          ];
          env = {
            LIBBITCOINPQC_PREFIX = libbitcoinpqcDrv;
            LIBCLANG_PATH = "${pkgs.libclang.lib}/lib";
            BINDGEN_EXTRA_CLANG_ARGS = "-I${libbitcoinpqcDrv}/include";
          };
          shellHook = ''
            echo "libbitcoinpqc-bindings dev shell (hermetic C lib from flake)"
            echo "  libbitcoinpqc: ${libbitcoinpqcDrv}"
            echo ""
            echo "Gate:   nix flake check -L"
            echo "Rust:   cargo test -- --test-threads=1"
            echo "Host:   just test"
          '';
        };

        formatter = pkgs.alejandra;
      };
    };
}
