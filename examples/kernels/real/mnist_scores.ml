/* Class scores summed over 4,096 MNIST test images under an int8 linear
   classifier (92% accurate): W X 1, with W the 10 x 784 int8 weights and X
   the images quantized to int8, one image per column. */
matrix W[10,784] = input(int8);
matrix X[784,4096] = input(int8);
matrix s = W * X * ones(4096,1);
print(s);
