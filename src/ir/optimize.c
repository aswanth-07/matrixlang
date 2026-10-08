#include "optimize.h"

#include <stdarg.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "chain.h"
#include "cost.h"
#include "facts.h"
#include "mutant.h"
#include "tac.h"
#include "util.h"
#include "value.h"

static OptStats stats;
static int contract_max = NG_BITWISE;   /* the weakest guarantee the contract accepts */
static int use_proofs = 1;

const char *num_guarantee_name(int level)
{
    switch (level) {
    case NG_BITWISE: return "bit-identical";
    case NG_BOUNDED: return "bound-preserving";
    default:         return "relaxed";
    }
}

static const char *contract_name(void)
{
    switch (contract_max) {
    case NG_BITWISE: return "strict";
    case NG_BOUNDED: return "bounded";
    default:         return "algebraic";
    }
}

const OptStats *optimize_stats(void) { return &stats; }

/* --- transformation log --------------------------------------------------- */

static char **log_lines = NULL;
static int    nlog = 0;
static int    logcap = 0;

static void log_add(const char *line)
{
    if (nlog == logcap) {
        logcap = logcap ? logcap * 2 : 16;
        log_lines = (char **)xrealloc(log_lines, (size_t)logcap * sizeof *log_lines);
    }
    log_lines[nlog++] = xstrdup(line);
}

static void logf_(const char *fmt, ...)
{
    char buf[400];
    va_list ap;

    va_start(ap, fmt);
    vsnprintf(buf, sizeof buf, fmt, ap);
    va_end(ap);
    log_add(buf);
}

/* A declined rewrite is seen again on every round of the fixed point, perhaps
 * with renamed operands; it is logged once per instruction and law. */
typedef struct { int instr; const char *law; } Refusal;

static Refusal *refusals = NULL;
static int      nrefusals = 0, refusalcap = 0;
static int      current_instr = -1;

static int refused_before(const char *law)
{
    int i;
    for (i = 0; i < nrefusals; i++)
        if (refusals[i].instr == current_instr && strcmp(refusals[i].law, law) == 0)
            return 1;
    if (nrefusals == refusalcap) {
        refusalcap = refusalcap ? refusalcap * 2 : 16;
        refusals = (Refusal *)xrealloc(refusals, (size_t)refusalcap * sizeof *refusals);
    }
    refusals[nrefusals].instr = current_instr;
    refusals[nrefusals].law = law;
    nrefusals++;
    return 0;
}

void optimize_free(void)
{
    int i;
    chain_reset();
    facts_free();
    for (i = 0; i < nlog; i++) free(log_lines[i]);
    free(log_lines);
    log_lines = NULL;
    nlog = logcap = 0;
    free(refusals);
    refusals = NULL;
    nrefusals = refusalcap = 0;
    memset(&stats, 0, sizeof stats);
}

/* --- value properties -----------------------------------------------------
 *
 * Structural properties of an operand beyond its shape: whether it is an
 * identity or a zero. They say which rewrite is *applicable*; the numerical
 * facts (facts.c) say which guarantee applying it keeps.
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

/* --- what each rewrite keeps ------------------------------------------------
 *
 * Each function returns the strongest guarantee the rewrite keeps for every
 * value the operands' facts admit, and says why in `why`. These are the IEEE
 * 754 side conditions of identities that hold unconditionally over the reals.
 */

/* x + 0 = x and x - 0 = x. They fail only on the sign of zero: in
 * round-to-nearest -0 + +0 = +0, while x - (+0) = x for every x. */
static int keeps_add_zero(Fact x, Fact zero, int is_sub, const char *xs,
                          char *why, size_t n)
{
    if (x.no_negzero || mutant_active(6)) {
        snprintf(why, n, "%s has no -0 entry", xs);
        return NG_BITWISE;
    }
    if (is_sub && zero.no_negzero) {
        snprintf(why, n, "x - (+0) = x for every x, including -0");
        return NG_BITWISE;
    }
    snprintf(why, n, "%s may hold -0, and -0 + 0 = +0", xs);
    return NG_BOUNDED;
}

