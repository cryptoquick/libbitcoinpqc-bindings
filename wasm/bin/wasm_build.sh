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
    echo "  ./emsdk install 6.0.2   # pinned in CI (.github/workflows/ci.yml)"
    echo "  ./emsdk activate 6.0.2"
    echo "  source ./emsdk_env.sh"
    exit 1
fi

# Get the project root directory (assuming script is in wasm/bin)
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

# Output directory
OUTPUT_DIR="wasm/dist"
OBJ_DIR="wasm/obj"
mkdir -p "$OUTPUT_DIR" "$OBJ_DIR"

# Fetch libsecp256k1 v0.5.0 (BIP-340 Schnorr + x-only keys)
SECP_DIR="$PROJECT_ROOT/wasm/vendor/secp256k1"
SECP_COMMIT="e3a885d42a7800c1ccebad94ad1e2b82c4df5c65"  # v0.5.0 tag

fetch_secp256k1() {
    echo "Fetching libsecp256k1 v0.5.0 (${SECP_COMMIT})..."
    rm -rf "$SECP_DIR"
    local cloned=0
    local attempt
    for attempt in 1 2 3; do
        if git clone --depth 1 --branch v0.5.0 https://github.com/bitcoin-core/secp256k1.git "$SECP_DIR"; then
            cloned=1
            break
        fi
        rm -rf "$SECP_DIR"
        if [ "$attempt" -lt 3 ]; then
            echo "  Clone failed, retrying (attempt $((attempt + 1))/3)..."
            sleep 2
        fi
    done
    if [ "$cloned" -ne 1 ]; then
        echo "Error: failed to clone libsecp256k1 after 3 attempts"
        exit 1
    fi
    local actual_commit
    actual_commit="$(git -C "$SECP_DIR" rev-parse HEAD)"
    if [ "$actual_commit" != "$SECP_COMMIT" ]; then
        echo "  Tag v0.5.0 resolved to ${actual_commit}; checking out pinned commit..."
        git -C "$SECP_DIR" fetch --depth 1 origin "$SECP_COMMIT"
        git -C "$SECP_DIR" checkout "$SECP_COMMIT"
    fi
}

if [ ! -f "$SECP_DIR/src/secp256k1.c" ]; then
    fetch_secp256k1
else
    actual_commit="$(git -C "$SECP_DIR" rev-parse HEAD 2>/dev/null || echo "")"
    if [ "$actual_commit" != "$SECP_COMMIT" ]; then
        echo "libsecp256k1 vendor commit mismatch (got ${actual_commit:-none}, want ${SECP_COMMIT}). Re-cloning..."
        fetch_secp256k1
    fi
fi

# Common compiler flags (shared between compile and link steps)
COMMON_FLAGS=(
    -O2                              # Use O2 instead of O3 (O3 can break VLAs in WASM)
    -DDILITHIUM_MODE=2
    -DPARAMS=sphincs-sha2-128s
    -DCUSTOM_RANDOMBYTES=1
)

# libsecp256k1 compile flags (WASM32: no x86_64 asm, use 10x26 field / 8x32 scalar)
SECP_DEFINES=(
    -DECMULT_GEN_PREC_BITS=4
    -DECMULT_WINDOW_SIZE=15
    -DENABLE_MODULE_SCHNORRSIG=1
    -DENABLE_MODULE_EXTRAKEYS=1
    -DUSE_NUM_NONE=1
    -DUSE_FIELD_INV_BUILTIN=1
    -DUSE_SCALAR_INV_BUILTIN=1
    -DUSE_ENDOMORPHISM=1
    -DUSE_FIELD_10X26=1
    -DUSE_SCALAR_8X32=1
)

# Linker flags (only for the final link step)
# Single-threaded default; Emscripten pthread stubs satisfy pthread_once in secp256k1_schnorr.c
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
    -I"$SECP_DIR/include"
)

# secp256k1 Schnorr wrapper (compiled with SECP_DEFINES, separate from other API sources)
SECP_SCHNORR_SOURCE="$PROJECT_ROOT/libbitcoinpqc/src/secp256k1_schnorr.c"

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

# libsecp256k1 sources (v0.5.0 requires precomputed_ecmult*.c)
SECP_SOURCES=(
    "$SECP_DIR/src/secp256k1.c"
    "$SECP_DIR/src/precomputed_ecmult.c"
    "$SECP_DIR/src/precomputed_ecmult_gen.c"
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
    "$PROJECT_ROOT/libbitcoinpqc/sphincsplus/ref/hash_sha2.c"
    "$PROJECT_ROOT/libbitcoinpqc/sphincsplus/ref/merkle.c"
    "$PROJECT_ROOT/libbitcoinpqc/sphincsplus/ref/sign.c"
    "$PROJECT_ROOT/libbitcoinpqc/sphincsplus/ref/thash_sha2_simple.c"
    "$PROJECT_ROOT/libbitcoinpqc/sphincsplus/ref/utils.c"
    "$PROJECT_ROOT/libbitcoinpqc/sphincsplus/ref/utilsx1.c"
    "$PROJECT_ROOT/libbitcoinpqc/sphincsplus/ref/wots.c"
    "$PROJECT_ROOT/libbitcoinpqc/sphincsplus/ref/wotsx1.c"
    "$PROJECT_ROOT/libbitcoinpqc/sphincsplus/ref/sha2.c"
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

# Step 1: Compile libsecp256k1 sources
echo "  Compiling libsecp256k1..."
SECP_OBJS=()
for src in "${SECP_SOURCES[@]}"; do
    objname="$(unique_objname "$src")"
    emcc -c "${COMMON_FLAGS[@]}" "${SECP_DEFINES[@]}" \
        -I"$SECP_DIR" -I"$SECP_DIR/include" -I"$SECP_DIR/src" \
        -Wno-unused-function \
        "$src" -o "$objname"
    SECP_OBJS+=("$objname")
done

# Step 1b: Compile secp256k1_schnorr.c with same SECP_DEFINES as libsecp256k1
echo "  Compiling secp256k1_schnorr..."
SECP_SCHNORR_OBJ="$(unique_objname "$SECP_SCHNORR_SOURCE")"
emcc -c "${COMMON_FLAGS[@]}" "${SECP_DEFINES[@]}" "${INCLUDE_DIRS[@]}" \
    -Wno-unused-function \
    "$SECP_SCHNORR_SOURCE" -o "$SECP_SCHNORR_OBJ"
SECP_OBJS+=("$SECP_SCHNORR_OBJ")

# Step 2: Compile Dilithium sources to object files with renamed randombytes.
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

# Step 3: Compile all other sources to object files (normal randombytes)
echo "  Compiling SPHINCS+, wrapper, and API sources..."
OTHER_OBJS=()
for src in "${OTHER_SOURCES[@]}"; do
    objname="$(unique_objname "$src")"
    emcc -c "${COMMON_FLAGS[@]}" "${INCLUDE_DIRS[@]}" \
        "$src" -o "$objname"
    OTHER_OBJS+=("$objname")
done

# Step 4: Link all object files into the final WASM module
echo "  Linking..."
emcc "${COMMON_FLAGS[@]}" "${LINK_FLAGS[@]}" \
    "${SECP_OBJS[@]}" "${DILITHIUM_OBJS[@]}" "${OTHER_OBJS[@]}" \
    -o "$OUTPUT_DIR/bitcoinpqc.js"

# Clean up object files
rm -rf "$OBJ_DIR"

echo "Build complete!"
echo ""
echo "Output files:"
echo "  - $OUTPUT_DIR/bitcoinpqc.js"
echo "  - $OUTPUT_DIR/bitcoinpqc.wasm"