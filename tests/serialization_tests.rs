use hex::{decode as hex_decode, encode as hex_encode};
use rand::{rng, RngCore};

use bitcoinpqc::{generate_keypair, sign, verify, Algorithm, PublicKey, SecretKey, Signature};

// Original random data generation function (commented out for deterministic tests)
fn _get_random_bytes_original(size: usize) -> Vec<u8> {
    let mut bytes = vec![0u8; size];
    rng().fill_bytes(&mut bytes);
    bytes
}

// Function to return fixed test data based on predefined hex strings
// This ensures deterministic test results
fn get_random_bytes(size: usize) -> Vec<u8> {
    match size {
        128 => {
            // Single common test vector for all tests (128 bytes)
            let random_data = "f47e7324fb639d867a35eea3558a54224e7ca5e357c588c136d2d514facd5fc0d93a31a624a7c3d9ba02f8a73bd2e9dac7b2e3a0dcf1900b2c3b8e56c6efec7ef2aa654567e42988f6c1b71ae817db8f7dbf25c5e7f3ddc87f39b8fc9b3c44caacb6fe8f9df68e895f6ae603e1c4db3c6a0e1ba9d52ac34a63426f9be2e2ac16";
            hex_decode(random_data).expect("Invalid hex data")
        }
        64 => {
            // Fixed test vector for signing (64 bytes)
            let sign_data = "7b8681d6e06fa65ef3b77243e7670c10e7c983cbe07f09cb1ddd10e9c4bc8ae6409a756b5bc35a352ab7dcf08395ce6994f4aafa581a843db147db47cf2e6fbd";
            hex_decode(sign_data).expect("Invalid hex data")
        }
        _ => {
            // Fallback for other sizes
            let mut bytes = vec![0u8; size];
            rng().fill_bytes(&mut bytes);
            bytes
        }
    }
}

#[test]
fn test_public_key_serialization() {
    // Generate a keypair with deterministic data
    let random_data = get_random_bytes(128);
    let keypair =
        generate_keypair(Algorithm::ML_DSA_44, &random_data).expect("Failed to generate keypair");

    // Print public key prefix for informational purposes
    let pk_prefix = hex_encode(&keypair.public_key.bytes[0..16]);
    println!("ML-DSA-44 Public key prefix: {pk_prefix}");

    // Check the public key has the expected length
    assert_eq!(
        keypair.public_key.bytes.len(),
        1312,
        "Public key should have the correct length"
    );

    // Check the public key has a non-empty prefix
    assert!(
        !pk_prefix.is_empty(),
        "Public key should have a non-empty prefix"
    );

    // Extract the public key bytes
    let pk_bytes = keypair.public_key.bytes.clone();

    // Create a new PublicKey from the bytes
    let reconstructed_pk = PublicKey {
        algorithm: Algorithm::ML_DSA_44,
        bytes: pk_bytes,
    };

    // Sign a message using the original key
    let message = b"Serialization test message";
    let signature = sign(&keypair.secret_key, message).expect("Failed to sign message");

    // Print signature for informational purposes
    println!(
        "ML-DSA-44 Signature prefix: {}",
        hex_encode(&signature.bytes[0..16])
    );

    // Verify the signature using the reconstructed public key
    let result = verify(&reconstructed_pk, message, &signature);
    assert!(
        result.is_ok(),
        "Verification with reconstructed public key failed"
    );
}

#[test]
fn test_secret_key_serialization() {
    // Generate a keypair with deterministic data
    let random_data = get_random_bytes(128);
    let keypair = generate_keypair(Algorithm::SLH_DSA_SHA2_128S, &random_data)
        .expect("Failed to generate keypair");

    // Print key prefixes for diagnostic purposes
    let sk_prefix = hex_encode(&keypair.secret_key.bytes[0..16]);
    let pk_prefix = hex_encode(&keypair.public_key.bytes[0..16]);
    println!("SLH-DSA-SHA2-128S Secret key prefix: {sk_prefix}");
    println!("SLH-DSA-SHA2-128S Public key prefix: {pk_prefix}");

    // Extract the secret key bytes
    let sk_bytes = keypair.secret_key.bytes.clone();

    // Create a new SecretKey from the bytes
    let reconstructed_sk = SecretKey {
        algorithm: Algorithm::SLH_DSA_SHA2_128S,
        bytes: sk_bytes,
    };

    // Sign a message using the reconstructed secret key
    let message = b"Secret key serialization test message";
    let signature =
        sign(&reconstructed_sk, message).expect("Failed to sign with reconstructed key");

    // Print signature for informational purposes
    println!(
        "SLH-DSA-128S Signature prefix: {}",
        hex_encode(&signature.bytes[0..16])
    );

    // Verify the signature using the original public key
    let result = verify(&keypair.public_key, message, &signature);
    assert!(
        result.is_ok(),
        "Verification of signature from reconstructed secret key failed"
    );
}

