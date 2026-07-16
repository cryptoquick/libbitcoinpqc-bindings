/* secp256k1-sys wasm-sysroot/string.h omits memmove; supply it for wasm32 builds. */
#ifndef BITCOINPQC_SECP_MEMMOVE_FIX_H
#define BITCOINPQC_SECP_MEMMOVE_FIX_H

#include <stddef.h>

void *memmove(void *dest, const void *src, size_t n);

#endif