/* An 8-bit integer chain. The compiler cannot see the values, only their
 * domain, and the domain is enough: every intermediate of every bracketing
 * needs at most 29 of binary64's 53 significand bits, so the cheaper order
 * computes the same bits and strict mode applies it. */
matrix A[100,2] = input(int8);
matrix B[2,100] = input(int8);
matrix C[100,2] = input(int8);
matrix R = A * B * C;
print(R);