/* A * I = A and I * A = A for a matrix product. Each entry is
 * +0 + a*1 + (sum of a'*0): exact for finite a, except that a = -0 becomes +0;
 * an infinite a' gives Inf*0 = NaN. x * 1 = x for scalars holds for every x. */
static int keeps_identity(Fact a, int matmul, const char *as, char *why, size_t n)
{
    int finite = a.finite || mutant_active(5);
    int no_negzero = a.no_negzero || mutant_active(4);

    if (!matmul) {
        snprintf(why, n, "x * 1 = x for every binary64 x, including -0 and infinities");
        return NG_BITWISE;
    }
    if (finite && no_negzero) {
        snprintf(why, n, "%s is finite and has no -0 entry", as);
        return NG_BITWISE;
    }
    if (finite) {
        snprintf(why, n, "%s may hold -0, which the product turns into +0", as);
        return NG_BOUNDED;
    }
    snprintf(why, n, "%s may hold Inf or NaN, and Inf * 0 = NaN in the product", as);
    return NG_RELAXED;
}

/* Anything times zero is zero. A matrix product starts each entry at +0, so
 * with finite operands the result is exactly +0. A scaling takes the sign of
 * each factor: 0 * -3 = -0. Inf * 0 = NaN in both. */
static int keeps_zero_product(Fact zero, Fact other, int matmul, const char *os,
                              char *why, size_t n)
{
    int finite = (other.finite || mutant_active(7)) && zero.finite;

    if (!finite) {
        snprintf(why, n, "%s may hold Inf or NaN, and Inf * 0 = NaN", os);
        return NG_RELAXED;
    }
    if (matmul) {
        snprintf(why, n, "%s is finite, and every product entry starts at +0", os);
        return NG_BITWISE;
    }
    if ((zero.nonneg && other.nonneg) || mutant_active(8)) {
        snprintf(why, n, "both factors are non-negative, so every product is +0");
        return NG_BITWISE;
    }
    snprintf(why, n, "a product with a negative factor is -0, not +0");
    return NG_BOUNDED;
}

/* --- applying or declining a rewrite -------------------------------------- */

/* The weakest guarantee in the dependency cone of the instruction being
 * rewritten, set by pass_algebraic before it tries a rule. A rewrite's proof
 * reads facts of its operands, and those facts may hold only because an
 * earlier, weaker rewrite produced them: 0 * (0 * X) is proved +0 only after
 * the inner product was rewritten to +0. When the rewrite also drops the
 * dependency, dead-code elimination would remove the weaker instruction and
 * its guarantee with it, so the result inherits the cone's level here. */
static int upstream_cert = NG_BITWISE;

static void record(Tac *t, int level, const char *law, const char *why)
{
    char line[320];

    if (level > t->cert) t->cert = level;
    if (upstream_cert > t->cert) t->cert = upstream_cert;
    if (use_proofs && why && !t->proof) {
        snprintf(line, sizeof line, "%s (%s)", law, why);
        t->proof = tac_intern(line);
    }
    if (level == NG_BITWISE)      stats.proved_bitwise++;
    else if (level == NG_BOUNDED) stats.kept_bound++;
    else                          stats.relaxed++;
}

/* Returns 1 when the contract admits a rewrite keeping `level`; otherwise logs
 * the refusal once and returns 0. */
static int admit(int level, const char *what, const char *before,
                 const char *law, const char *why)
{
    char line[400];

    if (!use_proofs) level = NG_RELAXED;
    if (level <= contract_max) return 1;

    snprintf(line, sizeof line, "declined         : %-28s  %s  (%s)",
             before, law, what);
    if (!refused_before(law)) {
        log_add(line);
        if (!use_proofs)
            logf_("                   proofs are disabled (--no-proofs)");
        else
            logf_("                   %s contract: %s; %s",
                  contract_name(), why,
                  level == NG_BOUNDED ? "--fp-bounded permits it"
                                      : "only --fp-algebraic permits it");
        stats.declined++;
    }
    return 0;
}

