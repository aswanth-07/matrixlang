/* chain_values.ml -- reordering must not change the answer.
   Small enough that the product can be checked by hand. */

matrix A[3,2] = {{1, 2},
                 {3, 4},
                 {5, 6}};
matrix B[2,4] = {{1, 0, 1, 0},
                 {0, 1, 0, 1}};
matrix C[4,2] = {{1, 1},
                 {2, 0},
                 {0, 2},
                 {1, 1}};

matrix R = A * B * C;

print(R);
