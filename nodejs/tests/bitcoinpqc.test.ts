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
  ML_DSA_44_EXPECTED_PK,
  ML_DSA_44_EXPECTED_SIG,
  ML_DSA_44_TEST_ENTROPY,
  ML_DSA_44_TEST_MESSAGE,
} from "./ml_dsa_44_golden_vectors";
import {
  SECP256K1_BIP340_ROW0_EXPECTED_PK,
  SECP256K1_BIP340_ROW0_EXPECTED_SIG,
  SECP256K1_BIP340_ROW0_MESSAGE,
  SECP256K1_BIP340_ROW0_SECRET,
} from "./secp256k1_bip340_golden_vectors";
import {
  SLH_DSA_SHA2_EXPECTED_PK,
  SLH_DSA_SHA2_EXPECTED_SIG,
  SLH_DSA_SHA2_TEST_ENTROPY,
  SLH_DSA_SHA2_TEST_MESSAGE,
} from "./slh_dsa_sha2_golden_vectors";

describe("Bitcoin PQC", () => {
  function getRandomBytes(size: number): Uint8Array {
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
    return bytes;
  }

  function e2eAlgorithm(
    algorithm: Algorithm,
    message: Uint8Array,
    tamperedMessage: Uint8Array
  ): void {
    const entropySize = algorithm === Algorithm.SECP256K1_SCHNORR ? 32 : 128;
    const randomData = getRandomBytes(entropySize);
    const keypair = generateKeyPair(algorithm, randomData);

    expect(keypair.publicKey.bytes.length).toBe(publicKeySize(algorithm));
    expect(keypair.secretKey.bytes.length).toBe(secretKeySize(algorithm));

    const signature = sign(keypair.secretKey, message);

    expect(signature.bytes.length).toBe(signatureSize(algorithm));

    expect(() => {
      verify(keypair.publicKey, message, signature);
    }).not.toThrow();

    expect(() => {
      verify(keypair.publicKey, message, signature.bytes);
    }).not.toThrow();

    expect(() => {
      verify(keypair.publicKey, tamperedMessage, signature);
    }).toThrow(PqcError);
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

  describe("SECP256K1_SCHNORR", () => {
    const algorithm = Algorithm.SECP256K1_SCHNORR;

    test("BIP-340 row 0 keygen sign verify", () => {
      const keypair = generateKeyPair(algorithm, SECP256K1_BIP340_ROW0_SECRET);

      expect(Buffer.from(keypair.publicKey.bytes)).toEqual(
        Buffer.from(SECP256K1_BIP340_ROW0_EXPECTED_PK)
      );
      expect(Buffer.from(keypair.secretKey.bytes)).toEqual(
        Buffer.from(SECP256K1_BIP340_ROW0_SECRET)
      );

      const signature = sign(keypair.secretKey, SECP256K1_BIP340_ROW0_MESSAGE);

      expect(signature.bytes.length).toBe(signatureSize(algorithm));

      expect(() => {
        verify(keypair.publicKey, SECP256K1_BIP340_ROW0_MESSAGE, signature);
      }).not.toThrow();

      const tamperedMessage = Buffer.from(SECP256K1_BIP340_ROW0_MESSAGE);
      tamperedMessage[31] ^= 0x01;

      expect(() => {
        verify(keypair.publicKey, tamperedMessage, signature);
      }).toThrow(PqcError);
    });

    test("BIP-340 row 0 golden signature", () => {
      const keypair = generateKeyPair(algorithm, SECP256K1_BIP340_ROW0_SECRET);
      const signature = sign(keypair.secretKey, SECP256K1_BIP340_ROW0_MESSAGE);

      expect(Buffer.from(signature.bytes)).toEqual(
        Buffer.from(SECP256K1_BIP340_ROW0_EXPECTED_SIG)
      );
    });

    test("should generate keypair, sign and verify", () => {
      const message = SECP256K1_BIP340_ROW0_MESSAGE;
      const tamperedMessage = Buffer.from(message);
      tamperedMessage[31] ^= 0x01;

      e2eAlgorithm(algorithm, message, tamperedMessage);
    });

    test("rejects bad inputs", () => {
      expect(() => {
        generateKeyPair(algorithm, getRandomBytes(31));
      }).toThrow(PqcError);

      expect(() => {
        generateKeyPair(algorithm, Buffer.alloc(32, 0));
      }).toThrow(PqcError);

      const keypair = generateKeyPair(algorithm, SECP256K1_BIP340_ROW0_SECRET);

      expect(() => {
        sign(keypair.secretKey, getRandomBytes(31));
      }).toThrow(PqcError);
    });
  });

  describe("ML-DSA-44 (Dilithium)", () => {
    const algorithm = Algorithm.ML_DSA_44;

    test("golden vectors match libbitcoinpqc reference", () => {
      const keypair = generateKeyPair(algorithm, ML_DSA_44_TEST_ENTROPY);

      expect(Buffer.from(keypair.publicKey.bytes)).toEqual(
        Buffer.from(ML_DSA_44_EXPECTED_PK)
      );

      const message = new TextEncoder().encode(ML_DSA_44_TEST_MESSAGE);
      const signature = sign(keypair.secretKey, message);

      expect(Buffer.from(signature.bytes)).toEqual(
        Buffer.from(ML_DSA_44_EXPECTED_SIG)
      );

      expect(() => {
        verify(keypair.publicKey, message, signature);
      }).not.toThrow();
    });

    test("should generate keypair, sign and verify", () => {
      const message = new TextEncoder().encode("Hello, Bitcoin PQC!");
      const tamperedMessage = new TextEncoder().encode("Bad message!");

      e2eAlgorithm(algorithm, message, tamperedMessage);
    });
  });

  describe("SLH-DSA-SHA2-128s (SPHINCS+)", () => {
    const algorithm = Algorithm.SLH_DSA_SHA2_128S;

    test("should generate keypair, sign and verify", () => {
      const message = new TextEncoder().encode("Hello, Bitcoin PQC!");
      const tamperedMessage = new TextEncoder().encode("Bad message!");

      e2eAlgorithm(algorithm, message, tamperedMessage);
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

      const tamperedMessage = new TextEncoder().encode(
        SLH_DSA_SHA2_TEST_MESSAGE + "!"
      );
      expect(() => {
        verify(keypair.publicKey, tamperedMessage, signature);
      }).toThrow(PqcError);
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

      expect(() => {
        generateKeyPair(Algorithm.SECP256K1_SCHNORR, getRandomBytes(31));
      }).toThrow(PqcError);
    });
  });
});