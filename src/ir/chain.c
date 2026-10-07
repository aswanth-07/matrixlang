#include "chain.h"

#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "cost.h"
#include "facts.h"
#include "mutant.h"
#include "optimize.h"
#include "tac.h"
#include "types.h"
#include "util.h"

#define MAX_CHAIN 32        /* a chain longer than this is not reordered */

static long long saved_total;
static long long declined_total;
static int       per_level[3];
static int       declined_chains;

/* --- the reasoning log ----------------------------------------------------- */

static char **log_lines;
static int    nlog, logcap;

static void logf_(const char *fmt, ...)
{
    char buf[800];
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
    saved_total = declined_total = 0;
    declined_chains = 0;
    memset(per_level, 0, sizeof per_level);
}

long long chain_flops_saved(void)    { return saved_total; }
long long chain_flops_declined(void) { return declined_total; }
int       chain_declined(void)       { return declined_chains; }
int       chain_count(int level)     { return (level >= 0 && level < 3) ? per_level[level] : 0; }

void chain_explain(FILE *out)
{
    int i;
    for (i = 0; i < nlog; i++) fprintf(out, "  %s\n", log_lines[i]);
}

/* --- finding a chain ------------------------------------------------------- */

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

/* --- the chain and its facts ----------------------------------------------- */

typedef struct {
    int         k;                      /* number of operands */
    const char *operand[MAX_CHAIN];
    int         dim[MAX_CHAIN + 1];     /* operand i is dim[i] x dim[i+1] */
    int         slot[MAX_CHAIN];        /* the k-1 instruction slots to reuse */
    const char *final_dst;
    Fact        fact[MAX_CHAIN];        /* each operand */
    Fact        prefix[MAX_CHAIN];      /* source-order product of operands 0..i */
} Chain;

/* --- the classical chain DP over one segment ------------------------------- */

static long long m_cost[MAX_CHAIN][MAX_CHAIN];
static int       m_split[MAX_CHAIN][MAX_CHAIN];

static long long solve(const int *dim, int k)
{
    int len, i, j, s;

    for (i = 0; i < k; i++) m_cost[i][i] = 0;
    for (len = 2; len <= k; len++) {
        for (i = 0; i + len - 1 < k; i++) {
            j = i + len - 1;
            m_cost[i][j] = -1;
            for (s = i; s < j; s++) {
                long long q = m_cost[i][s] + m_cost[s + 1][j]
                            + cost_matmul(dim[i], dim[s + 1], dim[j + 1]);
                if (m_cost[i][j] < 0 || q < m_cost[i][j]) {
                    m_cost[i][j] = q;
                    m_split[i][j] = s;
                }
            }
        }
    }
    return m_cost[0][k - 1];
}

static long long left_to_right_cost(const Chain *c)
{
    long long total = 0;
    int i;
    for (i = 1; i < c->k; i++)
        total += cost_matmul(c->dim[0], c->dim[i], c->dim[i + 1]);
    return total;
}

/* --- segments ---------------------------------------------------------------
 *
 * Segment (i, j), 0 <= i < j < k, is the product X * A(i+1) * ... * A(j),
 * where X is the source-order prefix product of operands 0..i. Its operands
 * and shapes are copied out so the facts checks and the DP see a plain chain.
 */
typedef struct {
    int  m;                             /* operands in the segment */
    int  dim[MAX_CHAIN + 1];
    Fact fact[MAX_CHAIN];
    int  level;                         /* NumGuarantee of reordering it */
    ChainCheck check;                   /* the exactness (or range) evidence */
    int  exact;
} Segment;

static void segment_build(const Chain *c, int i, int j, int use_proofs, Segment *s)
{
    int t;

    s->m = j - i + 1;
    s->dim[0] = c->dim[0];
    s->fact[0] = c->prefix[i];
    for (t = 1; t < s->m; t++) {
        s->dim[t] = c->dim[i + t];
        s->fact[t] = c->fact[i + t];
    }
    s->dim[s->m] = c->dim[j + 1];

    s->exact = 0;
    if (s->m == 2) {                    /* one product: nothing to reorder */
        s->level = NG_BITWISE;
        s->exact = 1;
        memset(&s->check, 0, sizeof s->check);
        s->check.ok = 1;
        return;
    }
    if (!use_proofs) {
        s->level = NG_RELAXED;
        return;
    }
    if (mutant_active(1) || facts_chain_exact(s->fact, s->dim, s->m, &s->check)) {
        s->level = NG_BITWISE;
        s->exact = 1;
    } else if (facts_chain_range(s->fact, s->dim, s->m, NULL)) {
        s->level = NG_BOUNDED;
    } else {
        s->level = NG_RELAXED;
    }
}

