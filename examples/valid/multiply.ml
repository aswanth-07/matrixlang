/* multiply.ml -- the headline example.
   A is 2x3 and B is 3x4, so A * B is 2x4 and the compiler works that out
   rather than being told. */

matrix A[2,3] = {{1, 2, 3},
                 {4, 5, 6}};

matrix B[3,4] = {{1, 0, 0, 1},
                 {0, 1, 0, 2},
                 {0, 0, 1, 3}};

matrix C = A * B;      // shape inferred: Matrix<2x4>

print(C);
