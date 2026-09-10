/* algebra.ml -- the matrix-specific optimizations.

   Each statement below is a matrix identity that a general-purpose optimizer
   cannot exploit, because it does not know what a matrix is. MatrixLang does:
   it tracks which values are identity matrices, which are all zeros, and which
   were produced by a transpose, and rewrites accordingly. */

matrix A[3,3] = {{1, 2, 3},
                 {4, 5, 6},
                 {7, 8, 9}};

matrix I = identity(3);
matrix Z = zeros(3,3);

matrix P = A * I;                    // A * I  -> A
matrix Q = I * A;                    // I * A  -> A
matrix R = A + Z;                    // A + 0  -> A
matrix S = A - Z;                    // A - 0  -> A
matrix T = transpose(transpose(A));  // T(T(A)) -> A
matrix U = A * 1;                    // A * 1  -> A
matrix V = A * 0;                    // A * 0  -> zeros(3,3)

print(P);
print(Q);
print(R);
print(S);
print(T);
print(U);
print(V);
