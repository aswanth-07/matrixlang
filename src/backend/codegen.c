#include "codegen.h"

#include <stdlib.h>
#include <string.h>

#include "tac.h"
#include "types.h"
#include "util.h"
#include "value.h"

static Instr *prog = NULL;
static int    nprog = 0;
static int    progcap = 0;

void codegen_free(void)
{
    free(prog);
    prog = NULL;
    nprog = progcap = 0;
}

static Instr *emit(VmOp op, int line)
{
    Instr *in;

    if (nprog == progcap) {
        progcap = progcap ? progcap * 2 : 64;
        prog = (Instr *)xrealloc(prog, (size_t)progcap * sizeof *prog);
    }
    in = &prog[nprog++];
    memset(in, 0, sizeof *in);
    in->op   = op;
    in->line = line;
    return in;
}

int    codegen_count(void)     { return nprog; }
Instr *codegen_at(int i)       { return (i >= 0 && i < nprog) ? &prog[i] : NULL; }

const char *vm_op_name(VmOp op)
{
    switch (op) {
    case OP_LOAD_MATRIX:  return "LOAD_MATRIX";
    case OP_LOAD_SCALAR:  return "LOAD_SCALAR";
    case OP_PUSH_SCALAR:  return "PUSH_SCALAR";
    case OP_PUSH_MATRIX:  return "PUSH_MATRIX";
    case OP_STORE_MATRIX: return "STORE_MATRIX";
    case OP_STORE_SCALAR: return "STORE_SCALAR";
    case OP_MATADD:       return "MATADD";
    case OP_MATSUB:       return "MATSUB";
    case OP_MATMUL:       return "MATMUL";
    case OP_MATSCALE:     return "MATSCALE";
    case OP_MATNEG:       return "MATNEG";
    case OP_TRANSPOSE:    return "TRANSPOSE";
    case OP_SCALADD:      return "SCALADD";
    case OP_SCALSUB:      return "SCALSUB";
    case OP_SCALMUL:      return "SCALMUL";
    case OP_SCALNEG:      return "SCALNEG";
    case OP_IDENTITY:     return "IDENTITY";
    case OP_ZEROS:        return "ZEROS";
    case OP_ONES:         return "ONES";
    case OP_PRINT:        return "PRINT";
    case OP_HALT:         return "HALT";
    }
    return "?";
}

/* Pushes whatever the operand denotes. The four operand spellings the IR uses
 * map onto four different instructions here, which is the whole of operand
 * selection in this backend. */
static void emit_load(const char *operand, int line)
{
    double v;
    int id;
    Instr *in;

    if (tac_operand_is_const(operand, &v)) {
        in = emit(OP_PUSH_SCALAR, line);
        in->val = v;
        return;
    }

    if (tac_operand_is_literal(operand, &id)) {
        in = emit(OP_PUSH_MATRIX, line);
        in->a = id;
        return;
    }

    in = emit(type_is_matrix(tac_operand_type(operand))
                  ? OP_LOAD_MATRIX : OP_LOAD_SCALAR, line);
    in->name = operand;
}

static void emit_store(const char *dst, Type t, int line)
{
    Instr *in = emit(type_is_matrix(t) ? OP_STORE_MATRIX : OP_STORE_SCALAR, line);
    in->name = dst;
}

void codegen_run(void)
{
    int i;

    codegen_free();

    for (i = 0; i < tac_count(); i++) {
        Tac *t = tac_at(i);
        Type at, bt;

        if (t->removed) continue;

        switch (t->op) {
        case TAC_ADD:
        case TAC_SUB:
            emit_load(t->a1, t->line);
            emit_load(t->a2, t->line);
            emit(type_is_matrix(t->type)
                     ? (t->op == TAC_ADD ? OP_MATADD : OP_MATSUB)
                     : (t->op == TAC_ADD ? OP_SCALADD : OP_SCALSUB),
                 t->line);
            emit_store(t->dst, t->type, t->line);
            break;

        case TAC_MUL:
            at = tac_operand_type(t->a1);
            bt = tac_operand_type(t->a2);
            emit_load(t->a1, t->line);
            emit_load(t->a2, t->line);
            /* Instruction selection: three different machine operations hide
             * behind one source-level '*', and only the inferred shapes
             * distinguish them. */
            if (type_is_matmul(at, bt))       emit(OP_MATMUL,  t->line);
            else if (type_is_scaling(at, bt)) emit(OP_MATSCALE, t->line);
            else                              emit(OP_SCALMUL, t->line);
            emit_store(t->dst, t->type, t->line);
            break;

        case TAC_NEG:
            emit_load(t->a1, t->line);
            emit(type_is_matrix(t->type) ? OP_MATNEG : OP_SCALNEG, t->line);
            emit_store(t->dst, t->type, t->line);
            break;

        case TAC_TRANS:
            emit_load(t->a1, t->line);
            emit(OP_TRANSPOSE, t->line);
            emit_store(t->dst, t->type, t->line);
            break;

        case TAC_COPY:
            emit_load(t->a1, t->line);
            emit_store(t->dst, t->type, t->line);
            break;

        case TAC_IDENTITY: {
            Instr *in = emit(OP_IDENTITY, t->line);
            in->a = t->i1;
            emit_store(t->dst, t->type, t->line);
            break;
        }

        case TAC_ZEROS:
        case TAC_ONES: {
            Instr *in = emit(t->op == TAC_ZEROS ? OP_ZEROS : OP_ONES, t->line);
            in->a = t->i1;
            in->b = t->i2;
            emit_store(t->dst, t->type, t->line);
            break;
        }

        case TAC_PRINT: {
            Instr *in;
            emit_load(t->a1, t->line);
            in = emit(OP_PRINT, t->line);
            /* The label is the expression as it was written in the source, so
             * output still says "C" after the optimizer has replaced C's
             * definition with a temporary. */
            in->name = t->label ? t->label : t->a1;
            break;
        }
        }
    }

    emit(OP_HALT, 0);
}

void codegen_print(FILE *out, const char *title)
{
    int i;

    if (title) fprintf(out, "%s\n\n", title);

    if (nprog == 0) {
        fprintf(out, "(no target code)\n");
        return;
    }

    for (i = 0; i < nprog; i++) {
        Instr *in = &prog[i];

        fprintf(out, "  %3d  %-14s", i, vm_op_name(in->op));

        switch (in->op) {
        case OP_LOAD_MATRIX:
        case OP_LOAD_SCALAR:
        case OP_STORE_MATRIX:
        case OP_STORE_SCALAR:
        case OP_PRINT:
            if (in->name) fprintf(out, " %s", in->name);
            break;
        case OP_PUSH_SCALAR:
            fprintf(out, " %g", in->val);
            break;
        case OP_PUSH_MATRIX:
            fprintf(out, " #%d", in->a);
            break;
        case OP_IDENTITY:
            fprintf(out, " %d", in->a);
            break;
        case OP_ZEROS:
        case OP_ONES:
            fprintf(out, " %d %d", in->a, in->b);
            break;
        default:
            break;
        }
        fputc('\n', out);
    }

    fprintf(out, "\n%d instruction(s).\n", nprog);
}
