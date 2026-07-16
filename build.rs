use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

const SECP256K1_TAG: &str = "v0.5.0";
const SECP256K1_COMMIT: &str = "e3a885d42a7800c1ccebad94ad1e2b82c4df5c65";

/// Fetch libsecp256k1 into wasm/vendor/ when missing (matches wasm/bin/wasm_build.sh).
fn ensure_secp256k1_vendor(manifest_dir: &Path) -> PathBuf {
    let secp_dir = manifest_dir.join("wasm/vendor/secp256k1");
    let marker = secp_dir.join("src/secp256k1.c");

    if marker.is_file() {
        return secp_dir;
    }

    if secp_dir.exists() {
        let _ = std::fs::remove_dir_all(&secp_dir);
    }

    let status = Command::new("git")
        .args([
            "clone",
            "--depth",
            "1",
            "--branch",
            SECP256K1_TAG,
            "https://github.com/bitcoin-core/secp256k1.git",
        ])
        .arg(&secp_dir)
        .status()
        .expect("failed to spawn git clone for libsecp256k1");

    if !status.success() {
        panic!("git clone libsecp256k1 failed with status {status}");
    }

    let actual = Command::new("git")
        .args(["-C", secp_dir.to_str().unwrap(), "rev-parse", "HEAD"])
        .output()
        .expect("failed to read libsecp256k1 HEAD");
    let actual_commit = String::from_utf8_lossy(&actual.stdout).trim().to_string();
    if actual_commit != SECP256K1_COMMIT {
        let checkout = Command::new("git")
            .args([
                "-C",
                secp_dir.to_str().unwrap(),
                "fetch",
                "--depth",
                "1",
                "origin",
                SECP256K1_COMMIT,
            ])
            .status()
            .expect("failed to spawn git fetch for libsecp256k1");
        if !checkout.success() {
            panic!("git fetch libsecp256k1 pin failed");
        }
        let checkout = Command::new("git")
            .args([
                "-C",
                secp_dir.to_str().unwrap(),
                "checkout",
                SECP256K1_COMMIT,
            ])
            .status()
            .expect("failed to spawn git checkout for libsecp256k1");
        if !checkout.success() {
            panic!("git checkout libsecp256k1 pin failed");
        }
    }

    secp_dir
}

fn apply_wasm_target(build: &mut cc::Build, clang: &str) {
    build
        .compiler(clang)
        .flag("-target")
        .flag("wasm32-unknown-unknown")
        .opt_level(2);
}

fn apply_secp256k1_defines(build: &mut cc::Build) {
    build
        .define("ECMULT_GEN_PREC_BITS", "4")
        .define("ECMULT_WINDOW_SIZE", "15")
        .define("ENABLE_MODULE_SCHNORRSIG", "1")
        .define("ENABLE_MODULE_EXTRAKEYS", "1")
        .define("USE_NUM_NONE", "1")
        .define("USE_FIELD_INV_BUILTIN", "1")
        .define("USE_SCALAR_INV_BUILTIN", "1")
        .define("USE_ENDOMORPHISM", "1")
        .define("USE_FIELD_10X26", "1")
        .define("USE_SCALAR_8X32", "1");
}

