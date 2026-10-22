/* kernels.h -- the reductions of kernels.c; see that file. */
#ifndef EXACT_REDUCE_KERNELS_H
#define EXACT_REDUCE_KERNELS_H

#include <stdint.h>

double k_sum_u8(const uint8_t *p, long n);
double k_sumsq_u8(const uint8_t *p, long n);
double k_energy_i16(const int16_t *x, long n);
double k_sum_i32(const int32_t *x, int n);
void   k_gram_u8(const uint8_t *X, int d, int n, double *G);
void   k_qlinear_i8(const int8_t *W, const int8_t *X, int classes, int features, int batch,
                    float *Y);
void   k_gemm_i8(const int8_t *A, const int8_t *Bt, int m, int n, int k, double *C);
void   k_degree_u8(const uint8_t *A, int n, double *deg);
void   k_walks2_u8(const uint8_t *A, const int16_t *deg, int n, double *w);
double k_dot_f64(const double *a, const double *b, long n);
float  k_sum_u8_f32(const uint8_t *p, long n);

#endif
