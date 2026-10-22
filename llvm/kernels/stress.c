/* stress.c -- inputs built to break an unsound license.
 *
 *   stress            prints one line per case: kernel family n output_hash
 *
 * Every kernel of kernels.c runs on input families that a value-blind test
 * would not draw: all-maximum and all-minimum values, alternating signs that
 * cancel, products that are -0, sparse maxima, and odd maxima, whose partial
 * sums are odd and therefore round as soon as they exceed the significand.
 * Trip counts include the admissible limit of each kernel's guard, one past
 * it, and twice it, where a license that accepted one more bit would be
 * wrong. A sound build prints the strict build's lines exactly;
 * tools/contracts/llvm_eval.py compares them.
 */
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "kernels.h"

static uint64_t state;
static uint64_t next(void)
{
    uint64_t z = (state += 0x9E3779B97F4A7C15u);
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9u;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBu;
    return z ^ (z >> 31);
}
static int64_t draw(int64_t lo, int64_t hi) { return lo + (int64_t)(next() % (uint64_t)(hi - lo + 1)); }

static uint64_t hash_of(const void *p, size_t bytes)
{
    const unsigned char *c = p;
    uint64_t h = 0xCBF29CE484222325u;
    for (size_t i = 0; i < bytes; i++)
        h = (h ^ c[i]) * 0x100000001B3u;
    return h;
}

enum { RANDOM, MAXIMUM, MINIMUM, ALTERNATE, NEGZERO, SPARSE, ODD, FAMILIES };
static const char *const FAMILY[] = {"random", "maximum", "minimum", "alternate",
                                     "negzero", "sparse", "odd"};

/* A value of [lo, hi] for element i of family f. The second operand of a
 * product uses family NEGZERO as zeros, so that negative first operands give
 * products of -0. */
static int64_t value(int f, long i, int64_t lo, int64_t hi, int second)
{
    int64_t odd_hi = (hi % 2) ? hi : hi - 1;
    switch (f) {
    case RANDOM: return draw(lo, hi);
    case MAXIMUM: return hi;
    case MINIMUM: return lo;
    case ALTERNATE: return (i % 2) ? lo : hi;
    case NEGZERO: return second ? 0 : (lo < 0 ? lo : 0);
    case SPARSE: return (i % 97 == 0) ? hi : 0;
    default: return odd_hi;
    }
}

static void line(const char *k, int f, long n, uint64_t h)
{
    printf("%s %s %ld %016" PRIx64 "\n", k, FAMILY[f], n, h);
}

