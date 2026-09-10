/* cse.ml -- common subexpression elimination.
   A * B is written twice but must only be computed once. */

matrix A[2,2] = {{1, 2}, {3, 4}};
matrix B[2,2] = {{5, 6}, {7, 8}};

matrix X = A * B;
matrix Y = A * B;

print(X);
print(Y);
