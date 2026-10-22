/* Three steps of a random walk on the Cora citation graph from the uniform
   distribution: P^3 v, with P the row-normalised adjacency D^-1 A. */
matrix P[2708,2708] = input(real(0,1));
matrix v[2708,1] = input(real(0,1));
matrix T = P * P * P * v;
print(T);
