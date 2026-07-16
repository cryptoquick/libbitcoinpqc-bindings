# Python Bindings for libbitcoinpqc

Python bindings for the [libbitcoinpqc](https://github.com/cryptoquick/libbitcoinpqc) C library — the three BIP 360 (P2MR) tapscript signature algorithms: secp256k1 Schnorr (BIP 340), ML-DSA-44, and SLH-DSA-SHA2-128s. See [BIP 360](https://github.com/bitcoin/bips/blob/master/bip-0360.mediawiki).

## Supported Algorithms

- **SECP256K1_SCHNORR** (BIP-340): Classical Schnorr signatures with x-only public keys
- **ML-DSA-44** (CRYSTALS-Dilithium): Lattice-based post-quantum signatures
- **SLH-DSA-SHA2-128s** (SPHINCS+): Stateless hash-based post-quantum signatures

## Installation

```bash
pip install bitcoinpqc
```

From source (requires the C library built from the bindings submodule):

```bash
git clone --recurse-submodules https://github.com/cryptoquick/libbitcoinpqc-bindings.git
cd libbitcoinpqc-bindings
make c-lib
cd python
pip install -e .
```

## Requirements

- Python 3.7 or higher
- `libbitcoinpqc` built via `make c-lib` or installed system-wide

## Example Usage

```python
import secrets
from bitcoinpqc import Algorithm, keygen, sign, verify

# PQC keygen needs 128 bytes of entropy; secp256k1 Schnorr needs 32
random_data = secrets.token_bytes(128)

algorithm = Algorithm.ML_DSA_44
keypair = keygen(algorithm, random_data)

message = b"Hello, Bitcoin PQC!"
signature = sign(algorithm, keypair.secret_key, message)

is_valid = verify(algorithm, keypair.public_key, message, signature)
print(f"Signature valid: {is_valid}")
```

## Breaking Changes (Phase 2)

- Rename `SLH_DSA_SHAKE_128S` → `SLH_DSA_SHA2_128S`
- Remove `FN_DSA_512` (no longer supported)
- Enum wire values: `SECP256K1_SCHNORR=0`, `ML_DSA_44=1`, `SLH_DSA_SHA2_128S=2`
- **Re-keying required:** SHAKE-128s keys/signatures are incompatible with SHA2-128s

## Running Tests

```bash
# From libbitcoinpqc-bindings/python (after make c-lib)
./run_tests.sh

# Or directly
python3 -m unittest discover -s tests -v
```

## License

MIT License.