//! Shared test harness helpers for native and wasm32 targets.
//!
//! Node.js is the default runner for `wasm-pack test --node`; no configure macro needed.

/// Run as a native `#[test]` or a wasm `#[wasm_bindgen_test]`.
#[macro_export]
macro_rules! integration_test {
    ($(#[$attr:meta])* fn $name:ident() $body:block) => {
        #[cfg_attr(target_arch = "wasm32", wasm_bindgen_test::wasm_bindgen_test)]
        #[cfg_attr(not(target_arch = "wasm32"), test)]
        $(#[$attr])*
        fn $name() $body
    };
}
