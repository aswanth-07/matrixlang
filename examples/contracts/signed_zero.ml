/* x * I = x and x + 0 = x hold over the reals but not for -0 in IEEE 754:
 * a matrix product starts every entry at +0, and -0 + +0 = +0. N = s * A can
 * hold -0 (s may be negative and A may be zero), so strict mode keeps both
 * operations; P is over an integer domain, which has no -0, so its identity
 * product is removed. */
matrix A[3,3] = input(int8);
scalar s = input(real(2));
matrix N = s * A;
matrix P = A * identity(3);
matrix Q = N * identity(3);
matrix V = N + zeros(3,3);
print(P);
print(Q);
print(V);
