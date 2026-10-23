/* Prints facts_chain_bound for a chain whose inner dimensions are the
 * arguments, as a hexadecimal float, for comparison with an exact oracle. */
#include <stdio.h>
#include <stdlib.h>

#include "facts.h"

int main(int argc, char **argv)
{
    int dims[34], i;
    if (argc < 2 || argc > 33) return 2;
    dims[0] = 1;
    for (i = 1; i < argc; i++) dims[i] = atoi(argv[i]);
    dims[argc] = 1;
    printf("%a\n", facts_chain_bound(dims, argc));
    return 0;
}
