#!/usr/bin/env sh
# secp256k1-sys's wasm sysroot string.h omits memmove; force our declaration.
FIX="$(cd "$(dirname "$0")" && pwd)/secp_memmove_fix.h"
exec clang -include "$FIX" "$@"