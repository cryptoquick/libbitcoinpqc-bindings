#![no_main]

use bitcoinpqc::{algorithm_from_index, generate_keypair, sign, verify, Signature};
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if data.len() < 152 {
        // Need 128 bytes for keygen + 2 algorithm bytes + message bytes
        return;
    }

    let key_data = &data[0..128];
    let alg1 = algorithm_from_index(data[128]);
    let alg2 = algorithm_from_index(data[129]);
    if alg1 == alg2 {
        return;
    }

    let keypair1 = match generate_keypair(alg1, key_data) {
        Ok(kp) => kp,
        Err(_) => return,
    };

    let keypair2 = match generate_keypair(alg2, key_data) {
        Ok(kp) => kp,
        Err(_) => return,
    };

    let message = &data[130..];

    let signature1 = match sign(&keypair1.secret_key, message) {
        Ok(sig) => sig,
        Err(_) => return,
    };

    let signature2 = match sign(&keypair2.secret_key, message) {
        Ok(sig) => sig,
        Err(_) => return,
    };

    // Correct key-signature pairs
    let _ = verify(&keypair1.public_key, message, &signature1);
    let _ = verify(&keypair2.public_key, message, &signature2);

    // Mismatched algorithm metadata on signatures
    let sig1_with_wrong_alg = Signature {
        algorithm: keypair2.public_key.algorithm,
        bytes: signature1.bytes.clone(),
    };
    let _ = verify(&keypair2.public_key, message, &sig1_with_wrong_alg);

    let sig2_with_wrong_alg = Signature {
        algorithm: keypair1.public_key.algorithm,
        bytes: signature2.bytes.clone(),
    };
    let _ = verify(&keypair1.public_key, message, &sig2_with_wrong_alg);

    // Wrong public key for the signature bytes
    let _ = verify(&keypair1.public_key, message, &signature2);
    let _ = verify(&keypair2.public_key, message, &signature1);
});