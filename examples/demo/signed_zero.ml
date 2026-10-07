/* Algebraic zero multiplication can change the sign of binary64 zero. */
scalar x = -2;
scalar y = x * 0;
print(y);
