#ifndef BITCOINPQC_WASM_PTHREAD_H
#define BITCOINPQC_WASM_PTHREAD_H

typedef int pthread_once_t;

#define PTHREAD_ONCE_INIT 0

int pthread_once(pthread_once_t *once_control, void (*init_routine)(void));

#endif