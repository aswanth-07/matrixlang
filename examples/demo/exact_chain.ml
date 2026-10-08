/* An 8-bit integer chain. The optimizer sees only the declared domain, and
 * the domain is enough: every intermediate of every bracketing fits in
 * binary64's 53 significand bits, so the cheaper order computes the same
 * bits and the strict contract applies it. */
matrix A[40,2] = input(int8);
matrix B[2,40] = input(int8);
matrix C[40,2] = input(int8);
matrix R = A * B * C;
print(R);
