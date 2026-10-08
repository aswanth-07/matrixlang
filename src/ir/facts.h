/* facts.h -- what the optimizer can prove about the values a name may hold.
 *
 * A fact over-approximates every value an operand can take, for every input
 * its declared domain admits. It has three parts:
 *
 *   grid   every entry is an integer multiple of 2^grid
 *   mag    every entry has magnitude at most mag
 *   signs  whether an entry can be negative, and whether it can be -0
 *
 * Grid and magnitude together decide exactness. A sum or product of values on
 * the grid 2^g whose magnitude stays at or below 2^(g+53) is an integer count
 * of grid steps that fits in binary64's 53-bit significand, so the operation
 * is computed without rounding. A matrix product chain whose every proper
 * sub-chain satisfies that bound, and whose final sums round at most once, is
 * computed as the correctly rounded exact product under every bracketing and
 * every summation order, so reordering it cannot change a single output bit
 * (facts_chain_exact).
 *
 * The grid survives rounding: rounding a multiple of 2^g to binary64 yields a
 * multiple of 2^g whenever g >= -1074. That is why the analysis can keep a
 * useful grid through inexact arithmetic, and why the same facts also exclude
 * gradual underflow when the grid is at or above 2^-1022.
 *
 * The analysis is a single forward pass: a MatrixLang program is one basic
 * block, so there are no joins and no fixed point.
 */
#ifndef MATRIXLANG_FACTS_H
#define MATRIXLANG_FACTS_H

#include "domain.h"
#include "value.h"

/* The grid of an all-zero value: zero is a multiple of every power of two. */
#define FACT_GRID_ANY 100000

typedef struct {
    int    finite;      /* every entry is finite; when 0 nothing below holds   */
    int    grid;        /* every entry is a multiple of 2^grid (>= -1074)      */
    double mag;         /* every |entry| <= mag; 0 means every entry is zero   */
    int    nonneg;      /* no entry is negative and none is -0                 */
    int    no_negzero;  /* no entry is -0                                      */
} Fact;

Fact fact_unknown(void);
Fact fact_of_value(const Value *v);
Fact fact_of_constant(double x);
Fact fact_of_domain(const Domain *d);
Fact fact_identity(void);
Fact fact_zeros(void);
Fact fact_ones(void);

Fact fact_add(Fact a, Fact b);
Fact fact_sub(Fact a, Fact b);
Fact fact_neg(Fact a);
Fact fact_scale(Fact s, Fact m);              /* scalar times scalar or matrix */
Fact fact_matmul(Fact a, Fact b, int inner);   /* inner: the shared dimension  */

/* Significand bits a value with this fact may need: log2(mag) - grid, rounded
 * up. 0 for an all-zero value; a large number when nothing is known. */
int fact_bits(Fact f);

/* --- product chains --------------------------------------------------------
 *
 * ops[0..k-1] are the operands' facts and dim[0..k] their shapes: operand t
 * is dim[t] x dim[t+1]. Both checks consider every contiguous sub-chain, which
 * is exactly the set of intermediates some bracketing computes. */
typedef struct {
    int ok;
    int bits;            /* the largest significand requirement found         */
    int first, last;     /* the sub-chain that set it (or that failed)        */
    int min_grid;        /* the finest grid of any sub-chain product          */
    int rounded;         /* 1 when the final sums may round (once)            */
} ChainCheck;

/* Every bracketing, with every order of summation inside each product,
 * returns the correctly rounded exact product: outputs are bit-identical
 * whichever bracketing is chosen.
 *
 * Every proper sub-chain is an operand of some later product in some
 * bracketing, so it must be exact. The whole chain need not be: a bracketing
 * whose last product contracts dimension d computes each output entry as a
 * sum of d exact terms, and if every sum of at most d - 1 of them is exact,
 * the only rounding is the final addition, which rounds the exact entry once.
 * why->rounded says whether that final rounding can occur. */
int facts_chain_exact(const Fact *ops, const int *dim, int k, ChainCheck *why);

/* One product L * R with shared dimension `inner` gives the same bits for
 * every order of summation (a vectorized or parallel reduction, say): every
 * term and every partial sum short of the whole is exact. */
int facts_product_reassociable(Fact a, Fact b, int inner);

/* No partial sum of L * R can overflow, in any order of summation: every order
 * keeps the standard inner-product bound gamma_inner |a|^T |b|. */
int facts_product_range(Fact a, Fact b, int inner);

/* Every operand is finite and no sub-chain product can overflow under any
 * bracketing: the precondition of the bracketing-invariant error bound. */
int facts_chain_range(const Fact *ops, const int *dim, int k, ChainCheck *why);

/* The coefficient c in |computed - exact| <= c |A1||A2|...|Ak|, which is the
 * same for every bracketing: prod over inner dimensions p of (1 + gamma_p),
 * minus one, with gamma_p = p u / (1 - p u) and u = 2^-53. */
double facts_chain_bound(const int *dim, int k);

/* --- per-instruction facts over the current instruction stream ----------- */

void facts_analyze(void);
Fact facts_operand(int instr, int which);      /* which: 1 for a1, 2 for a2 */
void facts_free(void);

#endif /* MATRIXLANG_FACTS_H */
