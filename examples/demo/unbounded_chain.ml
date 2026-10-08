/* Unbounded reals. With no magnitude bound an intermediate may overflow, so
 * no bracketing provably keeps the source-order error bound: strict and
 * bounded both keep the source order. Only the algebraic contract reorders,
 * and it certifies the output as relaxed. */
matrix A[40,2] = input(real);
matrix B[2,40] = input(real);
matrix C[40,2] = input(real);
matrix R = A * B * C;
print(R);
