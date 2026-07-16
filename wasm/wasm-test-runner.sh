#!/usr/bin/env sh
# Cargo runner for wasm32-unknown-unknown integration tests (Node).
# Override runner path: WASM_BINDGEN_TEST_RUNNER=/path/to/wasm-bindgen-test-runner
set -e

runner="${WASM_BINDGEN_TEST_RUNNER:-}"
if [ -z "$runner" ]; then
	runner="$(command -v wasm-bindgen-test-runner 2>/dev/null || true)"
fi
if [ -z "$runner" ]; then
	runner="$(find "${HOME}/.cache/.wasm-pack" -name wasm-bindgen-test-runner 2>/dev/null | head -1)"
fi
if [ -z "$runner" ]; then
	echo "error: wasm-bindgen-test-runner not found." >&2
	echo "Run 'wasm-pack test --node' once (installs wasm-bindgen), or: cargo install wasm-bindgen-cli" >&2
	exit 1
fi

exec "$runner" "$@"