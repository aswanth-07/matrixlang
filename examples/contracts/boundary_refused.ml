/* The bracketing the strict contract refuses for boundary_inexact.ml, written
   out. On tests/data/witness35698_*.txt it prints different bits from
   A * B * C evaluated left to right. */
matrix A[100,2] = input(int(0,35698));
matrix B[2,100] = input(int(0,35698));
matrix C[100,2] = input(int(0,35698));
matrix R = A * (B * C);
print(R);
