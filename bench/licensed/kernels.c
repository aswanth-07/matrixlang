/* kernels.c -- what an exactness certificate is worth to a C compiler.
 *
 * Every kernel reduces binary64 (or binary32) values that hold integers from a
 * declared domain, sized so that every partial sum of every association is
 * exactly representable. Compiled with GCC's strict IEEE semantics, the
 * reductions run in source order; compiled with -fassociative-math (the
 * "licensed" build), GCC reassociates and vectorizes them. The certificate is
 * what makes that licence safe: the two builds must print identical bits.
 * The last kernel holds real values, where the licence changes the result.
 *
 *   kernels <kernel> <repetitions>      prints: kernel median q1 q3 (ns) checksum distinct
 *   kernels list                        prints the kernel names
 *
 * Built twice by tools/contracts/bench.py; never part of the compiler.
 */
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#ifdef _WIN32
#include <windows.h>
#else
#include <time.h>
#endif
#ifdef _OPENMP
#include <omp.h>
#endif

static double now_ns(void)
{
#ifdef _WIN32
    static LARGE_INTEGER freq;
    LARGE_INTEGER t;
    if (!freq.QuadPart) QueryPerformanceFrequency(&freq);
    QueryPerformanceCounter(&t);
    return (double)t.QuadPart * 1e9 / (double)freq.QuadPart;
#else
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec * 1e9 + ts.tv_nsec;
#endif
}

/* splitmix64: the same generator for both builds, so inputs are identical. */
static uint64_t state = 0x9E3779B97F4A7C15u;
static uint64_t next(void)
{
    uint64_t z = (state += 0x9E3779B97F4A7C15u);
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9u;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBu;
    return z ^ (z >> 31);
}
static int64_t draw(int64_t lo, int64_t hi) { return lo + (int64_t)(next() % (uint64_t)(hi - lo + 1)); }
static double unit(void) { return (double)(next() >> 11) * 0x1p-53 * 2.0 - 1.0; }

static uint64_t bits(double x) { uint64_t u; memcpy(&u, &x, sizeof u); return u; }
static uint64_t fbits(float x) { uint32_t u; memcpy(&u, &x, sizeof u); return u; }
static uint64_t mix(uint64_t h, uint64_t v) { return (h ^ v) * 0x100000001B3u; }

enum { DOT_N = 1 << 20, SUM_N = 1 << 21, MV_N = 2048, MM_N = 256, FDOT_N = 1024 };

static double *x, *y, *A, *B, *C;
static float *fx, *fy;

/* int16 x int16: |product| <= 2^30, 2^20 terms: every partial sum < 2^50. */
static double dot_i16(void)
{
    double s = 0.0;
    for (long i = 0; i < DOT_N; i++) s += x[i] * y[i];
    return s;
}

/* int32 values, 2^21 terms: every partial sum < 2^52. */
static double sum_i32(void)
{
    double s = 0.0;
    for (long i = 0; i < SUM_N; i++) s += x[i];
    return s;
}

/* uint8 matrix times int16 vector: |row partial sum| < 2^8 * 2^15 * 2^11 = 2^34. */
static double matvec_u8_i16(void)
{
    uint64_t h = 0;
    for (long i = 0; i < MV_N; i++) {
        double s = 0.0;
        for (long j = 0; j < MV_N; j++) s += A[i * MV_N + j] * y[j];
        C[i] = s;
        h = mix(h, bits(s));
    }
    return (double)(h >> 11);
}

/* int8 GEMM with the k loop innermost (B stored transposed): sums < 2^22. */
static double gemm_i8(void)
{
    uint64_t h = 0;
    for (long i = 0; i < MM_N; i++)
        for (long j = 0; j < MM_N; j++) {
            double s = 0.0;
            for (long k = 0; k < MM_N; k++) s += A[i * MM_N + k] * B[j * MM_N + k];
            h = mix(h, bits(s));
        }
    return (double)(h >> 11);
}

/* int8 in binary32 with a binary32 accumulator: 1024 terms of |p| <= 2^14
 * keep every partial sum below 2^24, the float significand. */
static double fdot_i8(void)
{
    uint64_t h = 0;
    for (int r = 0; r < 256; r++) {
        float s = 0.0f;
        const float *a = fx + (size_t)r * FDOT_N, *b = fy + (size_t)r * FDOT_N;
        for (long i = 0; i < FDOT_N; i++) s += a[i] * b[i];
        h = mix(h, fbits(s));
    }
    return (double)(h >> 11);
}

/* Control: real values in [-1, 1]. No certificate exists. */
static double dot_real(void)
{
    double s = 0.0;
    for (long i = 0; i < DOT_N; i++) s += x[i] * y[i];
    return s;
}

