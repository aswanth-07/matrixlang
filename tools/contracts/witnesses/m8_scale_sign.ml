/* Mutant 8 treats 0 * A as bit-identical whatever the sign: 0 * -1 = -0. */
matrix A[2,2] = {{-1, 1}, {1, 1}};
matrix C = 0 * A;
print(C);
