/* Mutant 6 drops the -0 condition of A + 0 = A. */
matrix A[2,2] = {{0, 1}, {1, 1}};
matrix N = -2 * A;
matrix C = N + zeros(2,2);
print(C);
