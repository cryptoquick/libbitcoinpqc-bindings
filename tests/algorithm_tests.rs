mod common;

#[path = "vectors/rust/ml_dsa_44_golden_vectors.rs"]
mod ml_dsa_golden_vectors;
#[path = "vectors/rust/secp256k1_bip340_golden_vectors.rs"]
mod secp_golden_vectors;
#[path = "vectors/rust/slh_dsa_sha2_golden_vectors.rs"]
mod slh_golden_vectors;

use hex::decode as hex_decode;
use rand::{rng, RngCore};

use bitcoinpqc::{
    algorithm_from_index, generate_keypair, public_key_size, secret_key_size, sign, signature_size,
    verify, Algorithm, KeyPair, PqcError, SUPPORTED_ALGORITHM_COUNT,
};
use ml_dsa_golden_vectors::{
    ML_DSA_44_EXPECTED_PK, ML_DSA_44_EXPECTED_SIG, ML_DSA_44_TEST_ENTROPY, ML_DSA_44_TEST_MESSAGE,
};
use secp_golden_vectors::{
    SECP256K1_BIP340_ROW0_EXPECTED_PK, SECP256K1_BIP340_ROW0_EXPECTED_SIG,
    SECP256K1_BIP340_ROW0_MESSAGE, SECP256K1_BIP340_ROW0_SECRET,
};
use slh_golden_vectors::{
    SLH_DSA_SHA2_EXPECTED_PK, SLH_DSA_SHA2_EXPECTED_SIG, SLH_DSA_SHA2_TEST_ENTROPY,
    SLH_DSA_SHA2_TEST_MESSAGE,
};

const ML_DSA_DET_SIGN_ENTROPY: &str = "12187a59a14e1e9a0c37fc7625a0d3f8782f1e4cd361751abf7b85745173488e3e19afd47cbd4a823577cb360aed406791558ea1ff217fcd38af566e0e5d4d0903e6ea9c29108393c1a423f41b876b43ce0856ee436866f98d56ec8ceb169ed0470d847608f295474002a91a54937a64ac236fb9cf49fedf60b76500e3c0a7f0";

const SLH_DSA_DET_SIGN_ENTROPY: &str = "8ca905fd3e122d02e411683b52ecb1863104793aeba57718aabc9a65db5d61a66ca4bd29376d8118ceb555868b7054b59e23a45538d4ca28ad2080f70c56cce85f1fd5568661cb6ac06a9296ae77d97a7b854dab7eda10a4b78dd3a8f2e741f5c4686278eda9a1ac255a0cdbc79081435161331b69f9cbc04e7ae50cbfbab0ec";

fn decode_hex(data: &str) -> Vec<u8> {
    hex_decode(data).expect("Invalid hex test vector")
}

fn keygen_entropy(algorithm: Algorithm) -> Vec<u8> {
    if algorithm == Algorithm::ML_DSA_44 {
        ML_DSA_44_TEST_ENTROPY.to_vec()
    } else if algorithm == Algorithm::SLH_DSA_SHA2_128S {
        SLH_DSA_SHA2_TEST_ENTROPY.to_vec()
    } else {
        let mut bytes = vec![0u8; 32];
        rng().fill_bytes(&mut bytes);
        bytes
    }
}

fn insufficient_keygen_entropy() -> Vec<u8> {
    vec![0xAB; 127]
}

fn assert_sign_verify_e2e_with_keypair(
    algorithm: Algorithm,
    keypair: &KeyPair,
    message: &[u8],
    tampered_message: &[u8],
) {
    assert_eq!(
        keypair.public_key.bytes.len(),
        public_key_size(algorithm),
        "Unexpected public key size for {:?}",
        algorithm
    );
    assert_eq!(
        keypair.secret_key.bytes.len(),
        secret_key_size(algorithm),
        "Unexpected secret key size for {:?}",
        algorithm
    );

    let signature = sign(&keypair.secret_key, message)
        .unwrap_or_else(|e| panic!("Failed to sign with {:?}: {e:?}", algorithm));

    assert_eq!(
        signature.bytes.len(),
        signature_size(algorithm),
        "Unexpected signature size for {:?}",
        algorithm
    );

    assert!(
        verify(&keypair.public_key, message, &signature).is_ok(),
        "{:?} signature verification should succeed for original message",
        algorithm
    );

    assert!(
        verify(&keypair.public_key, tampered_message, &signature).is_err(),
        "{:?} signature verification should fail for tampered message",
        algorithm
    );
}

fn assert_sign_verify_e2e(
    algorithm: Algorithm,
    keygen_entropy: &[u8],
    message: &[u8],
    tampered_message: &[u8],
) {
    let keypair = generate_keypair(algorithm, keygen_entropy)
        .unwrap_or_else(|e| panic!("Failed to generate {:?} keypair: {e:?}", algorithm));

    assert_sign_verify_e2e_with_keypair(algorithm, &keypair, message, tampered_message);
}

