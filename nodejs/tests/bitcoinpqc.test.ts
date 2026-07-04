import {
  Algorithm,
  PqcError,
  generateKeyPair,
  publicKeySize,
  secretKeySize,
  sign,
  signatureSize,
  verify,
} from "../src";

import {
  SLH_DSA_SHA2_EXPECTED_PK,
  SLH_DSA_SHA2_EXPECTED_SIG,
  SLH_DSA_SHA2_TEST_ENTROPY,
  SLH_DSA_SHA2_TEST_MESSAGE,
} from "./slh_dsa_sha2_golden_vectors";

describe("Bitcoin PQC", () => {
  // Generate random data for tests
  function getRandomBytes(size: number): Uint8Array {
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
    return bytes;
  }

  test("algorithm enum wire values", () => {
    expect(Algorithm.SECP256K1_SCHNORR).toBe(0);
    expect(Algorithm.ML_DSA_44).toBe(1);
    expect(Algorithm.SLH_DSA_SHA2_128S).toBe(2);
  });

  describe("key sizes", () => {
    test("should report correct key sizes for each algorithm", () => {
      expect(publicKeySize(Algorithm.SECP256K1_SCHNORR)).toBe(32);
      expect(secretKeySize(Algorithm.SECP256K1_SCHNORR)).toBe(32);
      expect(signatureSize(Algorithm.SECP256K1_SCHNORR)).toBe(64);

      expect(publicKeySize(Algorithm.ML_DSA_44)).toBe(1312);
      expect(secretKeySize(Algorithm.ML_DSA_44)).toBe(2560);
      expect(signatureSize(Algorithm.ML_DSA_44)).toBe(2420);

      expect(publicKeySize(Algorithm.SLH_DSA_SHA2_128S)).toBe(32);
      expect(secretKeySize(Algorithm.SLH_DSA_SHA2_128S)).toBe(64);
      expect(signatureSize(Algorithm.SLH_DSA_SHA2_128S)).toBe(7856);
    });
  });

  describe("ML-DSA-44 (Dilithium)", () => {
    const algorithm = Algorithm.ML_DSA_44;

    // Skip this test for now
    test.skip("should generate keypair, sign and verify", () => {
      const randomData = getRandomBytes(128);
      const keypair = generateKeyPair(algorithm, randomData);

      expect(keypair.publicKey.bytes.length).toBe(publicKeySize(algorithm));
      expect(keypair.secretKey.bytes.length).toBe(secretKeySize(algorithm));

      const message = new TextEncoder().encode("Hello, Bitcoin PQC!");
      const signature = sign(keypair.secretKey, message);

      expect(signature.bytes.length).toBe(signatureSize(algorithm));

      expect(() => {
        verify(keypair.publicKey, message, signature);
      }).not.toThrow();

      expect(() => {
        verify(keypair.publicKey, message, signature.bytes);
      }).not.toThrow();

      const badMessage = new TextEncoder().encode("Bad message!");
      expect(() => {
        verify(keypair.publicKey, badMessage, signature);
      }).toThrow(PqcError);
    });
  });

  describe("SLH-DSA-SHA2-128s (SPHINCS+)", () => {
    const algorithm = Algorithm.SLH_DSA_SHA2_128S;

    test("should generate keypair, sign and verify", () => {
      const randomData = getRandomBytes(128);
      const keypair = generateKeyPair(algorithm, randomData);

      expect(keypair.publicKey.bytes.length).toBe(publicKeySize(algorithm));
      expect(keypair.secretKey.bytes.length).toBe(secretKeySize(algorithm));

      const message = new TextEncoder().encode("Hello, Bitcoin PQC!");
      const signature = sign(keypair.secretKey, message);

      expect(signature.bytes.length).toBe(signatureSize(algorithm));

      expect(() => {
        verify(keypair.publicKey, message, signature);
      }).not.toThrow();
    });

    test("golden vectors match libbitcoinpqc reference", () => {
      const keypair = generateKeyPair(algorithm, SLH_DSA_SHA2_TEST_ENTROPY);

      expect(Buffer.from(keypair.publicKey.bytes)).toEqual(
        Buffer.from(SLH_DSA_SHA2_EXPECTED_PK)
      );

      const message = new TextEncoder().encode(SLH_DSA_SHA2_TEST_MESSAGE);
      const signature = sign(keypair.secretKey, message);

      expect(Buffer.from(signature.bytes)).toEqual(
        Buffer.from(SLH_DSA_SHA2_EXPECTED_SIG)
      );

      expect(() => {
        verify(keypair.publicKey, message, signature);
      }).not.toThrow();
    });
  });

  describe("error conditions", () => {
    test("should throw on invalid input", () => {
      expect(() => {
        const randomData = getRandomBytes(128);
        generateKeyPair(99 as Algorithm, randomData);
      }).toThrow(PqcError);

      expect(() => {
        const randomData = getRandomBytes(16);
        generateKeyPair(Algorithm.ML_DSA_44, randomData);
      }).toThrow(PqcError);
    });
  });
});