/* kernels.c -- floating-point reductions over integer data, written the way C
 * programs write them: integers in integer arrays, converted where they are
 * summed. Compiled separately from the driver so that every trip count is a
 * run-time value, and built once per configuration by
 * tools/contracts/llvm_eval.py:
 *
 *   clang -O3 -march=native                         strict IEEE semantics
 *   clang -O3 -march=native -fpass-plugin=...       strict, plus ExactReduce
 *   clang -O3 -march=native -ffast-math             reassociation everywhere
 *
 * ExactReduce must license the integer kernels (statically or behind a
 * run-time guard) and decline the two controls at the end; the licensed build
 * must print the strict build's bits for every input.
 */
#include <stddef.h>
#include <stdint.h>

#include "kernels.h"

/* Mean intensity of 8-bit pixels: the sum of n values below 2^8. */
double k_sum_u8(const uint8_t *p, long n)
{
    double s = 0.0;
    for (long i = 0; i < n; i++)
        s += p[i];
    return s;
}

/* Second moment of 8-bit pixels, for the variance: terms below 2^16. */
double k_sumsq_u8(const uint8_t *p, long n)
{
    double s = 0.0;
    for (long i = 0; i < n; i++)
        s += (double)p[i] * p[i];
    return s;
}

/* Energy of 16-bit audio samples: terms up to 2^30, exact for n <= 2^23. */
double k_energy_i16(const int16_t *x, long n)
{
    double e = 0.0;
    for (long i = 0; i < n; i++)
        e += (double)x[i] * x[i];
    return e;
}

/* Sum of 32-bit integers in double: exact for n <= 2^22. */
double k_sum_i32(const int32_t *x, int n)
{
    double s = 0.0;
    for (int i = 0; i < n; i++)
        s += x[i];
    return s;
}

/* Gram matrix G = X X^T of d features over n samples of 8-bit data, the first
 * step of a PCA or a least-squares fit. X is stored feature-major. */
void k_gram_u8(const uint8_t *X, int d, int n, double *G)
{
    for (int a = 0; a < d; a++)
        for (int b = 0; b <= a; b++) {
            const uint8_t *u = X + (size_t)a * n, *v = X + (size_t)b * n;
            double s = 0.0;
            for (int i = 0; i < n; i++)
                s += (double)u[i] * v[i];
            G[(size_t)a * d + b] = G[(size_t)b * d + a] = s;
        }
}

/* Scores of a quantized linear classifier: int8 templates and int8 inputs,
 * accumulated in binary32 (exact for at most 1024 inputs per row). */
void k_qlinear_i8(const int8_t *W, const int8_t *X, int classes, int features, int batch,
                  float *Y)
{
    for (int b = 0; b < batch; b++)
        for (int c = 0; c < classes; c++) {
            const int8_t *w = W + (size_t)c * features, *x = X + (size_t)b * features;
            float s = 0.0f;
            for (int j = 0; j < features; j++)
                s += (float)w[j] * (float)x[j];
            Y[(size_t)b * classes + c] = s;
        }
}

/* C = A B^T for int8 matrices with a double accumulator (k innermost). */
void k_gemm_i8(const int8_t *A, const int8_t *Bt, int m, int n, int k, double *C)
{
    for (int i = 0; i < m; i++)
        for (int j = 0; j < n; j++) {
            const int8_t *a = A + (size_t)i * k, *b = Bt + (size_t)j * k;
            double s = 0.0;
            for (int t = 0; t < k; t++)
                s += (double)a[t] * b[t];
            C[(size_t)i * n + j] = s;
        }
}

/* Vertex degrees of a graph from its dense 0/1 adjacency matrix. */
void k_degree_u8(const uint8_t *A, int n, double *deg)
{
    for (int i = 0; i < n; i++) {
        const uint8_t *row = A + (size_t)i * n;
        double s = 0.0;
        for (int j = 0; j < n; j++)
            s += row[j];
        deg[i] = s;
    }
}

/* Walks of length two from every vertex: A times the integer degree vector. */
void k_walks2_u8(const uint8_t *A, const int16_t *deg, int n, double *w)
{
    for (int i = 0; i < n; i++) {
        const uint8_t *row = A + (size_t)i * n;
        double s = 0.0;
        for (int j = 0; j < n; j++)
            s += (double)row[j] * deg[j];
        w[i] = s;
    }
}

/* Control: real-valued data. No fact exists; the pass must decline. */
double k_dot_f64(const double *a, const double *b, long n)
{
    double s = 0.0;
    for (long i = 0; i < n; i++)
        s += a[i] * b[i];
    return s;
}

/* Control: 8-bit data in a binary32 accumulator. Exact only for n <= 65,793;
 * the guard sends larger inputs to the strict loop. */
float k_sum_u8_f32(const uint8_t *p, long n)
{
    float s = 0.0f;
    for (long i = 0; i < n; i++)
        s += p[i];
    return s;
}
