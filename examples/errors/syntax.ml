/* syntax.ml -- several syntax errors, not just the first.
   Statement-level recovery resynchronises at each semicolon. */

matrix A[2,3]

A = ;
matrix B[2 3];
print(A;
