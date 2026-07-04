import unittest
import sys
import secrets
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import bitcoinpqc
from bitcoinpqc import Algorithm
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

    def test_ml_dsa(self):
        """Test ML-DSA-44 (Dilithium) algorithm."""
        self._test_algorithm(Algorithm.ML_DSA_44)

    def test_slh_dsa(self):
        """Test SLH-DSA-SHA2-128s (SPHINCS+) algorithm."""
        self._test_algorithm(Algorithm.SLH_DSA_SHA2_128S)

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


if __name__ == "__main__":
    unittest.main()