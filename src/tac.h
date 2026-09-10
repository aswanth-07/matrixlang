/* tac.h -- three-address code: the intermediate representation.
 *
 * One flat instruction array. MatrixLang has no control flow, so the whole
 * program is a single basic block -- which is precisely what makes the local
 * optimizations in optimize.c correct without any control-flow graph or
 * dataflow iteration.
 *
 * Operands are strings, in the textbook style, and their spelling is what
 * distinguishes them:
 *
 *     A, C        a program variable  (an identifier never starts with a digit)
 *     t1, t7      a compiler temporary
 *     3, 2.5, -1  a scalar constant
 *     #0, #4      a matrix literal, by index into the literal pool
 *
 * Every operand string is interned, so equality is still a strcmp but nothing
 * owns or frees an individual operand.
 */
#ifndef MATRIXLANG_TAC_H
#define MATRIXLANG_TAC_H

#include <stddef.h>
#include <stdio.h>

#include "ast.h"
#include "types.h"

typedef enum {
    TAC_ADD,       /* dst = a1 + a2         */
    TAC_SUB,       /* dst = a1 - a2         */
    TAC_MUL,       /* dst = a1 * a2         */
    TAC_NEG,       /* dst = -a1             */
    TAC_TRANS,     /* dst = transpose(a1)   */
    TAC_COPY,      /* dst = a1              */
    TAC_IDENTITY,  /* dst = identity(i1)    */
    TAC_ZEROS,     /* dst = zeros(i1,i2)    */
    TAC_ONES,      /* dst = ones(i1,i2)     */
    TAC_PRINT      /* print a1              */
} TacOp;

typedef struct {
    TacOp       op;
    const char *dst;   /* NULL for TAC_PRINT */
    const char *a1;
    const char *a2;    /* NULL for unary forms */

    int   i1, i2;      /* identity/zeros/ones dimensions */

    /* TAC_PRINT only: the expression as it was written in the source. Kept so
     * that output still says "C" after the optimizer has rewritten C's
     * definition into a temporary. */
    const char *label;

    Type  type;        /* the shape this instruction produces */
    int   line;

    int   removed;     /* set by an optimizer pass; printers skip these */
} Tac;

void tac_init(void);
void tac_free(void);

/* Walks the analysed AST and emits the instruction stream. Must run only after
 * semantic_check succeeded: it reads the shapes that pass inferred and does no
 * checking of its own. */
void tac_generate(Node *root);

int   tac_count(void);          /* including removed instructions */
int   tac_live_count(void);     /* excluding removed instructions */
Tac  *tac_at(int i);

/* Renders one instruction in the conventional form, e.g. "t1 = A * B". */
void tac_format(const Tac *t, char *buf, size_t bufsz);

void tac_print(FILE *out, const char *title);

/* True when the instruction computes a value with no side effect, so it is a
 * candidate for common-subexpression elimination and for removal when dead. */
int tac_is_pure(const Tac *t);

/* Operand classification and typing, shared by the optimizer and codegen. */
int  tac_operand_is_const(const char *name, double *out);
int  tac_operand_is_literal(const char *name, int *lit_id);
int  tac_operand_is_temp(const char *name);
Type tac_operand_type(const char *name);

const char *tac_intern(const char *s);

#endif /* MATRIXLANG_TAC_H */
