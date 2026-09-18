#include "chain.h"

#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "cost.h"
#include "tac.h"
#include "types.h"
#include "util.h"

#define MAX_CHAIN 32        /* a chain longer than this is not a teaching example */

static long long saved_total;

/* --- the transformation log ---------------------------------------------- */

static char **log_lines;
static int    nlog, logcap;

static void logf_(const char *fmt, ...)
{
    char buf[320];
    va_list ap;

    va_start(ap, fmt);
    vsnprintf(buf, sizeof buf, fmt, ap);
    va_end(ap);

    if (nlog == logcap) {
        logcap = logcap ? logcap * 2 : 8;
        log_lines = (char **)xrealloc(log_lines, (size_t)logcap * sizeof *log_lines);
    }
    log_lines[nlog++] = xstrdup(buf);
}

void chain_reset(void)
{
    int i;
    for (i = 0; i < nlog; i++) free(log_lines[i]);
    free(log_lines);
    log_lines = NULL;
    nlog = logcap = 0;
    saved_total = 0;
}

long long chain_flops_saved(void) { return saved_total; }

void chain_explain(FILE *out)
{
    int i;
    for (i = 0; i < nlog; i++) fprintf(out, "  %s\n", log_lines[i]);
}

/* --- finding a chain ------------------------------------------------------ */

static int uses_of(const char *name)
{
    int i, n = 0;
    for (i = 0; i < tac_count(); i++) {
        Tac *t = tac_at(i);
        if (t->removed) continue;
        if (t->a1 && strcmp(t->a1, name) == 0) n++;
        if (t->a2 && strcmp(t->a2, name) == 0) n++;
    }
    return n;
}

/* The instruction that defines `name`, or -1. */
static int def_of(const char *name)
{
    int i;
    for (i = 0; i < tac_count(); i++) {
        Tac *t = tac_at(i);
        if (!t->removed && t->dst && strcmp(t->dst, name) == 0) return i;
    }
    return -1;
}

static int is_matmul_instr(const Tac *t)
{
    if (t->removed || t->op != TAC_MUL) return 0;
    return type_is_matmul(tac_operand_type(t->a1), tac_operand_type(t->a2));
}

/* True when instruction `idx` continues a chain: its left operand is a
 * temporary produced by another matrix product and consumed only here. A temp
 * used twice is shared, and re-bracketing would change what the other use
 * sees. */
static int continues_chain(int idx)
{
    Tac *t = tac_at(idx);
    int d;

    if (!is_matmul_instr(t)) return 0;
    if (!tac_operand_is_temp(t->a1)) return 0;
    if (uses_of(t->a1) != 1) return 0;

    d = def_of(t->a1);
    return d >= 0 && is_matmul_instr(tac_at(d));
}

/* --- the dynamic program -------------------------------------------------- */

typedef struct {
    int         k;                      /* number of operands */
    const char *operand[MAX_CHAIN];
    int         dim[MAX_CHAIN + 1];     /* operand i is dim[i] x dim[i+1] */
    int         slot[MAX_CHAIN];        /* the k-1 instruction slots to reuse */
    const char *final_dst;
    int         line;
} Chain;

static long long m_cost[MAX_CHAIN][MAX_CHAIN];
static int       m_split[MAX_CHAIN][MAX_CHAIN];

static void solve(const Chain *c)
{
    int len, i, j, s;

    for (i = 0; i < c->k; i++) m_cost[i][i] = 0;

    for (len = 2; len <= c->k; len++) {
        for (i = 0; i + len - 1 < c->k; i++) {
            j = i + len - 1;
            m_cost[i][j] = -1;
            for (s = i; s < j; s++) {
                long long q = m_cost[i][s] + m_cost[s + 1][j]
                            + cost_matmul(c->dim[i], c->dim[s + 1], c->dim[j + 1]);
                if (m_cost[i][j] < 0 || q < m_cost[i][j]) {
                    m_cost[i][j] = q;
                    m_split[i][j] = s;
                }
            }
        }
    }
}

/* Cost of the bracketing the source actually wrote, which for a left
 * associative '*' is (((A*B)*C)*D). This is the baseline the saving is
 * measured against. */
static long long left_to_right_cost(const Chain *c)
{
    long long total = 0;
    int i;
    for (i = 1; i < c->k; i++)
        total += cost_matmul(c->dim[0], c->dim[i], c->dim[i + 1]);
    return total;
}

/* --- emitting the chosen bracketing --------------------------------------- */

typedef struct {
    const Chain *c;
    int          next_slot;     /* index into c->slot */
} Emitter;

/* Writes the optimal bracketing into the slots the original chain occupied.
 *
 * A chain of k operands needs exactly k-1 products under any bracketing, so the
 * slots always match exactly. Post-order recursion fills them in an order where
 * every operand is defined before it is used. */
