/* Two quantized linear layers with no nonlinearity between them (a factorized
   projection), applied to one vector of 8-bit activations. */
matrix W1[512,1024] = input(int8);
matrix W2[16,512] = input(int8);
matrix x[1024,1] = input(uint8);
matrix y = W2 * W1 * x;
print(y);
