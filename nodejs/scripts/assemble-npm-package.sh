#!/usr/bin/env bash
# Assemble dual-export npm package: native (this tree) + WASM from ../wasm/dist
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WASM_DIST="$(cd "$ROOT/../wasm" && pwd)/dist"
if [[ ! -d "$WASM_DIST" ]]; then
  echo "Missing $WASM_DIST — run wasm build first (cd ../wasm && npm run build)" >&2
  exit 1
fi
mkdir -p "$ROOT/wasm"
cp -a "$WASM_DIST"/. "$ROOT/wasm/"
echo "Assembled $ROOT/wasm from $WASM_DIST"
