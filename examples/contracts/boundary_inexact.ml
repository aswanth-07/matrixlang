/* 200 * 35579^3 = 9007643881907800 > 2^53: one bit too many to prove. */
matrix A[100,2] = input(int(0,35579));
matrix B[2,100] = input(int(0,35579));
matrix C[100,2] = input(int(0,35579));
matrix R = A * B * C;
print(R);
