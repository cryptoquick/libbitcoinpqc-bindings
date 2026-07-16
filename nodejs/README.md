# BitcoinPQC - NodeJS TypeScript Bindings

TypeScript bindings for the [libbitcoinpqc](https://github.com/cryptoquick/libbitcoinpqc) library — the three BIP 360 (P2MR) tapscript signature algorithms: secp256k1 Schnorr (BIP 340), ML-DSA-44, and SLH-DSA-SHA2-128s. See [BIP 360](https://github.com/bitcoin/bips/blob/master/bip-0360.mediawiki).

## Features

- Full TypeScript support with typings
- Clean, ergonomic API
- Compatible with Node.js 16+
- All three BIP 360 tapscript algorithms:
  - SECP256K1_SCHNORR (BIP-340 Schnorr)
  - ML-DSA-44 (CRYSTALS-Dilithium)
  - SLH-DSA-SHA2-128s (SPHINCS+)

## Installation

```bash
npm install bitcoinpqc
```

### Prerequisites

Build from the bindings repo (recommended):

```bash
git clone --recurse-submodules https://github.com/cryptoquick/libbitcoinpqc-bindings.git
cd libbitcoinpqc-bindings/nodejs
npm ci
npm run build
npm test
```

The native addon compiles `libbitcoinpqc` sources vendored under `nodejs/native/` during `npm run build`.

## API Usage

```typescript
import { Algorithm, generateKeyPair, sign, verify } from 'bitcoinpqc';
import crypto from 'crypto';

// Generate random data for key generation
const randomData = crypto.randomBytes(128);

// Generate a key pair using ML-DSA-44 (CRYSTALS-Dilithium)
const keypair = generateKeyPair(Algorithm.ML_DSA_44, randomData);

// Create a message to sign
const message = Buffer.from('Message to sign');

// Sign the message deterministically
const signature = sign(keypair.secretKey, message);

// Verify the signature
verify(keypair.publicKey, message, signature);
// If verification fails, it will throw a PqcError

// You can also verify using the raw signature bytes
verify(keypair.publicKey, message, signature.bytes);
```

## API Reference

### Enums

#### `Algorithm`

```typescript
enum Algorithm {
  /** BIP-340 Schnorr + X-Only - Elliptic Curve Digital Signature Algorithm */
  SECP256K1_SCHNORR = 0,
  /** ML-DSA-44 (CRYSTALS-Dilithium) - Lattice-based signature scheme */
  ML_DSA_44 = 1,
  /** SLH-DSA-SHA2-128s (SPHINCS+) - Hash-based signature scheme */
  SLH_DSA_SHA2_128S = 2
}
```

### Classes

#### `PublicKey`

```typescript
class PublicKey {
  readonly algorithm: Algorithm;
  readonly bytes: Uint8Array;
}
```

#### `SecretKey`

```typescript
class SecretKey {
  readonly algorithm: Algorithm;
  readonly bytes: Uint8Array;
}
```

#### `KeyPair`

```typescript
class KeyPair {
  readonly publicKey: PublicKey;
  readonly secretKey: SecretKey;
}
```

#### `Signature`

```typescript
class Signature {
  readonly algorithm: Algorithm;
  readonly bytes: Uint8Array;
}
```

#### `PqcError`

```typescript
class PqcError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message?: string);
}

enum ErrorCode {
  OK = 0,
  BAD_ARGUMENT = -1,
  BAD_KEY = -2,
  BAD_SIGNATURE = -3,
  NOT_IMPLEMENTED = -4
}
```

### Functions

#### `publicKeySize(algorithm: Algorithm): number`

Get the public key size for an algorithm.

#### `secretKeySize(algorithm: Algorithm): number`

Get the secret key size for an algorithm.

#### `signatureSize(algorithm: Algorithm): number`

Get the signature size for an algorithm.

#### `generateKeyPair(algorithm: Algorithm, randomData: Uint8Array): KeyPair`

Generate a key pair for the specified algorithm. Use **32 bytes** of entropy for `SECP256K1_SCHNORR` and **128 bytes** for PQC algorithms.

#### `sign(secretKey: SecretKey, message: Uint8Array): Signature`

Sign a message using the specified secret key. The signature is deterministic based on the message and key.

#### `verify(publicKey: PublicKey, message: Uint8Array, signature: Signature | Uint8Array): void`

Verify a signature using the specified public key. Throws a `PqcError` if verification fails.

## Breaking Changes (Phase 2)

- Rename `SLH_DSA_SHAKE_128S` → `SLH_DSA_SHA2_128S` (enum wire value `2` unchanged)
- ML-DSA secret key size is **2560** bytes (was incorrectly documented as 2528)
- **Re-keying required:** SHAKE-128s keys/signatures are incompatible with SHA2-128s

## Algorithm Characteristics

| Algorithm          | Public Key Size | Secret Key Size | Signature Size | Security Level |
| ------------------ | --------------- | --------------- | -------------- | -------------- |
| SECP256K1_SCHNORR  | 32 bytes        | 32 bytes        | 64 bytes       | Classical      |
| ML-DSA-44          | 1,312 bytes     | 2,560 bytes     | 2,420 bytes    | NIST Level 2   |
| SLH-DSA-SHA2-128s  | 32 bytes        | 64 bytes        | 7,856 bytes    | NIST Level 1   |

## Security Notes

- Random data is required for key generation but not for signing. All signatures are deterministic, based on the message and secret key.
- The implementations are based on reference code from the NIST PQC standardization process and are not production-hardened.
- Care should be taken to securely manage secret keys in applications.

## BIP 360 / P2MR compliance

TypeScript bindings for the tapscript signature overloads specified in [BIP 360 (P2MR)](https://github.com/bitcoin/bips/blob/master/bip-0360.mediawiki).

## License

This project is licensed under the MIT License - see the LICENSE file for details.