static void log_applied(const char *kind, const char *before, const char *after,
                        const char *law, int level, const char *why)
{
    if (!use_proofs) level = NG_RELAXED;
    logf_("%-17s: %-28s -> %s  (%s)", kind, before, after, law);
    if (use_proofs)
        logf_("                   %s: %s", num_guarantee_name(level), why);
    else
        logf_("                   relaxed: proofs are disabled (--no-proofs)");
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
        if (!isfinite(r)) return 0;
        snprintf(buf, sizeof buf, "%.17g", r);
        snprintf(what, whatsz, "%g", r);
        rewrite_to_copy(t, tac_intern(buf));
    }
    return 1;
}

static int is_zero_prop(Prop p) { return p == P_ZERO_MAT || p == P_SCALAR_ZERO; }

static int upstream_level(int idx);

static int pass_algebraic(void)
{
    int i, changed = 0;
    char before[128], why[256], after[128];

    env_reset();
    facts_analyze();

    for (i = 0; i < tac_count(); i++) {
        Tac *t = tac_at(i);
        Prop pa, pb;
        Prop result_prop = P_NONE;
        const char *trans_src = NULL;
        Fact fa, fb;
        int rewrote = 0;

        if (t->removed) continue;

        current_instr = i;
        tac_format(t, before, sizeof before);

        pa = operand_prop(t->a1);
        pb = operand_prop(t->a2);
        fa = facts_operand(i, 1);
        fb = facts_operand(i, 2);
        upstream_cert = upstream_level(i);

        switch (t->op) {
        case TAC_ADD:
        case TAC_SUB: {
            int is_sub = t->op == TAC_SUB;
            /* Scalar arithmetic on two constants is the same IEEE operation
             * the VM would perform, so folding it changes nothing. */
            if (tac_operand_is_const(t->a1, NULL) &&
                tac_operand_is_const(t->a2, NULL)) {
                char res[64];
                if (fold_scalar_constants(t, res, sizeof res)) {
                    logf_("constant folding : %-28s -> %s", before, res);
                    stats.const_folds++;
                    rewrote = 1;
                    break;
                }
            }
            /* X + 0 and X - 0 are X; 0 + X is X. The zero has X's shape, which
             * the semantic pass guaranteed for '+' and '-'.
             *
             * There is deliberately no `0 - x => -x` rule: +0 - +0 is +0 while
             * negating +0 gives -0, and it saves no arithmetic. Differential
             * testing found exactly that disagreement when the rule existed. */
            if (is_zero_prop(pb)) {
                const char *law = is_sub ? "x - 0 = x" : "x + 0 = x";
                int lvl = keeps_add_zero(fa, fb, is_sub, t->a1, why, sizeof why);
                snprintf(after, sizeof after, "%s = %s", t->dst, t->a1);
                if (admit(lvl, "zero operand", before, law, why)) {
                    log_applied("zero operand", before, after, law, lvl, why);
                    rewrite_to_copy(t, t->a1);
                    record(t, use_proofs ? lvl : NG_RELAXED, law, why);
                    stats.zero_ops++;
                    rewrote = 1;
                }
            } else if (!is_sub && is_zero_prop(pa)) {
                int lvl = keeps_add_zero(fb, fa, 0, t->a2, why, sizeof why);
                snprintf(after, sizeof after, "%s = %s", t->dst, t->a2);
                if (admit(lvl, "zero operand", before, "0 + x = x", why)) {
                    log_applied("zero operand", before, after, "0 + x = x", lvl, why);
                    rewrite_to_copy(t, t->a2);
                    record(t, use_proofs ? lvl : NG_RELAXED, "0 + x = x", why);
                    stats.zero_ops++;
                    rewrote = 1;
                }
            }
            break;
        }

        case TAC_MUL: {
            Type at = tac_operand_type(t->a1);
            Type bt = tac_operand_type(t->a2);
            int matmul = type_is_matmul(at, bt);

            if (tac_operand_is_const(t->a1, NULL) &&
                tac_operand_is_const(t->a2, NULL)) {
                char res[64];
                if (fold_scalar_constants(t, res, sizeof res)) {
                    logf_("constant folding : %-28s -> %s", before, res);
                    stats.const_folds++;
                    rewrote = 1;
                    break;
                }
            }

            /* Anything times zero: a zero of the shape the semantic pass
             * already computed. */
            if (is_zero_prop(pa) || is_zero_prop(pb)) {
                int zero_left = is_zero_prop(pa);
                Fact zf = zero_left ? fa : fb, of = zero_left ? fb : fa;
                const char *other = zero_left ? t->a2 : t->a1;
                int lvl = keeps_zero_product(zf, of, matmul, other, why, sizeof why);

                if (type_is_matrix(t->type))
                    snprintf(after, sizeof after, "%s = zeros(%d,%d)", t->dst,
                             t->type.rows, t->type.cols);
                else
                    snprintf(after, sizeof after, "%s = 0", t->dst);

                if (admit(lvl, "zero operand", before, "x * 0 = 0", why)) {
                    log_applied("zero operand", before, after, "x * 0 = 0", lvl, why);
                    if (type_is_matrix(t->type)) {
                        t->op = TAC_ZEROS;
                        t->i1 = t->type.rows;
                        t->i2 = t->type.cols;
                        t->a1 = t->a2 = NULL;
                    } else {
                        rewrite_to_copy(t, tac_intern("0"));
                    }
                    record(t, use_proofs ? lvl : NG_RELAXED, "x * 0 = 0", why);
                    stats.zero_ops++;
                    rewrote = 1;
                }
                break;
            }

            /* The identity rewrites. A * I is valid only when I is the right
             * size, and the semantic pass has already established that. */
            /* An identity matrix is a unit only for a matrix product: in a
             * scaling s * I it is an ordinary operand. */
            if (((pb == P_IDENTITY && matmul) || pb == P_SCALAR_ONE) ||
                ((pa == P_IDENTITY && matmul) || pa == P_SCALAR_ONE)) {
                int one_right = (pb == P_IDENTITY && matmul) || pb == P_SCALAR_ONE;
                const char *kept = one_right ? t->a1 : t->a2;
                Fact kf = one_right ? fa : fb;
                int is_mat_identity = matmul;
                int lvl = keeps_identity(kf, is_mat_identity, kept, why, sizeof why);
                const char *law = one_right
                    ? (is_mat_identity ? "x * I = x" : "x * 1 = x")
                    : (is_mat_identity ? "I * x = x" : "1 * x = x");

                snprintf(after, sizeof after, "%s = %s", t->dst, kept);
                if (admit(lvl, "identity operand", before, law, why)) {
                    log_applied("identity operand", before, after, law, lvl, why);
                    rewrite_to_copy(t, kept);
                    record(t, use_proofs ? lvl : NG_RELAXED, law, why);
                    stats.identity_ops++;
                    rewrote = 1;
                }
            }
            break;
        }

        case TAC_TRANS: {
            /* No arithmetic: transpose(transpose(x)) is x, bit for bit. */
            const char *inner = operand_trans_src(t->a1);
            if (inner) {
                rewrite_to_copy(t, inner);
                logf_("double transpose : %-28s -> %s = %s  "
                      "(transpose(transpose(x)) = x)",
                      before, t->dst, inner);
                stats.double_transpose++;
                rewrote = 1;
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
                    rewrote = 1;
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

        /* A rewrite can change what later operands may hold (a bound-
         * preserving rewrite may turn -0 into +0), so the facts are rebuilt
         * before the next instruction relies on them. */
        if (rewrote) {
            changed = 1;
            facts_analyze();
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

/* Evaluating the same expression twice on the same operands gives the same
 * bits, so CSE needs no numerical argument. */
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
 * and the listing is a deliverable: a reader should still see "X = t1".
 *
 * A use that now reads the copy's source inherits the copy's guarantee, so a
 * rewrite's effect is still visible after the copy itself is deleted. */
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
            int hit = 0;
            if (u->removed) continue;

            if (same_operand(u->a1, from)) { u->a1 = to; stats.copies++; changed = 1; hit = 1; }
            if (same_operand(u->a2, from)) { u->a2 = to; stats.copies++; changed = 1; hit = 1; }
            if (hit) {
                if (t->cert > u->cert) u->cert = t->cert;
                if (t->proof && !u->proof) u->proof = t->proof;
            }

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
 * liveness at each point depends only on what comes after it. Nothing is live
 * when the program ends; only a print keeps a computation alive. */
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
    stats.flops_before = cost_total();

    contract_max = (passes & OPT_RELAXED) ? NG_RELAXED
                 : (passes & OPT_BOUNDED) ? NG_BOUNDED : NG_BITWISE;
    use_proofs = (passes & OPT_NOPROOF) == 0;

    /* Chain re-bracketing runs first and once. It never changes the number of
     * instructions, so it cannot feed the instruction-shrinking passes; running
     * it first matters because it decides the shapes of the intermediate
     * results that the passes after it reason about. */
    if (passes & OPT_CHAIN) {
        int before_saved;
        stats.chains = chain_reorder(contract_max, use_proofs);
        stats.flops_chain = chain_flops_saved();
        stats.flops_declined = chain_flops_declined();
        before_saved = chain_count(NG_BITWISE);
        stats.proved_bitwise += before_saved;
        stats.kept_bound += chain_count(NG_BOUNDED);
        stats.relaxed += chain_count(NG_RELAXED);
        stats.declined += chain_declined();
    }

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
    stats.flops_after = cost_total();
}

void optimize_explain(FILE *out)
{
    int i;

    /* Chain re-bracketing is reported first because it runs first, and because
     * it is the transformation an instruction count cannot see at all. */
    chain_explain(out);

    if (nlog == 0 && stats.chains == 0 && chain_declined() == 0) {
        fprintf(out, "No transformation applied: the program was already "
                     "in its simplest form.\n");
        return;
    }

    for (i = 0; i < nlog; i++)
        fprintf(out, "  %s\n", log_lines[i]);
}

/* --- output guarantees ------------------------------------------------------ */

static int def_before(const char *name, int idx)
{
    int i;
    if (!name || tac_operand_is_const(name, NULL) || tac_operand_is_literal(name, NULL))
        return -1;
    for (i = idx - 1; i >= 0; i--) {
        Tac *t = tac_at(i);
        if (!t->removed && t->dst && same_operand(t->dst, name)) return i;
    }
    return -1;
}

#define MAX_PROOFS 12

typedef struct {
    int         level;
    int         nproofs;
    const char *proofs[MAX_PROOFS];
} Cone;

static void cone_add(Cone *c, const Tac *t)
{
    int k;
    if (t->cert > c->level) c->level = t->cert;
    if (!t->proof) return;
    for (k = 0; k < c->nproofs; k++)
        if (c->proofs[k] == t->proof) return;
    if (c->nproofs < MAX_PROOFS) c->proofs[c->nproofs++] = t->proof;
}

static void cone_walk(int idx, char *seen, Cone *c)
{
    Tac *t;
    int d;

    if (idx < 0 || seen[idx]) return;
    seen[idx] = 1;
    t = tac_at(idx);
    cone_add(c, t);

    d = def_before(t->a1, idx);
    cone_walk(d, seen, c);
    d = def_before(t->a2, idx);
    cone_walk(d, seen, c);
}

/* The weakest guarantee among the definitions instruction idx reads. */
static int upstream_level(int idx)
{
    int n = tac_count();
    char *seen = (char *)xcalloc((size_t)(n ? n : 1), 1);
    Tac *t = tac_at(idx);
    Cone c;

    memset(&c, 0, sizeof c);
    cone_walk(def_before(t->a1, idx), seen, &c);
    cone_walk(def_before(t->a2, idx), seen, &c);
    free(seen);
    return c.level;
}

void optimize_guarantees(FILE *out)
{
    int i, n = tac_count(), k = 0;
    char *seen = (char *)xcalloc((size_t)(n ? n : 1), 1);

    fprintf(out, "Contract: %s.", contract_name());
    switch (contract_max) {
    case NG_BITWISE:
        fprintf(out, " Every output must be bit-identical to the unoptimized program.\n");
        break;
    case NG_BOUNDED:
        fprintf(out, " Every output must keep the source order's worst-case error bound.\n");
        break;
    default:
        fprintf(out, " Rewrites valid over the reals are permitted.\n");
        break;
    }
    if (!use_proofs) fprintf(out, "Proofs are disabled (--no-proofs).\n");
    fprintf(out, "\n");

    for (i = 0; i < n; i++) {
        Tac *t = tac_at(i);
        Cone c;
        int j;

        if (t->removed || t->op != TAC_PRINT) continue;

        memset(seen, 0, (size_t)n);
        memset(&c, 0, sizeof c);
        cone_add(&c, t);
        cone_walk(def_before(t->a1, i), seen, &c);

        fprintf(out, "  %d. %-17s print(%s)\n", ++k, num_guarantee_name(c.level),
                t->label ? t->label : t->a1);
        if (c.nproofs == 0 && c.level == NG_BITWISE)
            fprintf(out, "       no value-changing rewrite reaches this output\n");
        for (j = 0; j < c.nproofs; j++)
            fprintf(out, "       - %s\n", c.proofs[j]);
        if (c.level == NG_BOUNDED)
            fprintf(out, "       values may differ from the unoptimized program "
                         "within the source-order error bound\n");
        if (c.level == NG_RELAXED)
            fprintf(out, "       values may differ: a rewrite valid only over the "
                         "reals reaches this output\n");
    }
    if (k == 0) fprintf(out, "  (the program prints nothing)\n");
    free(seen);
}

void optimize_report(FILE *out)
{
    double reduction = 0.0;
    char d[32];

    if (stats.original > 0)
        reduction = 100.0 * (stats.original - stats.optimized) / stats.original;

    fprintf(out, "==================================================\n");
    fprintf(out, " MATRIXLANG OPTIMIZATION REPORT\n");
    fprintf(out, "==================================================\n\n");
    fprintf(out, "  Numerical contract          : %s\n",
            contract_max == NG_RELAXED ? "algebraic (rounding/zero/NaN changes permitted)"
          : contract_max == NG_BOUNDED ? "bounded (source-order error bound kept)"
                                       : "strict (bit-identical output)");
    fprintf(out, "  Exactness proofs            : %s\n", use_proofs ? "on" : "off");
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
    fprintf(out, "    Product chains reordered  : %6d\n", stats.chains);
    fprintf(out, "    Identity operations       : %6d\n", stats.identity_ops);
    fprintf(out, "    Zero-matrix operations    : %6d\n", stats.zero_ops);
    fprintf(out, "    Double transposes         : %6d\n", stats.double_transpose);
    fprintf(out, "\n");
    fprintf(out, "  Numerical guarantees of value-changing rewrites\n");
    fprintf(out, "    Proved bit-identical      : %6d\n", stats.proved_bitwise);
    fprintf(out, "    Proved bound-preserving   : %6d\n", stats.kept_bound);
    fprintf(out, "    Relaxed (reals only)      : %6d\n", stats.relaxed);
    fprintf(out, "    Declined by the contract  : %6d\n", stats.declined);
    cost_format(stats.flops_declined, d, sizeof d);
    fprintf(out, "    Chain arithmetic declined : %14lld   (%s)\n", stats.flops_declined, d);
    fprintf(out, "\n");
    fprintf(out, "  Passes to fixed point       : %6d\n", stats.rounds);
    fprintf(out, "  Instruction reduction       : %5.1f%%\n", reduction);
    fprintf(out, "\n");
    fprintf(out, "  Arithmetic cost, in scalar floating-point operations.\n");
    fprintf(out, "  Instructions count lines; this counts work.\n\n");
    cost_report(out, stats.flops_before, stats.flops_after);
    fprintf(out, "==================================================\n");
}
