import { getLibrary } from "./library";
import {
  Algorithm,
  ErrorCode,
  KeyPair,
  PqcError,
  PublicKey,
  SecretKey,
  Signature,
} from "./types";

// Re-export types
export {
  Algorithm,
  ErrorCode,
  KeyPair,
  PqcError,
  PublicKey,
  SecretKey,
  Signature,
};

/**
 * Get the public key size for an algorithm
 *
 * @param algorithm - The algorithm identifier
 * @returns The public key size in bytes
 */
export function publicKeySize(algorithm: Algorithm): number {
  return getLibrary().bitcoin_pqc_public_key_size(algorithm);
}

/**
 * Get the secret key size for an algorithm
 *
 * @param algorithm - The algorithm identifier
 * @returns The secret key size in bytes
 */
export function secretKeySize(algorithm: Algorithm): number {
  return getLibrary().bitcoin_pqc_secret_key_size(algorithm);
}

/**
 * Get the signature size for an algorithm
 *
 * @param algorithm - The algorithm identifier
 * @returns The signature size in bytes
 */
export function signatureSize(algorithm: Algorithm): number {
  return getLibrary().bitcoin_pqc_signature_size(algorithm);
}

function minKeygenEntropySize(algorithm: Algorithm): number {
  return algorithm === Algorithm.SECP256K1_SCHNORR ? 32 : 128;
}

/**
 * Generate a key pair for the specified algorithm
 *
 * @param algorithm - The PQC algorithm to use
 * @param randomData - Random bytes for key generation (32 bytes for secp, 128 for PQC)
 * @returns A new key pair
 * @throws {PqcError} If key generation fails
 */
export function generateKeyPair(
  algorithm: Algorithm,
  randomData: Uint8Array
): KeyPair {
  if (!(randomData instanceof Uint8Array)) {
    throw new PqcError(
      ErrorCode.BAD_ARGUMENT,
      "Random data must be a Uint8Array"
    );
  }

  const minEntropy = minKeygenEntropySize(algorithm);
  if (randomData.length < minEntropy) {
    throw new PqcError(
      ErrorCode.BAD_ARGUMENT,
      `Random data must be at least ${minEntropy} bytes for ${Algorithm[algorithm]}`
    );
  }

  const lib = getLibrary();
  const result = lib.bitcoin_pqc_keygen(algorithm, randomData);

  if (result.resultCode !== ErrorCode.OK) {
    throw new PqcError(result.resultCode);
  }

  const publicKey = new PublicKey(algorithm, result.publicKey);
  const secretKey = new SecretKey(algorithm, result.secretKey);

  return new KeyPair(publicKey, secretKey);
}

/**
 * Sign a message using the specified secret key
 *
 * @param secretKey - The secret key to sign with
 * @param message - The message to sign
 * @returns A signature
 * @throws {PqcError} If signing fails
 */
export function sign(secretKey: SecretKey, message: Uint8Array): Signature {
  if (!(secretKey instanceof SecretKey)) {
    throw new PqcError(
      ErrorCode.BAD_ARGUMENT,
      "Secret key must be a SecretKey instance"
    );
  }

  if (!(message instanceof Uint8Array)) {
    throw new PqcError(ErrorCode.BAD_ARGUMENT, "Message must be a Uint8Array");
  }

  if (
    secretKey.algorithm === Algorithm.SECP256K1_SCHNORR &&
    message.length < 32
  ) {
    throw new PqcError(
      ErrorCode.BAD_ARGUMENT,
      "Message must be at least 32 bytes for SECP256K1_SCHNORR (BIP-340 message hash)"
    );
  }

  const lib = getLibrary();
  const result = lib.bitcoin_pqc_sign(
    secretKey.algorithm,
    secretKey.bytes,
    message
  );

  if (result.resultCode !== ErrorCode.OK) {
    throw new PqcError(result.resultCode);
  }

  return new Signature(secretKey.algorithm, result.signature);
}

/**
 * Verify a signature using the specified public key
 *
 * @param publicKey - The public key to verify with
 * @param message - The message that was signed
 * @param signature - The signature to verify
 * @returns {void}
 * @throws {PqcError} If verification fails
 */
export function verify(
  publicKey: PublicKey,
  message: Uint8Array,
  signature: Signature | Uint8Array
): void {
  if (!(publicKey instanceof PublicKey)) {
    throw new PqcError(
      ErrorCode.BAD_ARGUMENT,
      "Public key must be a PublicKey instance"
    );
  }

  if (!(message instanceof Uint8Array)) {
    throw new PqcError(ErrorCode.BAD_ARGUMENT, "Message must be a Uint8Array");
  }

  if (
    publicKey.algorithm === Algorithm.SECP256K1_SCHNORR &&
    message.length < 32
  ) {
    throw new PqcError(
      ErrorCode.BAD_ARGUMENT,
      "Message must be at least 32 bytes for SECP256K1_SCHNORR (BIP-340 message hash)"
    );
  }

  const lib = getLibrary();
  const sigBytes = signature instanceof Signature ? signature.bytes : signature;

  if (!(sigBytes instanceof Uint8Array)) {
    throw new PqcError(
      ErrorCode.BAD_ARGUMENT,
      "Signature must be a Signature or Uint8Array instance"
    );
  }

  const result = lib.bitcoin_pqc_verify(
    publicKey.algorithm,
    publicKey.bytes,
    message,
    sigBytes
  );

  if (result !== ErrorCode.OK) {
    throw new PqcError(result);
  }
}
