#!/bin/bash

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

echo "Copying ML-DSA source files..."
cp -r ../libbitcoinpqc/src/ml_dsa src/c_sources/

echo "Copying SLH-DSA source files..."
cp -r ../libbitcoinpqc/src/slh_dsa src/c_sources/

echo "Copying Dilithium reference implementation..."
cp -r ../libbitcoinpqc/dilithium/ref src/c_sources/dilithium_ref

echo "Copying SPHINCS+ reference implementation..."
cp -r ../libbitcoinpqc/sphincsplus/ref src/c_sources/sphincsplus_ref

echo "Copying include files..."
cp -r ../libbitcoinpqc/include src/c_sources/

echo "Copying custom randombytes files..."
cp ../libbitcoinpqc/src/randombytes_custom.c src/c_sources/
cp ../libbitcoinpqc/src/randombytes_custom.h src/c_sources/

# Update include paths in C source files
echo "Updating include paths..."
find src/c_sources -name "*.c" -exec sed -i 's|../../dilithium/ref/|../dilithium_ref/|g' {} \;
find src/c_sources -name "*.c" -exec sed -i 's|../../sphincsplus/ref/|../sphincsplus_ref/|g' {} \;
find src/c_sources -name "*.c" -exec sed -i 's|../../include/|../include/|g' {} \;

echo "C source files synced successfully!"
