#![allow(non_upper_case_globals)]
#![allow(non_camel_case_types)]
#![allow(non_snake_case)]

#[cfg(feature = "serde")]
use std::convert::TryFrom;
use std::fmt;
use std::hash::Hash;
use std::ptr;

use bitmask_enum::bitmask;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

#[cfg(feature = "serde")]
mod hex_bytes {
    use serde::{de::Error, Deserialize, Deserializer, Serializer};
    use std::vec::Vec; // Ensure Vec is in scope

    pub fn serialize<S>(bytes: &Vec<u8>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&hex::encode(bytes))
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Vec<u8>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        hex::decode(s).map_err(Error::custom)
    }
}

// Include the auto-generated bindings using our wrapper
// Make it pub(crate) so doctests can access these symbols
pub(crate) mod bindings_include;
// Use a glob import to get all the symbols consistently
use bindings_include::*;

/// Error type for PQC operations
#[derive(Debug, PartialEq, Eq, Clone, Copy, Hash)]
pub enum PqcError {
    /// Invalid arguments provided
    BadArgument,
    /// Not enough data provided (e.g., for key generation)
    InsufficientData,
    /// Invalid key provided or invalid format for the specified algorithm
    BadKey,
    /// Invalid signature provided or invalid format for the specified algorithm
    BadSignature,
    /// Algorithm not implemented
    NotImplemented,
    /// Provided public key and signature algorithms do not match
    AlgorithmMismatch,
    /// Other unexpected error from the C library
    Other(i32),
}

impl fmt::Display for PqcError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            PqcError::BadArgument => write!(f, "Invalid arguments provided"),
            PqcError::InsufficientData => write!(f, "Not enough data provided"),
            PqcError::BadKey => write!(f, "Invalid key provided or invalid format"),
            PqcError::BadSignature => write!(f, "Invalid signature provided or invalid format"),
            PqcError::NotImplemented => write!(f, "Algorithm not implemented"),
            PqcError::AlgorithmMismatch => {
                write!(f, "Public key and signature algorithms mismatch")
            }
            PqcError::Other(code) => write!(f, "Unexpected error code: {code}"),
        }
    }
}

impl From<bitcoin_pqc_error_t> for Result<(), PqcError> {
    fn from(error: bitcoin_pqc_error_t) -> Self {
        match error {
            bitcoin_pqc_error_t::BITCOIN_PQC_OK => Ok(()),
            bitcoin_pqc_error_t::BITCOIN_PQC_ERROR_BAD_ARG => Err(PqcError::BadArgument),
            bitcoin_pqc_error_t::BITCOIN_PQC_ERROR_BAD_KEY => Err(PqcError::BadKey),
            bitcoin_pqc_error_t::BITCOIN_PQC_ERROR_BAD_SIGNATURE => Err(PqcError::BadSignature),
            bitcoin_pqc_error_t::BITCOIN_PQC_ERROR_NOT_IMPLEMENTED => Err(PqcError::NotImplemented),
            _ => Err(PqcError::Other(error.0)),
        }
    }
}

/// PQC Algorithm type
#[bitmask(u8)]
// We derive serde conditionally, other traits like Debug, Clone, Eq, Hash etc.
// should be provided by the included C bindings or the bitmask macro.
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(try_from = "String", into = "String")
)]
pub enum Algorithm {
    /// BIP-340 Schnorr + X-Only - Elliptic Curve Digital Signature Algorithm
    SECP256K1_SCHNORR,
    /// ML-DSA-44 (CRYSTALS-Dilithium) - Lattice-based signature scheme
    ML_DSA_44,
    /// SLH-DSA-SHA2-128s (SPHINCS+) - Hash-based signature scheme
    SLH_DSA_SHA2_128S,
}

impl From<Algorithm> for bitcoin_pqc_algorithm_t {
    fn from(alg: Algorithm) -> Self {
        match alg {
            Algorithm::SECP256K1_SCHNORR => bitcoin_pqc_algorithm_t::BITCOIN_PQC_SECP256K1_SCHNORR,
            Algorithm::ML_DSA_44 => bitcoin_pqc_algorithm_t::BITCOIN_PQC_ML_DSA_44,
            Algorithm::SLH_DSA_SHA2_128S => bitcoin_pqc_algorithm_t::BITCOIN_PQC_SLH_DSA_SHA2_128S,
            _ => panic!("Invalid algorithm"),
        }
    }
}

// Serde implementations using string representation directly on Algorithm
#[cfg(feature = "serde")]
impl TryFrom<String> for Algorithm {
    type Error = String; // Serde requires specific error handling

