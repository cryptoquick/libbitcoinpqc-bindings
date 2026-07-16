#![no_main]

use bitcoinpqc::{algorithm_from_index, generate_keypair, sign, verify};
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    // Need sufficient bytes for all operations:
    // 1 byte for algorithm + 128 bytes for key generation + 32 bytes for message (Secp256k1 requires 32)
    if data.len() < 1 + 128 + 32 {
        return;
    }

    // Use first byte to select an algorithm
    let alg_byte = data[0];
    let algorithm = algorithm_from_index(alg_byte);

    // Use 128 bytes for key generation
    let key_data = &data[1..129];

    let keypair = match generate_keypair(algorithm, key_data) {
        Ok(kp) => kp,
        Err(_) => return,
    };

    // We've already checked above that we have at least 32 bytes left
    let message = &data[129..];

    let signature = match sign(&keypair.secret_key, message) {
        Ok(sig) => sig,
        Err(_) => return,
    };

    // Try to verify the signature with the correct public key
    let verify_result = verify(&keypair.public_key, message, &signature);
    if let Err(err) = &verify_result {
        panic!("Verification failed for a signature generated with the corresponding private key! Algorithm: {}, error: {:?}",
               algorithm.debug_name(), err);
    }

    // Also try some invalid cases (if we have a valid signature)
    if message.len() > 1 {
        // Try with modified message
        let mut modified_msg = message.to_vec();
        modified_msg[0] ^= 0xFF; // Flip bits in first byte
        let verify_result_bad_msg = verify(&keypair.public_key, &modified_msg, &signature);
        assert!(
            verify_result_bad_msg.is_err(),
            "Verification should fail with modified message! Algorithm: {}",
            algorithm.debug_name()
        );
    }

    if signature.bytes.len() > 1 {
        // Try with modified signature
        let mut modified_sig = signature.clone();
        modified_sig.bytes[0] ^= 0xFF; // Flip bits in first byte
        let verify_result_bad_sig = verify(&keypair.public_key, message, &modified_sig);
        assert!(
            verify_result_bad_sig.is_err(),
            "Verification should fail with modified signature! Algorithm: {}",
            algorithm.debug_name()
        );
    }
});