static const char *emit(Emitter *e, int i, int j)
{
    const Chain *c = e->c;
    int  s;
    int  slot;
    Tac *t;
    const char *left, *right, *dst;
    Type shape;

    if (i == j) return c->operand[i];

    s = m_split[i][j];
    left  = emit(e, i, s);
    right = emit(e, s + 1, j);

    slot = c->slot[e->next_slot++];
    t = tac_at(slot);

    shape = type_matrix(c->dim[i], c->dim[j + 1]);
    /* The outermost product must keep the destination the rest of the program
     * reads; the inner ones get fresh temporaries. */
    dst = (e->next_slot == c->k - 1) ? c->final_dst : tac_new_temp(shape);

    t->op   = TAC_MUL;
    t->dst  = dst;
    t->a1   = left;
    t->a2   = right;
    t->type = shape;
    t->removed = 0;

    return dst;
}

/* Renders a bracketing as text, for the explanation log.
 *
 * Appends into one buffer through a cursor rather than composing nested fixed
 * buffers: the nested form makes the compiler reason about a worst case where
 * each level could overflow the next, and it is right to complain. */
static void render_into(const Chain *c, int i, int j, char *buf, size_t n,
                        size_t *pos)
{
    int s;

    if (*pos >= n) return;

    if (i == j) {
        *pos += (size_t)snprintf(buf + *pos, n - *pos, "%s", c->operand[i]);
        if (*pos > n) *pos = n;
        return;
    }

    s = m_split[i][j];
    if (*pos < n) *pos += (size_t)snprintf(buf + *pos, n - *pos, "(");
    if (*pos > n) *pos = n;
    render_into(c, i, s, buf, n, pos);
    if (*pos < n) *pos += (size_t)snprintf(buf + *pos, n - *pos, " * ");
    if (*pos > n) *pos = n;
    render_into(c, s + 1, j, buf, n, pos);
    if (*pos < n) *pos += (size_t)snprintf(buf + *pos, n - *pos, ")");
    if (*pos > n) *pos = n;
}

static void render(const Chain *c, int i, int j, char *buf, size_t n)
{
    size_t pos = 0;
    buf[0] = '\0';
    render_into(c, i, j, buf, n, &pos);
}

/* --- the pass ------------------------------------------------------------- */

static int reorder_one(int head)
{
    Chain c;
    Emitter e;
    long long before, after;
    char chosen[256], srcbuf[256];
    int idx, i;

    memset(&c, 0, sizeof c);

    /* Walk the chain forward from its head, collecting operands and slots. */
    c.operand[0] = tac_at(head)->a1;
    c.operand[1] = tac_at(head)->a2;
    c.k = 2;
    c.slot[0] = head;
    c.line = tac_at(head)->line;

    idx = head;
    for (;;) {
        const char *produced = tac_at(idx)->dst;
        int next = -1;

        if (uses_of(produced) != 1) break;
        for (i = idx + 1; i < tac_count(); i++) {
            Tac *u = tac_at(i);
            if (u->removed) continue;
            if (u->a1 && strcmp(u->a1, produced) == 0 && is_matmul_instr(u)) next = i;
            if (u->a1 && strcmp(u->a1, produced) == 0) break;
            if (u->a2 && strcmp(u->a2, produced) == 0) break;
        }
        if (next < 0 || c.k >= MAX_CHAIN) break;

        c.operand[c.k] = tac_at(next)->a2;
        c.slot[c.k - 1] = next;
        c.k++;
        idx = next;
    }

    if (c.k < 3) return 0;

    /* Shapes. Every operand is a matrix and the inner dimensions agree,
     * because the semantic pass proved the products legal before this ran. */
    for (i = 0; i < c.k; i++) {
        Type t = tac_operand_type(c.operand[i]);
        if (!type_is_matrix(t)) return 0;
        c.dim[i] = t.rows;
        c.dim[i + 1] = t.cols;
    }
    c.final_dst = tac_at(idx)->dst;

    solve(&c);
    before = left_to_right_cost(&c);
    after  = m_cost[0][c.k - 1];

    if (after >= before) return 0;      /* the source order was already best */

    e.c = &c;
    e.next_slot = 0;
    emit(&e, 0, c.k - 1);

    render(&c, 0, c.k - 1, chosen, sizeof chosen);
    {
        char b[32], a[32];
        size_t used = 0;
        srcbuf[0] = '\0';
        for (i = 0; i < c.k; i++) {
            int w = snprintf(srcbuf + used, sizeof srcbuf - used, "%s%s",
                             i ? " * " : "", c.operand[i]);
            if (w < 0 || (size_t)w >= sizeof srcbuf - used) break;
            used += (size_t)w;
        }
        cost_format(before, b, sizeof b);
        cost_format(after, a, sizeof a);
        logf_("chain order      : %s  ->  %s", srcbuf, chosen);
        logf_("                   left-to-right %s, chosen %s, saved %lld FLOP (%.1f%%)",
              b, a, before - after,
              before > 0 ? 100.0 * (double)(before - after) / (double)before : 0.0);
    }

    saved_total += before - after;
    return 1;
}

int chain_reorder(void)
{
    int i, n = 0;

    for (i = 0; i < tac_count(); i++) {
        if (!is_matmul_instr(tac_at(i))) continue;
        if (continues_chain(i)) continue;       /* not a head */
        n += reorder_one(i);
    }
    return n;
}
