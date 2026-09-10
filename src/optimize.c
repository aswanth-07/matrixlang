#include "optimize.h"

#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "tac.h"
#include "util.h"
#include "value.h"

static OptStats stats;

/* --- transformation log --------------------------------------------------- */

static char **log_lines = NULL;
static int    nlog = 0;
static int    logcap = 0;

static void logf_(const char *fmt, ...)
{
    char buf[256];
    va_list ap;

    va_start(ap, fmt);
    vsnprintf(buf, sizeof buf, fmt, ap);
    va_end(ap);

    if (nlog == logcap) {
        logcap = logcap ? logcap * 2 : 16;
        log_lines = (char **)xrealloc(log_lines, (size_t)logcap * sizeof *log_lines);
    }
    log_lines[nlog++] = xstrdup(buf);
}

void optimize_free(void)
{
    int i;
    for (i = 0; i < nlog; i++) free(log_lines[i]);
    free(log_lines);
    log_lines = NULL;
    nlog = logcap = 0;
    memset(&stats, 0, sizeof stats);
}

/* --- value properties -----------------------------------------------------
 *
 * What the optimizer knows about an operand beyond its shape. This is the
 * analysis that makes the matrix-specific rewrites possible at all: without it
 * the compiler cannot tell that a particular matrix happens to be an identity,
 * and A * I is just another multiply.
 */
typedef enum {
    P_NONE = 0,
    P_IDENTITY,      /* a square matrix with ones on the diagonal */
    P_ZERO_MAT,      /* a matrix whose entries are all zero       */
    P_SCALAR_ZERO,
    P_SCALAR_ONE
} Prop;

typedef struct {
    const char *name;
    Prop        prop;
    const char *trans_src;   /* set when this name was defined by transpose(x) */
} EnvEntry;

static EnvEntry *env = NULL;
static int nenv = 0;
static int envcap = 0;

static void env_reset(void)
{
    nenv = 0;
}

static EnvEntry *env_find(const char *name)
{
    int i;
    for (i = 0; i < nenv; i++)
        if (env[i].name == name || strcmp(env[i].name, name) == 0)
            return &env[i];
    return NULL;
}

/* Records what is now known about `name`, and forgets anything that was
 * derived from the previous value of `name`. Skipping that invalidation is how
 * an optimizer silently miscompiles a reassignment. */
static void env_define(const char *name, Prop p, const char *trans_src)
{
    EnvEntry *e;
    int i;

    for (i = 0; i < nenv; i++)
        if (env[i].trans_src &&
            (env[i].trans_src == name || strcmp(env[i].trans_src, name) == 0))
            env[i].trans_src = NULL;

    e = env_find(name);
    if (!e) {
        if (nenv == envcap) {
            envcap = envcap ? envcap * 2 : 32;
            env = (EnvEntry *)xrealloc(env, (size_t)envcap * sizeof *env);
        }
        e = &env[nenv++];
        e->name = name;
    }
    e->prop      = p;
    e->trans_src = trans_src;
}

static Prop operand_prop(const char *name)
{
    double v;
    int id;
    EnvEntry *e;

    if (!name) return P_NONE;

    if (tac_operand_is_const(name, &v)) {
        if (v == 0.0) return P_SCALAR_ZERO;
        if (v == 1.0) return P_SCALAR_ONE;
        return P_NONE;
    }

    if (tac_operand_is_literal(name, &id)) {
        const Value *val = litpool_get(id);
        if (!val) return P_NONE;
        if (value_is_identity(val)) return P_IDENTITY;
        if (value_is_zero(val))     return P_ZERO_MAT;
        return P_NONE;
    }

    e = env_find(name);
    return e ? e->prop : P_NONE;
}

static const char *operand_trans_src(const char *name)
{
    EnvEntry *e;
    if (!name) return NULL;
    e = env_find(name);
    return e ? e->trans_src : NULL;
}

/* --- pass 1: algebraic simplification ------------------------------------ */