/// C sources and flags for wasm32 builds.
///
/// Keep in sync with `wasm/bin/wasm_build.sh` and `libbitcoinpqc/CMakeLists.txt`.
fn build_wasm_lib(manifest_dir: &Path) {
    let clang = env::var("CC_wasm32-unknown-unknown").unwrap_or_else(|_| "clang".to_string());
    let shim_include = manifest_dir.join("wasm/libc_shim/include");
    let secp_dir = ensure_secp256k1_vendor(manifest_dir);

    let pqc = manifest_dir.join("libbitcoinpqc");
    let include = |build: &mut cc::Build| {
        build
            .include(&shim_include)
            .include(pqc.join("include"))
            .include(pqc.join("src"))
            .include(pqc.join("dilithium/ref"))
            .include(pqc.join("sphincsplus/ref"));
    };

    // Dilithium: rename randombytes to avoid WASM32 ABI clash with SPHINCS+.
    let dilithium_sources = [
        "dilithium/ref/sign.c",
        "dilithium/ref/packing.c",
        "dilithium/ref/polyvec.c",
        "dilithium/ref/poly.c",
        "dilithium/ref/ntt.c",
        "dilithium/ref/reduce.c",
        "dilithium/ref/rounding.c",
        "dilithium/ref/fips202.c",
        "dilithium/ref/symmetric-shake.c",
    ];

    let mut secp = cc::Build::new();
    apply_wasm_target(&mut secp, &clang);
    apply_secp256k1_defines(&mut secp);
    secp.include(&shim_include)
        .include(&secp_dir)
        .include(secp_dir.join("include"))
        .include(secp_dir.join("src"))
        .file(secp_dir.join("src/secp256k1.c"))
        .file(secp_dir.join("src/precomputed_ecmult.c"))
        .file(secp_dir.join("src/precomputed_ecmult_gen.c"));
    secp.compile("secp256k1_wasm");

    let mut secp_schnorr = cc::Build::new();
    apply_wasm_target(&mut secp_schnorr, &clang);
    apply_secp256k1_defines(&mut secp_schnorr);
    include(&mut secp_schnorr);
    secp_schnorr
        .include(&shim_include)
        .include(&secp_dir)
        .include(secp_dir.join("include"))
        .include(secp_dir.join("src"))
        .file(pqc.join("src/secp256k1_schnorr.c"));
    secp_schnorr.compile("secp256k1_schnorr_wasm");

    let mut dilithium = cc::Build::new();
    apply_wasm_target(&mut dilithium, &clang);
    dilithium
        .define("DILITHIUM_MODE", "2")
        .define("PARAMS", "sphincs-sha2-128s")
        .define("CUSTOM_RANDOMBYTES", "1")
        .define("randombytes", "dilithium_randombytes");
    include(&mut dilithium);
    for src in dilithium_sources {
        dilithium.file(pqc.join(src));
    }
    dilithium.compile("dilithium_wasm");

    let other_sources = [
        "src/bitcoinpqc.c",
        "src/ml_dsa/keygen.c",
        "src/ml_dsa/sign.c",
        "src/ml_dsa/verify.c",
        "src/ml_dsa/utils.c",
        "src/slh_dsa/keygen.c",
        "src/slh_dsa/sign.c",
        "src/slh_dsa/verify.c",
        "src/slh_dsa/utils.c",
        "sphincsplus/ref/address.c",
        "sphincsplus/ref/fors.c",
        "sphincsplus/ref/hash_sha2.c",
        "sphincsplus/ref/merkle.c",
        "sphincsplus/ref/sign.c",
        "sphincsplus/ref/thash_sha2_simple.c",
        "sphincsplus/ref/utils.c",
        "sphincsplus/ref/utilsx1.c",
        "sphincsplus/ref/wots.c",
        "sphincsplus/ref/wotsx1.c",
        "sphincsplus/ref/sha2.c",
    ];

    let mut other = cc::Build::new();
    apply_wasm_target(&mut other, &clang);
    other
        .define("DILITHIUM_MODE", "2")
        .define("PARAMS", "sphincs-sha2-128s")
        .define("CUSTOM_RANDOMBYTES", "1");
    include(&mut other);
    for src in other_sources {
        other.file(pqc.join(src));
    }
    other.file(manifest_dir.join("wasm/src/randombytes_wrapper.c"));
    other.file(manifest_dir.join("wasm/libc_shim/libc_shim.c"));
    other.compile("bitcoinpqc_wasm");

    println!("cargo:rustc-link-lib=static=secp256k1_wasm");
    println!("cargo:rustc-link-lib=static=secp256k1_schnorr_wasm");
    println!("cargo:rustc-link-lib=static=dilithium_wasm");
    println!("cargo:rustc-link-lib=static=bitcoinpqc_wasm");
}