/* The run-time domain check a guarded build would execute before dot_i16. */
static double guard_i16(void)
{
    /* Branch-free so that GCC vectorizes it; the range test runs first, so
     * the integer conversion only ever sees in-range values that matter. */
    int bad = 0;
    for (long i = 0; i < DOT_N; i++) {
        double a = x[i], b = y[i];
        int ra = (a < -32768.0) | (a > 32767.0), rb = (b < -32768.0) | (b > 32767.0);
        bad |= ra | rb | (a != (double)(int)(ra ? 0.0 : a)) | (b != (double)(int)(rb ? 0.0 : b));
    }
    return (double)bad;
}

#ifdef _OPENMP
/* OpenMP reductions reassociate whatever the flags say: the certified kernel
 * must give one answer for every thread count, the real one need not. */
static double omp_dot_i16(void)
{
    double s = 0.0;
    #pragma omp parallel for reduction(+:s) schedule(static)
    for (long i = 0; i < DOT_N; i++) s += x[i] * y[i];
    return s;
}
static double omp_dot_real(void)
{
    double s = 0.0;
    #pragma omp parallel for reduction(+:s) schedule(static)
    for (long i = 0; i < DOT_N; i++) s += x[i] * y[i];
    return s;
}
#endif

struct kernel { const char *name; double (*run)(void); int data; };
static const struct kernel KERNELS[] = {
    {"dot_i16", dot_i16, 1}, {"sum_i32", sum_i32, 2}, {"matvec_u8_i16", matvec_u8_i16, 3},
    {"gemm_i8", gemm_i8, 4}, {"fdot_i8", fdot_i8, 5}, {"dot_real", dot_real, 6},
    {"guard_i16", guard_i16, 1},
#ifdef _OPENMP
    {"omp_dot_i16", omp_dot_i16, 1}, {"omp_dot_real", omp_dot_real, 6},
#endif
};

static void prepare(int which)
{
    x = malloc(sizeof *x * SUM_N); y = malloc(sizeof *y * SUM_N);
    A = malloc(sizeof *A * MV_N * MV_N); B = malloc(sizeof *B * MM_N * MM_N);
    C = malloc(sizeof *C * MV_N);
    fx = malloc(sizeof *fx * 256 * FDOT_N); fy = malloc(sizeof *fy * 256 * FDOT_N);
    if (!x || !y || !A || !B || !C || !fx || !fy) { fputs("out of memory\n", stderr); exit(2); }
    switch (which) {
    case 1: for (long i = 0; i < DOT_N; i++) { x[i] = draw(-32768, 32767); y[i] = draw(-32768, 32767); } break;
    case 2: for (long i = 0; i < SUM_N; i++) x[i] = draw(-2147483647LL - 1, 2147483647LL); break;
    case 3: for (long i = 0; i < (long)MV_N * MV_N; i++) A[i] = draw(0, 255);
            for (long j = 0; j < MV_N; j++) y[j] = draw(-32768, 32767);
            break;
    case 4: for (long i = 0; i < MM_N * MM_N; i++) { A[i] = draw(-128, 127); B[i] = draw(-128, 127); } break;
    case 5: for (long i = 0; i < 256L * FDOT_N; i++) { fx[i] = (float)draw(-128, 127); fy[i] = (float)draw(-128, 127); } break;
    case 6: for (long i = 0; i < DOT_N; i++) { x[i] = unit(); y[i] = unit(); } break;
    }
}

static int compare(const void *a, const void *b)
{
    double u = *(const double *)a, v = *(const double *)b;
    return (u > v) - (u < v);
}

int main(int argc, char **argv)
{
    size_t count = sizeof KERNELS / sizeof KERNELS[0];
    if (argc == 2 && strcmp(argv[1], "list") == 0) {
        for (size_t k = 0; k < count; k++) puts(KERNELS[k].name);
        return 0;
    }
    if (argc != 3) { fputs("usage: kernels <kernel> <repetitions> | kernels list\n", stderr); return 2; }
    const struct kernel *kern = NULL;
    for (size_t k = 0; k < count; k++)
        if (strcmp(argv[1], KERNELS[k].name) == 0) kern = &KERNELS[k];
    int reps = atoi(argv[2]);
    if (!kern || reps < 1 || reps > 10000) { fputs("unknown kernel or bad repetition count\n", stderr); return 2; }
    prepare(kern->data);
    /* An OpenMP reduction may combine partial sums in a different order on
     * every call, so results are counted rather than required to repeat. */
    double *times = malloc(sizeof *times * (size_t)reps), result = kern->run();   /* warm-up */
    uint64_t *seen = malloc(sizeof *seen * (size_t)(reps + 1));
    int distinct = 1;
    seen[0] = bits(result);
    for (int r = 0; r < reps; r++) {
        double t0 = now_ns();
        double value = kern->run();
        times[r] = now_ns() - t0;
        int known = 0;
        for (int k = 0; k < distinct; k++) known |= seen[k] == bits(value);
        if (!known) seen[distinct++] = bits(value);
    }
    qsort(times, (size_t)reps, sizeof *times, compare);
    printf("%s %.0f %.0f %.0f %016" PRIx64 " %d\n", kern->name, times[reps / 2], times[reps / 4],
           times[(3 * reps) / 4], bits(result), distinct);
    return 0;
}