integration_test! {
fn test_algorithm_from_index_mapping() {
    assert_eq!(SUPPORTED_ALGORITHM_COUNT, 3);

    assert_eq!(algorithm_from_index(0), Algorithm::SECP256K1_SCHNORR);
    assert_eq!(algorithm_from_index(1), Algorithm::ML_DSA_44);
    assert_eq!(algorithm_from_index(2), Algorithm::SLH_DSA_SHA2_128S);

    // Wraps modulo SUPPORTED_ALGORITHM_COUNT
    assert_eq!(algorithm_from_index(3), Algorithm::SECP256K1_SCHNORR);
    assert_eq!(algorithm_from_index(4), Algorithm::ML_DSA_44);
    assert_eq!(algorithm_from_index(5), Algorithm::SLH_DSA_SHA2_128S);
    assert_eq!(algorithm_from_index(255), Algorithm::SECP256K1_SCHNORR);
}
}

integration_test! {
fn test_key_sizes() {
    assert_eq!(public_key_size(Algorithm::SECP256K1_SCHNORR), 32);
    assert_eq!(secret_key_size(Algorithm::SECP256K1_SCHNORR), 32);
    assert_eq!(signature_size(Algorithm::SECP256K1_SCHNORR), 64);

    assert_eq!(public_key_size(Algorithm::ML_DSA_44), 1312);
    assert_eq!(secret_key_size(Algorithm::ML_DSA_44), 2560);
    assert_eq!(signature_size(Algorithm::ML_DSA_44), 2420);

    assert_eq!(public_key_size(Algorithm::SLH_DSA_SHA2_128S), 32);
    assert_eq!(secret_key_size(Algorithm::SLH_DSA_SHA2_128S), 64);
    assert_eq!(signature_size(Algorithm::SLH_DSA_SHA2_128S), 7856);
}
}

integration_test! {
fn test_ml_dsa_44_keygen_sign_verify() {
    assert_sign_verify_e2e(
        Algorithm::ML_DSA_44,
        &keygen_entropy(Algorithm::ML_DSA_44),
        b"ML-DSA-44 Test Message",
        b"ML-DSA-44 Modified Message",
    );
}
}

integration_test! {
fn test_slh_dsa_sha2_128s_keygen_sign_verify() {
    assert_sign_verify_e2e(
        Algorithm::SLH_DSA_SHA2_128S,
        &keygen_entropy(Algorithm::SLH_DSA_SHA2_128S),
        b"SLH-DSA-SHA2-128S Test Message",
        b"SLH-DSA-SHA2-128S Modified Message",
    );
}
}

integration_test! {
fn test_secp256k1_schnorr_e2e() {
    let message = [0x42u8; 32];
    let mut tampered_message = message;
    tampered_message[31] ^= 0x01;

    assert_sign_verify_e2e(
        Algorithm::SECP256K1_SCHNORR,
        &keygen_entropy(Algorithm::SECP256K1_SCHNORR),
        &message,
        &tampered_message,
    );
}
}

integration_test! {
fn test_secp256k1_bip340_golden_vectors() {
    let keypair = generate_keypair(Algorithm::SECP256K1_SCHNORR, SECP256K1_BIP340_ROW0_SECRET)
        .expect("Failed to generate secp256k1 keypair from golden secret");

    assert_eq!(
        keypair.public_key.bytes.as_slice(),
        SECP256K1_BIP340_ROW0_EXPECTED_PK
    );

    let signature = sign(&keypair.secret_key, SECP256K1_BIP340_ROW0_MESSAGE)
        .expect("Failed to sign BIP-340 golden message");

    assert_eq!(
        signature.bytes.as_slice(),
        SECP256K1_BIP340_ROW0_EXPECTED_SIG,
        "BIP-340 row 0 signature is deterministic (sign_schnorr_no_aux_rand)"
    );

    assert!(
        verify(
            &keypair.public_key,
            SECP256K1_BIP340_ROW0_MESSAGE,
            &signature
        )
        .is_ok(),
        "Golden secp256k1 signature should verify"
    );
}
}

integration_test! {
fn test_ml_dsa_44_golden_vectors() {
    let keypair = generate_keypair(Algorithm::ML_DSA_44, ML_DSA_44_TEST_ENTROPY)
        .expect("Failed to generate ML-DSA-44 keypair from golden entropy");

    assert_eq!(keypair.public_key.bytes.as_slice(), ML_DSA_44_EXPECTED_PK);

    let signature = sign(&keypair.secret_key, ML_DSA_44_TEST_MESSAGE)
        .expect("Failed to sign ML-DSA-44 golden message");

    assert_eq!(signature.bytes.as_slice(), ML_DSA_44_EXPECTED_SIG);

    assert!(
        verify(&keypair.public_key, ML_DSA_44_TEST_MESSAGE, &signature).is_ok(),
        "Golden ML-DSA-44 signature should verify"
    );
}
}