/* Turns instruction `t` into "dst = src", preserving its result shape. */
static void rewrite_to_copy(Tac *t, const char *src)
{
    t->op = TAC_COPY;
    t->a1 = src;
    t->a2 = NULL;
}

static int fold_scalar_constants(Tac *t, char *what, size_t whatsz)
{
    double a, b, r;

    if (t->op == TAC_NEG) {
        if (!tac_operand_is_const(t->a1, &a)) return 0;
        r = -a;
    } else {
        if (!tac_operand_is_const(t->a1, &a)) return 0;
        if (!tac_operand_is_const(t->a2, &b)) return 0;
        switch (t->op) {
        case TAC_ADD: r = a + b; break;
        case TAC_SUB: r = a - b; break;
        case TAC_MUL: r = a * b; break;
        default: return 0;
        }
    }

    {
        char buf[64];
        snprintf(buf, sizeof buf, "%g", r);
        snprintf(what, whatsz, "%g", r);
        rewrite_to_copy(t, tac_intern(buf));
    }
    return 1;
}

static int pass_algebraic(void)
{
    int i, changed = 0;
    char before[128];

    env_reset();

    for (i = 0; i < tac_count(); i++) {
        Tac *t = tac_at(i);
        Prop pa, pb;
        Prop result_prop = P_NONE;
        const char *trans_src = NULL;

        if (t->removed) continue;

        tac_format(t, before, sizeof before);

        pa = operand_prop(t->a1);
        pb = operand_prop(t->a2);

        switch (t->op) {
        case TAC_ADD:
        case TAC_SUB:
            /* Scalar arithmetic on two constants is settled here rather than
             * left to the VM. */
            if (tac_operand_is_const(t->a1, NULL) &&
                tac_operand_is_const(t->a2, NULL)) {
                char res[64];
                if (fold_scalar_constants(t, res, sizeof res)) {
                    logf_("constant folding : %-28s -> %s", before, res);
                    stats.const_folds++;
                    changed = 1;
                    break;
                }
            }
            /* X + 0 and X - 0 are X. The zero must have the same shape as X,
             * which the semantic pass already guaranteed for '+' and '-'. */
            if (pb == P_ZERO_MAT || pb == P_SCALAR_ZERO) {
                const char *kept = t->a1;
                const char *sign = (t->op == TAC_ADD) ? "+" : "-";
                rewrite_to_copy(t, kept);
                logf_("zero operand     : %-28s -> %s = %s  (x %s 0 = x)",
                      before, t->dst, kept, sign);
                stats.zero_ops++;
                changed = 1;
            } else if (t->op == TAC_ADD && (pa == P_ZERO_MAT || pa == P_SCALAR_ZERO)) {
                const char *kept = t->a2;
                rewrite_to_copy(t, kept);
                logf_("zero operand     : %-28s -> %s = %s  (0 + x = x)",
                      before, t->dst, kept);
                stats.zero_ops++;
                changed = 1;
            } else if (t->op == TAC_SUB && (pa == P_ZERO_MAT || pa == P_SCALAR_ZERO)) {
                /* 0 - x is -x: still one instruction, but a cheaper one. */
                t->op = TAC_NEG;
                t->a1 = t->a2;
                t->a2 = NULL;
                logf_("zero operand     : %-28s -> %s = -%s  (0 - x = -x)",
                      before, t->dst, t->a1);
                stats.zero_ops++;
                changed = 1;
            }
            break;

        case TAC_MUL:
            if (tac_operand_is_const(t->a1, NULL) &&
                tac_operand_is_const(t->a2, NULL)) {
                char res[64];
                if (fold_scalar_constants(t, res, sizeof res)) {
                    logf_("constant folding : %-28s -> %s", before, res);
                    stats.const_folds++;
                    changed = 1;
                    break;
                }
            }

            /* A multiplication by anything zero produces a zero result of the
             * shape the semantic pass already computed. */
            if (pa == P_SCALAR_ZERO || pb == P_SCALAR_ZERO ||
                pa == P_ZERO_MAT   || pb == P_ZERO_MAT) {
                if (type_is_matrix(t->type)) {
                    t->op = TAC_ZEROS;
                    t->i1 = t->type.rows;
                    t->i2 = t->type.cols;
                    t->a1 = t->a2 = NULL;
                    logf_("zero operand     : %-28s -> %s = zeros(%d,%d)",
                          before, t->dst, t->i1, t->i2);
                } else {
                    rewrite_to_copy(t, tac_intern("0"));
                    logf_("zero operand     : %-28s -> %s = 0", before, t->dst);
                }
                stats.zero_ops++;
                changed = 1;
                break;
            }

            /* The identity rewrites. A * I is valid only when I is the right
             * size, and the semantic pass has already established that -- if it
             * had not, this instruction would not exist. */
            if (pb == P_IDENTITY || pb == P_SCALAR_ONE) {
                const char *kept = t->a1;
                rewrite_to_copy(t, kept);
                logf_("identity operand : %-28s -> %s = %s  (x * %s = x)",
                      before, t->dst, kept,
                      pb == P_IDENTITY ? "I" : "1");
                stats.identity_ops++;
                changed = 1;
            } else if (pa == P_IDENTITY || pa == P_SCALAR_ONE) {
                const char *kept = t->a2;
                rewrite_to_copy(t, kept);
                logf_("identity operand : %-28s -> %s = %s  (%s * x = x)",
                      before, t->dst, kept,
                      pa == P_IDENTITY ? "I" : "1");
                stats.identity_ops++;
                changed = 1;
            }
            break;

        case TAC_TRANS: {
            const char *inner = operand_trans_src(t->a1);
            if (inner) {
                rewrite_to_copy(t, inner);
                logf_("double transpose : %-28s -> %s = %s  "
                      "(transpose(transpose(x)) = x)",
                      before, t->dst, inner);
                stats.double_transpose++;
                changed = 1;
            } else {
                trans_src = t->a1;
            }
            break;
        }

        case TAC_NEG:
            if (tac_operand_is_const(t->a1, NULL)) {
                char res[64];
                if (fold_scalar_constants(t, res, sizeof res)) {
                    logf_("constant folding : %-28s -> %s", before, res);
                    stats.const_folds++;
                    changed = 1;
                }
            }
            break;

        default:
            break;
        }

        /* Record what the destination now holds, so later instructions can use
         * it. A COPY inherits everything known about its source. */
        if (t->dst) {
            switch (t->op) {
            case TAC_IDENTITY: result_prop = P_IDENTITY;  break;
            case TAC_ZEROS:    result_prop = P_ZERO_MAT;  break;
            case TAC_COPY:
                result_prop = operand_prop(t->a1);
                if (!trans_src) trans_src = operand_trans_src(t->a1);
                break;
            default:
                break;
            }
            env_define(t->dst, result_prop, trans_src);
        }
    }

    return changed;
}

