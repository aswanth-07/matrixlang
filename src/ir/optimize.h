/* optimize.h -- the MatrixLang optimizer.
 *
 * Five kinds of transformation run over the single basic block that a
 * MatrixLang program compiles to:
 *
 *   1. matrix chain ordering, chosen by arithmetic cost (chain.c)
 *   2. algebraic simplification, including the matrix-specific identities
 *      (A*I, I*A, A+0, A*1, transpose(transpose(A))) and scalar constant folding
 *   3. common subexpression elimination
 *   4. copy propagation
 *   5. dead code elimination
 *
 * Passes 2-5 repeat to a fixed point, because each feeds the next.
 *
 * Every rewrite that can change a floating-point result carries a proof
 * obligation, and the numerical contract decides which obligations must be
 * discharged:
 *
 *   strict     (default) output is bit-identical to the unoptimized program.
 *              A value-changing rewrite is applied only when the fact analysis
 *              proves that, for every input the declared domains admit, it
 *              produces the same bits: a chain whose every intermediate is
 *              exact, A*I with A finite and free of -0, and so on.
 *   bounded    every output keeps the worst-case componentwise error bound of
 *              the source evaluation order (standard model of floating-point
 *              arithmetic), and NaN/Infinity behavior is unchanged. Signed
 *              zeros may differ.
 *   algebraic  real-number algebra: any rewrite valid over the reals.
 *
 * After optimization every printed value is labelled with the strongest
 * guarantee that all rewrites on its dependency cone keep.
 */
#ifndef MATRIXLANG_OPTIMIZE_H
#define MATRIXLANG_OPTIMIZE_H

#include <stdio.h>

/* The guarantee a rewrite keeps, ordered from strongest to weakest. */
typedef enum {
    NG_BITWISE = 0,     /* output bits unchanged                         */
    NG_BOUNDED = 1,     /* source-order error bound kept; -0 may differ   */
    NG_RELAXED = 2      /* valid over the reals only                      */
} NumGuarantee;

const char *num_guarantee_name(int level);

typedef struct {
    int original;           /* instructions before optimization */
    int optimized;          /* instructions after                */

    int const_folds;        /* scalar arithmetic evaluated at compile time */
    int cse;                /* repeated expressions reused                 */
    int copies;             /* copy propagations applied                   */
    int dead;               /* instructions deleted as unreachable/unused  */

    int identity_ops;       /* A*I, I*A, A*1, 1*A collapsed */
    int zero_ops;           /* A+0, 0+A, A-0, A*0 collapsed */
    int double_transpose;   /* transpose(transpose(A)) collapsed */

    int rounds;             /* how many times the sequence repeated */

    int chains;             /* matrix product chains re-bracketed */

    /* Value-changing rewrites, by the guarantee each one keeps. A rewrite that
     * needed no numerical argument (CSE, folding, double transpose) is not
     * counted here. */
    int proved_bitwise;     /* proved bit-identical                    */
    int kept_bound;         /* proved to keep the source error bound   */
    int relaxed;            /* valid over the reals only               */
    int declined;           /* applicable, but refused by the contract */

    /* Arithmetic, in scalar floating-point operations, before and after.
     * Instruction counts cannot distinguish removing a 2x2 addition from
     * removing a 100x100 product; arithmetic cost is fixed by the shapes. */
    long long flops_before;
    long long flops_after;
    long long flops_chain;     /* of which, attributable to chain re-bracketing */
    long long flops_declined;  /* chain saving the contract refused             */
} OptStats;

/* Which passes to run. Individually selectable so a demonstration can show one
 * transformation at a time. */
#define OPT_ALGEBRAIC  0x01
#define OPT_CSE        0x02
#define OPT_COPYPROP   0x04
#define OPT_DCE        0x08
#define OPT_CHAIN      0x10
#define OPT_ALL        0x1F

/* The numerical contract. Neither flag means strict. */
#define OPT_RELAXED    0x20     /* --fp-algebraic */
#define OPT_BOUNDED    0x40     /* --fp-bounded   */
#define OPT_NOPROOF    0x80     /* --no-proofs: value facts are not used */

void optimize_run(int passes);

/* The numeric summary the project report quotes. */
void optimize_report(FILE *out);

/* A line per transformation, in the order they were applied, saying what was
 * rewritten, the guarantee it keeps and why -- and every rewrite the contract
 * declined, with the condition that could not be proved. */
void optimize_explain(FILE *out);

/* One line per printed value: the strongest guarantee it keeps and the proofs
 * it rests on. */
void optimize_guarantees(FILE *out);

const OptStats *optimize_stats(void);

void optimize_free(void);

#endif /* MATRIXLANG_OPTIMIZE_H */
