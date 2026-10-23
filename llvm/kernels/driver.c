/* driver.c -- times the kernels of kernels.c on real and generated data.
 *
 *   driver DATA_DIR KERNEL REPS    prints: kernel n median_ns p25_ns p75_ns output_hash
 *   driver DATA_DIR list           prints the kernel names
 *
 * DATA_DIR holds the files written by tools/contracts/llvm_data.py: MNIST
 * images (uint8), int8 class templates built from them, and the Cora citation
 * graph as a dense 0/1 matrix with its degree vector. Generated inputs use
 * splitmix64 with fixed seeds, so every build sees the same values. The
 * output hash covers every bit of every result, so two builds agree on it
 * exactly when they print the same bits.
 */
#define _POSIX_C_SOURCE 199309L
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "kernels.h"

enum { MNIST_TRAIN = 60000, MNIST_TEST = 10000, PIXELS = 784, CLASSES = 10, CORA = 2708 };
enum { CROP = 10, GRAM_D = CROP * CROP, GEMM_N = 384 };
enum { AUDIO_N = 1 << 22, INT32_N = 1 << 21, REAL_N = 1 << 21, SHORT = 16 };

static double now_ns(void)
{
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec * 1e9 + ts.tv_nsec;
}

static uint64_t state;
static uint64_t next(void)
{
    uint64_t z = (state += 0x9E3779B97F4A7C15u);
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9u;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBu;
    return z ^ (z >> 31);
}
static int64_t draw(int64_t lo, int64_t hi) { return lo + (int64_t)(next() % (uint64_t)(hi - lo + 1)); }

static uint64_t hash;
static void mix(const void *p, size_t bytes)
{
    const unsigned char *c = p;
    for (size_t i = 0; i < bytes; i++)
        hash = (hash ^ c[i]) * 0x100000001B3u;
}

static void *load(const char *dir, const char *name, size_t bytes)
{
    char path[4096];
    snprintf(path, sizeof path, "%s/%s", dir, name);
    FILE *f = fopen(path, "rb");
    void *p = malloc(bytes);
    if (!f || !p || fread(p, 1, bytes, f) != bytes) {
        fprintf(stderr, "cannot read %zu bytes from %s\n", bytes, path);
        exit(2);
    }
    fclose(f);
    return p;
}

static void *alloc(size_t bytes)
{
    void *p = malloc(bytes);
    if (!p) { fputs("out of memory\n", stderr); exit(2); }
    return p;
}

/* Inputs, prepared once per process. */
static uint8_t *train, *test, *adj, *crop;
static int8_t *templates, *qtest, *ga, *gb;
static int16_t *audio, *deg;
static int32_t *ints;
static double *ra, *rb, *gram, *gemm, *degree, *walks;
static float *scores;

