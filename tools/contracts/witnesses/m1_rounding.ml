/* Mutant 1 reorders without proof. 0.1 is not a dyadic rational, so the
 * two bracketings round differently. */
matrix A[4,1] = {{0.1},{0.3},{0.7},{1.1}};
matrix B[1,4] = {{0.7, 1.3, 0.3, 0.9}};
matrix C[4,1] = {{1.7},{0.1},{0.3},{1.9}};
matrix R = A * B * C;
print(R);
