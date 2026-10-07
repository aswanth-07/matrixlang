/* 200 * 35578^3 = 9006884384110400 <= 2^53: every intermediate is exact. */
matrix A[100,2] = input(int(0,35578));
matrix B[2,100] = input(int(0,35578));
matrix C[100,2] = input(int(0,35578));
matrix R = A * B * C;
print(R);
