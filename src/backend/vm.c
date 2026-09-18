#include "vm.h"

#include <stdlib.h>
#include <string.h>

#include "codegen.h"
#include "diag.h"
#include "symtab.h"
#include "util.h"
#include "value.h"

/* --- the variable store --------------------------------------------------
 *
 * Names are interned by the IR, but a temporary introduced by codegen may not
 * be in the symbol table, so entries are created on first store. */
typedef struct { const char *name; Value v; int set; } Slot;

static Slot *slots = NULL;
static int   nslots = 0;
static int   slotcap = 0;

static Slot *slot_find(const char *name)
{
    int i;
    for (i = 0; i < nslots; i++)
        if (slots[i].name == name || strcmp(slots[i].name, name) == 0)
            return &slots[i];
    return NULL;
}

static Slot *slot_get(const char *name)
{
    Slot *s = slot_find(name);
    if (s) return s;

    if (nslots == slotcap) {
        slotcap = slotcap ? slotcap * 2 : 32;
        slots = (Slot *)xrealloc(slots, (size_t)slotcap * sizeof *slots);
    }
    s = &slots[nslots++];
    s->name = name;
    s->set  = 0;
    memset(&s->v, 0, sizeof s->v);
    return s;
}

static void slots_free(void)
{
    int i;
    for (i = 0; i < nslots; i++)
        if (slots[i].set) value_free(&slots[i].v);
    free(slots);
    slots = NULL;
    nslots = slotcap = 0;
}

/* Every declared variable exists from the start, zero-filled at its declared
 * shape. A declaration with no initialiser generates no IR, so this is the
 * only thing that gives such a variable a value. */
static void slots_init_from_symtab(void)
{
    int i;
    for (i = 0; i < sym_count(); i++) {
        Symbol *sym = sym_index(i);
        Slot *s = slot_get(sym->name);
        if (type_is_matrix(sym->type))
            s->v = value_zeros(sym->type.rows, sym->type.cols);
        else
            s->v = value_scalar(0.0);
        s->set = 1;
    }
}

/* --- the operand stack --------------------------------------------------- */

#define STACK_MAX 256

static Value stack[STACK_MAX];
static int   sp = 0;

static int push(Value v, int line)
{
    if (sp >= STACK_MAX) {
        diag_report(DIAG_ERROR, DIAG_RUNTIME, line, 1,
                    "virtual machine stack overflow");
        value_free(&v);
        return 0;
    }
    stack[sp++] = v;
    return 1;
}

static Value pop(void)
{
    if (sp == 0) return value_scalar(0.0);
    return stack[--sp];
}

static void stack_clear(void)
{
    while (sp > 0) {
        Value v = stack[--sp];
        value_free(&v);
    }
}

/* --- execution ----------------------------------------------------------- */

static void store_into(Slot *s, Value v)
{
    if (s->set) value_free(&s->v);
    s->v   = v;
    s->set = 1;
}

int vm_run(FILE *out, int trace)
{
    int pc;
    int status = 0;

    slots_free();
    sp = 0;
    slots_init_from_symtab();

    for (pc = 0; pc < codegen_count(); pc++) {
        Instr *in = codegen_at(pc);
        Value a, b, r;

        if (trace)
            fprintf(out, "  %3d  %-14s   [stack %d]\n", pc, vm_op_name(in->op), sp);

        switch (in->op) {
        case OP_LOAD_MATRIX:
        case OP_LOAD_SCALAR: {
            Slot *s = slot_find(in->name);
            if (!s || !s->set) {
                diag_report(DIAG_ERROR, DIAG_RUNTIME, in->line, 1,
                            "'%s' has no value at this point", in->name);
                status = 1;
                goto done;
            }
            if (!push(value_copy(s->v), in->line)) { status = 1; goto done; }
            break;
        }

        case OP_PUSH_SCALAR:
            if (!push(value_scalar(in->val), in->line)) { status = 1; goto done; }
            break;

        case OP_PUSH_MATRIX: {
            const Value *lit = litpool_get(in->a);
            if (!lit) {
                diag_report(DIAG_ERROR, DIAG_RUNTIME, in->line, 1,
                            "matrix literal #%d is missing", in->a);
                status = 1;
                goto done;
            }
            if (!push(value_copy(*lit), in->line)) { status = 1; goto done; }
            break;
        }

        case OP_STORE_MATRIX:
        case OP_STORE_SCALAR:
            store_into(slot_get(in->name), pop());
            break;

        case OP_MATADD:
            b = pop(); a = pop();
            r = value_add(a, b);
            value_free(&a); value_free(&b);
            if (!push(r, in->line)) { status = 1; goto done; }
            break;

        case OP_MATSUB:
            b = pop(); a = pop();
            r = value_sub(a, b);
            value_free(&a); value_free(&b);
            if (!push(r, in->line)) { status = 1; goto done; }
            break;

        case OP_MATMUL:
            b = pop(); a = pop();
            r = value_matmul(a, b);
            value_free(&a); value_free(&b);
            if (!push(r, in->line)) { status = 1; goto done; }
            break;

        case OP_MATSCALE:
            /* One instruction covers both operand orders: the compiler knows
             * exactly one side is a scalar, so the machine only has to find
             * which. */
            b = pop(); a = pop();
            r = a.is_matrix ? value_scale(a, b.scalar) : value_scale(b, a.scalar);
            value_free(&a); value_free(&b);
            if (!push(r, in->line)) { status = 1; goto done; }
            break;

        case OP_MATNEG:
        case OP_SCALNEG:
            a = pop();
            r = value_negate(a);
            value_free(&a);
            if (!push(r, in->line)) { status = 1; goto done; }
            break;

        case OP_TRANSPOSE:
            a = pop();
            r = value_transpose(a);
            value_free(&a);
            if (!push(r, in->line)) { status = 1; goto done; }
            break;

        case OP_SCALADD:
            b = pop(); a = pop();
            r = value_scalar(a.scalar + b.scalar);
            if (!push(r, in->line)) { status = 1; goto done; }
            break;

        case OP_SCALSUB:
            b = pop(); a = pop();
            r = value_scalar(a.scalar - b.scalar);
            if (!push(r, in->line)) { status = 1; goto done; }
            break;

        case OP_SCALMUL:
            b = pop(); a = pop();
            r = value_scalar(a.scalar * b.scalar);
            if (!push(r, in->line)) { status = 1; goto done; }
            break;

        case OP_IDENTITY:
            if (!push(value_identity(in->a), in->line)) { status = 1; goto done; }
            break;

        case OP_ZEROS:
            if (!push(value_zeros(in->a, in->b), in->line)) { status = 1; goto done; }
            break;

        case OP_ONES:
            if (!push(value_ones(in->a, in->b), in->line)) { status = 1; goto done; }
            break;

        case OP_PRINT:
            a = pop();
            value_print_named(out, in->name ? in->name : "value", &a);
            value_free(&a);
            break;

        case OP_HALT:
            goto done;
        }
    }

done:
    stack_clear();
    return status;
}
