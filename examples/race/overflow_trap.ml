/* The cheaper bracketing overflows. Written left to right, A * B holds values
   near 1 and the result is finite. Reordered, B * C multiplies two values
   near 1e200 and overflows to infinity before A can scale it back. The facts
   see the overflow coming, so strict and bounded keep the source order;
   only algebraic reorders, and labels the output relaxed. */
matrix A[1024,1] = input(real(1e-200, 2e-200));
matrix B[1,1024] = input(real(1e199, 1e200));
matrix C[1024,1] = input(real(1e199, 1e200));
matrix R = A * B * C;
print(R);
