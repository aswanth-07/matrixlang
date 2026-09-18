/* chain_order.ml -- the bracketing the compiler chooses.

   Matrix multiplication is associative, so A * B * C computes the same matrix
   whichever way it is bracketed. It does not perform the same amount of
   arithmetic, and which bracketing is cheaper depends only on the shapes.

   Here A is 100x2, B is 2x100 and C is 100x2.

       (A * B) * C   builds a 100x100 intermediate, then multiplies it away
       A * (B * C)   builds a 2x2 intermediate instead

   '*' is left associative, so the program as written asks for the first. The
   compiler is free to choose the second, because it knows all three shapes
   before the program runs -- they are in the type. */

matrix A[100,2];
matrix B[2,100];
matrix C[100,2];

matrix R = A * B * C;

print(R);
