/* duplicate.ml -- one declaration per name. */

matrix A[2,2];
matrix A[3,3];      // already declared at line 3

scalar x;
matrix x[2,2];      // same name, different kind, still a duplicate

print(A);
print(x);