/* --- pass 2: common subexpression elimination ---------------------------- */

typedef struct {
    TacOp       op;
    const char *a1;
    const char *a2;
    int         i1, i2;
    const char *dst;    /* where the value already lives */
    int         valid;
} Avail;

static Avail *avail = NULL;
static int navail = 0;
static int availcap = 0;

static void avail_reset(void) { navail = 0; }

static int same_operand(const char *a, const char *b)
{
    if (a == b) return 1;
    if (!a || !b) return 0;
    return strcmp(a, b) == 0;
}

/* An expression stops being available the moment anything it mentions is
 * redefined -- and so does the entry holding its result. */
static void avail_kill(const char *name)
{
    int i;
    for (i = 0; i < navail; i++) {
        if (!avail[i].valid) continue;
        if (same_operand(avail[i].a1, name) ||
            same_operand(avail[i].a2, name) ||
            same_operand(avail[i].dst, name))
            avail[i].valid = 0;
    }
}

static Avail *avail_find(const Tac *t)
{
    int i;
    for (i = 0; i < navail; i++) {
        if (!avail[i].valid) continue;
        if (avail[i].op != t->op) continue;
        if (!same_operand(avail[i].a1, t->a1)) continue;
        if (!same_operand(avail[i].a2, t->a2)) continue;
        if (avail[i].i1 != t->i1 || avail[i].i2 != t->i2) continue;
        return &avail[i];
    }
    return NULL;
}

