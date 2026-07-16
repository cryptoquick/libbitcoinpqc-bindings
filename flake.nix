{
  description = "libbitcoinpqc-bindings — Rust/Python/Node/WASM bindings for libbitcoinpqc";

  inputs = {
    # Compose the C library flake. Rev must match the libbitcoinpqc submodule
    # gitlink (git submodule status libbitcoinpqc); flake.lock pins for CI.
    libbitcoinpqc.url = "github:cryptoquick/libbitcoinpqc/053e954534b13c1dbdc8ef4f9ae4d93bb301bab6";

    # Nightly toolchain for cargo-fuzz (requires -Zsanitizer=address).
    fenix = {
      url = "github:nix-community/fenix";
      inputs.nixpkgs.follows = "libbitcoinpqc/nixpkgs";
    };

    # NodeJS binding.gyp pins v0.7.1 (see nodejs/scripts/sync-c-sources.sh).
    secp256k1-nodejs = {
      url = "git+https://github.com/bitcoin-core/secp256k1?rev=1a53f4961f337b4d166c25fce72ef0dc88806618";
      flake = false;
    };

    # Share the upstream toolchain pins.
    nixpkgs.follows = "libbitcoinpqc/nixpkgs";
    flake-parts.follows = "libbitcoinpqc/flake-parts";
    systems.follows = "libbitcoinpqc/systems";
  };

  outputs = inputs @ {
    self,
    libbitcoinpqc,
    fenix,
    secp256k1-nodejs,
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

        # Full C tree for Node sync (submodule gitlink may be absent from builtins.path).
        libbitcoinpqcSrc = builtins.fetchTree {
          type = "github";
          owner = "cryptoquick";
          repo = "libbitcoinpqc";
          rev = "053e954534b13c1dbdc8ef4f9ae4d93bb301bab6";
        };

        nightlyToolchain = fenix.packages.${system}.latest.withComponents [
          "cargo"
          "rustc"
          "rust-src"
          "llvm-tools"
        ];

        fuzzTargets = [
          "keypair_generation"
          "sign_verify"
          "cross_algorithm"
          "key_parsing"
          "signature_parsing"
        ];

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

        rustEnv = {
          LIBBITCOINPQC_PREFIX = libbitcoinpqcDrv;
          LIBCLANG_PATH = "${pkgs.libclang.lib}/lib";
          BINDGEN_EXTRA_CLANG_ARGS = "-I${libbitcoinpqcDrv}/include";
        };

        rustNativeBuildInputs = with pkgs; [
          pkg-config
          clang
          libclang
          libbitcoinpqcDrv
        ];

        rustCommon = {
          inherit src;
          pname = "bitcoinpqc";
          version = "0.4.1";
          cargoLock = {
            lockFile = ./Cargo.lock;
            outputHashes = {};
          };
          nativeBuildInputs = rustNativeBuildInputs;
          buildInputs = [libbitcoinpqcDrv];
          env = rustEnv;
        };

        bitcoinpqc = pkgs.rustPlatform.buildRustPackage (rustCommon
          // {
            # libbitcoinpqc is not thread-safe under parallel integration tests.
            checkPhase = ''
              runHook preCheck
              cargo test --offline -- --test-threads=1
              cargo test --offline --features serde -- --test-threads=1
              runHook postCheck
            '';
            meta = with lib; {
              description = "Tapscript signature algorithms for Bitcoin P2MR (BIP 360)";
              homepage = "https://github.com/bitcoin/libbitcoinpqc";
              license = licenses.mit;
              platforms = platforms.unix;
            };
          });

        rust-fmt =
          pkgs.runCommand "bitcoinpqc-rust-fmt" {
            nativeBuildInputs = [pkgs.cargo pkgs.rustfmt];
            inherit src;
          } ''
            set -euo pipefail
            cd "$src"
            cargo fmt --all -- --check
            mkdir -p $out
            echo ok > $out/result
          '';

        rust-clippy = pkgs.rustPlatform.buildRustPackage (rustCommon
          // {
            pname = "bitcoinpqc-clippy";
            nativeBuildInputs = rustNativeBuildInputs ++ [pkgs.clippy];
            doCheck = true;
            checkPhase = ''
              runHook preCheck
              cargo clippy --offline -- -D warnings
              runHook postCheck
            '';
          });

        # Workspace member (`Cargo.toml`); shares root lock/vendor.
        fuzzBuildCommon =
          rustCommon
          // {
            pname = "libbitcoinpqc-fuzz";
            version = "0.0.0";
            buildAndTestSubPackages = false;
            cargoBuildFlags = ["-p" "libbitcoinpqc-fuzz"];
          };

        fuzz-compile = pkgs.rustPlatform.buildRustPackage (fuzzBuildCommon
          // {
            doCheck = false;
            # Match CI `cd fuzz && cargo check` (no libFuzzer link on stable).
            buildPhase = ''
              runHook preBuild
              cargo check --offline -p libbitcoinpqc-fuzz
              runHook postBuild
            '';
            installPhase = ''
              runHook preInstall
              mkdir -p "$out"
              echo ok > "$out/result"
              runHook postInstall
            '';
          });

        # Nightly libFuzzer smoke (offline via root vendor; no cargo-fuzz network in sandbox).
        fuzzRustPlatform = pkgs.makeRustPlatform {
          cargo = nightlyToolchain;
          rustc = nightlyToolchain;
        };

        fuzz-smoke = fuzzRustPlatform.buildRustPackage (fuzzBuildCommon
          // {
            pname = "bitcoinpqc-fuzz-smoke";
            cargoBuildFlags = ["-p" "libbitcoinpqc-fuzz" "--bins"];
            nativeBuildInputs =
              rustNativeBuildInputs
              ++ [
                pkgs.llvmPackages.llvm
              ];
            buildInputs = [libbitcoinpqcDrv pkgs.stdenv.cc.cc.lib];
            env =
              rustEnv
              // {
                ASAN_OPTIONS = "detect_odr_violation=0";
                RUSTFLAGS =
                  "-Zsanitizer=address -Cdebug-assertions -Ccodegen-units=1"
                  + " -C link-arg=-L${libbitcoinpqcDrv}/lib"
                  + " -C link-arg=-lbitcoinpqc"
                  + " -C link-arg=-lsecp256k1"
                  + " -C link-arg=-lpthread"
                  + " -C link-arg=-lm";
              };
            doCheck = true;
            checkPhase = ''
              runHook preCheck
              export LD_LIBRARY_PATH="${lib.makeLibraryPath [pkgs.stdenv.cc.cc.lib libbitcoinpqcDrv]}"
              bin_dir="target/x86_64-unknown-linux-gnu/release"
              for target in ${lib.concatStringsSep " " fuzzTargets}; do
                echo "=== fuzz smoke: $target ==="
                mkdir -p "fuzz/corpus/$target"
                "$bin_dir/$target" -max_total_time=2 "fuzz/corpus/$target"
              done
              runHook postCheck
            '';
          });

        # Fast benchmark smoke: `sizes` group only (no CI=true — criterion needs sample_size >= 10).
        bench-smoke = pkgs.rustPlatform.buildRustPackage (rustCommon
          // {
            pname = "bitcoinpqc-bench-smoke";
            doCheck = true;
            checkPhase = ''
              runHook preCheck
              cargo bench --features bench --bench sig_benchmarks -- sizes
              runHook postCheck
            '';
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
              tests/vectors/fixtures
              tests/vectors/rust
              tests/vectors/python
              tests/vectors/nodejs
              tests/vectors/wasm
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
              echo "golden vectors out of sync with tests/vectors/fixtures/ (run: make sync-vectors)" >&2
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

        python-test =
          pkgs.runCommand "bitcoinpqc-python-test" {
            nativeBuildInputs = [pkgs.python3];
            inherit src;
          } ''
            set -euo pipefail
            work=$(mktemp -d)
            cp -r "$src/." "$work/"
            cd "$work/python"
            export LD_LIBRARY_PATH="${libbitcoinpqcDrv}/lib''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
            python3 -m unittest discover -s tests -v
            mkdir -p $out
            echo ok > $out/result
          '';

        nodejs-test = pkgs.buildNpmPackage {
          pname = "bitcoinpqc-nodejs-test";
          version = "0.4.1";
          src = src;
          # Keep the full tree so `scripts/sync-c-sources.sh` can read ../libbitcoinpqc.
          npmRoot = "nodejs";
          npmDepsHash = "sha256-1xi0HDmbQRdCPNSAystnaMaWPEk8ls3vlju809W5SGs=";
          nodejs = pkgs.nodejs_22;

          nativeBuildInputs = with pkgs; [
            bash
            python3
            node-gyp
            pkg-config
          ];

          # package.json install/prepare hooks run node-gyp before C sources are synced.
          npmFlags = ["--ignore-scripts"];

          buildPhase = ''
            runHook preBuild
            rm -rf libbitcoinpqc
            cp -r ${libbitcoinpqcSrc} libbitcoinpqc
            chmod -R u+w libbitcoinpqc
            cd nodejs
            export SECP256K1_SRC="${secp256k1-nodejs}"
            bash scripts/sync-c-sources.sh
            chmod -R u+w src/c_sources
            ./node_modules/.bin/tsc -p .
            node-gyp rebuild
            runHook postBuild
          '';

          doCheck = true;
          checkPhase = ''
            runHook preCheck
            npm test
            runHook postCheck
          '';

          installPhase = ''
            mkdir -p $out
            echo ok > $out/result
          '';
        };

        wasm32Clang = pkgs.writeShellScript "bitcoinpqc-wasm32-clang" ''
          exec ${pkgs.clang}/bin/clang -include ${./wasm/secp_memmove_fix.h} "$@"
        '';

        wasmBuildEnv = {
          "CC_wasm32-unknown-unknown" = wasm32Clang;
        };

        wasm-check = pkgs.rustPlatform.buildRustPackage (rustCommon
          // {
            pname = "bitcoinpqc-wasm-check";
            env = rustEnv // wasmBuildEnv;
            hardeningDisable = ["zerocallusedregs"];
            doCheck = true;
            checkPhase = ''
              runHook preCheck
              cargo check --target wasm32-unknown-unknown
              runHook postCheck
            '';
          });

        wasm-pack-test = pkgs.rustPlatform.buildRustPackage (rustCommon
          // {
            pname = "bitcoinpqc-wasm-pack-test";
            env = rustEnv // wasmBuildEnv;
            hardeningDisable = ["zerocallusedregs"];
            nativeBuildInputs =
              rustNativeBuildInputs
              ++ [
                pkgs.wasm-pack
                pkgs.nodejs_22
              ];
            doCheck = true;
            checkPhase = ''
              runHook preCheck
              export HOME="$TMPDIR/home"
              mkdir -p "$HOME"
              wasm-pack test --node
              runHook postCheck
            '';
          });

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
          # Optional: `nix build .#wasm-check` (not in flake check yet).
          inherit wasm-check wasm-pack-test;
        };

        checks = {
          # Upstream C library gate (ctest, naming, install smoke, secp pin, …).
          inherit (upstreamChecks) libbitcoinpqc fmt naming install-smoke pin-sync;

          # Rust crate.
          rust = bitcoinpqc;
          rust-fmt = rust-fmt;
          rust-clippy = rust-clippy;

          # Fuzz (stable compile + nightly libFuzzer smoke).
          fuzz-compile = fuzz-compile;
          fuzz = fuzz-smoke;

          # Benchmark smoke (informational; full suite: `cargo bench --features bench`).
          bench = bench-smoke;

          # Bindings policy gates.
          bindings-fmt = fmt-check;
          input-pin-sync = input-pin-sync;
          vectors-in-sync = vectors-in-sync;
          no-skipped-tests = no-skipped-tests;

          # Language bindings.
          python = python-test;
          nodejs = nodejs-test;
          # Wasm: `just wasm` / `just test-all` (custom clang sysroot; see packages.wasm-check).
        };

        devShells.default = pkgs.mkShell {
          inputsFrom = [libbitcoinpqcDrv bitcoinpqc];
          packages = with pkgs; [
            rustc
            cargo
            rustfmt
            clippy
            rust-analyzer
            nightlyToolchain
            cargo-fuzz
            wasm-pack
            just
            alejandra
            ripgrep
            python3
            nodejs_22
          ];
          env = rustEnv;
          shellHook = ''
            echo "libbitcoinpqc-bindings dev shell (hermetic C lib from flake)"
            echo "  libbitcoinpqc: ${libbitcoinpqcDrv}"
            echo ""
            echo "Gate:     nix flake check -L"
            echo "Rust:     cargo test -- --test-threads=1"
            echo "Fuzz:     cargo +nightly fuzz run <target> -- -max_total_time=2"
            echo "Bench:    cargo bench --features bench --bench sig_benchmarks -- sizes"
            echo "Host:     just test"
          '';
        };

        formatter = pkgs.alejandra;
      };
    };
}
