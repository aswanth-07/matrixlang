/* Three steps of a diffusion with a nonnegative transition matrix, written as
   P^3 v: the real-valued counterpart of walks.ml. */
matrix P[1024,1024] = input(real(0,1));
matrix v[1024,1] = input(real(0,1));
matrix T = P * P * P * v;
print(T);
