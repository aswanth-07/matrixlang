/* chain.h -- matrix chain ordering.
 *
 * The optimization this language exists to make possible.
 *
 * Matrix multiplication is associative, so A*B*C*D may be bracketed in any
 * way, and every bracketing computes the same matrix. It does not perform the
 * same amount of arithmetic. For A[10x100], B[100x5], C[5x50]:
 *
 *     (A*B)*C   costs  10*5*(2*100-1) + 10*50*(2*5-1)   =   14,450 FLOP
 *     A*(B*C)   costs  100*50*(2*5-1) + 10*50*(2*100-1) = 144,500 FLOP
 *
 * A factor of ten, decided entirely by the shapes -- and in MatrixLang the
 * shapes are in the type, known before the program runs. The compiler can
 * therefore choose the bracketing, and the programmer never has to.
 *
 * This is the clearest thing in the language that a compiler for a
 * general-purpose mini-language could not do at all: it needs the dimensions,
 * and a scalar type system does not carry them.
 *
 * The algorithm is the standard O(k^3) dynamic program over the chain, which
 * is the same one an algorithms course teaches. Reusing a familiar algorithm
 * is deliberate: what is being demonstrated is that the compiler has the
 * information to run it, not the algorithm itself.
 */
#ifndef MATRIXLANG_CHAIN_H
#define MATRIXLANG_CHAIN_H

#include <stdio.h>

/* Rewrites every matrix product chain of three or more operands into its
 * cheapest bracketing. Returns the number of chains it reordered.
 *
 * A chain always needs exactly k-1 products whatever the bracketing, so this
 * never changes the instruction count -- only the arithmetic. That is precisely
 * why an optimizer measured in instructions cannot see it. */
int chain_reorder(void);

/* Arithmetic removed by the reorderings applied so far. */
long long chain_flops_saved(void);

/* One line per chain: the operands, the bracketing chosen, and the cost of
 * that bracketing against the left-to-right one the source implied. */
void chain_explain(FILE *out);

void chain_reset(void);

#endif /* MATRIXLANG_CHAIN_H */
