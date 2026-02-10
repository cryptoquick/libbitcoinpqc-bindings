#!/bin/bash

# Build script to compile Bitcoin PQC C libraries to WebAssembly using Emscripten
# Prerequisites: Emscripten SDK must be installed and activated

set -e

echo "Building Bitcoin PQC libraries for WebAssembly..."

# Check if Emscripten is available
if ! command -v emcc &> /dev/null; then
    echo "Error: Emscripten (emcc) not found!"
    echo "Please install and activate Emscripten SDK:"
    echo "  git clone https://github.com/emscripten-core/emsdk.git"
    echo "  cd emsdk"
    echo "  ./emsdk install latest"
    echo "  ./emsdk activate latest"
    echo "  source ./emsdk_env.sh"
    exit 1
fi

# Get the project root directory (assuming script is in wasm/bin)
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
echo $PROJECT_ROOT
cd "$PROJECT_ROOT"

# Output directory
OUTPUT_DIR="wasm/dist"
OBJ_DIR="wasm/obj"
mkdir -p "$OUTPUT_DIR" "$OBJ_DIR"

# Common compiler flags (shared between compile and link steps)
COMMON_FLAGS=(
    -O2                              # Use O2 instead of O3 (O3 can break VLAs in WASM)
    -DDILITHIUM_MODE=2
    -DPARAMS=sphincs-shake-128s
    -DCUSTOM_RANDOMBYTES=1
)

# Linker flags (only for the final link step)
LINK_FLAGS=(
    -s WASM=1                        # Output WebAssembly
    -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","UTF8ToString","stringToUTF8","HEAP8","HEAP32","HEAPU8"]'
    -s EXPORTED_FUNCTIONS='["_bitcoin_pqc_keygen","_bitcoin_pqc_public_key_size","_bitcoin_pqc_secret_key_size","_bitcoin_pqc_signature_size","_bitcoin_pqc_keypair_free","_bitcoin_pqc_sign","_bitcoin_pqc_signature_free","_bitcoin_pqc_verify","_malloc","_free"]'
    -s ALLOW_MEMORY_GROWTH=1         # Allow memory to grow
    -s INITIAL_MEMORY=33554432       # 32MB initial memory
    -s MAXIMUM_MEMORY=134217728      # 128MB max memory
    -s STACK_SIZE=10485760           # 10MB stack (SPHINCS+ needs significant stack space)
    -s TOTAL_STACK=10485760          # Total stack size
    -s MODULARIZE=1                  # Use module pattern
    -s EXPORT_NAME="Module"          # Module name
    -s STANDALONE_WASM=0             # Enable JS glue code
    --no-entry                       # No main function
)

# Include directories
INCLUDE_DIRS=(
    -I"$PROJECT_ROOT/libbitcoinpqc/include"
    -I"$PROJECT_ROOT/libbitcoinpqc/src"
    -I"$PROJECT_ROOT/libbitcoinpqc/dilithium/ref"
    -I"$PROJECT_ROOT/libbitcoinpqc/sphincsplus/ref"
)

# Source files for bitcoinpqc main API
BITCOINPQC_SOURCES=(
    "$PROJECT_ROOT/libbitcoinpqc/src/bitcoinpqc.c"
    "$PROJECT_ROOT/libbitcoinpqc/src/ml_dsa/keygen.c"
    "$PROJECT_ROOT/libbitcoinpqc/src/ml_dsa/sign.c"
    "$PROJECT_ROOT/libbitcoinpqc/src/ml_dsa/verify.c"
    "$PROJECT_ROOT/libbitcoinpqc/src/ml_dsa/utils.c"
    "$PROJECT_ROOT/libbitcoinpqc/src/slh_dsa/keygen.c"
    "$PROJECT_ROOT/libbitcoinpqc/src/slh_dsa/sign.c"
    "$PROJECT_ROOT/libbitcoinpqc/src/slh_dsa/verify.c"
    "$PROJECT_ROOT/libbitcoinpqc/src/slh_dsa/utils.c"
)

# Dilithium reference implementation sources
# NOTE: Compiled separately with -Drandombytes=dilithium_randombytes to avoid
# ABI conflict with SPHINCS+ on WASM32 (size_t=i32 vs unsigned long long=i64)
DILITHIUM_SOURCES=(
    "$PROJECT_ROOT/libbitcoinpqc/dilithium/ref/sign.c"
    "$PROJECT_ROOT/libbitcoinpqc/dilithium/ref/packing.c"
    "$PROJECT_ROOT/libbitcoinpqc/dilithium/ref/polyvec.c"
    "$PROJECT_ROOT/libbitcoinpqc/dilithium/ref/poly.c"
    "$PROJECT_ROOT/libbitcoinpqc/dilithium/ref/ntt.c"
    "$PROJECT_ROOT/libbitcoinpqc/dilithium/ref/reduce.c"
    "$PROJECT_ROOT/libbitcoinpqc/dilithium/ref/rounding.c"
    "$PROJECT_ROOT/libbitcoinpqc/dilithium/ref/fips202.c"
    "$PROJECT_ROOT/libbitcoinpqc/dilithium/ref/symmetric-shake.c"
)

