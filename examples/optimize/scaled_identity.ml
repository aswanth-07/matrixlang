/* identity(3) is a unit for a matrix product, not for a scaling: 2 * I is
 * the matrix with 2 on the diagonal, never the scalar 2. */
matrix T = 2 * identity(3);
print(T);