integration_test! {
fn test_secp256k1_schnorr_rejects_bad_inputs() {
    let short_seed = vec![0xAB; 31];
    let result = generate_keypair(Algorithm::SECP256K1_SCHNORR, &short_seed);
    assert_eq!(result, Err(PqcError::InsufficientData));

    let zero_secret = vec![0u8; 32];
    let result = generate_keypair(Algorithm::SECP256K1_SCHNORR, &zero_secret);
    assert_eq!(result, Err(PqcError::BadKey));

    let keypair = generate_keypair(Algorithm::SECP256K1_SCHNORR, SECP256K1_BIP340_ROW0_SECRET)
        .expect("Failed to generate secp256k1 keypair");

    let short_message = vec![0xCD; 31];
    let result = sign(&keypair.secret_key, &short_message);
    assert_eq!(result, Err(PqcError::InsufficientData));
}
}

integration_test! {
fn test_deterministic_signing() {
    let random_data = decode_hex(ML_DSA_DET_SIGN_ENTROPY);
    let keypair = generate_keypair(Algorithm::ML_DSA_44, &random_data)
        .expect("Failed to generate ML-DSA-44 keypair");
    let message = b"Test message for deterministic signing";

    let signature1 = sign(&keypair.secret_key, message).expect("Failed to create first signature");
    let signature2 = sign(&keypair.secret_key, message).expect("Failed to create second signature");

    assert!(
        verify(&keypair.public_key, message, &signature1).is_ok(),
        "First ML-DSA-44 signature should be valid"
    );
    assert!(
        verify(&keypair.public_key, message, &signature2).is_ok(),
        "Second ML-DSA-44 signature should be valid"
    );

    let random_data = decode_hex(SLH_DSA_DET_SIGN_ENTROPY);
    let keypair = generate_keypair(Algorithm::SLH_DSA_SHA2_128S, &random_data)
        .expect("Failed to generate SLH-DSA-SHA2-128S keypair");
    let message = b"Test message for deterministic signing";

    let signature1 = sign(&keypair.secret_key, message).expect("Failed to create first signature");
    let signature2 = sign(&keypair.secret_key, message).expect("Failed to create second signature");

    assert!(
        verify(&keypair.public_key, message, &signature1).is_ok(),
        "First SLH-DSA-SHA2-128S signature should be valid"
    );
    assert!(
        verify(&keypair.public_key, message, &signature2).is_ok(),
        "Second SLH-DSA-SHA2-128S signature should be valid"
    );
}
}

integration_test! {
fn test_error_conditions() {
    let short_random = insufficient_keygen_entropy();

    let result = generate_keypair(Algorithm::ML_DSA_44, &short_random);
    assert!(
        result.is_err(),
        "ML-DSA-44 should fail with insufficient random data"
    );

    let result = generate_keypair(Algorithm::SLH_DSA_SHA2_128S, &short_random);
    assert!(
        result.is_err(),
        "SLH-DSA-SHA2-128S should fail with insufficient random data"
    );

    let random_data = keygen_entropy(Algorithm::ML_DSA_44);
    let ml_keypair = generate_keypair(Algorithm::ML_DSA_44, &random_data)
        .expect("Failed to generate ML-DSA-44 keypair");
    let slh_keypair = generate_keypair(Algorithm::SLH_DSA_SHA2_128S, &keygen_entropy(Algorithm::SLH_DSA_SHA2_128S))
        .expect("Failed to generate SLH-DSA-SHA2-128S keypair");

    let message = b"Test message";

    let ml_sig = sign(&ml_keypair.secret_key, message).expect("Failed to sign with ML-DSA-44");
    let slh_sig =
        sign(&slh_keypair.secret_key, message).expect("Failed to sign with SLH-DSA-SHA2-128S");

    let result = verify(&slh_keypair.public_key, message, &ml_sig);
    assert!(
        result.is_err(),
        "Verification should fail with ML-DSA-44 signature and SLH-DSA-SHA2-128S key"
    );

    let result = verify(&ml_keypair.public_key, message, &slh_sig);
    assert!(
        result.is_err(),
        "Verification should fail with SLH-DSA-SHA2-128S signature and ML-DSA-44 key"
    );
}
}

integration_test! {
fn test_slh_dsa_sha2_128s_golden_vectors() {
    let keypair = generate_keypair(Algorithm::SLH_DSA_SHA2_128S, SLH_DSA_SHA2_TEST_ENTROPY)
        .expect("Failed to generate SLH-DSA-SHA2-128S keypair from golden entropy");

    assert_eq!(
        keypair.public_key.bytes.as_slice(),
        SLH_DSA_SHA2_EXPECTED_PK
    );

    let signature = sign(&keypair.secret_key, SLH_DSA_SHA2_TEST_MESSAGE)
        .expect("Failed to sign golden test message");

    assert_eq!(signature.bytes.as_slice(), SLH_DSA_SHA2_EXPECTED_SIG);

    assert!(
        verify(&keypair.public_key, SLH_DSA_SHA2_TEST_MESSAGE, &signature).is_ok(),
        "Golden SLH-DSA-SHA2-128S signature should verify"
    );
}
}
