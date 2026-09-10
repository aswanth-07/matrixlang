/* codegen.h -- target code for the MatrixLang Virtual Machine.
 *
 * The MVM is a stack machine. That choice is not arbitrary: three-address code
 * lowers to a stack machine without any register allocation, so this phase
 * stays about instruction selection -- picking MATMUL over MATSCALE over
 * SCALMUL from the shapes the semantic pass inferred -- rather than becoming a
 * second, unrelated problem.
 *
 * The instruction set is the one named in the language design, extended where
 * execution required it: separate scalar arithmetic, matrix construction, and
 * a push for compile-time matrix literals.
 */
#ifndef MATRIXLANG_CODEGEN_H
#define MATRIXLANG_CODEGEN_H

#include <stdio.h>

typedef enum {
    OP_LOAD_MATRIX,    /* push the matrix held in <name>        */
    OP_LOAD_SCALAR,    /* push the scalar held in <name>        */
    OP_PUSH_SCALAR,    /* push an immediate scalar              */
    OP_PUSH_MATRIX,    /* push matrix literal <a> from the pool */
    OP_STORE_MATRIX,   /* pop into matrix <name>                */
    OP_STORE_SCALAR,   /* pop into scalar <name>                */

    OP_MATADD,
    OP_MATSUB,
    OP_MATMUL,
    OP_MATSCALE,       /* scalar times matrix, in either order  */
    OP_MATNEG,
    OP_TRANSPOSE,

    OP_SCALADD,
    OP_SCALSUB,
    OP_SCALMUL,
    OP_SCALNEG,

    OP_IDENTITY,       /* push identity(<a>)          */
    OP_ZEROS,          /* push zeros(<a>,<b>)         */
    OP_ONES,           /* push ones(<a>,<b>)          */

    OP_PRINT,
    OP_HALT
} VmOp;

typedef struct {
    VmOp        op;
    const char *name;   /* LOAD/STORE operand, or the label for PRINT */
    double      val;    /* OP_PUSH_SCALAR */
    int         a, b;   /* dimensions, or the literal pool index */
    int         line;   /* source line, for runtime diagnostics */
} Instr;

/* Lowers the live TAC stream. Must run after optimization, if optimization is
 * running at all. */
void codegen_run(void);

int    codegen_count(void);
Instr *codegen_at(int i);

const char *vm_op_name(VmOp op);

/* Prints the target listing, in the form a reader can hand-check against the
 * TAC it came from. */
void codegen_print(FILE *out, const char *title);

void codegen_free(void);

#endif /* MATRIXLANG_CODEGEN_H */
