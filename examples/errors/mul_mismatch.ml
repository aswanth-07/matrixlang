/* mul_mismatch.ml -- the Review 2 rejection demo.
   B was 3x4 in multiply.ml. Making it 5x4 breaks columns(A) == rows(B),
   and the compiler must say so before any element is multiplied. */

matrix A[2,3];
matrix B[5,4];
matrix C[2,4];

C = A * B;

print(C);
