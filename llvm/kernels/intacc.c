/* intacc.c -- the integer kernels of kernels.c rewritten by hand to
 * accumulate in integers, the alternative a programmer has to the license:
 * the same sums, computed exactly in an integer type wide enough for the
 * bound ExactReduce proves, and converted to floating point once at the end.
 * Every sum the license applies to is exact, so each function returns the
 * bits of its strict counterpart. The accumulator types are the narrowest a
 * careful programmer would choose from the data's bounds:
 *
 *   int64  sum_u8, sumsq_u8 (47 million terms), energy_i16 (terms < 2^30),
 *          sum_i32, gram_u8 (60,000 products < 2^16)
 *   int32  qlinear_i8 (784 terms < 2^14), gemm_i8 (384 terms <= 2^14),
 *          degree_u8 and walks2_u8 (2,708 terms < 2^8 and < 2^16)
 *
 * The driver calls these instead of kernels.c when built with -DINT_ACC.
 */
#include <stddef.h>
#include <stdint.h>

#include "kernels.h"

double k_sum_u8_int(const uint8_t *p, long n)
{
    int64_t s = 0;
    for (long i = 0; i < n; i++)
        s += p[i];
    return (double)s;
}

double k_sumsq_u8_int(const uint8_t *p, long n)
{
    int64_t s = 0;
    for (long i = 0; i < n; i++)
        s += (int32_t)p[i] * p[i];
    return (double)s;
}

double k_energy_i16_int(const int16_t *x, long n)
{
    int64_t e = 0;
    for (long i = 0; i < n; i++)
        e += (int32_t)x[i] * x[i];
    return (double)e;
}

double k_sum_i32_int(const int32_t *x, int n)
{
    int64_t s = 0;
    for (int i = 0; i < n; i++)
        s += x[i];
    return (double)s;
}

void k_gram_u8_int(const uint8_t *X, int d, int n, double *G)
{
    for (int a = 0; a < d; a++)
        for (int b = 0; b <= a; b++) {
            const uint8_t *u = X + (size_t)a * n, *v = X + (size_t)b * n;
            int64_t s = 0;
            for (int i = 0; i < n; i++)
                s += (int32_t)u[i] * v[i];
            G[(size_t)a * d + b] = G[(size_t)b * d + a] = (double)s;
        }
}

void k_qlinear_i8_int(const int8_t *W, const int8_t *X, int classes, int features, int batch,
                      float *Y)
{
    for (int b = 0; b < batch; b++)
        for (int c = 0; c < classes; c++) {
            const int8_t *w = W + (size_t)c * features, *x = X + (size_t)b * features;
            int32_t s = 0;
            for (int j = 0; j < features; j++)
                s += (int32_t)w[j] * x[j];
            Y[(size_t)b * classes + c] = (float)s;
        }
}

void k_gemm_i8_int(const int8_t *A, const int8_t *Bt, int m, int n, int k, double *C)
{
    for (int i = 0; i < m; i++)
        for (int j = 0; j < n; j++) {
            const int8_t *a = A + (size_t)i * k, *b = Bt + (size_t)j * k;
            int32_t s = 0;
            for (int t = 0; t < k; t++)
                s += (int32_t)a[t] * b[t];
            C[(size_t)i * n + j] = (double)s;
        }
}

void k_degree_u8_int(const uint8_t *A, int n, double *deg)
{
    for (int i = 0; i < n; i++) {
        const uint8_t *row = A + (size_t)i * n;
        int32_t s = 0;
        for (int j = 0; j < n; j++)
            s += row[j];
        deg[i] = (double)s;
    }
}

void k_walks2_u8_int(const uint8_t *A, const int16_t *deg, int n, double *w)
{
    for (int i = 0; i < n; i++) {
        const uint8_t *row = A + (size_t)i * n;
        int32_t s = 0;
        for (int j = 0; j < n; j++)
            s += (int32_t)row[j] * deg[j];
        w[i] = (double)s;
    }
}
