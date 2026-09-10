/* dce.ml -- dead code elimination.
   The first product is stored into X and then immediately overwritten, so
   nothing ever observes it. Removing X = A * B then makes A and B dead too,
   which is why the optimizer has to repeat until nothing changes.

   D is deliberately not an identity matrix here: the matrix-specific rewrites
   are demonstrated separately in algebra.ml, and one example should show one
   thing. */

matrix A[2,2] = {{1, 1}, {1, 1}};
matrix B[2,2] = {{2, 2}, {2, 2}};
matrix C[2,2] = {{3, 0}, {0, 3}};
matrix D[2,2] = {{2, 1}, {1, 2}};

matrix X[2,2];

X = A * B;
X = C * D;

print(X);
