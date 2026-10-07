/* chain.h -- matrix chain ordering under a numerical contract.
 *
 * Matrix multiplication is associative over the reals, so A*B*C*D may be
 * bracketed in any way. It does not perform the same amount of arithmetic.
 * For A[10x100], B[100x5], C[5x50]:
 *
 *     (A*B)*C   costs  10*5*(2*100-1) + 10*50*(2*5-1)   =   14,450 FLOP
 *     A*(B*C)   costs  100*50*(2*5-1) + 10*50*(2*100-1) = 144,500 FLOP
 *
 * The shapes are in the type, so the compiler can choose the bracketing. In
 * binary64 a different bracketing generally rounds differently, so whether it
 * may do so is a question about the numerical contract, and the answer is a
 * proof obligation rather than a switch:
 *
 *   strict      any bracketing is allowed when every intermediate of every
 *               bracketing is exact (facts_chain_exact): output bits cannot
 *               change.
 *   bounded     any bracketing is allowed when no intermediate can overflow:
 *               every bracketing then satisfies the same componentwise error
 *               bound, (prod (1 + gamma_p) - 1) |A1|...|Ak|.
 *   algebraic   any bracketing.
 *
 * When only part of a chain can be proved, the pass still reorders that part.
 * The source evaluates (((A1*A2)*A3)*A4) left to right; any prefix product it
 * computes may be followed by a segment X*A(i+1)*...*Aj evaluated in any
 * bracketing, provided that segment satisfies the contract with X's facts.
 * A dynamic program over segment boundaries finds the cheapest such
 * evaluation, and each segment is solved by the standard O(k^3) chain DP.
 */
#ifndef MATRIXLANG_CHAIN_H
#define MATRIXLANG_CHAIN_H

#include <stdio.h>

/* Rewrites every product chain of three or more operands into the cheapest
 * bracketing the contract allows. `max_level` is the weakest NumGuarantee the
 * contract accepts; `use_proofs` is 0 to treat every reordering as relaxed.
 * Returns the number of chains reordered. Never changes the instruction
 * count: a chain of k operands needs k-1 products however it is bracketed. */
int chain_reorder(int max_level, int use_proofs);

long long chain_flops_saved(void);      /* arithmetic removed by reordering    */
long long chain_flops_declined(void);   /* further saving the contract refused */
int       chain_count(int level);       /* chains reordered at that guarantee  */
int       chain_declined(void);         /* chains with a refused saving        */

/* The reasoning, chain by chain: the order chosen, its cost against the
 * source order, the guarantee it keeps and why, and anything declined. */
void chain_explain(FILE *out);

void chain_reset(void);

#endif /* MATRIXLANG_CHAIN_H */
