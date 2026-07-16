import unittest
import sys
import secrets
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(_ROOT / "tests" / "vectors" / "python"))

import bitcoinpqc
from bitcoinpqc import Algorithm
from ml_dsa_44_golden_vectors import (
    ML_DSA_44_EXPECTED_PK,
    ML_DSA_44_EXPECTED_SIG,
    ML_DSA_44_TEST_ENTROPY,
    ML_DSA_44_TEST_MESSAGE,
)
from secp256k1_bip340_golden_vectors import (
    SECP256K1_BIP340_ROW0_EXPECTED_PK,
    SECP256K1_BIP340_ROW0_EXPECTED_SIG,
    SECP256K1_BIP340_ROW0_MESSAGE,
    SECP256K1_BIP340_ROW0_SECRET,
)
from slh_dsa_sha2_golden_vectors import (
    SLH_DSA_SHA2_EXPECTED_PK,
    SLH_DSA_SHA2_EXPECTED_SIG,
    SLH_DSA_SHA2_TEST_ENTROPY,
    SLH_DSA_SHA2_TEST_MESSAGE,
)


class TestBitcoinPQC(unittest.TestCase):

    def test_algorithm_enum_values(self):
        """Algorithm wire values match the C API."""
        self.assertEqual(Algorithm.SECP256K1_SCHNORR, 0)
        self.assertEqual(Algorithm.ML_DSA_44, 1)
        self.assertEqual(Algorithm.SLH_DSA_SHA2_128S, 2)

    def test_key_sizes(self):
        """Test key size reporting functions."""
        self.assertEqual(bitcoinpqc.public_key_size(Algorithm.SECP256K1_SCHNORR), 32)
        self.assertEqual(bitcoinpqc.secret_key_size(Algorithm.SECP256K1_SCHNORR), 32)
        self.assertEqual(bitcoinpqc.signature_size(Algorithm.SECP256K1_SCHNORR), 64)

        self.assertEqual(bitcoinpqc.public_key_size(Algorithm.ML_DSA_44), 1312)
        self.assertEqual(bitcoinpqc.secret_key_size(Algorithm.ML_DSA_44), 2560)
        self.assertEqual(bitcoinpqc.signature_size(Algorithm.ML_DSA_44), 2420)

        self.assertEqual(bitcoinpqc.public_key_size(Algorithm.SLH_DSA_SHA2_128S), 32)
        self.assertEqual(bitcoinpqc.secret_key_size(Algorithm.SLH_DSA_SHA2_128S), 64)
        self.assertEqual(bitcoinpqc.signature_size(Algorithm.SLH_DSA_SHA2_128S), 7856)

    def _test_secp_schnorr_e2e(self):
        """BIP-340 row 0 secp256k1 Schnorr E2E (32-byte seed and message hash)."""
        keypair = bitcoinpqc.keygen(Algorithm.SECP256K1_SCHNORR, SECP256K1_BIP340_ROW0_SECRET)

        self.assertEqual(keypair.public_key, SECP256K1_BIP340_ROW0_EXPECTED_PK)
        self.assertEqual(keypair.secret_key, SECP256K1_BIP340_ROW0_SECRET)
        self.assertEqual(len(keypair.public_key), bitcoinpqc.public_key_size(Algorithm.SECP256K1_SCHNORR))
        self.assertEqual(len(keypair.secret_key), bitcoinpqc.secret_key_size(Algorithm.SECP256K1_SCHNORR))

        signature = bitcoinpqc.sign(
            Algorithm.SECP256K1_SCHNORR, keypair.secret_key, SECP256K1_BIP340_ROW0_MESSAGE
        )

        self.assertEqual(len(signature.signature), bitcoinpqc.signature_size(Algorithm.SECP256K1_SCHNORR))

        self.assertTrue(bitcoinpqc.verify(
            Algorithm.SECP256K1_SCHNORR,
            keypair.public_key,
            SECP256K1_BIP340_ROW0_MESSAGE,
            signature,
        ))

        tampered_message = bytearray(SECP256K1_BIP340_ROW0_MESSAGE)
        tampered_message[31] ^= 0x01
        self.assertFalse(bitcoinpqc.verify(
            Algorithm.SECP256K1_SCHNORR,
            keypair.public_key,
            bytes(tampered_message),
            signature,
        ))

    def _test_algorithm(self, algorithm):
        """Test key generation, signing, and verification for a specific algorithm."""
        random_data = secrets.token_bytes(128)
        keypair = bitcoinpqc.keygen(algorithm, random_data)

        self.assertEqual(len(keypair.public_key), bitcoinpqc.public_key_size(algorithm))
        self.assertEqual(len(keypair.secret_key), bitcoinpqc.secret_key_size(algorithm))

        message = b"Hello, Bitcoin PQC!"
        signature = bitcoinpqc.sign(algorithm, keypair.secret_key, message)

        self.assertEqual(len(signature.signature), bitcoinpqc.signature_size(algorithm))

        self.assertTrue(bitcoinpqc.verify(
            algorithm, keypair.public_key, message, signature
        ))

        self.assertTrue(bitcoinpqc.verify(
            algorithm, keypair.public_key, message, signature.signature
        ))

        bad_message = b"Bad message!"
        self.assertFalse(bitcoinpqc.verify(
            algorithm, keypair.public_key, bad_message, signature
        ))

    def test_secp256k1_schnorr(self):
        """Test SECP256K1_SCHNORR (BIP-340) algorithm."""
        self._test_secp_schnorr_e2e()

    def test_secp256k1_schnorr_rejects_bad_inputs(self):
        """Short seed and message are rejected for secp256k1 Schnorr."""
        with self.assertRaises(ValueError):
            bitcoinpqc.keygen(Algorithm.SECP256K1_SCHNORR, b"\xab" * 31)

        with self.assertRaises((Exception, ValueError)):
            bitcoinpqc.keygen(Algorithm.SECP256K1_SCHNORR, b"\x00" * 32)

        keypair = bitcoinpqc.keygen(Algorithm.SECP256K1_SCHNORR, SECP256K1_BIP340_ROW0_SECRET)

        with self.assertRaises(ValueError):
            bitcoinpqc.sign(
                Algorithm.SECP256K1_SCHNORR, keypair.secret_key, b"\xcd" * 31
            )

    def test_ml_dsa(self):
        """Test ML-DSA-44 (Dilithium) algorithm."""
        self._test_algorithm(Algorithm.ML_DSA_44)

    def test_slh_dsa(self):
        """Test SLH-DSA-SHA2-128s (SPHINCS+) algorithm."""
        self._test_algorithm(Algorithm.SLH_DSA_SHA2_128S)

    def test_secp256k1_bip340_golden_vectors(self):
        """BIP-340 row 0 golden pk/sig (deterministic sign, no aux_rand)."""
        keypair = bitcoinpqc.keygen(
            Algorithm.SECP256K1_SCHNORR, SECP256K1_BIP340_ROW0_SECRET
        )

        self.assertEqual(keypair.public_key, SECP256K1_BIP340_ROW0_EXPECTED_PK)

        signature = bitcoinpqc.sign(
            Algorithm.SECP256K1_SCHNORR,
            keypair.secret_key,
            SECP256K1_BIP340_ROW0_MESSAGE,
        )

        self.assertEqual(signature.signature, SECP256K1_BIP340_ROW0_EXPECTED_SIG)
        self.assertTrue(bitcoinpqc.verify(
            Algorithm.SECP256K1_SCHNORR,
            keypair.public_key,
            SECP256K1_BIP340_ROW0_MESSAGE,
            signature,
        ))

    def test_ml_dsa_44_golden_vectors(self):
        """Golden-vector regression for ML-DSA-44."""
        keypair = bitcoinpqc.keygen(Algorithm.ML_DSA_44, ML_DSA_44_TEST_ENTROPY)

        self.assertEqual(keypair.public_key, ML_DSA_44_EXPECTED_PK)

        message = ML_DSA_44_TEST_MESSAGE.encode("utf-8")
        signature = bitcoinpqc.sign(
            Algorithm.ML_DSA_44, keypair.secret_key, message
        )

        self.assertEqual(signature.signature, ML_DSA_44_EXPECTED_SIG)
        self.assertTrue(bitcoinpqc.verify(
            Algorithm.ML_DSA_44,
            keypair.public_key,
            message,
            signature,
        ))
        tampered = b"Bad message!"
        self.assertFalse(bitcoinpqc.verify(
            Algorithm.ML_DSA_44,
            keypair.public_key,
            tampered,
            signature,
        ))

    def test_slh_dsa_sha2_128s_golden_vectors(self):
        """Golden-vector regression from libbitcoinpqc reference."""
        keypair = bitcoinpqc.keygen(
            Algorithm.SLH_DSA_SHA2_128S, SLH_DSA_SHA2_TEST_ENTROPY
        )

        self.assertEqual(keypair.public_key, SLH_DSA_SHA2_EXPECTED_PK)

        message = SLH_DSA_SHA2_TEST_MESSAGE.encode("utf-8")
        signature = bitcoinpqc.sign(
            Algorithm.SLH_DSA_SHA2_128S, keypair.secret_key, message
        )

        self.assertEqual(signature.signature, SLH_DSA_SHA2_EXPECTED_SIG)
        self.assertTrue(bitcoinpqc.verify(
            Algorithm.SLH_DSA_SHA2_128S,
            keypair.public_key,
            message,
            signature,
        ))
        tampered = b"Bad message!"
        self.assertFalse(bitcoinpqc.verify(
            Algorithm.SLH_DSA_SHA2_128S,
            keypair.public_key,
            tampered,
            signature,
        ))


if __name__ == "__main__":
    unittest.main()