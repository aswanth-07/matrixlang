/* 198 * 35698^3 = 9007346004701616 > 2^53: a partial sum of the source order
   can round before the last addition, so two bracketings can differ. */
matrix A[100,2] = input(int(0,35698));
matrix B[2,100] = input(int(0,35698));
matrix C[100,2] = input(int(0,35698));
matrix R = A * B * C;
print(R);