#[test]
fn test_signature_serialization() {
    // Generate a keypair with deterministic data
    let random_data = get_random_bytes(128);
    let keypair =
        generate_keypair(Algorithm::ML_DSA_44, &random_data).expect("Failed to generate keypair");

    // Sign a message
    let message = b"Signature serialization test";
    let signature = sign(&keypair.secret_key, message).expect("Failed to sign message");

    // Print signature for informational purposes
    println!(
        "ML-DSA-44 Signature prefix: {}",
        hex_encode(&signature.bytes[0..16])
    );

    // Create a new Signature from the bytes
    let reconstructed_sig = Signature {
        algorithm: Algorithm::ML_DSA_44,
        bytes: signature.bytes.clone(),
    };

    // Verify that the reconstructed signature bytes match
    assert_eq!(
        signature.bytes, reconstructed_sig.bytes,
        "Reconstructed signature bytes should match original"
    );

    // Verify the reconstructed signature
    let result = verify(&keypair.public_key, message, &reconstructed_sig);
    assert!(
        result.is_ok(),
        "Verification with reconstructed signature failed"
    );
}

#[test]
fn test_cross_algorithm_serialization_failure() {
    // Generate keypairs for different algorithms with deterministic data
    let random_data = get_random_bytes(128);
    let keypair_ml_dsa = generate_keypair(Algorithm::ML_DSA_44, &random_data)
        .expect("Failed to generate ML-DSA keypair");
    let keypair_slh_dsa = generate_keypair(Algorithm::SLH_DSA_SHA2_128S, &random_data)
        .expect("Failed to generate SLH-DSA keypair");

    // Sign with ML-DSA
    let message = b"Cross algorithm test";
    let signature = sign(&keypair_ml_dsa.secret_key, message).expect("Failed to sign message");

    // Print signature for informational purposes
    println!(
        "ML-DSA signature prefix: {}",
        hex_encode(&signature.bytes[0..16])
    );

    // Attempt to verify ML-DSA signature with SLH-DSA public key
    // This should fail because the algorithms don't match
    let result = verify(&keypair_slh_dsa.public_key, message, &signature);
    assert!(
        result.is_err(),
        "Verification should fail when using public key from different algorithm"
    );

    // Create an invalid signature by changing the algorithm but keeping the bytes
    let invalid_sig = Signature {
        algorithm: Algorithm::SLH_DSA_SHA2_128S, // Wrong algorithm
        bytes: signature.bytes.clone(),
    };

    // This should fail because the signature was generated with ML-DSA but claimed to be SLH-DSA
    let result = verify(&keypair_slh_dsa.public_key, message, &invalid_sig);
    assert!(
        result.is_err(),
        "Verification should fail with mismatched algorithm"
    );

    // Also verify that the library correctly checks algorithm consistency
    let result = verify(&keypair_ml_dsa.public_key, message, &invalid_sig);
    assert!(
        result.is_err(),
        "Verification should fail when signature algorithm doesn't match public key algorithm"
    );
}

// Add new test for serialization consistency
#[test]
fn test_serialization_consistency() {
    // Generate keypairs for each algorithm using deterministic data
    let random_data = get_random_bytes(128);

    // ML-DSA-44
    let ml_keypair = generate_keypair(Algorithm::ML_DSA_44, &random_data)
        .expect("Failed to generate ML-DSA keypair");

    // Expected ML-DSA key serialization (from test output)
    let expected_ml_pk_prefix = "b3f22d3e1f93e3122063898b98eb89e6";
    let expected_ml_sk_prefix = "b3f22d3e1f93e3122063898b98eb89e6";

    // Print and verify ML-DSA public key
    let actual_ml_pk_prefix = hex_encode(&ml_keypair.public_key.bytes[0..16]);
    println!("ML-DSA-44 public key prefix: {actual_ml_pk_prefix}");

    assert_eq!(
        actual_ml_pk_prefix, expected_ml_pk_prefix,
        "ML-DSA-44 public key serialization should be deterministic"
    );

    // Print and verify ML-DSA secret key
    let actual_ml_sk_prefix = hex_encode(&ml_keypair.secret_key.bytes[0..16]);
    println!("ML-DSA-44 secret key prefix: {actual_ml_sk_prefix}");

    assert_eq!(
        actual_ml_sk_prefix, expected_ml_sk_prefix,
        "ML-DSA-44 secret key serialization should be deterministic"
    );

    // SLH-DSA-128S - Just print for informational purposes
    let slh_keypair = generate_keypair(Algorithm::SLH_DSA_SHA2_128S, &random_data)
        .expect("Failed to generate SLH-DSA keypair");

    println!(
        "SLH-DSA-128S public key prefix: {}",
        hex_encode(&slh_keypair.public_key.bytes[0..16])
    );
    println!(
        "SLH-DSA-128S secret key prefix: {}",
        hex_encode(&slh_keypair.secret_key.bytes[0..16])
    );

    // Test serialization/deserialization consistency
    let message = b"Serialization consistency test";

    // ML-DSA-44 signature consistency
    let ml_sig = sign(&ml_keypair.secret_key, message).expect("Failed to sign with ML-DSA-44");

    // Print ML-DSA signature for informational purposes
    println!(
        "ML-DSA-44 signature prefix: {}",
        hex_encode(&ml_sig.bytes[0..16])
    );

    // Verify keys generated with the same random data are consistent
    let new_ml_keypair = generate_keypair(Algorithm::ML_DSA_44, &random_data)
        .expect("Failed to generate second ML-DSA-44 keypair");

    assert_eq!(
        hex_encode(&ml_keypair.public_key.bytes),
        hex_encode(&new_ml_keypair.public_key.bytes),
        "ML-DSA-44 public key generation should be deterministic"
    );

    assert_eq!(
        hex_encode(&ml_keypair.secret_key.bytes),
        hex_encode(&new_ml_keypair.secret_key.bytes),
        "ML-DSA-44 secret key generation should be deterministic"
    );
}

