#include <stdio.h>
#include "facts.h"

int main(void)
{
    Fact a = fact_of_constant(0x1p-537);
    Fact b = fact_of_constant(0x1p-537);
    Fact c = fact_of_constant(0x1p-538);
    Fact integer = fact_of_constant(0x1p30);
    Fact ops[3] = {integer, integer, integer};
    int dims[4] = {2, 1, 2, 1};
    printf("exact-subnormal=%d\n", facts_product_range(a, b, 2));
    printf("inexact-underflow=%d\n", facts_product_range(a, c, 2));
    printf("inexact-integer-chain=%d\n", facts_chain_range(ops, dims, 3, NULL));
    return 0;
}
