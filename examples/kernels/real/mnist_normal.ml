/* Normal equations of a least-squares fit of the digit label on the central
   10x10 pixels of the first 4,096 MNIST training images. */
matrix X[4096,100] = input(uint8);
matrix y[4096,1] = input(uint8);
matrix G = transpose(X) * X;
matrix b = transpose(X) * y;
print(G);
print(b);