#[path = "vectors/slh_dsa_sha2_golden_vectors.rs"]
mod golden_vectors;

#[cfg(feature = "serde")]
#[test]
fn test_serde_roundtrip() {
    use golden_vectors::{SLH_DSA_SHA2_TEST_ENTROPY, SLH_DSA_SHA2_TEST_MESSAGE};

    let ml_random = get_random_bytes(128);
    let ml_message = b"Serde roundtrip test message";

    let test_cases: Vec<(Algorithm, &[u8], &[u8])> = vec![
        (Algorithm::ML_DSA_44, &ml_random, ml_message),
        (
            Algorithm::SLH_DSA_SHA2_128S,
            SLH_DSA_SHA2_TEST_ENTROPY,
            SLH_DSA_SHA2_TEST_MESSAGE,
        ),
    ];

    for (algorithm, random_data, message) in test_cases {
        let keypair = generate_keypair(algorithm, random_data)
            .unwrap_or_else(|_| panic!("Failed to generate keypair for {algorithm:?}"));

        let signature = sign(&keypair.secret_key, message)
            .unwrap_or_else(|_| panic!("Failed to sign message for {algorithm:?}"));

        let pk_json =
            serde_json::to_string(&keypair.public_key).expect("Failed to serialize PublicKey");
        let reconstructed_pk: PublicKey =
            serde_json::from_str(&pk_json).expect("Failed to deserialize PublicKey");
        assert_eq!(
            keypair.public_key, reconstructed_pk,
            "PublicKey roundtrip failed for {algorithm:?}"
        );

        let sk_json =
            serde_json::to_string(&keypair.secret_key).expect("Failed to serialize SecretKey");
        let reconstructed_sk: SecretKey =
            serde_json::from_str(&sk_json).expect("Failed to deserialize SecretKey");
        assert_eq!(
            keypair.secret_key, reconstructed_sk,
            "SecretKey roundtrip failed for {algorithm:?}"
        );

        let sig_json = serde_json::to_string(&signature).expect("Failed to serialize Signature");
        let reconstructed_sig: Signature =
            serde_json::from_str(&sig_json).expect("Failed to deserialize Signature");
        assert_eq!(
            signature, reconstructed_sig,
            "Signature roundtrip failed for {algorithm:?}"
        );

        assert!(
            verify(&reconstructed_pk, message, &reconstructed_sig).is_ok(),
            "Verification failed after serde roundtrip for {algorithm:?}"
        );
    }
}

#[cfg(feature = "serde")]
#[test]
fn test_reject_legacy_slh_dsa_128s_string() {
    let legacy_pk = r#"{"algorithm":"SLH_DSA_128S","bytes":"00"}"#;
    let result: Result<PublicKey, _> = serde_json::from_str(legacy_pk);
    assert!(
        result.is_err(),
        "Legacy SLH_DSA_128S algorithm string should be rejected"
    );

    let legacy_sk = r#"{"algorithm":"SLH_DSA_SHAKE_128S","bytes":"00"}"#;
    let result: Result<SecretKey, _> = serde_json::from_str(legacy_sk);
    assert!(
        result.is_err(),
        "Legacy SLH_DSA_SHAKE_128S algorithm string should be rejected"
    );
}
