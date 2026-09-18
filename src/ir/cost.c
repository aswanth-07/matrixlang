#include "cost.h"

#include <stdio.h>

#include "types.h"

long long cost_matmul(int m, int n, int p)
{
    /* m*p entries, each an inner product of length n: n multiplications and
     * n-1 additions. n is at least 1 because a dimension of zero is rejected
     * by the semantic pass. */
    return (long long)m * p * (2LL * n - 1);
}

/* The shapes an instruction's operands carry. Only the product needs the inner
 * dimension, which is why this is not simply the result shape. */
static long long cost_binary(const Tac *t)
{
    Type at = tac_operand_type(t->a1);
    Type bt = tac_operand_type(t->a2);

    switch (t->op) {
    case TAC_MUL:
        if (type_is_matmul(at, bt))
            return cost_matmul(at.rows, at.cols, bt.cols);
        if (type_is_scaling(at, bt)) {
            Type m = type_is_matrix(at) ? at : bt;
            return (long long)m.rows * m.cols;      /* one multiply per entry */
        }
        return 1;                                   /* scalar times scalar */

    case TAC_ADD:
    case TAC_SUB:
        if (type_is_matrix(t->type))
            return (long long)t->type.rows * t->type.cols;
        return 1;

    default:
        return 0;
    }
}

long long cost_of(const Tac *t)
{
    if (!t || t->removed) return 0;

    switch (t->op) {
    case TAC_ADD:
    case TAC_SUB:
    case TAC_MUL:
        return cost_binary(t);

    case TAC_NEG:
        /* A negation is one multiplication by -1 per entry. */
        return type_is_matrix(t->type)
                   ? (long long)t->type.rows * t->type.cols : 1;

    /* Data movement, not arithmetic. */
    case TAC_TRANS:
    case TAC_COPY:
    case TAC_IDENTITY:
    case TAC_ZEROS:
    case TAC_ONES:
    case TAC_PRINT:
        return 0;
    }
    return 0;
}

long long cost_total(void)
{
    long long total = 0;
    int i;
    for (i = 0; i < tac_count(); i++)
        total += cost_of(tac_at(i));
    return total;
}

void cost_format(long long flops, char *buf, unsigned bufsz)
{
    if (flops >= 1000000000LL)
        snprintf(buf, bufsz, "%.2f GFLOP", flops / 1e9);
    else if (flops >= 1000000LL)
        snprintf(buf, bufsz, "%.2f MFLOP", flops / 1e6);
    else if (flops >= 1000LL)
        snprintf(buf, bufsz, "%.2f kFLOP", flops / 1e3);
    else
        snprintf(buf, bufsz, "%lld FLOP", flops);
}

void cost_report(FILE *out, long long before, long long after)
{
    char b[32], a[32], saved[32];
    double pct = 0.0;

    cost_format(before, b, sizeof b);
    cost_format(after, a, sizeof a);
    cost_format(before - after, saved, sizeof saved);
    if (before > 0)
        pct = 100.0 * (double)(before - after) / (double)before;

    fprintf(out, "  Arithmetic before optimization : %14lld   (%s)\n", before, b);
    fprintf(out, "  Arithmetic after optimization  : %14lld   (%s)\n", after, a);
    fprintf(out, "  Arithmetic removed             : %14lld   (%s)\n",
            before - after, saved);
    fprintf(out, "  Cost reduction                 : %13.1f%%\n", pct);
}
