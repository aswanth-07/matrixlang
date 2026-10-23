/* Exposes the static bound arithmetic in facts.c to an external exact oracle.
 *
 *   bound_arithmetic_driver mul A B    the upward-rounded bound on A*B
 *   bound_arithmetic_driver fits M G   whether every multiple of 2^G up to M fits
 *
 * A and B are read with strtod, so hexadecimal floats keep every bit. The
 * driver includes facts.c itself and is linked without facts.o. */
#include "../src/ir/facts.c"
#include <stdio.h>

int main(int argc, char **argv)
{
    if (argc != 4) return 2;
    if (!strcmp(argv[1], "mul")) {
        printf("%a\n", mul_up(strtod(argv[2], NULL), strtod(argv[3], NULL)));
        return 0;
    }
    if (!strcmp(argv[1], "fits")) {
        printf("%d\n", fits(strtod(argv[2], NULL), atoi(argv[3])));
        return 0;
    }
    return 2;
}
