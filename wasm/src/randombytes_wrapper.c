/*
 * WASM-specific randombytes implementation.
 *
 * This replaces randombytes_custom.c for the WASM build. It provides the same
 * pqc_randombytes_init() / pqc_randombytes_cleanup() API used by the wrapper
 * functions in src/ml_dsa/ and src/slh_dsa/.
 *
 * On WASM32, size_t is 4 bytes while unsigned long long is 8 bytes. SPHINCS+
 * declares randombytes(unsigned char*, unsigned long long), while Dilithium
 * uses randombytes(uint8_t*, size_t). These are ABI-incompatible on WASM32
 * and wasm-ld's signature mismatch adapters emit unreachable traps.
 *
 * To solve this, Dilithium sources are compiled with
 * -Drandombytes=dilithium_randombytes so its call sites use a renamed symbol.
 * We then provide BOTH functions here, each with the correct signature,
 * both delegating to the same entropy buffer.
 *
 * In the WASM environment there is no /dev/urandom. Entropy MUST be provided
 * from JavaScript via the bitcoin_pqc_keygen / sign APIs, which call
 * pqc_randombytes_init() before any crypto operation.
 */

#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "randombytes_custom.h"

/* Global entropy state */
static const uint8_t *g_random_data = NULL;
static size_t g_random_data_size = 0;
static size_t g_random_data_offset = 0;

void pqc_randombytes_init(const uint8_t *data, size_t size) {
    g_random_data = data;
    g_random_data_size = size;
    g_random_data_offset = 0;
}

void pqc_randombytes_cleanup(void) {
    g_random_data = NULL;
    g_random_data_size = 0;
    g_random_data_offset = 0;
}

/* Core implementation shared by both entry points */
static void randombytes_impl(uint8_t *out, size_t outlen) {
    if (!out || outlen == 0) {
        return;
    }

    if (g_random_data == NULL || g_random_data_size == 0) {
        /* No entropy available -- this should not happen in WASM since
         * JavaScript always provides entropy before calling keygen/sign.
         * Zero-fill as a safe fallback rather than calling abort(). */
        memset(out, 0, outlen);
        return;
    }

    /* Serve from user-provided buffer, cycling if necessary */
    size_t total_copied = 0;

    while (total_copied < outlen) {
        size_t amount = outlen - total_copied;
        if (amount > g_random_data_size - g_random_data_offset) {
            amount = g_random_data_size - g_random_data_offset;
        }

        memcpy(out + total_copied, g_random_data + g_random_data_offset, amount);

        total_copied += amount;
        g_random_data_offset += amount;

        if (g_random_data_offset >= g_random_data_size) {
            g_random_data_offset = 0;
        }
    }
}

/*
 * randombytes() with SPHINCS+ signature (unsigned long long).
 * Called by SPHINCS+ reference code (sign.c, keypair).
 */
void randombytes(unsigned char *out, unsigned long long outlen) {
    randombytes_impl((uint8_t *)out, (size_t)outlen);
}

/*
 * dilithium_randombytes() with Dilithium signature (size_t).
 * Dilithium sources are compiled with -Drandombytes=dilithium_randombytes
 * so their call sites resolve to this function.
 */
void dilithium_randombytes(uint8_t *out, size_t outlen) {
    randombytes_impl(out, outlen);
}
