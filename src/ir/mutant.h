/* mutant.h -- deliberately wrong optimizer variants, for test-adequacy studies.
 *
 * A normal build compiles every hook below to a constant 0. The evaluation
 * builds a second binary with -DMATRIXC_MUTANTS, and the environment variable
 * MATRIXC_MUTANT=<n> then disables one side condition of one rewrite. The
 * question the study asks is which test inputs notice: each mutant is a
 * plausible implementation mistake, and a test suite that cannot tell it from
 * the correct compiler is blind to that class of mistake.
 *
 *   1  strict mode reorders chains without an exactness proof
 *   2  the exactness proof checks only the whole chain, not its sub-chains
 *   3  the exactness proof allows 54 significand bits instead of 53
 *   4  A*I -> A without requiring that A has no -0 entry
 *   5  A*I -> A without requiring that A is finite
 *   6  A+0 -> A without requiring that A has no -0 entry
 *   7  A*0 -> 0 (matrix product) without requiring that A is finite
 *   8  0*A -> 0 (scaling) as bit-identical without the sign condition
 *   9  negation and scaling are assumed never to produce -0
 *  10  every sub-chain, not only the whole chain, may round in its final sum
 */
#ifndef MATRIXLANG_MUTANT_H
#define MATRIXLANG_MUTANT_H

#ifdef MATRIXC_MUTANTS
#include <stdlib.h>

static inline int mutant_active(int id)
{
    static int which = -1;
    if (which < 0) {
        const char *s = getenv("MATRIXC_MUTANT");
        which = s ? atoi(s) : 0;
    }
    return which == id;
}
#else
#define mutant_active(id) 0
#endif

#endif /* MATRIXLANG_MUTANT_H */
