/**
 * Bitcoin PQC WebAssembly Library
 *
 * This module provides a TypeScript/JavaScript wrapper for the Bitcoin PQC
 * WebAssembly library, supporting both browser and Node.js environments.
 */
export declare enum Algorithm {
    /** BIP-340 Schnorr + X-Only - Elliptic Curve Digital Signature Algorithm */
    SECP256K1_SCHNORR = 0,
    /** ML-DSA-44 (CRYSTALS-Dilithium) - Lattice-based signature scheme */
    ML_DSA_44 = 1,
    /** SLH-DSA-SHA2-128s (SPHINCS+) - Hash-based signature scheme */
    SLH_DSA_SHA2_128S = 2
}
export interface KeyPair {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
    publicKeySize: number;
    secretKeySize: number;
}
export interface Signature {
    bytes: Uint8Array;
    size: number;
}
export interface ModuleConfig {
    getRandomValues?: (arr: Uint8Array) => Uint8Array;
    onRuntimeInitialized?: () => void;
    print?: (text: string) => void;
    printErr?: (text: string) => void;
}
export interface BitcoinPQCModule {
    ccall: (func: string, returnType: string, argTypes: string[], args: any[]) => any;
    cwrap: (func: string, returnType: string, argTypes: string[]) => Function;
    _malloc: (size: number) => number;
    _free: (ptr: number) => void;
    HEAP8: Uint8Array;
    HEAP32: Int32Array;
    HEAPU8: Uint8Array;
}
/**
 * BitcoinPQC class - Main interface for the WASM library
 */
export declare class BitcoinPQC {
    private module;
    private initialized;
    /**
     * Initialize the WASM module
     * @param config Optional configuration for the module
     * @returns Promise that resolves when the module is ready
     */
    init(config?: ModuleConfig): Promise<void>;
    /**
     * Get default random values implementation
     */
    private getDefaultRandomValues;
    /**
     * Ensure module is initialized
     */
    private ensureInitialized;
    /**
     * Get public key size for an algorithm
     */
    publicKeySize(algorithm: Algorithm): number;
    /**
     * Get secret key size for an algorithm
     */
    secretKeySize(algorithm: Algorithm): number;
    /**
     * Get signature size for an algorithm
     */
    signatureSize(algorithm: Algorithm): number;
    /**
     * Generate a key pair
     * @param algorithm The algorithm to use
     * @param randomData Entropy for key generation (32 bytes for SECP256K1_SCHNORR, 128 for PQC)
     */
    generateKeypair(algorithm: Algorithm, randomData: Uint8Array): KeyPair;
    /**
     * Sign a message
     * @param secretKey The secret key
     * @param message The message to sign
     * @param algorithm The algorithm to use
     */
    sign(secretKey: Uint8Array, message: Uint8Array, algorithm: Algorithm): Signature;
    /**
     * Verify a signature
     * @param publicKey The public key
     * @param message The original message
     * @param signature The signature to verify
     * @param algorithm The algorithm to use
     */
    verify(publicKey: Uint8Array, message: Uint8Array, signature: Signature, algorithm: Algorithm): boolean;
    /**
     * Read a 32-bit unsigned integer from WASM memory
     */
    private readUint32;
    /**
     * Get the underlying WASM module (for advanced usage)
     */
    getModule(): BitcoinPQCModule;
}
export declare const bitcoinpqc: BitcoinPQC;
export default bitcoinpqc;
//# sourceMappingURL=index.d.ts.map