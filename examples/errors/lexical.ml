/* lexical.ml -- illegal characters and malformed numbers. */

matrix A[2,2];

A = A $ A;      // '$' is not a MatrixLang character
A = 12abc * A;  // an identifier may not begin with a digit
