/* bad_literal.ml -- a matrix literal must be rectangular, its entries must be
   constants, and it must match the declared shape. */

matrix A[2,3] = {{1, 2, 3},
                 {4, 5}};        // row 2 is short

matrix B[2,2] = {{1, 2},
                 {3, 4},
                 {5, 6}};        // 3x2 literal into a 2x2 declaration

print(A);
print(B);
