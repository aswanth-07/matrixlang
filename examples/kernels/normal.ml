/* Normal equations of a least-squares fit: four integer-coded features and a
   16-bit response over 4,096 observations. */
matrix X[4096,4] = input(int8);
matrix y[4096,1] = input(int16);
matrix G = transpose(X) * X;
matrix b = transpose(X) * y;
print(G);
print(b);
