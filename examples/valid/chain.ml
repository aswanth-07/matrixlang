/* chain.ml -- a longer expression, to show temporaries and shape inference
   through several operators.

   A is 2x3, B is 3x2, C is 2x2. So A*B is 2x2, and the whole expression is
   2x2 without any of those shapes being written down. */

matrix A[2,3] = {{1, 0, 2},
                 {0, 1, 3}};
matrix B[3,2] = {{1, 1},
                 {2, 0},
                 {0, 1}};
matrix C[2,2] = {{1, 1},
                 {1, 1}};

matrix R = A * B + C - C;

print(R);
