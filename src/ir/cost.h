/* cost.h -- what a MatrixLang program costs to run, computed at compile time.
 *
 * This exists because instruction counts are a bad measure of an optimizer.
 * Removing one instruction that multiplies two 100x100 matrices is worth far
 * more than removing three that add 2x2 ones, and a count cannot tell the
 * difference. Worse, a count is easy to flatter: write the example program so
 * that many instructions disappear and the percentage looks good.
 *
 * Arithmetic cost is not flatterable in the same way. The cost of A * B is
 * fixed by the shapes of A and B, and the shapes are in the type. A compiler
 * that knows every shape at compile time can therefore report exactly how much
 * arithmetic a program will perform before running it, and an optimizer can be
 * scored on arithmetic removed rather than on lines removed.
 *
 * The unit is one scalar floating-point operation: one multiplication or one
 * addition. For the textbook product of an m x n matrix with an n x p matrix
 * that is m*p*(2n-1) -- m*p*n multiplications and m*p*(n-1) additions.
 */
#ifndef MATRIXLANG_COST_H
#define MATRIXLANG_COST_H

#include <stdio.h>

#include "tac.h"
#include "types.h"

/* Scalar arithmetic operations performed by one instruction. Data movement --
 * a copy, a transpose, a load -- is zero: it costs time on a real machine, but
 * counting it would mix two different quantities, and the operation this
 * language exists to reason about is the product. */
long long cost_of(const Tac *t);

/* The cost of one matrix product, exposed because chain ordering needs to cost
 * products that do not exist as instructions yet. */
long long cost_matmul(int m, int n, int p);

/* Total over the live instruction stream. */
long long cost_total(void);

/* Human-readable, e.g. "1.2 MFLOP". Large programs otherwise print a wall of
 * digits that nobody compares correctly by eye. */
void cost_format(long long flops, char *buf, unsigned bufsz);

void cost_report(FILE *out, long long before, long long after);

#endif /* MATRIXLANG_COST_H */
