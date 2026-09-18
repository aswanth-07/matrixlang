/* value.h -- runtime values, the matrix arithmetic itself, and the literal
 * pool that carries compile-time matrix constants through to execution.
 *
 * This is the only place that actually multiplies matrices. The semantic pass
 * reasons about shapes without touching data; the VM operates on data whose
 * shapes the semantic pass has already proved compatible. Keeping the two
 * apart is why the VM contains no dimension checks: by the time it runs, every
 * operation it will perform is known to fit.
 */
#ifndef MATRIXLANG_VALUE_H
#define MATRIXLANG_VALUE_H

#include <stdio.h>

#include "types.h"

typedef struct {
    int     is_matrix;
    double  scalar;     /* when !is_matrix */
    int     rows, cols; /* when is_matrix  */
    double *data;       /* row-major, rows*cols entries */
} Value;

Value value_scalar(double v);
Value value_matrix(int rows, int cols);          /* zero-filled */
Value value_copy(Value v);
void  value_free(Value *v);

double value_get(const Value *m, int r, int c);
void   value_set(Value *m, int r, int c, double x);

/* Arithmetic. Every one of these assumes the semantic pass already approved
 * the shapes; they are not a second line of defence. */
Value value_add(Value a, Value b);
Value value_sub(Value a, Value b);
Value value_matmul(Value a, Value b);
Value value_scale(Value m, double k);
Value value_transpose(Value a);
Value value_negate(Value a);

Value value_identity(int n);
Value value_zeros(int rows, int cols);
Value value_ones(int rows, int cols);

void value_print(FILE *out, const Value *v);
void value_print_named(FILE *out, const char *name, const Value *v);

/* Shape recognition, used by the optimizer to decide whether A * X can be
 * folded to A. A literal that happens to be an identity matrix is recognised
 * as one, so `{{1,0},{0,1}}` optimizes exactly like `identity(2)`. */
int value_is_identity(const Value *v);
int value_is_zero(const Value *v);

/* --- the literal pool ----------------------------------------------------
 *
 * Matrix literals are evaluated once, during semantic analysis, and stored
 * here. The AST node, the TAC instruction and the VM instruction all refer to
 * the same pool index, so the data is never copied between phases and the
 * optimizer can inspect a literal's shape without re-walking the tree. */
int          litpool_add(Value v);      /* takes ownership; returns the index */
const Value *litpool_get(int id);
int          litpool_count(void);
void         litpool_free(void);

#endif /* MATRIXLANG_VALUE_H */