static void prepare(const char *dir, const char *kernel)
{
    if (!strcmp(kernel, "sum_u8") || !strcmp(kernel, "sumsq_u8") || !strcmp(kernel, "sum_u8_f32") ||
        !strcmp(kernel, "sum_u8_short"))
        train = load(dir, "mnist_train.u8", (size_t)MNIST_TRAIN * PIXELS);
    if (!strcmp(kernel, "gram_u8")) {
        train = load(dir, "mnist_train.u8", (size_t)MNIST_TRAIN * PIXELS);
        /* The central 10x10 pixels of every image, stored feature-major. */
        crop = alloc((size_t)GRAM_D * MNIST_TRAIN);
        for (int f = 0; f < GRAM_D; f++) {
            int r = 9 + f / CROP, c = 9 + f % CROP;
            for (int i = 0; i < MNIST_TRAIN; i++)
                crop[(size_t)f * MNIST_TRAIN + i] = train[(size_t)i * PIXELS + r * 28 + c];
        }
        gram = alloc(sizeof *gram * GRAM_D * GRAM_D);
    }
    if (!strcmp(kernel, "qlinear_i8")) {
        templates = load(dir, "mnist_templates.i8", (size_t)CLASSES * PIXELS);
        test = load(dir, "mnist_test.u8", (size_t)MNIST_TEST * PIXELS);
        /* Pixels quantized to int8 by dropping their lowest bit. */
        qtest = alloc((size_t)MNIST_TEST * PIXELS);
        for (size_t i = 0; i < (size_t)MNIST_TEST * PIXELS; i++)
            qtest[i] = (int8_t)(test[i] >> 1);
        scores = alloc(sizeof *scores * MNIST_TEST * CLASSES);
    }
    if (!strcmp(kernel, "degree_u8") || !strcmp(kernel, "walks2_u8")) {
        adj = load(dir, "cora_adj.u8", (size_t)CORA * CORA);
        deg = load(dir, "cora_deg.i16", sizeof *deg * CORA);
        degree = alloc(sizeof *degree * CORA);
        walks = alloc(sizeof *walks * CORA);
    }
    if (!strcmp(kernel, "gemm_i8")) {
        state = 1;
        ga = alloc((size_t)GEMM_N * GEMM_N);
        gb = alloc((size_t)GEMM_N * GEMM_N);
        for (size_t i = 0; i < (size_t)GEMM_N * GEMM_N; i++) {
            ga[i] = (int8_t)draw(-128, 127);
            gb[i] = (int8_t)draw(-128, 127);
        }
        gemm = alloc(sizeof *gemm * GEMM_N * GEMM_N);
    }
    if (!strcmp(kernel, "energy_i16")) {
        state = 2;
        audio = alloc(sizeof *audio * AUDIO_N);
        for (long i = 0; i < AUDIO_N; i++)
            audio[i] = (int16_t)draw(-32768, 32767);
    }
    if (!strcmp(kernel, "sum_i32")) {
        state = 3;
        ints = alloc(sizeof *ints * INT32_N);
        for (long i = 0; i < INT32_N; i++)
            ints[i] = (int32_t)draw(INT32_MIN, INT32_MAX);
    }
    if (!strcmp(kernel, "dot_f64")) {
        state = 4;
        ra = alloc(sizeof *ra * REAL_N);
        rb = alloc(sizeof *rb * REAL_N);
        for (long i = 0; i < REAL_N; i++) {
            ra[i] = (double)(next() >> 11) * 0x1p-53 * 2.0 - 1.0;
            rb[i] = (double)(next() >> 11) * 0x1p-53 * 2.0 - 1.0;
        }
    }
}

/* Built with -DINT_ACC, the driver runs the integer kernels with integer
 * accumulators (intacc.c) instead; the two controls are unchanged. */
#ifdef INT_ACC
#define K(f) f##_int
#else
#define K(f) f
#endif

