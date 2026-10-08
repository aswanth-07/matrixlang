/* Mutant 4 drops the -0 condition of A * I = A: -0 + (+0) = +0. */
matrix A[2,2] = {{0, 1}, {1, 1}};
matrix N = -2 * A;
matrix C = N * identity(2);
print(C);
