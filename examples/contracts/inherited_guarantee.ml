/* A guarantee is inherited through the facts a proof reads. N = -A holds -0
 * wherever A is 0, so 0 * N may be -0; the bounded contract rewrites it to
 * +0 and labels it bound-preserving. The outer 0 * T is then exactly +0 --
 * but only because of the inner rewrite, and once the outer rewrite removes
 * every use of the inner product, nothing else carries that weaker label.
 * The certificate of print(R) must still say bound-preserving. */
matrix A[2,2] = {{0, 1}, {1, 1}};
matrix N = -A;
matrix T = 1 * transpose(0 * N);
matrix R = 0 * T;
print(R);
