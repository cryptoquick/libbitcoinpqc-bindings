#![no_main]

use bitcoinpqc::{algorithm_from_index, SecretKey};
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if data.len() < 2 {
        // Need at least 2 bytes: 1 for algorithm, 1+ for key data
        return;
    }

    // First byte selects algorithm
    let alg_byte = data[0];
    let algorithm = algorithm_from_index(alg_byte);

    // Rest of the data is treated as a potential key
    let key_data = &data[1..];

    // Try to interpret this as a secret key without crashing
    let sk_result = SecretKey::try_from_slice(algorithm, key_data);
    if key_data.len() != bitcoinpqc::secret_key_size(algorithm) {
        assert!(
            sk_result.is_err(),
            "Parsing should fail for invalid key length!"
        );
    }
    // Valid-length random bytes may still fail validation (e.g. Secp256k1); Err is acceptable.
});
