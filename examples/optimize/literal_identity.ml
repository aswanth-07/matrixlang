/* literal_identity.ml -- an identity matrix does not have to come from
   identity(). The optimizer inspects matrix literals for the same properties,
   so a hand-written identity is folded away exactly like a constructed one. */

matrix A[2,2] = {{4, 7},
                 {2, 6}};

matrix I[2,2] = {{1, 0},
                 {0, 1}};

matrix R = A * I;

print(R);
