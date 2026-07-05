#ifndef BITCOINPQC_WASM_STDIO_H
#define BITCOINPQC_WASM_STDIO_H

#include <stddef.h>

typedef struct FILE {
    int unused;
} FILE;

extern FILE *stderr;

int printf(const char *format, ...);
int fprintf(FILE *stream, const char *format, ...);
size_t fwrite(const void *ptr, size_t size, size_t nmemb, FILE *stream);

#endif