static void avail_add(const Tac *t)
{
    Avail *e;
    if (navail == availcap) {
        availcap = availcap ? availcap * 2 : 32;
        avail = (Avail *)xrealloc(avail, (size_t)availcap * sizeof *avail);
    }
    e = &avail[navail++];
    e->op    = t->op;
    e->a1    = t->a1;
    e->a2    = t->a2;
    e->i1    = t->i1;
    e->i2    = t->i2;
    e->dst   = t->dst;
    e->valid = 1;
}

static int pass_cse(void)
{
    int i, changed = 0;
    char before[128];

    avail_reset();

    for (i = 0; i < tac_count(); i++) {
        Tac *t = tac_at(i);
        Avail *hit;

        if (t->removed) continue;
        if (!tac_is_pure(t) || !t->dst) continue;

        /* A copy is not an expression worth remembering; copy propagation
         * handles those, and treating them here would just add noise. */
        if (t->op == TAC_COPY) {
            avail_kill(t->dst);
            continue;
        }

        hit = avail_find(t);
        if (hit) {
            tac_format(t, before, sizeof before);
            rewrite_to_copy(t, hit->dst);
            logf_("common subexpr   : %-28s -> %s = %s  (already computed)",
                  before, t->dst, hit->dst);
            stats.cse++;
            changed = 1;
            avail_kill(t->dst);
            continue;
        }

        avail_kill(t->dst);
        avail_add(t);
    }

    return changed;
}

/* --- pass 3: copy propagation -------------------------------------------- */

/* Only temporaries are propagated. Propagating through program variables would
 * also be correct here, but it erases the variable from the optimized listing,
 * and the listing is a deliverable: a reader should still see "X = t1". */
static int pass_copyprop(void)
{
    int i, j, changed = 0;

    for (i = 0; i < tac_count(); i++) {
        Tac *t = tac_at(i);
        const char *from, *to;

        if (t->removed) continue;
        if (t->op != TAC_COPY || !t->dst) continue;
        if (!tac_operand_is_temp(t->dst)) continue;

        from = t->dst;
        to   = t->a1;

        for (j = i + 1; j < tac_count(); j++) {
            Tac *u = tac_at(j);
            if (u->removed) continue;

            if (same_operand(u->a1, from)) { u->a1 = to; stats.copies++; changed = 1; }
            if (same_operand(u->a2, from)) { u->a2 = to; stats.copies++; changed = 1; }

            /* Stop at the first redefinition of either name: past that point
             * the substitution would no longer be the same value. */
            if (u->dst && (same_operand(u->dst, from) || same_operand(u->dst, to)))
                break;
        }
    }

    return changed;
}

/* --- pass 4: dead code elimination --------------------------------------- */

static const char **live = NULL;
static int nlive = 0;
static int livecap = 0;

static int is_live(const char *name)
{
    int i;
    for (i = 0; i < nlive; i++)
        if (same_operand(live[i], name)) return 1;
    return 0;
}

static void live_add(const char *name)
{
    if (!name) return;
    if (tac_operand_is_const(name, NULL)) return;
    if (tac_operand_is_literal(name, NULL)) return;
    if (is_live(name)) return;

    if (nlive == livecap) {
        livecap = livecap ? livecap * 2 : 32;
        live = (const char **)xrealloc(live, (size_t)livecap * sizeof *live);
    }
    live[nlive++] = name;
}

