#ifndef BITCOINPQC_WASM_STDLIB_H
#define BITCOINPQC_WASM_STDLIB_H

#include <stddef.h>

void *malloc(size_t size);
void free(void *ptr);
void *calloc(size_t nmemb, size_t size);
void *realloc(void *ptr, size_t size);
__attribute__((noreturn)) void abort(void);

#endif