/* Runs the kernel once; returns the number of terms it summed. */
static long run(const char *kernel, int record)
{
    if (!strcmp(kernel, "sum_u8")) {
        double s = K(k_sum_u8)(train, (long)MNIST_TRAIN * PIXELS);
        if (record) mix(&s, sizeof s);
        return (long)MNIST_TRAIN * PIXELS;
    }
    if (!strcmp(kernel, "sumsq_u8")) {
        double s = K(k_sumsq_u8)(train, (long)MNIST_TRAIN * PIXELS);
        if (record) mix(&s, sizeof s);
        return (long)MNIST_TRAIN * PIXELS;
    }
    if (!strcmp(kernel, "sum_u8_f32")) {
        float s = k_sum_u8_f32(train, (long)MNIST_TRAIN * PIXELS);
        if (record) mix(&s, sizeof s);
        return (long)MNIST_TRAIN * PIXELS;
    }
    if (!strcmp(kernel, "sum_u8_short")) {
        /* The guard's cost: the sum of every 16-pixel run of the training
         * images, one call per run, so that each call checks its guard. */
        double total = 0.0;
        for (long off = 0; off + SHORT <= (long)MNIST_TRAIN * PIXELS; off += SHORT) {
            double s = K(k_sum_u8)(train + off, SHORT);
            if (record) mix(&s, sizeof s);
            total += s;
        }
        (void)total;
        return (long)MNIST_TRAIN * PIXELS;
    }
    if (!strcmp(kernel, "gram_u8")) {
        K(k_gram_u8)(crop, GRAM_D, MNIST_TRAIN, gram);
        if (record) mix(gram, sizeof *gram * GRAM_D * GRAM_D);
        return (long)GRAM_D * (GRAM_D + 1) / 2 * MNIST_TRAIN;
    }
    if (!strcmp(kernel, "qlinear_i8")) {
        K(k_qlinear_i8)(templates, qtest, CLASSES, PIXELS, MNIST_TEST, scores);
        if (record) mix(scores, sizeof *scores * MNIST_TEST * CLASSES);
        return (long)MNIST_TEST * CLASSES * PIXELS;
    }
    if (!strcmp(kernel, "gemm_i8")) {
        K(k_gemm_i8)(ga, gb, GEMM_N, GEMM_N, GEMM_N, gemm);
        if (record) mix(gemm, sizeof *gemm * GEMM_N * GEMM_N);
        return (long)GEMM_N * GEMM_N * GEMM_N;
    }
    if (!strcmp(kernel, "degree_u8")) {
        K(k_degree_u8)(adj, CORA, degree);
        if (record) mix(degree, sizeof *degree * CORA);
        return (long)CORA * CORA;
    }
    if (!strcmp(kernel, "walks2_u8")) {
        K(k_walks2_u8)(adj, deg, CORA, walks);
        if (record) mix(walks, sizeof *walks * CORA);
        return (long)CORA * CORA;
    }
    if (!strcmp(kernel, "energy_i16")) {
        double e = K(k_energy_i16)(audio, AUDIO_N);
        if (record) mix(&e, sizeof e);
        return AUDIO_N;
    }
    if (!strcmp(kernel, "sum_i32")) {
        double s = K(k_sum_i32)(ints, INT32_N);
        if (record) mix(&s, sizeof s);
        return INT32_N;
    }
    if (!strcmp(kernel, "dot_f64")) {
        double s = k_dot_f64(ra, rb, REAL_N);
        if (record) mix(&s, sizeof s);
        return REAL_N;
    }
    fprintf(stderr, "unknown kernel %s\n", kernel);
    exit(2);
}

static const char *const NAMES[] = {
    "sum_u8", "sumsq_u8", "gram_u8", "qlinear_i8", "degree_u8", "walks2_u8",
    "gemm_i8", "energy_i16", "sum_i32", "sum_u8_short", "dot_f64", "sum_u8_f32",
};

static int compare(const void *a, const void *b)
{
    double u = *(const double *)a, v = *(const double *)b;
    return (u > v) - (u < v);
}

int main(int argc, char **argv)
{
    if (argc == 3 && !strcmp(argv[2], "list")) {
        for (size_t k = 0; k < sizeof NAMES / sizeof NAMES[0]; k++)
            puts(NAMES[k]);
        return 0;
    }
    if (argc != 4) {
        fputs("usage: driver DATA_DIR KERNEL REPS | driver DATA_DIR list\n", stderr);
        return 2;
    }
    const char *kernel = argv[2];
    int reps = atoi(argv[3]);
    if (reps < 1 || reps > 100000) { fputs("bad repetition count\n", stderr); return 2; }
    prepare(argv[1], kernel);
    hash = 0xCBF29CE484222325u;
    long terms = run(kernel, 1);   /* warm-up; its output is the one reported */
    double *t = alloc(sizeof *t * (size_t)reps);
    for (int r = 0; r < reps; r++) {
        double t0 = now_ns();
        run(kernel, 0);
        t[r] = now_ns() - t0;
    }
    qsort(t, (size_t)reps, sizeof *t, compare);
    printf("%s %ld %.0f %.0f %.0f %016" PRIx64 "\n", kernel, terms, t[reps / 2], t[reps / 4],
           t[(3 * reps) / 4], hash);
    return 0;
}
