/* A rank-16 correction B A applied to a vector, with real-valued factors as
   in a low-rank adapter. Reordering changes the bits; the bounded contract
   keeps the source order's error bound. */
matrix B[2048,16] = input(real(1));
matrix A[16,2048] = input(real(1));
matrix x[2048,1] = input(real(1));
matrix y = B * A * x;
print(y);
