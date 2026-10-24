/* tier32.c -- the integer rewrite's 32-bit tier at its limit.
 *
 * k_gemm_i8 is licensed statically with a 64-bit accumulator; the integer
 * rewrite versions it on the trip count, accumulating in 32 bits when every
 * sum fits: (trip count) * 2^14 <= 2^31 - 1, that is at most 131,071 terms of
 * int8 products. With every product at its maximum, 16,384, one term more
 * makes a 32-bit sum overflow. This prints the bits of every result for trip
 * counts on both sides of the limit and several value families; the integer
 * build must print the strict build's bits exactly.
 */
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../kernels/kernels.h"

static uint64_t bits(double x) { uint64_t u; memcpy(&u, &x, sizeof u); return u; }

int main(void)
{
    const int lens[] = {131070, 131071, 131072, 131073, 262144};
    const int8_t fam[][2] = {{-128, -128}, {127, 127}, {-128, 127}, {1, -1}};
    int cases = 0;
    for (size_t f = 0; f < sizeof fam / sizeof fam[0]; f++)
        for (size_t l = 0; l < sizeof lens / sizeof lens[0]; l++) {
            int k = lens[l], d = 2;
            int8_t *a = malloc((size_t)d * k), *b = malloc((size_t)d * k);
            double out[4];
            for (long i = 0; i < (long)d * k; i++) {
                /* Rows alternate between the family's values and their opposite sign
                 * pattern, so that both large positive and cancelling sums appear. */
                a[i] = (i / k) ? fam[f][1] : fam[f][0];
                b[i] = fam[f][0];
            }
            k_gemm_i8(a, b, d, d, k, out);
            printf("gemm_i8 %zu %d", f, k);
            for (int j = 0; j < d * d; j++)
                printf(" %016" PRIx64, bits(out[j]));
            printf("\n");
            cases++;
            free(a);
            free(b);
        }
    fprintf(stderr, "%d cases\n", cases);
    return 0;
}
