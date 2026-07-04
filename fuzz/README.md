# Fuzz Testing for libbitcoinpqc

This directory contains fuzz testing for the libbitcoinpqc library using [cargo-fuzz](https://github.com/rust-fuzz/cargo-fuzz).

## Prerequisites

You need to have cargo-fuzz installed:

```
cargo install cargo-fuzz
```

## Algorithm Selection

Fuzz targets that exercise multiple algorithms use `bitcoinpqc::algorithm_from_index` from the main crate. The first input byte (or dedicated bytes in `cross_algorithm`) is mapped modulo `SUPPORTED_ALGORITHM_COUNT` (currently 3):

- `0` → `SECP256K1_SCHNORR`
- `1` → `ML_DSA_44`
- `2` → `SLH_DSA_SHA2_128S`

## Compile Check (CI gate)

Before running fuzzers locally or in CI, verify the fuzz workspace compiles:

```bash
cd fuzz && cargo check
```

## Available Fuzz Targets

1. **`keypair_generation`** - Tests key pair generation with different algorithms using fuzzed randomness.
2. **`sign_verify`** - Tests signature creation and verification using generated keys and fuzzed messages.
3. **`cross_algorithm`** - Tests verification with mismatched keys and signatures from different algorithms (all pairs via `algorithm_from_index`).
4. **`key_parsing`** - Tests parsing of arbitrary byte sequences into `SecretKey` structs across algorithms.
5. **`signature_parsing`** - Tests parsing of arbitrary byte sequences into `Signature` structs across algorithms.

## Running the Fuzz Tests

To run a specific fuzz target:

```bash
cargo fuzz run keypair_generation
cargo fuzz run sign_verify
cargo fuzz run cross_algorithm
cargo fuzz run key_parsing
cargo fuzz run signature_parsing
```

To run a fuzz target for a specific amount of time:

```bash
cargo fuzz run keypair_generation -- -max_total_time=60
```

To run a fuzz target with a specific number of iterations:

```bash
cargo fuzz run keypair_generation -- -runs=1000000
```

To run **all** fuzz targets **in parallel**, use the provided script (make sure it's executable: `chmod +x fuzz/run_all_fuzzers.sh`):

```bash
./fuzz/run_all_fuzzers.sh
```

This script runs all defined targets in parallel using **GNU Parallel**.
If you don't have GNU Parallel installed, the script will output an error. You can install it using your system's package manager:

- **Debian/Ubuntu:** `sudo apt update && sudo apt install parallel`
- **Fedora:** `sudo dnf install parallel`
- **Arch Linux:** `sudo pacman -S parallel`
- **macOS (Homebrew):** `brew install parallel`

## Corpus Management

Cargo-fuzz automatically manages a corpus of interesting inputs. You can find them in the `fuzz/corpus` directory once you've run the fuzz tests.

## Finding and Reporting Issues

If a fuzz test finds a crash, it will save the crashing input to `fuzz/artifacts`. You can reproduce the crash with:

```
cargo fuzz run target_name fuzz/artifacts/target_name/crash-*
```

When reporting an issue found by fuzzing, please include:

1. The exact command used to run the fuzzer
2. The crash input file
3. The full output of the crash

## Adding New Fuzz Targets

To add a new fuzz target:

1. Create a new Rust file in the `fuzz_targets` directory
2. Add the target to `fuzz/Cargo.toml`
3. Run `cd fuzz && cargo check` to verify it compiles
4. Run the new target with `cargo fuzz run target_name`