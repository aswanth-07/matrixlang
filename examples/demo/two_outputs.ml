/* Two outputs, two guarantees. The integer chain R is proved bit-identical
 * under every contract. S multiplies real-valued data, so the bounded
 * contract certifies it as bound-preserving rather than bit-identical. */
matrix A[24,2] = input(int16);
matrix B[2,24] = input(int16);
matrix C[24,2] = input(int16);
matrix X[24,2] = input(real(1));
matrix R = A * B * C;
matrix S = X * B * C;
print(R);
print(S);