# SPHINCS+ reference implementation sources
SPHINCSPLUS_SOURCES=(
    "$PROJECT_ROOT/libbitcoinpqc/sphincsplus/ref/address.c"
    "$PROJECT_ROOT/libbitcoinpqc/sphincsplus/ref/fors.c"
    "$PROJECT_ROOT/libbitcoinpqc/sphincsplus/ref/hash_shake.c"
    "$PROJECT_ROOT/libbitcoinpqc/sphincsplus/ref/merkle.c"
    "$PROJECT_ROOT/libbitcoinpqc/sphincsplus/ref/sign.c"
    "$PROJECT_ROOT/libbitcoinpqc/sphincsplus/ref/thash_shake_simple.c"
    "$PROJECT_ROOT/libbitcoinpqc/sphincsplus/ref/utils.c"
    "$PROJECT_ROOT/libbitcoinpqc/sphincsplus/ref/utilsx1.c"
    "$PROJECT_ROOT/libbitcoinpqc/sphincsplus/ref/wots.c"
    "$PROJECT_ROOT/libbitcoinpqc/sphincsplus/ref/wotsx1.c"
    "$PROJECT_ROOT/libbitcoinpqc/sphincsplus/ref/fips202.c"
)

# WASM-specific randombytes implementation
# Provides both randombytes() (SPHINCS+ signature: unsigned long long) and
# dilithium_randombytes() (Dilithium signature: size_t), both backed by
# the same entropy buffer managed via pqc_randombytes_init/cleanup.
WRAPPER_SOURCES=(
    "$PROJECT_ROOT/wasm/src/randombytes_wrapper.c"
)

# Non-Dilithium sources (compiled normally)
OTHER_SOURCES=(
    "${BITCOINPQC_SOURCES[@]}"
    "${SPHINCSPLUS_SOURCES[@]}"
    "${WRAPPER_SOURCES[@]}"
)

echo "Compiling C sources to WebAssembly..."
echo "Note: This may take a few minutes due to large codebase..."

# Helper: derive a unique object filename from a source path
# e.g. .../dilithium/ref/sign.c -> dilithium_ref_sign.o
unique_objname() {
    local src="$1"
    local rel="${src#$PROJECT_ROOT/}"
    # Replace path separators with underscores, strip .c extension
    echo "$OBJ_DIR/$(echo "${rel%.c}" | tr '/' '_').o"
}

# Step 1: Compile Dilithium sources to object files with renamed randombytes.
# On WASM32, Dilithium's randombytes(uint8_t*, size_t) and SPHINCS+'s
# randombytes(unsigned char*, unsigned long long) have incompatible ABIs.
# The -D renames all Dilithium randombytes references to dilithium_randombytes,
# which is provided by randombytes_wrapper.c with the correct (size_t) signature.
echo "  Compiling Dilithium sources (with renamed randombytes)..."
DILITHIUM_OBJS=()
for src in "${DILITHIUM_SOURCES[@]}"; do
    objname="$(unique_objname "$src")"
    emcc -c "${COMMON_FLAGS[@]}" "${INCLUDE_DIRS[@]}" \
        -Drandombytes=dilithium_randombytes \
        "$src" -o "$objname"
    DILITHIUM_OBJS+=("$objname")
done

# Step 2: Compile all other sources to object files (normal randombytes)
echo "  Compiling SPHINCS+, wrapper, and API sources..."
OTHER_OBJS=()
for src in "${OTHER_SOURCES[@]}"; do
    objname="$(unique_objname "$src")"
    emcc -c "${COMMON_FLAGS[@]}" "${INCLUDE_DIRS[@]}" \
        "$src" -o "$objname"
    OTHER_OBJS+=("$objname")
done

# Step 3: Link all object files into the final WASM module
echo "  Linking..."
emcc "${COMMON_FLAGS[@]}" "${LINK_FLAGS[@]}" \
    "${DILITHIUM_OBJS[@]}" "${OTHER_OBJS[@]}" \
    -o "$OUTPUT_DIR/bitcoinpqc.js"

# Clean up object files
rm -rf "$OBJ_DIR"

echo "Build complete!"
echo ""
echo "Output files:"
echo "  - $OUTPUT_DIR/bitcoinpqc.js"
echo "  - $OUTPUT_DIR/bitcoinpqc.wasm"