/* --- the evaluation tree ----------------------------------------------------- */

typedef struct {
    int leaf;            /* operand index, or -1 for a product */
    int l, r;            /* children, for a product */
    int rows, cols;
    int level;
    const char *proof;
} TreeNode;

static TreeNode tree[2 * MAX_CHAIN];
static int      ntree;

static int tree_leaf(const Chain *c, int t)
{
    TreeNode *n = &tree[ntree];
    n->leaf = t;
    n->l = n->r = -1;
    n->rows = c->dim[t];
    n->cols = c->dim[t + 1];
    n->level = NG_BITWISE;
    n->proof = NULL;
    return ntree++;
}

/* Builds the segment's optimal bracketing over [x, leaves i+1..j]. Interior
 * products are new values with no counterpart in the source program; only the
 * segment's root replaces a value the source computed (its prefix product), so
 * only the root carries the segment's guarantee. */
static int tree_segment(int lo, int hi, int x, int first_leaf, const Chain *c)
{
    TreeNode *n;
    int s, l, r;

    if (lo == hi) return lo == 0 ? x : tree_leaf(c, first_leaf + lo - 1);

    s = m_split[lo][hi];
    l = tree_segment(lo, s, x, first_leaf, c);
    r = tree_segment(s + 1, hi, x, first_leaf, c);

    n = &tree[ntree];
    n->leaf = -1;
    n->l = l;
    n->r = r;
    n->rows = tree[l].rows;
    n->cols = tree[r].cols;
    n->level = NG_BITWISE;
    n->proof = NULL;
    return ntree++;
}

typedef struct {
    const Chain *c;
    int          next_slot;
} Emitter;

/* Post-order emission into the chain's slots: every operand is defined before
 * it is used, and the root, emitted last, keeps the destination the rest of
 * the program reads. */
static const char *emit(Emitter *e, int node)
{
    const Chain *c = e->c;
    TreeNode *n = &tree[node];
    const char *left, *right, *dst;
    Tac *t;
    Type shape;
    int slot;

    if (n->leaf >= 0) return c->operand[n->leaf];

    left  = emit(e, n->l);
    right = emit(e, n->r);

    slot = c->slot[e->next_slot++];
    t = tac_at(slot);
    shape = type_matrix(n->rows, n->cols);
    dst = (e->next_slot == c->k - 1) ? c->final_dst : tac_new_temp(shape);

    t->op    = TAC_MUL;
    t->dst   = dst;
    t->a1    = left;
    t->a2    = right;
    t->type  = shape;
    t->removed = 0;
    t->cert  = n->level;
    t->proof = n->proof;
    return dst;
}

static void render_node(const Chain *c, int node, char *buf, size_t n, size_t *pos, int top)
{
    TreeNode *t = &tree[node];
    if (*pos >= n) return;
    if (t->leaf >= 0) {
        *pos += (size_t)snprintf(buf + *pos, n - *pos, "%s", c->operand[t->leaf]);
        if (*pos > n) *pos = n;
        return;
    }
    if (!top && *pos < n) *pos += (size_t)snprintf(buf + *pos, n - *pos, "(");
    if (*pos > n) *pos = n;
    render_node(c, t->l, buf, n, pos, 0);
    if (*pos < n) *pos += (size_t)snprintf(buf + *pos, n - *pos, " * ");
    if (*pos > n) *pos = n;
    render_node(c, t->r, buf, n, pos, 0);
    if (!top && *pos < n) *pos += (size_t)snprintf(buf + *pos, n - *pos, ")");
    if (*pos > n) *pos = n;
}

