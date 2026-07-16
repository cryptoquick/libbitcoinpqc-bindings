@jbride/bitcoinpqc-wasm

WebAssembly build of libbitcoinpqc for browser and Node.js — the three BIP 360 (P2MR) tapscript signature algorithms (classical secp256k1 Schnorr plus two post-quantum options).

## 1. Features

- ✅ **SECP256K1_SCHNORR** (BIP-340) - Classical Schnorr + x-only public keys
- ✅ **ML-DSA-44** (Dilithium) - Fast post-quantum signatures
- ✅ **SLH-DSA-SHA2-128s** (SPHINCS+) - Stateless hash-based signatures
- ✅ **High-level API** - TypeScript class with keygen, sign, and verify methods
- ✅ **Low-level API** - Direct WASM `ccall`/`cwrap` access for advanced usage
- ✅ **Browser support** - Works in modern browsers with WebAssembly
- ✅ **Node.js support** - Works in Node.js 14+
- ✅ **TypeScript support** - Full TypeScript definitions included

## 2. Installation

```bash
npm install @jbride/bitcoinpqc-wasm
```

## Breaking Changes (Phase 2)

- Rename `SLH_DSA_SHAKE_128S` → `SLH_DSA_SHA2_128S` (enum wire value `2` unchanged)
- WASM build now uses SHA2 SPHINCS+ sources (`hash_sha2.c`, `thash_sha2_simple.c`, `sha2.c`)
- **Re-keying required:** SHAKE-128s keys/signatures are incompatible with SHA2-128s

## 3. API Reference

This section documents the **high-level TypeScript/JavaScript API** (`dist/index.js`), which provides a clean, type-safe interface with automatic memory management. For direct access to the underlying WebAssembly module (low-level API), see the [Low-Level API Test](#low-level-api-test-testtest-raw-wasmjs) section below.

### 3.1. Algorithms

```typescript
enum Algorithm {
    SECP256K1_SCHNORR = 0,   // BIP-340 Schnorr + x-only (classical)
    ML_DSA_44 = 1,           // Dilithium (recommended for most use cases)
    SLH_DSA_SHA2_128S = 2    // SPHINCS+ (stateless hash-based)
}
```

### 3.2. Key Sizes

```typescript
// SECP256K1_SCHNORR (BIP-340)
publicKeySize: 32 bytes
secretKeySize: 32 bytes
signatureSize: 64 bytes

// ML-DSA-44
publicKeySize: 1312 bytes
secretKeySize: 2560 bytes
signatureSize: 2420 bytes

// SLH-DSA-SHA2-128s
publicKeySize: 32 bytes
secretKeySize: 64 bytes
signatureSize: 7856 bytes
```

### 3.3. Methods

#### 3.3.1. `init(config?: ModuleConfig): Promise<void>`

Initialize the WASM module. Must be called before using any other methods.

**Parameters:**
- `config` (optional): Configuration object
  - `getRandomValues`: Custom random number generator function
  - `onRuntimeInitialized`: Callback when module is ready
  - `print`: Custom print function for debug output
  - `printErr`: Custom error print function

#### 3.3.2. `generateKeypair(algorithm: Algorithm, randomData: Uint8Array): KeyPair`

Generate a new key pair.

**Parameters:**
- `algorithm`: The algorithm to use
- `randomData`: Entropy for key generation (32 bytes for SECP256K1_SCHNORR, 128 bytes for ML-DSA-44 and SLH-DSA-SHA2-128s)

**Returns:** `KeyPair` object with `publicKey`, `secretKey`, `publicKeySize`, `secretKeySize`

#### 3.3.3. `sign(secretKey: Uint8Array, message: Uint8Array, algorithm: Algorithm): Signature`

Sign a message.

**Parameters:**
- `secretKey`: The secret key
- `message`: The message to sign
- `algorithm`: The algorithm to use

**Returns:** `Signature` object with `bytes` and `size`

#### 3.3.4. `verify(publicKey: Uint8Array, message: Uint8Array, signature: Signature, algorithm: Algorithm): boolean`

Verify a signature.

**Parameters:**
- `publicKey`: The public key
- `message`: The original message
- `signature`: The signature to verify
- `algorithm`: The algorithm to use

**Returns:** `true` if signature is valid, `false` otherwise

#### 3.3.5. `publicKeySize(algorithm: Algorithm): number`
#### 3.3.6. `secretKeySize(algorithm: Algorithm): number`
#### 3.3.7. `signatureSize(algorithm: Algorithm): number`

Get key and signature sizes for an algorithm.

## 4. Building from Source

If you want to build the WASM module from source:

### 4.1. Prerequisites

1. Install Emscripten SDK (anywhere on your local filesystem):
```bash
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
```

2. At the terminal, move back into the `wasm` directory of this project

3. Install dependencies:
```bash
npm install
```

### 4.2. Build

```bash
npm run build
```

This will:
1. Compile C sources to WebAssembly (`build:wasm`)
2. Copy WASM files to `dist/` (`copy:wasm`)
3. Compile TypeScript to JavaScript (`build:ts`)

## 5. Testing

The package includes two test scripts that demonstrate different ways to use the library:

### 5.1. Running Tests

Run both tests:
```bash
npm test
```

Or run them individually:
```bash
npm run test:high-level   # High-level API test
npm run test:low-level    # Low-level API test
```

### 5.2. Details of High-Level API Test (`test/test-npm-package.js`)

Tests the TypeScript wrapper API (`dist/index.js`) which provides a clean, high-level interface:

This test demonstrates:
- Using the `bitcoinpqc` singleton instance
- Using the `Algorithm` enum for algorithm selection
- Automatic memory management (no manual `malloc`/`free`)
- Clean API with methods like `generateKeypair()`, `sign()`, and `verify()`

### 5.3. Details of Low-Level API Test (`test/test-raw-wasm.js`)

Tests the raw Emscripten-generated module (`dist/bitcoinpqc.js`) which provides direct access to the WASM functions:

This test demonstrates:
- Direct use of `Module.ccall()` for calling WASM functions
- Manual memory management with `_malloc()` and `_free()`
- Direct access to WASM memory via `HEAP8`, `HEAP32`, etc.
- Numeric algorithm IDs instead of enums

### 5.4. Browser Testing

Render index.html in a webserver:

> cd wasm; python3 -m http.server 8000

The page allows you to:
- Select between low-level and high-level APIs
- Test SECP256K1_SCHNORR, ML-DSA-44, and SLH-DSA-SHA2-128s algorithms
- See performance metrics and test results
