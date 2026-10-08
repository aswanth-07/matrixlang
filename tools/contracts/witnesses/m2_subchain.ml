/* Mutant 2 checks only the whole chain. The zero operand makes the whole
 * chain's bound 0, yet A * B overflows: Inf * 0 = NaN in the source order. */
matrix A[4,1] = {{1e200},{1e200},{1e200},{1e200}};
matrix B[1,4] = {{1e200, 1e200, 1e200, 1e200}};
matrix Z[4,1] = zeros(4,1);
matrix R = A * B * Z;
print(R);
