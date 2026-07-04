# Python Bindings for libbitcoinpqc

This package provides Python bindings for the libbitcoinpqc library, which implements post-quantum cryptographic signature algorithms for use with BIP-360 and the Bitcoin QuBit soft fork.

## Supported Algorithms

- **ML-DSA-44** (CRYSTALS-Dilithium): A structured lattice-based digital signature scheme
- **SLH-DSA-SHA2-128s** (SPHINCS+): A stateless hash-based signature scheme

## Installation

```bash
# Install the package
pip install bitcoinpqc
```

or from source:

```bash
# Clone the repository
git clone https://github.com/bitcoin/libbitcoinpqc.git
cd libbitcoinpqc

# Build the C library
mkdir build && cd build
cmake ..
make
cd ..

# Install the Python package
cd python
pip install -e .
```

## Requirements

- Python 3.7 or higher
- The libbitcoinpqc C library must be built and installed

## Example Usage

```python
import secrets
from bitcoinpqc import Algorithm, keygen, sign, verify

# Generate random data for key generation
random_data = secrets.token_bytes(128)

# Generate a key pair
algorithm = Algorithm.ML_DSA_44  # CRYSTALS-Dilithium
keypair = keygen(algorithm, random_data)

# Create a message to sign
message = b"Hello, Bitcoin PQC!"

# Sign the message
signature = sign(algorithm, keypair.secret_key, message)

# Verify the signature
is_valid = verify(algorithm, keypair.public_key, message, signature)
print(f"Signature valid: {is_valid}")  # Should print True
```

## Breaking Changes (Phase 2)

- Rename `SLH_DSA_SHAKE_128S` → `SLH_DSA_SHA2_128S`
- Remove `FN_DSA_512` (no longer supported)
- Enum wire values: `SECP256K1_SCHNORR=0`, `ML_DSA_44=1`, `SLH_DSA_SHA2_128S=2`
- **Re-keying required:** SHAKE-128s keys/signatures are incompatible with SHA2-128s

## Running Tests

```bash
# Run the tests
./run_tests.sh

# Or using unittest directly
python -m unittest discover -s tests
```

## License

This project is licensed under the MIT License.
