/**
 * Bitcoin PQC WebAssembly Library
 *
 * This module provides a TypeScript/JavaScript wrapper for the Bitcoin PQC
 * WebAssembly library, supporting both browser and Node.js environments.
 */
// Type definitions
export var Algorithm;
(function (Algorithm) {
    /** BIP-340 Schnorr + X-Only - Elliptic Curve Digital Signature Algorithm */
    Algorithm[Algorithm["SECP256K1_SCHNORR"] = 0] = "SECP256K1_SCHNORR";
    /** ML-DSA-44 (CRYSTALS-Dilithium) - Lattice-based signature scheme */
    Algorithm[Algorithm["ML_DSA_44"] = 1] = "ML_DSA_44";
    /** SLH-DSA-SHA2-128s (SPHINCS+) - Hash-based signature scheme */
    Algorithm[Algorithm["SLH_DSA_SHA2_128S"] = 2] = "SLH_DSA_SHA2_128S";
})(Algorithm || (Algorithm = {}));
const MIN_PQC_KEYGEN_ENTROPY = 128;
const MIN_SECP_KEYGEN_ENTROPY = 32;
const MIN_SECP_MESSAGE_LENGTH = 32;
function minKeygenEntropySize(algorithm) {
    return algorithm === Algorithm.SECP256K1_SCHNORR ? MIN_SECP_KEYGEN_ENTROPY : MIN_PQC_KEYGEN_ENTROPY;
}
function algorithmName(algorithm) {
    return Algorithm[algorithm] ?? String(algorithm);
}
/**
 * BitcoinPQC class - Main interface for the WASM library
 */
