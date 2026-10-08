/* The same shapes over real-valued data. Products of reals round, so no
 * bracketing is provably bit-identical and the strict contract keeps the
 * source order. Every bracketing satisfies the same worst-case error bound,
 * so the bounded contract applies the cheaper order and certifies the bound. */
matrix A[40,2] = input(real(1));
matrix B[2,40] = input(real(1));
matrix C[40,2] = input(real(1));
matrix R = A * B * C;
print(R);
