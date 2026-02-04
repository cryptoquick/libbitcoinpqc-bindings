use std::env;
use std::path::PathBuf;

fn main() {
    // Build the C library from the git submodule
    let dst = cmake::build("libbitcoinpqc");

    // Link against the built library
    println!("cargo:rustc-link-search=native={}/lib", dst.display());
    println!("cargo:rustc-link-lib=static=bitcoinpqc");

    // Tell cargo to invalidate the built crate whenever the submodule changes
    println!("cargo:rerun-if-changed=libbitcoinpqc/include/libbitcoinpqc/bitcoinpqc.h");
    println!("cargo:rerun-if-changed=libbitcoinpqc/include/libbitcoinpqc/ml_dsa.h");
    println!("cargo:rerun-if-changed=libbitcoinpqc/include/libbitcoinpqc/slh_dsa.h");
    println!("cargo:rerun-if-changed=libbitcoinpqc/src/");
    println!("cargo:rerun-if-changed=libbitcoinpqc/dilithium/");
    println!("cargo:rerun-if-changed=libbitcoinpqc/sphincsplus/");
    println!("cargo:rerun-if-changed=libbitcoinpqc/CMakeLists.txt");

    // The bindgen::Builder is the main entry point to bindgen
    let bindings = bindgen::Builder::default()
        // The input header to generate bindings for
        .header("libbitcoinpqc/include/libbitcoinpqc/bitcoinpqc.h")
        // Tell bindgen to generate constants for enums
        .bitfield_enum("bitcoin_pqc_algorithm_t")
        .bitfield_enum("bitcoin_pqc_error_t")
        // Tell cargo to invalidate the built crate whenever the wrapper changes
        .parse_callbacks(Box::new(bindgen::CargoCallbacks::new()))
        // Suppress warnings for unused code in the generated bindings
        .allowlist_function("bitcoin_pqc_.*")
        .allowlist_type("bitcoin_pqc_.*")
        .allowlist_var("BITCOIN_PQC_.*")
        // Generate bindings
        .generate()
        // Unwrap the Result and panic on failure
        .expect("Unable to generate bindings");

    // Write the bindings to the $OUT_DIR/bindings.rs file
    let out_path = PathBuf::from(env::var("OUT_DIR").unwrap());
    bindings
        .write_to_file(out_path.join("bindings.rs"))
        .expect("Couldn't write bindings!");
}