int main(void)
{
    /* Trip counts: small, then each guard's limit, limit + 1 and twice it. */
    const long small[] = {0, 1, 2, 3, 7, 8, 9, 31, 100, 1000, 4099};
    const size_t nsmall = sizeof small / sizeof small[0];

    for (int f = 0; f < FAMILIES; f++) {
        state = 100 + (uint64_t)f;
        /* sum_u8, sumsq_u8, sum_u8_f32: one buffer of 8-bit values. */
        long u8n[] = {65793, 65794, 131586, 1L << 20};
        long maxn = 1L << 20;
        uint8_t *p = malloc((size_t)maxn);
        for (long i = 0; i < maxn; i++)
            p[i] = (uint8_t)value(f, i, 0, 255, 0);
        for (size_t s = 0; s < nsmall + 4; s++) {
            long n = s < nsmall ? small[s] : u8n[s - nsmall];
            double a = k_sum_u8(p, n), b = k_sumsq_u8(p, n);
            float c = k_sum_u8_f32(p, n);
            line("sum_u8", f, n, hash_of(&a, sizeof a));
            line("sumsq_u8", f, n, hash_of(&b, sizeof b));
            line("sum_u8_f32", f, n, hash_of(&c, sizeof c));
        }
        free(p);

        /* energy_i16: limit 2^23 samples of magnitude 2^15. */
        long en[] = {1L << 23, (1L << 23) + 1, 1L << 24};
        int16_t *x = malloc(sizeof *x * (size_t)(1L << 24));
        for (long i = 0; i < (1L << 24); i++)
            x[i] = (int16_t)value(f, i, -32768, 32767, 0);
        for (size_t s = 0; s < nsmall + 3; s++) {
            long n = s < nsmall ? small[s] : en[s - nsmall];
            double e = k_energy_i16(x, n);
            line("energy_i16", f, n, hash_of(&e, sizeof e));
        }
        free(x);

        /* sum_i32: limit 2^22 values of magnitude 2^31. */
        long in[] = {1L << 22, (1L << 22) + 1, 1L << 23};
        int32_t *v = malloc(sizeof *v * (size_t)(1L << 23));
        for (long i = 0; i < (1L << 23); i++)
            v[i] = (int32_t)value(f, i, INT32_MIN, INT32_MAX, 0);
        for (size_t s = 0; s < nsmall + 3; s++) {
            long n = s < nsmall ? small[s] : in[s - nsmall];
            double e = k_sum_i32(v, (int)n);
            line("sum_i32", f, n, hash_of(&e, sizeof e));
        }
        free(v);

        /* qlinear_i8: binary32 rows, limit 1024 features of int8 products. */
        int feats[] = {1, 3, 8, 100, 784, 1024, 1025, 2048};
        for (size_t s = 0; s < sizeof feats / sizeof feats[0]; s++) {
            int nf = feats[s], classes = 3, batch = 2;
            int8_t *w = malloc((size_t)classes * nf), *xi = malloc((size_t)batch * nf);
            float *y = malloc(sizeof *y * (size_t)(classes * batch));
            for (long i = 0; i < (long)classes * nf; i++) w[i] = (int8_t)value(f, i, -128, 127, 0);
            for (long i = 0; i < (long)batch * nf; i++) xi[i] = (int8_t)value(f, i, -128, 127, 1);
            k_qlinear_i8(w, xi, classes, nf, batch, y);
            line("qlinear_i8", f, nf, hash_of(y, sizeof *y * (size_t)(classes * batch)));
            free(w); free(xi); free(y);
        }

        /* gemm_i8, gram_u8, degree_u8, walks2_u8: small shapes, every family. */
        int dims[] = {1, 2, 5, 17, 64};
        for (size_t s = 0; s < sizeof dims / sizeof dims[0]; s++) {
            int d = dims[s], n = 3 * d + 1;
            int8_t *a = malloc((size_t)d * n), *b = malloc((size_t)d * n);
            uint8_t *u = malloc((size_t)n * n);
            int16_t *dg = malloc(sizeof *dg * (size_t)n);
            double *out = malloc(sizeof *out * (size_t)(n * n + d * d));
            for (long i = 0; i < (long)d * n; i++) {
                a[i] = (int8_t)value(f, i, -128, 127, 0);
                b[i] = (int8_t)value(f, i, -128, 127, 1);
            }
            for (long i = 0; i < (long)n * n; i++) u[i] = (uint8_t)value(f, i, 0, 1, 0);
            for (long i = 0; i < n; i++) dg[i] = (int16_t)value(f, i, -32768, 32767, 1);
            k_gemm_i8(a, b, d, d, n, out);
            line("gemm_i8", f, n, hash_of(out, sizeof *out * (size_t)(d * d)));
            k_gram_u8(u, d, n, out);
            line("gram_u8", f, n, hash_of(out, sizeof *out * (size_t)(d * d)));
            k_degree_u8(u, n, out);
            line("degree_u8", f, n, hash_of(out, sizeof *out * (size_t)n));
            k_walks2_u8(u, dg, n, out);
            line("walks2_u8", f, n, hash_of(out, sizeof *out * (size_t)n));
            free(a); free(b); free(u); free(dg); free(out);
        }

        /* dot_f64: real values in [-1, 1]; only the strict order is right. */
        long rn = 1L << 16;
        double *ra = malloc(sizeof *ra * (size_t)rn), *rb = malloc(sizeof *rb * (size_t)rn);
        for (long i = 0; i < rn; i++) {
            ra[i] = (double)(next() >> 11) * 0x1p-53 * 2.0 - 1.0;
            rb[i] = (double)(next() >> 11) * 0x1p-53 * 2.0 - 1.0;
        }
        for (size_t s = 0; s < nsmall; s++) {
            double e = k_dot_f64(ra, rb, small[s]);
            line("dot_f64", f, small[s], hash_of(&e, sizeof e));
        }
        free(ra); free(rb);
    }
    return 0;
}
