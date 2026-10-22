/* Walks of length three from every paper of the Cora citation graph (2,708
   papers, 5,278 undirected citations), written as the textbook formula A^3 1
   over its 0/1 adjacency matrix. */
matrix A[2708,2708] = input(bool);
matrix W = A * A * A * ones(2708,1);
print(W);
