#include <stddef.h>
#include <stdarg.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include <pthread.h>

/* Bump allocator for wasm32-unknown-unknown (no OS libc). */
#define WASM_HEAP_SIZE (32 * 1024 * 1024)
static unsigned char wasm_heap[WASM_HEAP_SIZE];
static size_t wasm_heap_offset;

static size_t align_up(size_t value, size_t alignment) {
    return (value + (alignment - 1)) & ~(alignment - 1);
}

void *malloc(size_t size) {
    if (size == 0) {
        return NULL;
    }
    size_t aligned = align_up(size, 8);
    if (wasm_heap_offset + aligned > WASM_HEAP_SIZE) {
        return NULL;
    }
    void *ptr = &wasm_heap[wasm_heap_offset];
    wasm_heap_offset += aligned;
    return ptr;
}

void free(void *ptr) {
    (void)ptr;
}

void abort(void) {
    __builtin_trap();
}

int pthread_once(pthread_once_t *once_control, void (*init_routine)(void)) {
    if (*once_control == 0) {
        *once_control = 1;
        init_routine();
    }
    return 0;
}

void *calloc(size_t nmemb, size_t size) {
    if (nmemb != 0 && size > (size_t)-1 / nmemb) {
        return NULL;
    }
    size_t total = nmemb * size;
    void *ptr = malloc(total);
    if (ptr != NULL) {
        memset(ptr, 0, total);
    }
    return ptr;
}

void *realloc(void *ptr, size_t size) {
    (void)ptr;
    return malloc(size);
}

void *memcpy(void *dest, const void *src, size_t n) {
    unsigned char *d = dest;
    const unsigned char *s = src;
    for (size_t i = 0; i < n; i++) {
        d[i] = s[i];
    }
    return dest;
}

void *memmove(void *dest, const void *src, size_t n) {
    unsigned char *d = dest;
    const unsigned char *s = src;
    if (d == s || n == 0) {
        return dest;
    }
    if (d < s) {
        for (size_t i = 0; i < n; i++) {
            d[i] = s[i];
        }
    } else {
        for (size_t i = n; i > 0; i--) {
            d[i - 1] = s[i - 1];
        }
    }
    return dest;
}

void *memset(void *s, int c, size_t n) {
    unsigned char *p = s;
    unsigned char value = (unsigned char)c;
    for (size_t i = 0; i < n; i++) {
        p[i] = value;
    }
    return s;
}

int memcmp(const void *s1, const void *s2, size_t n) {
    const unsigned char *a = s1;
    const unsigned char *b = s2;
    for (size_t i = 0; i < n; i++) {
        if (a[i] != b[i]) {
            return (int)a[i] - (int)b[i];
        }
    }
    return 0;
}

size_t strlen(const char *s) {
    size_t len = 0;
    while (s[len] != '\0') {
        len++;
    }
    return len;
}

FILE stderr_stub;
FILE *stderr = &stderr_stub;

int printf(const char *format, ...) {
    (void)format;
    return 0;
}

int fprintf(FILE *stream, const char *format, ...) {
    (void)stream;
    (void)format;
    return 0;
}

size_t fwrite(const void *ptr, size_t size, size_t nmemb, FILE *stream) {
    (void)ptr;
    (void)size;
    (void)nmemb;
    (void)stream;
    return 0;
}