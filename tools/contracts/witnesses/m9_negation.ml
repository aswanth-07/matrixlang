/* Mutant 9 assumes negation never yields -0, so it proves N + 0 = N. */
matrix A[2,2] = {{0, 1}, {1, 1}};
matrix N = -A;
matrix C = N + zeros(2,2);
print(C);