    fn try_from(s: String) -> Result<Self, Self::Error> {
        match s.as_str() {
            "SECP256K1_SCHNORR" => Ok(Algorithm::SECP256K1_SCHNORR),
            "ML_DSA_44" => Ok(Algorithm::ML_DSA_44),
            "SLH_DSA_SHA2_128S" => Ok(Algorithm::SLH_DSA_SHA2_128S),
            _ => Err(format!("Unknown algorithm string: {s}")),
        }
    }
}

#[cfg(feature = "serde")]
impl From<Algorithm> for String {
    fn from(alg: Algorithm) -> Self {
        match alg {
            Algorithm::SECP256K1_SCHNORR => "SECP256K1_SCHNORR".to_string(),
            Algorithm::ML_DSA_44 => "ML_DSA_44".to_string(),
            Algorithm::SLH_DSA_SHA2_128S => "SLH_DSA_SHA2_128S".to_string(),
            _ => panic!("Invalid algorithm variant"), // Should not happen with bitmask
        }
    }
}

impl fmt::Display for Algorithm {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Algorithm::SECP256K1_SCHNORR => write!(f, "SECP256K1_SCHNORR"),
            Algorithm::ML_DSA_44 => write!(f, "ML_DSA_44"),
            Algorithm::SLH_DSA_SHA2_128S => write!(f, "SLH_DSA_SHA2_128S"),
            _ => write!(f, "Unknown({:b})", self.bits),
        }
    }
}

impl Algorithm {
    /// Returns a user-friendly debug string with the algorithm name
    pub fn debug_name(&self) -> String {
        match *self {
            Algorithm::SECP256K1_SCHNORR => "SECP256K1_SCHNORR".to_string(),
            Algorithm::ML_DSA_44 => "ML_DSA_44".to_string(),
            Algorithm::SLH_DSA_SHA2_128S => "SLH_DSA_SHA2_128S".to_string(),
            _ => format!("Unknown({:b})", self.bits),
        }
    }
}

const SECP256K1_MESSAGE_HASH_SIZE: usize = 32;
const PQC_KEYGEN_ENTROPY_SIZE: usize = 128;

fn keygen_entropy_size(algorithm: Algorithm) -> usize {
    if algorithm == Algorithm::SECP256K1_SCHNORR {
        SECP256K1_MESSAGE_HASH_SIZE
    } else {
        PQC_KEYGEN_ENTROPY_SIZE
    }
}