static void render_range(const Chain *c, int a, int b, char *buf, size_t n)
{
    size_t used = 0;
    int i;
    buf[0] = '\0';
    for (i = a; i <= b; i++) {
        int w = snprintf(buf + used, n - used, "%s%s", i > a ? " * " : "", c->operand[i]);
        if (w < 0 || (size_t)w >= n - used) break;
        used += (size_t)w;
    }
}

/* Names the operands of segment sub-chain [first..last], where segment
 * operand 0 stands for the prefix product of chain operands 0..i. */
static void render_sub(const Chain *c, int i, int first, int last, char *buf, size_t n)
{
    int a = first == 0 ? 0 : i + first;
    int b = i + last;
    render_range(c, a, b, buf, n);
}

/* --- the pass ----------------------------------------------------------------- */

static int reorder_one(int head, int max_level, int use_proofs)
{
    static Chain c;
    static Segment seg[MAX_CHAIN][MAX_CHAIN];
    long long best[MAX_CHAIN];
    int best_level[MAX_CHAIN];
    int choice[MAX_CHAIN];
    long long before, after, unconstrained;
    char chosen[320], srcbuf[256];
    int idx, i, j;

    memset(&c, 0, sizeof c);

    c.operand[0] = tac_at(head)->a1;
    c.operand[1] = tac_at(head)->a2;
    c.k = 2;
    c.slot[0] = head;

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

    /* Reusing slots may move a leaf earlier. A gap can contain the leaf's
     * definition or a variable write; decline that chain rather than move
     * a computation across it without dependency analysis. */
    for (i = 1; i < c.k - 1; i++)
        if (c.slot[i] != c.slot[0] + i) return 0;

    for (i = 0; i < c.k; i++) {
        Type t = tac_operand_type(c.operand[i]);
        if (!type_is_matrix(t)) return 0;
        c.dim[i] = t.rows;
        c.dim[i + 1] = t.cols;
    }
    c.final_dst = tac_at(idx)->dst;

    /* Operand facts, and the facts of every source-order prefix product. */
    facts_analyze();
    c.fact[0] = facts_operand(c.slot[0], 1);
    for (i = 1; i < c.k; i++) c.fact[i] = facts_operand(c.slot[i - 1], 2);
    c.prefix[0] = c.fact[0];
    for (i = 1; i < c.k; i++)
        c.prefix[i] = fact_matmul(c.prefix[i - 1], c.fact[i], c.dim[i]);

    before = left_to_right_cost(&c);
    unconstrained = solve(c.dim, c.k);
    if (unconstrained >= before) return 0;     /* the source order is already best */

    /* best[j]: the cheapest admissible evaluation of the prefix 0..j. Between
     * evaluations of equal cost the stronger guarantee wins: an exact order is
     * preferred to a bound-preserving one that saves nothing more. */
    best[0] = 0;
    best_level[0] = NG_BITWISE;
    choice[0] = -1;
    for (j = 1; j < c.k; j++) {
        best[j] = -1;
        for (i = 0; i < j; i++) {
            long long q;
            int lvl;
            segment_build(&c, i, j, use_proofs, &seg[i][j]);
            if (seg[i][j].level > max_level) continue;
            q = best[i] + solve(seg[i][j].dim, seg[i][j].m);
            lvl = seg[i][j].level > best_level[i] ? seg[i][j].level : best_level[i];
            if (best[j] < 0 || q < best[j] || (q == best[j] && lvl < best_level[j])) {
                best[j] = q;
                best_level[j] = lvl;
                choice[j] = i;
            }
        }
    }
    after = best[c.k - 1];

    render_range(&c, 0, c.k - 1, srcbuf, sizeof srcbuf);

    if (after < before) {
        int bounds[MAX_CHAIN], nb = 0, x, level = NG_BITWISE, nproofs = 0;
        const char *proofs[MAX_CHAIN];
        int proof_level[MAX_CHAIN];
        Emitter e;

        for (j = c.k - 1; j > 0; j = choice[j]) bounds[nb++] = j;

        ntree = 0;
        x = tree_leaf(&c, 0);
        for (i = nb - 1; i >= 0; i--) {
            int end = bounds[i];
            int start = (i == nb - 1) ? 0 : bounds[i + 1];
            Segment *s = &seg[start][end];
            const char *proof = NULL;
            char why[640], ops[256];

            if (s->m > 2) {
                render_sub(&c, start, 0, s->m - 1, ops, sizeof ops);
                if (s->level == NG_BITWISE)
                    snprintf(why, sizeof why, "%s is exact: every intermediate of "
                             "every bracketing needs at most %d of 53 significand bits",
                             ops, s->check.bits);
                else if (s->level == NG_BOUNDED)
                    snprintf(why, sizeof why, "%s keeps the source-order error bound: "
                             "|error| <= %.3g |A1|...|Ak| under every bracketing, and "
                             "no intermediate can overflow",
                             ops, facts_chain_bound(s->dim, s->m));
                else if (!use_proofs)
                    snprintf(why, sizeof why, "%s reordered without a proof "
                             "(--no-proofs)", ops);
                else
                    snprintf(why, sizeof why, "%s reordered without a proof: neither "
                             "exactness nor the range condition holds", ops);
                proof = tac_intern(why);
                proofs[nproofs] = proof;
                proof_level[nproofs++] = s->level;
                if (s->level > level) level = s->level;
            }
            solve(s->dim, s->m);
            x = tree_segment(0, s->m - 1, x, start + 1, &c);
            tree[x].level = s->m > 2 ? s->level : NG_BITWISE;
            tree[x].proof = proof;
        }

        e.c = &c;
        e.next_slot = 0;
        emit(&e, x);

        {
            size_t pos = 0;
            chosen[0] = '\0';
            render_node(&c, x, chosen, sizeof chosen, &pos, 1);
        }

        {
            char b[32], a[32];
            cost_format(before, b, sizeof b);
            cost_format(after, a, sizeof a);
            logf_("chain order      : %s  ->  %s", srcbuf, chosen);
            logf_("                   left-to-right %s, chosen %s, saved %lld FLOP (%.1f%%)",
                  b, a, before - after, 100.0 * (double)(before - after) / (double)before);
            for (i = 0; i < nproofs; i++)
                logf_("                   %s: %s",
                      num_guarantee_name(proof_level[i]), proofs[i]);
        }

        saved_total += before - after;
        per_level[level]++;
    }

    /* Saving the contract refused: report why, from the whole-chain view. */
    if (after > unconstrained) {
        ChainCheck why;
        Segment *whole = &seg[0][c.k - 1];
        char sub[256];

        declined_total += after - unconstrained;
        declined_chains++;

        if (after >= before)
            logf_("chain kept       : %s  (cheapest order would save %lld FLOP)",
                  srcbuf, before - unconstrained);
        else
            logf_("                   a further %lld FLOP is declined by the contract",
                  after - unconstrained);

        if (!use_proofs) {
            logf_("                   proofs are disabled (--no-proofs): every "
                  "reordering counts as relaxed");
        } else if (!facts_chain_exact(whole->fact, whole->dim, whole->m, &why)) {
            int t, real = -1;
            for (t = why.first; t <= why.last && t >= 0; t++)
                if (whole->fact[t].finite && whole->fact[t].grid <= -1000 &&
                    whole->fact[t].mag > 0.0) { real = t; break; }
            if (why.bits >= 9999) {
                render_sub(&c, 0, why.first, why.last, sub, sizeof sub);
                logf_("                   not provably exact: %s may be non-finite", sub);
            } else if (real >= 0) {
                logf_("                   not provably exact: %s is real-valued, "
                      "so products with it round", c.operand[real]);
            } else {
                render_sub(&c, 0, why.first, why.last, sub, sizeof sub);
                logf_("                   not provably exact: %s may need %d "
                      "significand bits; binary64 has 53", sub, why.bits);
            }
            if (max_level < NG_BOUNDED && whole->level == NG_BOUNDED)
                logf_("                   --fp-bounded permits it: every bracketing "
                      "has the same error bound");
            else if (max_level < NG_RELAXED && whole->level == NG_RELAXED)
                logf_("                   the range condition fails as well; only "
                      "--fp-algebraic permits it");
        }
    }

    return after < before;
}

int chain_reorder(int max_level, int use_proofs)
{
    int i, n = 0;

    for (i = 0; i < tac_count(); i++) {
        if (!is_matmul_instr(tac_at(i))) continue;
        if (continues_chain(i)) continue;       /* not a head */
        n += reorder_one(i, max_level, use_proofs);
    }
    return n;
}
