/* optimize.h -- the MatrixLang optimizer.
 *
 * Four kinds of transformation run to a fixed point over the single basic
 * block that a MatrixLang program compiles to:
 *
 *   1. algebraic simplification, including the matrix-specific identities
 *      (A*I, I*A, A+0, A*1, transpose(transpose(A))) and scalar constant folding
 *   2. common subexpression elimination
 *   3. copy propagation
 *   4. dead code elimination
 *
 * They are ordered that way because each feeds the next: simplification turns
 * operations into copies, CSE turns repeats into copies, copy propagation makes
 * those copies unused, and dead code elimination deletes them. Running once is
 * not enough -- deleting one instruction can expose another -- so the sequence
 * repeats until nothing changes.
 */
#ifndef MATRIXLANG_OPTIMIZE_H
#define MATRIXLANG_OPTIMIZE_H

#include <stdio.h>

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
} OptStats;

/* Which passes to run. Individually selectable so a demonstration can show one
 * transformation at a time. */
#define OPT_ALGEBRAIC  0x01
#define OPT_CSE        0x02
#define OPT_COPYPROP   0x04
#define OPT_DCE        0x08
#define OPT_ALL        0x0F

void optimize_run(int passes);

/* The numeric summary the project report quotes. */
void optimize_report(FILE *out);

/* A line per transformation, in the order they were applied, saying what was
 * rewritten and why. This is what turns "the count went down" into something a
 * reader can check. */
void optimize_explain(FILE *out);

void optimize_free(void);

#endif /* MATRIXLANG_OPTIMIZE_H */