export class BitcoinPQC {
    constructor() {
        this.module = null;
        this.initialized = false;
    }
    /**
     * Initialize the WASM module
     * @param config Optional configuration for the module
     * @returns Promise that resolves when the module is ready
     */
    async init(config) {
        if (this.initialized && this.module) {
            return;
        }
        // Dynamic import for browser/node compatibility
        let moduleFactory;
        // Check if we're in a browser environment
        // Use type guards to avoid TypeScript errors
        const hasWindow = typeof globalThis.window !== 'undefined' ||
            (typeof globalThis !== 'undefined' && 'document' in globalThis);
        const isBrowser = hasWindow;
        if (isBrowser) {
            // Browser: Check if Module is available globally (from script tag)
            const globalModule = (typeof globalThis !== 'undefined' ? globalThis.Module : undefined) ||
                (typeof globalThis.window !== 'undefined' ? globalThis.window.Module : undefined);
            if (globalModule) {
                moduleFactory = globalModule;
            }
            else {
                // Try to load via dynamic import (bitcoinpqc.js should be in same directory as dist/index.js)
                // Use type assertion to avoid TypeScript error about missing module
                try {
                    const module = await import('./bitcoinpqc.js');
                    moduleFactory = module.default || module;
                }
                catch (error) {
                    throw new Error('bitcoinpqc.js not found. Make sure it is built and accessible. Error: ' + error.message);
                }
            }
        }
        else {
            // Node.js - use dynamic import for ES module compatibility
            const { createRequire } = await import('module');
            const require = createRequire(import.meta.url);
            // Use require for path and fs since they're CommonJS modules
            const path = require('path');
            const fs = require('fs');
            // Get the directory of the current module
            // import.meta.url is a file:// URL, need to convert to path
            const currentFileUrl = import.meta.url;
            const __dirname = path.dirname(currentFileUrl.startsWith('file://')
                ? new URL(currentFileUrl).pathname
                : currentFileUrl);
            // In dist/, bitcoinpqc.js should be in the same directory
            const wasmPath = path.join(__dirname, './bitcoinpqc.js');
            if (!fs.existsSync(wasmPath)) {
                throw new Error(`bitcoinpqc.js not found at ${wasmPath}. Make sure to build the WASM module first.`);
            }
            moduleFactory = require(wasmPath);
        }
        // Create module configuration
        const moduleConfig = {
            onRuntimeInitialized: () => {
                if (config?.onRuntimeInitialized) {
                    config.onRuntimeInitialized();
                }
            },
            print: config?.print || ((text) => console.log('WASM:', text)),
            printErr: config?.printErr || ((text) => console.error('WASM Error:', text)),
            getRandomValues: config?.getRandomValues || await this.getDefaultRandomValues(),
        };
        // Initialize module
        this.module = await moduleFactory(moduleConfig);
        this.initialized = true;
    }
    /**
     * Get default random values implementation
     */
    async getDefaultRandomValues() {
        // Check for browser crypto API
        if (typeof globalThis !== 'undefined' && typeof globalThis.crypto !== 'undefined' &&
            typeof globalThis.crypto.getRandomValues === 'function') {
            return (arr) => globalThis.crypto.getRandomValues(arr);
        }
        // Check for window.crypto (browser) - use globalThis to avoid TypeScript errors
        const win = (typeof globalThis !== 'undefined' && globalThis.window) ? globalThis.window : undefined;
        if (win && typeof win.crypto !== 'undefined' && typeof win.crypto.getRandomValues === 'function') {
            return (arr) => win.crypto.getRandomValues(arr);
        }
        // Node.js fallback - use dynamic import for ES module compatibility
        try {
            const { createRequire } = await import('module');
            const require = createRequire(import.meta.url);
            const crypto = require('crypto');
            return (arr) => {
                const randomBytes = crypto.randomBytes(arr.length);
                arr.set(randomBytes);
                return arr;
            };
        }
        catch (error) {
            throw new Error('No random number generator available');
        }
    }
    /**
     * Ensure module is initialized
     */
    ensureInitialized() {
        if (!this.initialized || !this.module) {
            throw new Error('Module not initialized. Call init() first.');
        }
    }
    /**
     * Get public key size for an algorithm
     */
    publicKeySize(algorithm) {
        this.ensureInitialized();
        return this.module.ccall('bitcoin_pqc_public_key_size', 'number', ['number'], [algorithm]);
    }
    /**
     * Get secret key size for an algorithm
     */
    secretKeySize(algorithm) {
        this.ensureInitialized();
        return this.module.ccall('bitcoin_pqc_secret_key_size', 'number', ['number'], [algorithm]);
    }
    /**
     * Get signature size for an algorithm
     */
    signatureSize(algorithm) {
        this.ensureInitialized();
        return this.module.ccall('bitcoin_pqc_signature_size', 'number', ['number'], [algorithm]);
    }
    /**
     * Generate a key pair
     * @param algorithm The algorithm to use
     * @param randomData Entropy for key generation (32 bytes for SECP256K1_SCHNORR, 128 for PQC)
     */
    generateKeypair(algorithm, randomData) {
        this.ensureInitialized();
        const mod = this.module;
        const minEntropy = minKeygenEntropySize(algorithm);
        if (randomData.length < minEntropy) {
            throw new Error(`Random data must be at least ${minEntropy} bytes for ${algorithmName(algorithm)}`);
        }
        const randomPtr = mod._malloc(randomData.length);
        mod.HEAP8.set(randomData, randomPtr);
        const keypairPtr = mod._malloc(32);
        const result = mod.ccall('bitcoin_pqc_keygen', 'number', ['number', 'number', 'number', 'number'], [algorithm, keypairPtr, randomPtr, randomData.length]);
        mod._free(randomPtr);
        if (result !== 0) {
            mod._free(keypairPtr);
            throw new Error(`Key generation failed with error code: ${result}`);
        }
        // Read keypair structure
        const publicKeyPtr = this.readUint32(keypairPtr + 4);
        const secretKeyPtr = this.readUint32(keypairPtr + 8);
        const publicKeySize = this.readUint32(keypairPtr + 12);
        const secretKeySize = this.readUint32(keypairPtr + 16);
        // Read keys from memory (copy before freeing native allocations)
        const publicKey = new Uint8Array(mod.HEAP8.subarray(publicKeyPtr, publicKeyPtr + publicKeySize));
        const secretKey = new Uint8Array(mod.HEAP8.subarray(secretKeyPtr, secretKeyPtr + secretKeySize));
        mod.ccall('bitcoin_pqc_keypair_free', 'void', ['number'], [keypairPtr]);
        mod._free(keypairPtr);
        return {
            publicKey,
            secretKey,
            publicKeySize,
            secretKeySize,
        };
    }
    /**
     * Sign a message
     * @param secretKey The secret key
     * @param message The message to sign
     * @param algorithm The algorithm to use
     */
    sign(secretKey, message, algorithm) {
        this.ensureInitialized();
        const mod = this.module;
        if (algorithm === Algorithm.SECP256K1_SCHNORR && message.length < MIN_SECP_MESSAGE_LENGTH) {
            throw new Error('Message must be at least 32 bytes for SECP256K1_SCHNORR (BIP-340 message hash)');
        }
        const secretKeyPtr = mod._malloc(secretKey.length);
        mod.HEAP8.set(secretKey, secretKeyPtr);
        const messagePtr = mod._malloc(message.length);
        mod.HEAP8.set(message, messagePtr);
        const signaturePtr = mod._malloc(16);
        mod.HEAP8.fill(0, signaturePtr, signaturePtr + 16);
        // Set algorithm field
        if (mod.HEAP32) {
            mod.HEAP32[signaturePtr >> 2] = algorithm;
        }
        else {
            mod.HEAP8[signaturePtr] = algorithm & 0xFF;
            mod.HEAP8[signaturePtr + 1] = (algorithm >> 8) & 0xFF;
            mod.HEAP8[signaturePtr + 2] = (algorithm >> 16) & 0xFF;
            mod.HEAP8[signaturePtr + 3] = (algorithm >> 24) & 0xFF;
        }
        const result = mod.ccall('bitcoin_pqc_sign', 'number', ['number', 'number', 'number', 'number', 'number', 'number'], [algorithm, secretKeyPtr, secretKey.length, messagePtr, message.length, signaturePtr]);
        mod._free(secretKeyPtr);
        mod._free(messagePtr);
        if (result !== 0) {
            mod._free(signaturePtr);
            throw new Error(`Signing failed with error code: ${result}`);
        }
        // Read signature structure
        const signatureDataPtr = this.readUint32(signaturePtr + 4);
        const signatureSize = this.readUint32(signaturePtr + 8);
        const signature = new Uint8Array(mod.HEAP8.subarray(signatureDataPtr, signatureDataPtr + signatureSize));
        mod.ccall('bitcoin_pqc_signature_free', 'void', ['number'], [signaturePtr]);
        mod._free(signaturePtr);
        return {
            bytes: signature,
            size: signatureSize,
        };
    }
    /**
     * Verify a signature
     * @param publicKey The public key
     * @param message The original message
     * @param signature The signature to verify
     * @param algorithm The algorithm to use
     */
    verify(publicKey, message, signature, algorithm) {
        this.ensureInitialized();
        const mod = this.module;
        if (algorithm === Algorithm.SECP256K1_SCHNORR && message.length < MIN_SECP_MESSAGE_LENGTH) {
            throw new Error('Message must be at least 32 bytes for SECP256K1_SCHNORR (BIP-340 message hash)');
        }
        const publicKeyPtr = mod._malloc(publicKey.length);
        mod.HEAP8.set(publicKey, publicKeyPtr);
        const messagePtr = mod._malloc(message.length);
        mod.HEAP8.set(message, messagePtr);
        const signaturePtr = mod._malloc(signature.bytes.length);
        mod.HEAP8.set(signature.bytes, signaturePtr);
        const result = mod.ccall('bitcoin_pqc_verify', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number'], [algorithm, publicKeyPtr, publicKey.length, messagePtr, message.length, signaturePtr, signature.bytes.length]);
        mod._free(publicKeyPtr);
        mod._free(messagePtr);
        mod._free(signaturePtr);
        return result === 0; // BITCOIN_PQC_OK = 0
    }
    /**
     * Read a 32-bit unsigned integer from WASM memory
     */
    readUint32(ptr) {
        const mod = this.module;
        if (mod.HEAP32) {
            return (mod.HEAP32[ptr >> 2] >>> 0);
        }
        const heap = mod.HEAP8;
        return (heap[ptr] | (heap[ptr + 1] << 8) | (heap[ptr + 2] << 16) | (heap[ptr + 3] << 24)) >>> 0;
    }
    /**
     * Get the underlying WASM module (for advanced usage)
     */
    getModule() {
        this.ensureInitialized();
        return this.module;
    }
}
// Export a singleton instance
export const bitcoinpqc = new BitcoinPQC();
// Export default
export default bitcoinpqc;
