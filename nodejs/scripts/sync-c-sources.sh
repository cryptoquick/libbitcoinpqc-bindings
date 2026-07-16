#!/usr/bin/env bash

# Script to sync C source files from the libbitcoinpqc submodule to src/c_sources
# This should be run before building or publishing the package

set -e

echo "Syncing C source files from libbitcoinpqc submodule..."

# Remove existing c_sources directory
rm -rf src/c_sources

# Create new c_sources directory
mkdir -p src/c_sources

# Copy C source files
echo "Copying main C source file..."
cp ../libbitcoinpqc/src/bitcoinpqc.c src/c_sources/

echo "Copying secp256k1 Schnorr source files..."
cp ../libbitcoinpqc/src/secp256k1_schnorr.c src/c_sources/
cp ../libbitcoinpqc/src/secp256k1_schnorr.h src/c_sources/

echo "Copying ML-DSA source files..."
cp -r ../libbitcoinpqc/src/ml_dsa src/c_sources/

echo "Copying SLH-DSA source files..."
cp -r ../libbitcoinpqc/src/slh_dsa src/c_sources/

echo "Copying Dilithium reference implementation..."
cp -r ../libbitcoinpqc/dilithium/ref src/c_sources/dilithium_ref

echo "Copying SPHINCS+ reference implementation..."
# Copies the full upstream ref tree (SHAKE and SHA2 files). binding.gyp selects
# SHA2 sources only (hash_sha2.c, thash_sha2_simple.c, sha2.c); orphaned SHAKE
# files in sphincsplus_ref/ are intentionally not removed.
cp -r ../libbitcoinpqc/sphincsplus/ref src/c_sources/sphincsplus_ref

echo "Copying include files..."
cp -r ../libbitcoinpqc/include src/c_sources/

echo "Copying custom randombytes files..."
cp ../libbitcoinpqc/src/randombytes_custom.c src/c_sources/
cp ../libbitcoinpqc/src/randombytes_custom.h src/c_sources/

# Keep in sync with libbitcoinpqc/CMakeLists.txt FetchContent GIT_TAG (v0.7.1).
SECP_TAG="v0.7.1"
SECP_COMMIT="1a53f4961f337b4d166c25fce72ef0dc88806618"
echo "Fetching libsecp256k1 ${SECP_TAG}..."
SECP_DIR=src/c_sources/secp256k1
rm -rf "$SECP_DIR"
if [ -n "${SECP256K1_SRC:-}" ] && [ -d "$SECP256K1_SRC" ]; then
    cp -r "$SECP256K1_SRC" "$SECP_DIR"
else
    git clone --depth 1 --branch "$SECP_TAG" https://github.com/bitcoin-core/secp256k1.git "$SECP_DIR"
    actual_commit="$(git -C "$SECP_DIR" rev-parse HEAD)"
    if [ "$actual_commit" != "$SECP_COMMIT" ]; then
        git -C "$SECP_DIR" fetch --depth 1 origin "$SECP_COMMIT"
        git -C "$SECP_DIR" checkout "$SECP_COMMIT"
    fi
fi

# Update include paths in C source files
echo "Updating include paths..."
if sed --version >/dev/null 2>&1; then
    SED_INPLACE=(-i)
else
    # BSD sed (macOS) requires an explicit backup suffix for -i.
    SED_INPLACE=(-i '')
fi
find src/c_sources -name "*.c" -exec sed "${SED_INPLACE[@]}" 's|../../dilithium/ref/|../dilithium_ref/|g' {} \;
find src/c_sources -name "*.c" -exec sed "${SED_INPLACE[@]}" 's|../../sphincsplus/ref/|../sphincsplus_ref/|g' {} \;
find src/c_sources -name "*.c" -exec sed "${SED_INPLACE[@]}" 's|../../include/|../include/|g' {} \;

echo "C source files synced successfully!"