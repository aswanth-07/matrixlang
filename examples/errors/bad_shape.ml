/* bad_shape.ml -- the remaining shape rules.

   transpose() needs a matrix, '+' will not mix a scalar with a matrix, and a
   dimension has to be a compile-time constant. */

scalar s = 4;
matrix A[2,2] = {{1, 2}, {3, 4}};

scalar bad1 = transpose(s);     // transpose of a scalar
matrix bad2 = A + s;            // matrix plus scalar
matrix bad3 = zeros(s, 2);      // dimension taken from a variable
matrix bad4 = identity(2.5);    // dimension is not a whole number

print(bad1);
print(bad2);
print(bad3);
print(bad4);