fn map_ffi_error(error: bitcoin_pqc_error_t) -> PqcError {
    match error {
        bitcoin_pqc_error_t::BITCOIN_PQC_ERROR_BAD_ARG => PqcError::BadArgument,
        bitcoin_pqc_error_t::BITCOIN_PQC_ERROR_BAD_KEY => PqcError::BadKey,
        bitcoin_pqc_error_t::BITCOIN_PQC_ERROR_BAD_SIGNATURE => PqcError::BadSignature,
        bitcoin_pqc_error_t::BITCOIN_PQC_ERROR_NOT_IMPLEMENTED => PqcError::NotImplemented,
        _ => PqcError::Other(error.0),
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct PublicKey {
    /// The algorithm this key belongs to
    pub algorithm: Algorithm,
    /// The raw key bytes (serialized as hex)
    #[cfg_attr(feature = "serde", serde(with = "hex_bytes"))]
    pub bytes: Vec<u8>,
}

impl PublicKey {
    /// Creates a PublicKey from an algorithm and a byte slice.
    ///
    /// Validates the length of the byte slice against the expected size for the algorithm.
    pub fn try_from_slice(algorithm: Algorithm, bytes: &[u8]) -> Result<Self, PqcError> {
        let expected_len = public_key_size(algorithm);
        if bytes.len() != expected_len {
            return Err(PqcError::BadKey); // Use BadKey for length mismatch
        }

        Ok(PublicKey {
            algorithm,
            bytes: bytes.to_vec(),
        })
    }

    /// Creates a PublicKey from an algorithm and a hex string.
    pub fn from_str(algorithm: Algorithm, s: &str) -> Result<Self, PqcError> {
        let bytes = hex::decode(s).map_err(|_| PqcError::BadArgument)?;
        Self::try_from_slice(algorithm, &bytes)
    }
}

/// Secret key wrapper
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct SecretKey {
    /// The algorithm this key belongs to
    pub algorithm: Algorithm,
    /// The raw key bytes (serialized as hex)
    #[cfg_attr(feature = "serde", serde(with = "hex_bytes"))]
    pub bytes: Vec<u8>,
}

impl SecretKey {
    /// Creates a SecretKey from an algorithm and a hex string.
    pub fn from_str(algorithm: Algorithm, s: &str) -> Result<Self, PqcError> {
        let bytes = hex::decode(s).map_err(|_| PqcError::BadArgument)?;
        Self::try_from_slice(algorithm, &bytes)
    }

    /// Creates a SecretKey from an algorithm and a byte slice.
    ///
    /// Validates the length of the byte slice against the expected size for the algorithm.
    pub fn try_from_slice(algorithm: Algorithm, bytes: &[u8]) -> Result<Self, PqcError> {
        let expected_len = secret_key_size(algorithm);
        if bytes.len() != expected_len {
            return Err(PqcError::BadKey);
        }

        Ok(SecretKey {
            algorithm,
            bytes: bytes.to_vec(),
        })
    }
}

impl Drop for SecretKey {
    fn drop(&mut self) {
        // Zero out secret key memory on drop
        // Consider using crates like `zeroize` for more robust clearing
        for byte in &mut self.bytes {
            *byte = 0;
        }
    }
}

/// Represents a signature (PQC or Secp256k1)
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct Signature {
    /// The algorithm this signature belongs to
    pub algorithm: Algorithm,
    /// The raw signature bytes (serialized as hex)
    #[cfg_attr(feature = "serde", serde(with = "hex_bytes"))]
    pub bytes: Vec<u8>,
}

impl Signature {
    /// Creates a Signature from an algorithm and a byte slice.
    ///
    /// Validates the length of the byte slice against the expected size for the algorithm.
    pub fn try_from_slice(algorithm: Algorithm, bytes: &[u8]) -> Result<Self, PqcError> {
        let expected_len = signature_size(algorithm);
        if bytes.len() != expected_len {
            return Err(PqcError::BadSignature);
        }

        Ok(Signature {
            algorithm,
            bytes: bytes.to_vec(),
        })
    }

    /// Creates a Signature from an algorithm and a hex string.
    pub fn from_str(algorithm: Algorithm, s: &str) -> Result<Self, PqcError> {
        let bytes = hex::decode(s).map_err(|_| PqcError::BadArgument)?;
        Self::try_from_slice(algorithm, &bytes)
    }
}

/// Key pair containing both public and secret keys
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct KeyPair {
    /// The public key
    pub public_key: PublicKey,
    /// The secret key
    pub secret_key: SecretKey,
}

/// Generate a key pair for the specified algorithm using provided seed data.
///
/// # Arguments
///
/// * `algorithm` - The algorithm to use (PQC or Secp256k1)
/// * `random_data` - Seed bytes for key generation.
///     - For PQC algorithms, must be at least 128 bytes.
///     - For `SECP256K1_SCHNORR`, must be exactly 32 bytes representing the desired secret key.
///
/// # Returns
///
/// A new key pair on success, or an error if the `random_data` is invalid for the algorithm.
///
pub fn generate_keypair(algorithm: Algorithm, random_data: &[u8]) -> Result<KeyPair, PqcError> {
    if random_data.len() < keygen_entropy_size(algorithm) {
        return Err(PqcError::InsufficientData);
    }

    unsafe {
        let mut keypair = bitcoin_pqc_keypair_t {
            algorithm: algorithm.into(),
            public_key: ptr::null_mut(),
            secret_key: ptr::null_mut(),
            public_key_size: 0,
            secret_key_size: 0,
        };

        let result = bitcoin_pqc_keygen(
            algorithm.into(),
            &mut keypair,
            random_data.as_ptr(),
            random_data.len(),
        );

        if result != bitcoin_pqc_error_t::BITCOIN_PQC_OK {
            bitcoin_pqc_keypair_free(&mut keypair);
            return Err(map_ffi_error(result));
        }

        let pk_slice =
            std::slice::from_raw_parts(keypair.public_key as *const u8, keypair.public_key_size);
        let sk_slice =
            std::slice::from_raw_parts(keypair.secret_key as *const u8, keypair.secret_key_size);

        let public_key = PublicKey {
            algorithm,
            bytes: pk_slice.to_vec(),
        };
        let secret_key = SecretKey {
            algorithm,
            bytes: sk_slice.to_vec(),
        };

        bitcoin_pqc_keypair_free(&mut keypair);

        Ok(KeyPair {
            public_key,
            secret_key,
        })
    }
}

/// Sign a message using the specified secret key
///
/// # Arguments
///
/// * `secret_key` - The secret key to sign with
/// * `message` - The message to sign.
///     - For PQC algorithms, this is the raw message.
///     - For `SECP256K1_SCHNORR`, this *must* be a 32-byte hash of the message.
///
/// # Returns
///
/// A signature on success, or an error
pub fn sign(secret_key: &SecretKey, message: &[u8]) -> Result<Signature, PqcError> {
    if secret_key.algorithm == Algorithm::SECP256K1_SCHNORR
        && message.len() < SECP256K1_MESSAGE_HASH_SIZE
    {
        return Err(PqcError::InsufficientData);
    }

    let algorithm = secret_key.algorithm;

    unsafe {
        let mut signature = bitcoin_pqc_signature_t {
            algorithm: algorithm.into(),
            signature: ptr::null_mut(),
            signature_size: 0,
        };

        let result = bitcoin_pqc_sign(
            algorithm.into(),
            secret_key.bytes.as_ptr(),
            secret_key.bytes.len(),
            message.as_ptr(),
            message.len(),
            &mut signature,
        );

        if result != bitcoin_pqc_error_t::BITCOIN_PQC_OK {
            return Err(map_ffi_error(result));
        }

        let sig_slice =
            std::slice::from_raw_parts(signature.signature as *const u8, signature.signature_size);
        let sig_bytes = sig_slice.to_vec();

        bitcoin_pqc_signature_free(&mut signature);

        Ok(Signature {
            algorithm,
            bytes: sig_bytes,
        })
    }
}

/// Verify a signature using the specified public key
///
/// # Arguments
///
/// * `public_key` - The public key to verify with
/// * `message` - The message that was signed (assumed to be pre-hashed for Secp256k1)
/// * `signature` - The signature to verify
///
/// # Returns
///
/// Ok(()) if the signature is valid, an error otherwise
pub fn verify(
    public_key: &PublicKey,
    message: &[u8],
    signature: &Signature,
) -> Result<(), PqcError> {
    // Ensure the key and signature algorithms match
    if public_key.algorithm != signature.algorithm {
        return Err(PqcError::AlgorithmMismatch);
    }

    let algorithm = public_key.algorithm;

    if algorithm == Algorithm::SECP256K1_SCHNORR && message.len() < SECP256K1_MESSAGE_HASH_SIZE {
        return Err(PqcError::InsufficientData);
    }

    if public_key.bytes.len() != public_key_size(algorithm) {
        return Err(PqcError::BadKey);
    }

    // NOTE: We do NOT check the signature length here against signature_size(algorithm)
    // because some algorithms like FN-DSA have variable signature lengths.
    // The C library's verify function should handle invalid lengths internally.

    unsafe {
        let result = bitcoin_pqc_verify(
            algorithm.into(),
            public_key.bytes.as_ptr(),
            public_key.bytes.len(),
            message.as_ptr(),
            message.len(),
            signature.bytes.as_ptr(),
            signature.bytes.len(),
        );
        result.into()
    }
}

/// Get the public key size for an algorithm
///
/// # Arguments
///
/// * `algorithm` - The algorithm to get the size for
///
/// # Returns
///
/// The size in bytes
pub fn public_key_size(algorithm: Algorithm) -> usize {
    unsafe { bitcoin_pqc_public_key_size(algorithm.into()) }
}

/// Number of algorithms supported by [`algorithm_from_index`].
pub const SUPPORTED_ALGORITHM_COUNT: u8 = 3;

/// Map an arbitrary index to a supported algorithm.
///
/// Used by fuzz targets to select algorithms from raw input bytes:
/// 0 → SECP256K1_SCHNORR, 1 → ML_DSA_44, 2 → SLH_DSA_SHA2_128S.
#[doc(hidden)]
pub fn algorithm_from_index(index: u8) -> Algorithm {
    match index % SUPPORTED_ALGORITHM_COUNT {
        0 => Algorithm::SECP256K1_SCHNORR,
        1 => Algorithm::ML_DSA_44,
        2 => Algorithm::SLH_DSA_SHA2_128S,
        _ => unreachable!(),
    }
}

/// Get the secret key size for an algorithm
///
/// # Arguments
///
/// * `algorithm` - The algorithm to get the size for
///
/// # Returns
///
/// The size in bytes
pub fn secret_key_size(algorithm: Algorithm) -> usize {
    unsafe { bitcoin_pqc_secret_key_size(algorithm.into()) }
}

/// Get the signature size for an algorithm
///
/// # Arguments
///
/// * `algorithm` - The algorithm to get the size for
///
/// # Returns
///
/// The size in bytes
pub fn signature_size(algorithm: Algorithm) -> usize {
    unsafe { bitcoin_pqc_signature_size(algorithm.into()) }
}
