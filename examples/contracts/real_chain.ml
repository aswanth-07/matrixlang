/* The same shapes over real-valued data. Products of reals round, so no
 * bracketing is provably bit-identical to the source order and strict mode
 * keeps it. Every bracketing satisfies the same worst-case error bound,
 * so --fp-bounded applies the cheaper order and says so. */
matrix A[100,2] = input(real(1));
matrix B[2,100] = input(real(1));
matrix C[100,2] = input(real(1));
matrix R = A * B * C;
print(R);
