/* Mutant 7 drops the finiteness condition of A * 0 = 0. */
matrix A[2,2] = {{1e200, 1}, {1, 1}};
matrix B = A * A;
matrix C = B * zeros(2,2);
print(C);
