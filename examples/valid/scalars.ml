/* scalars.ml -- scalars, and scaling a matrix by one.
   A scalar times a matrix keeps the matrix's shape; a scalar times a scalar
   stays a scalar. Those are three different machine instructions behind one
   '*', chosen from the inferred types. */

scalar k = 3;
scalar half = 0.5;

matrix M[2,2] = {{2, 4},
                 {6, 8}};

matrix Scaled = k * M;         // Matrix<2x2>
matrix Halved = M * half;      // Matrix<2x2>

scalar product = k * half;     // Scalar

print(Scaled);
print(Halved);
print(product);
