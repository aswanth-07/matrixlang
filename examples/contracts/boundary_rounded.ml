/* 200 * 35697^3 > 2^53, so the product itself may round, but every partial
   sum short of the last fits: 198 * 35697^3 = 9006589063666854 <= 2^53.
   Every bracketing then returns the correctly rounded product. */
matrix A[100,2] = input(int(0,35697));
matrix B[2,100] = input(int(0,35697));
matrix C[100,2] = input(int(0,35697));
matrix R = A * B * C;
print(R);
