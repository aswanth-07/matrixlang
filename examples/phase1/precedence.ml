/* precedence.ml -- what the %left declarations buy.

   The expression grammar is ambiguous as written. Nothing in

       expr : expr '+' expr
            | expr '*' expr

   says that '*' binds tighter than '+', or that either is left associative,
   and bison finds exactly those shift/reduce conflicts. The three precedence
   lines in matrix.y decide all twelve of them.

   This program is small enough to walk end to end in the demo, and it reaches
   the decision once: the parser holds A + B, reads '*', and could either
   reduce rule 16 or shift. It shifts, because '*' sits at a tighter
   precedence level than '+'. The three-address code is the proof -- B * C is
   computed first -- but the demo shows the moment the parser chose it. */

matrix A[2,2];
matrix B[2,2];
matrix C[2,2];

matrix R = A + B * C;

print(R);