static void live_remove(const char *name)
{
    int i;
    for (i = 0; i < nlive; i++)
        if (same_operand(live[i], name)) {
            live[i] = live[--nlive];
            return;
        }
}

/* A single backward sweep is enough because the program is one basic block:
 * liveness at each point depends only on what comes after it.
 *
 * Nothing is live when the program ends. A MatrixLang program has no return
 * value and no observable state after the last statement, so the only thing
 * that keeps a computation alive is a print that consumes it -- which is
 * exactly why "X = A*B; X = C*D; print(X);" drops the first multiplication. */
static int pass_dce(void)
{
    int i, changed = 0;
    char before[128];

    nlive = 0;

    for (i = tac_count() - 1; i >= 0; i--) {
        Tac *t = tac_at(i);

        if (t->removed) continue;

        if (!tac_is_pure(t)) {          /* print */
            live_add(t->a1);
            continue;
        }

        if (t->dst && !is_live(t->dst)) {
            tac_format(t, before, sizeof before);
            t->removed = 1;
            logf_("dead code        : %-28s -> removed  (%s is never used)",
                  before, t->dst);
            stats.dead++;
            changed = 1;
            continue;
        }

        if (t->dst) live_remove(t->dst);
        live_add(t->a1);
        live_add(t->a2);
    }

    return changed;
}

/* --- driver -------------------------------------------------------------- */

void optimize_run(int passes)
{
    int round;

    stats.original = tac_live_count();

    /* Ten is a ceiling, not a target: each round only runs because the previous
     * one changed something, and the passes shrink the program monotonically,
     * so the loop terminates well before this in practice. */
    for (round = 0; round < 10; round++) {
        int changed = 0;

        if (passes & OPT_ALGEBRAIC) changed |= pass_algebraic();
        if (passes & OPT_CSE)       changed |= pass_cse();
        if (passes & OPT_COPYPROP)  changed |= pass_copyprop();
        if (passes & OPT_DCE)       changed |= pass_dce();

        stats.rounds = round + 1;
        if (!changed) break;
    }

    stats.optimized = tac_live_count();
}

void optimize_explain(FILE *out)
{
    int i;

    if (nlog == 0) {
        fprintf(out, "No transformation applied: the program was already "
                     "in its simplest form.\n");
        return;
    }

    for (i = 0; i < nlog; i++)
        fprintf(out, "  %s\n", log_lines[i]);
}

void optimize_report(FILE *out)
{
    double reduction = 0.0;

    if (stats.original > 0)
        reduction = 100.0 * (stats.original - stats.optimized) / stats.original;

    fprintf(out, "==================================================\n");
    fprintf(out, " MATRIXLANG OPTIMIZATION REPORT\n");
    fprintf(out, "==================================================\n\n");
    fprintf(out, "  Original TAC instructions   : %6d\n", stats.original);
    fprintf(out, "  Optimized TAC instructions  : %6d\n", stats.optimized);
    fprintf(out, "\n");
    fprintf(out, "  General optimizations\n");
    fprintf(out, "    Constant folds            : %6d\n", stats.const_folds);
    fprintf(out, "    Common subexpressions     : %6d\n", stats.cse);
    fprintf(out, "    Copies propagated         : %6d\n", stats.copies);
    fprintf(out, "    Dead instructions removed : %6d\n", stats.dead);
    fprintf(out, "\n");
    fprintf(out, "  Matrix-specific optimizations\n");
    fprintf(out, "    Identity operations       : %6d\n", stats.identity_ops);
    fprintf(out, "    Zero-matrix operations    : %6d\n", stats.zero_ops);
    fprintf(out, "    Double transposes         : %6d\n", stats.double_transpose);
    fprintf(out, "\n");
    fprintf(out, "  Passes to fixed point       : %6d\n", stats.rounds);
    fprintf(out, "  Instruction reduction       : %5.1f%%\n", reduction);
    fprintf(out, "==================================================\n");
}
