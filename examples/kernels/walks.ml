/* Walks of length three from every vertex of a directed graph, written as the
   textbook formula A^3 1 over the 0/1 adjacency matrix. Every count is an
   integer below 2^30, so every bracketing is exact. */
matrix A[1024,1024] = input(bool);
matrix W = A * A * A * ones(1024,1);
print(W);
