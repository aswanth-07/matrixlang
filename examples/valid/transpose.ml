/* transpose.ml -- transpose changes the shape, and the compiler follows it.
   A is 2x3, so transpose(A) is 3x2 and A * transpose(A) is 2x2. */

matrix A[2,3] = {{1, 2, 3},
                 {4, 5, 6}};

matrix At = transpose(A);          // Matrix<3x2>
matrix G  = A * transpose(A);      // Matrix<2x2>, the Gram matrix

print(At);
print(G);