fn rerun_if_sources_changed() {
    println!("cargo:rerun-if-changed=libbitcoinpqc/include/libbitcoinpqc/bitcoinpqc.h");
    println!("cargo:rerun-if-changed=libbitcoinpqc/include/libbitcoinpqc/ml_dsa.h");
    println!("cargo:rerun-if-changed=libbitcoinpqc/include/libbitcoinpqc/slh_dsa.h");
    println!("cargo:rerun-if-changed=libbitcoinpqc/src/");
    println!("cargo:rerun-if-changed=libbitcoinpqc/dilithium/");
    println!("cargo:rerun-if-changed=libbitcoinpqc/sphincsplus/");
    println!("cargo:rerun-if-changed=libbitcoinpqc/CMakeLists.txt");
    println!("cargo:rerun-if-changed=wasm/src/randombytes_wrapper.c");
    println!("cargo:rerun-if-changed=wasm/clang-wasm32.sh");
    println!("cargo:rerun-if-changed=wasm/secp_memmove_fix.h");
    println!("cargo:rerun-if-changed=wasm/libc_shim/");
    println!("cargo:rerun-if-changed=wasm/vendor/secp256k1/");
    println!("cargo:rerun-if-env-changed=CC_wasm32-unknown-unknown");
}

fn libbitcoinpqc_include_dir(manifest_dir: &Path) -> PathBuf {
    if let Ok(prefix) = env::var("LIBBITCOINPQC_PREFIX") {
        PathBuf::from(prefix).join("include")
    } else {
        manifest_dir.join("libbitcoinpqc/include")
    }
}

fn generate_bindings(manifest_dir: &Path) {
    // Always parse headers with the host triple so cross-compiles get full FFI.
    // Layout tests are disabled because struct sizes differ on wasm32 (usize = 32-bit).
    let host = env::var("HOST").expect("HOST not set");
    let include_dir = libbitcoinpqc_include_dir(manifest_dir);
    let header = include_dir.join("libbitcoinpqc/bitcoinpqc.h");

    let bindings = bindgen::Builder::default()
        .header(header.to_str().expect("valid UTF-8 header path"))
        .clang_arg(format!("--target={host}"))
        .clang_arg(format!("-I{}", include_dir.display()))
        .bitfield_enum("bitcoin_pqc_algorithm_t")
        .bitfield_enum("bitcoin_pqc_error_t")
        .parse_callbacks(Box::new(bindgen::CargoCallbacks::new()))
        .allowlist_function("bitcoin_pqc_.*")
        .allowlist_type("bitcoin_pqc_.*")
        .allowlist_var("BITCOIN_PQC_.*")
        .layout_tests(false)
        .generate()
        .expect("Unable to generate bindings");

    let out_path = PathBuf::from(env::var("OUT_DIR").unwrap());
    bindings
        .write_to_file(out_path.join("bindings.rs"))
        .expect("Couldn't write bindings!");
}

fn link_native_libbitcoinpqc(prefix: &Path) {
    let lib_dir = prefix.join("lib");
    println!("cargo:rustc-link-search=native={}", lib_dir.display());
    println!("cargo:rustc-link-lib=static=bitcoinpqc");
    println!("cargo:rustc-link-lib=static=secp256k1");
    println!("cargo:rustc-link-lib=pthread");
    println!("cargo:rustc-link-lib=m");
    // Full archive paths avoid colliding with the Rust secp256k1-sys crate's prefixed symbols.
    println!(
        "cargo:rustc-link-arg={}",
        lib_dir.join("libbitcoinpqc.a").display()
    );
    println!(
        "cargo:rustc-link-arg={}",
        lib_dir.join("libsecp256k1.a").display()
    );
}

fn main() {
    rerun_if_sources_changed();
    println!("cargo:rerun-if-env-changed=LIBBITCOINPQC_PREFIX");

    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let cmake_lists = manifest_dir.join("libbitcoinpqc/CMakeLists.txt");
    let lib_prefix = env::var("LIBBITCOINPQC_PREFIX").ok();
    if lib_prefix.is_none() && !cmake_lists.exists() {
        panic!(
            "libbitcoinpqc submodule not initialized (missing {}). \
             Run: git submodule update --init --recursive",
            cmake_lists.display()
        );
    }

    let target = env::var("TARGET").expect("TARGET not set");

    if target.starts_with("wasm32") {
        build_wasm_lib(&manifest_dir);
    } else if let Some(prefix) = lib_prefix {
        link_native_libbitcoinpqc(Path::new(&prefix));
    } else {
        let dst = cmake::build("libbitcoinpqc");
        link_native_libbitcoinpqc(&dst);
    }

    generate_bindings(&manifest_dir);
}
