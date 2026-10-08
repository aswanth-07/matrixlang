/* Row and column intensity profiles of an 8-bit grayscale image. */
matrix I[2048,2048] = input(uint8);
matrix rows = I * ones(2048,1);
matrix cols = ones(1,2048) * I;
print(rows);
print(cols);
