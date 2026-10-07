/* Two outputs, two guarantees. Under --fp-bounded the integer chain R is
 * still proved bit-identical; only S, which involves real-valued data, is
 * reported as bound-preserving. */
matrix A[100,2] = input(int16);
matrix B[2,100] = input(int16);
matrix C[100,2] = input(int16);
matrix D[2,100] = input(int16);
matrix X[100,2] = input(real(1));
matrix R = A * B * C * D;
matrix S = X * B * C;
print(R);
print(S);
