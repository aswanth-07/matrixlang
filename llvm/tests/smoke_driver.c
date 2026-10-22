/* smoke_driver.c -- runs every function of smoke.c on value families and
 * lengths around each guard's limit and prints the bits of every result, so
 * that tests/run.sh can compare a strict and a licensed build of smoke.c. */
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

double sum_u8(const uint8_t *p, int n);
double sum_u8_long(const uint8_t *p, long n);
double dot_i16_long(const int16_t *a, const int16_t *b, long n);
float dot_i8_f32_1024(const int8_t *a, const int8_t *b);
float dot_i8_f32_2048(const int8_t *a, const int8_t *b);
double dot_real(const double *a, const double *b, int n);
double sum2d_u8(const uint8_t *img, int h, int w);
double cond_sum(const int8_t *p, int n);
void two_sums(const uint8_t *p, long n, double *a, double *b);

static uint64_t bits(double x) { uint64_t u; memcpy(&u, &x, sizeof u); return u; }
static uint32_t fbits(float x) { uint32_t u; memcpy(&u, &x, sizeof u); return u; }

int main(void)
{
    enum { N = 1 << 24 };
    uint8_t *u = malloc(N);
    int16_t *a = malloc(sizeof *a * N), *b = malloc(sizeof *b * N);
    int8_t *c = malloc(N), *d = malloc(N);
    double *r = malloc(sizeof *r * 4096);
    uint64_t s = 1;
    for (int f = 0; f < 5; f++) {
        for (long i = 0; i < N; i++) {
            s = s * 6364136223846793005u + 1442695040888963407u;
            uint32_t x = (uint32_t)(s >> 33);
            u[i] = f == 0 ? (uint8_t)x : f == 1 ? 255 : f == 2 ? (uint8_t)(i % 2 ? 255 : 0) : f == 3 ? 0 : 253;
            a[i] = f == 0 ? (int16_t)x : f == 1 ? 32767 : f == 2 ? (int16_t)(i % 2 ? -32768 : 32767) : f == 3 ? -1 : 32765;
            b[i] = f == 3 ? 0 : f == 0 ? (int16_t)(x >> 7) : a[i];
            c[i] = f == 0 ? (int8_t)x : f == 1 ? 127 : f == 2 ? (int8_t)(i % 2 ? -128 : 127) : f == 3 ? -1 : 125;
            d[i] = f == 3 ? 0 : c[i];
        }
        for (int i = 0; i < 4096; i++)
            r[i] = (double)(int32_t)(s >> (i % 31)) * 0x1p-20;
        long lens[] = {0, 1, 7, 1000, 4096, (1L << 23) - 1, 1L << 23, (1L << 23) + 1, N};
        for (size_t k = 0; k < sizeof lens / sizeof lens[0]; k++) {
            long n = lens[k];
            double x, y;
            two_sums(u, n, &x, &y);
            printf("%d %ld %016" PRIx64 " %016" PRIx64 " %016" PRIx64 " %016" PRIx64 " %016" PRIx64 "\n", f, n,
                   bits(sum_u8(u, (int)n)), bits(sum_u8_long(u, n)), bits(dot_i16_long(a, b, n)), bits(x), bits(y));
        }
        printf("%d f32 %08" PRIx32 " %08" PRIx32 " %016" PRIx64 " %016" PRIx64 "\n", f,
               fbits(dot_i8_f32_1024(c, d)), fbits(dot_i8_f32_2048(c, d)), bits(dot_real(r, r, 4096)),
               bits(cond_sum(c, 1 << 20)));
        int dims[][2] = {{0, 5}, {1, 1}, {3, 7}, {64, 64}, {4096, 4096}};
        for (size_t k = 0; k < 5; k++)
            printf("%d 2d %d %d %016" PRIx64 "\n", f, dims[k][0], dims[k][1],
                   bits(sum2d_u8(u, dims[k][0], dims[k][1])));
    }
    return 0;
}
