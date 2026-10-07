#include "facts.h"

#include <float.h>
#include <math.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "inputs.h"
#include "mutant.h"
#include "symtab.h"
#include "tac.h"
#include "types.h"
#include "util.h"

#define UNIT_ROUNDOFF 0x1.0p-53

/* --- upward-rounded bound arithmetic ---------------------------------------
 *
 * Magnitude bounds must never be underestimated, so every bound computation
 * that may have rounded is moved up by one unit in the last place. A product
 * or sum that was exact is left alone, which keeps the exactness test sharp at
 * its boundary: an int8 chain needing exactly 53 bits is still accepted. */
static double up(double x) { return nextafter(x, INFINITY); }

static double mul_up(double a, double b)
{
    double p = a * b;
    if (a == 0.0 || b == 0.0) return 0.0;
    if (isinf(p)) return p;
    if (p < DBL_MIN) return DBL_MIN;            /* never let a bound underflow to 0 */
    if (fma(a, b, -p) > 0.0) p = up(p);
    return p;
}

static double add_up(double a, double b)
{
    double s = a + b, bb, err;
    if (isinf(s)) return s;
    bb  = s - a;
    err = (a - (s - bb)) + (b - bb);
    return err > 0.0 ? up(s) : s;
}

/* True when every multiple of 2^g of magnitude at most m is a binary64 value:
 * the count m / 2^g fits in 53 bits and the grid itself is representable. */
static int fits(double m, int g)
{
    if (m == 0.0) return 1;
    if (g < -1074) return 0;
    if (g + 53 >= 1024) return 1;
    if (mutant_active(3)) return m <= ldexp(1.0, g + 54);
    return m <= ldexp(1.0, g + 53);
}

static int ceil_log2(double m)
{
    int e;
    double f = frexp(m, &e);                    /* m = f * 2^e, f in [0.5, 1) */
    return f == 0.5 ? e - 1 : e;
}

/* The exponent of the lowest set bit of a finite non-zero x. */
static int trailing_exp(double x)
{
    int e, tz = 0;
    double f = frexp(fabs(x), &e);
    uint64_t s = (uint64_t)ldexp(f, 53);
    while (!(s & 1u)) { s >>= 1; tz++; }
    return e - 53 + tz;
}

/* --- elementary facts ------------------------------------------------------ */

Fact fact_unknown(void)
{
    Fact f;
    memset(&f, 0, sizeof f);
    return f;
}

Fact fact_zeros(void)
{
    Fact f;
    f.finite = 1;
    f.grid = FACT_GRID_ANY;
    f.mag = 0.0;
    f.nonneg = 1;
    f.no_negzero = 1;
    return f;
}

Fact fact_identity(void)
{
    Fact f = fact_zeros();
    f.grid = 0;
    f.mag = 1.0;
    return f;
}

Fact fact_ones(void) { return fact_identity(); }

static Fact fact_of_entries(const double *v, int n)
{
    Fact f = fact_zeros();
    int i;

    for (i = 0; i < n; i++) {
        double x = v[i];
        if (!isfinite(x)) return fact_unknown();
        if (x == 0.0) {
            if (signbit(x)) { f.no_negzero = 0; f.nonneg = 0; }
            continue;
        }
        if (x < 0.0) f.nonneg = 0;
        if (fabs(x) > f.mag) f.mag = fabs(x);
        {
            int te = trailing_exp(x);
            if (te < f.grid) f.grid = te;
        }
    }
    return f;
}

Fact fact_of_value(const Value *v)
{
    if (!v) return fact_unknown();
    if (v->is_matrix) return fact_of_entries(v->data, v->rows * v->cols);
    return fact_of_entries(&v->scalar, 1);
}

Fact fact_of_constant(double x) { return fact_of_entries(&x, 1); }

Fact fact_of_domain(const Domain *d)
{
    Fact f = fact_zeros();
    double m = fabs(d->lo) > fabs(d->hi) ? fabs(d->lo) : fabs(d->hi);

    if (!d->bounded) m = DBL_MAX;
    if (m == 0.0) return f;                     /* int(0,0): every value is +0 */

    f.mag = m;
    f.nonneg = d->lo >= 0.0;                    /* canonical storage has no -0 */
    if (d->kind == DOM_INT) {
        f.grid = 0;
        f.no_negzero = 1;
    } else {
        f.grid = -1074;                         /* every finite double lies on it */
        f.no_negzero = d->lo >= 0.0;
    }
    return f;
}

/* --- transfer functions ---------------------------------------------------- */

Fact fact_add(Fact a, Fact b)
{
    Fact r;
    int g;
    double m;

    if (!a.finite || !b.finite) return fact_unknown();

    g = a.grid < b.grid ? a.grid : b.grid;
    m = add_up(a.mag, b.mag);
    if (!fits(m, g)) m = mul_up(m, 1.0 + 2 * UNIT_ROUNDOFF);
    if (!(m <= DBL_MAX)) return fact_unknown();

    r.finite = 1;
    r.grid = m == 0.0 ? FACT_GRID_ANY : g;
    r.mag = m;
    r.nonneg = a.nonneg && b.nonneg;
    /* In round-to-nearest x + y is -0 only when both are -0. */
    r.no_negzero = a.no_negzero || b.no_negzero;
    return r;
}

Fact fact_sub(Fact a, Fact b)
{
    Fact r = fact_add(a, b);
    if (!r.finite) return r;
    /* x - y is -0 only when x is -0 and y is +0. */
    r.no_negzero = a.no_negzero;
    r.nonneg = a.nonneg && b.mag == 0.0;
    return r;
}

Fact fact_neg(Fact a)
{
    if (!a.finite) return a;
    a.nonneg = 0;
    a.no_negzero = mutant_active(9);            /* -(+0) is -0 */
    return a;
}

Fact fact_scale(Fact s, Fact m)
{
    Fact r;
    int g;
    double mag;

    if (!s.finite || !m.finite) return fact_unknown();

    r.finite = 1;
    r.nonneg = s.nonneg && m.nonneg;
    r.no_negzero = r.nonneg || mutant_active(9); /* a zero product takes the xor of signs */

    if (s.mag == 0.0 || m.mag == 0.0) {
        r.grid = FACT_GRID_ANY;
        r.mag = 0.0;
        return r;
    }

    g = s.grid + m.grid;
    mag = mul_up(s.mag, m.mag);
    if (!fits(mag, g)) mag = mul_up(mag, 1.0 + 2 * UNIT_ROUNDOFF);
    if (!(mag <= DBL_MAX)) return fact_unknown();

    r.grid = g < -1074 ? -1074 : g;
    r.mag = mag;
    return r;
}

Fact fact_matmul(Fact a, Fact b, int inner)
{
    Fact r;
    int g;
    double mag;

    if (!a.finite || !b.finite) return fact_unknown();

    /* The VM starts every accumulator at +0, and in round-to-nearest a running
     * sum that starts at +0 never becomes -0: a product entry is never -0. */
    r.finite = 1;
    r.no_negzero = 1;
    r.nonneg = a.nonneg && b.nonneg;

    if (a.mag == 0.0 || b.mag == 0.0) {
        r.grid = FACT_GRID_ANY;
        r.mag = 0.0;
        return r;
    }

    g = a.grid + b.grid;
    mag = mul_up(mul_up(a.mag, b.mag), (double)inner);
    if (!fits(mag, g))
        mag = mul_up(mag, 1.0 + 2.0 * inner * UNIT_ROUNDOFF);
    if (!(mag <= DBL_MAX)) return fact_unknown();

    r.grid = g < -1074 ? -1074 : g;
    r.mag = mag;
    return r;
}

int fact_bits(Fact f)
{
    if (!f.finite) return 9999;
    if (f.mag == 0.0) return 0;
    return ceil_log2(f.mag) - f.grid;
}

/* --- chains ---------------------------------------------------------------- */

/* The bound on every entry of operands a..b multiplied together, under any
 * bracketing and any summation order: |A_a|...|A_b| entrywise is at most the
 * product of the operands' magnitudes and the inner dimensions. */
static void sub_chain(const Fact *ops, const int *dim, int a, int b,
                      double *mag, int *grid)
{
    double m = ops[a].mag;
    long g = ops[a].grid;
    int t;

    for (t = a + 1; t <= b; t++) {
        m = mul_up(m, ops[t].mag);
        m = mul_up(m, (double)dim[t]);
        g += ops[t].grid;
    }
    *mag = m;
    *grid = (m == 0.0 || g > FACT_GRID_ANY) ? FACT_GRID_ANY : (int)g;
}

static void check_init(ChainCheck *why)
{
    why->ok = 1;
    why->bits = 0;
    why->first = why->last = -1;
    why->min_grid = FACT_GRID_ANY;
}

int facts_chain_exact(const Fact *ops, const int *dim, int k, ChainCheck *why)
{
    ChainCheck local;
    int a, b, t;

    if (!why) why = &local;
    check_init(why);

    for (t = 0; t < k; t++)
        if (!ops[t].finite) {
            why->ok = 0;
            why->bits = 9999;
            why->first = why->last = t;
            return 0;
        }

    for (a = 0; a < k; a++)
        for (b = a + 1; b < k; b++) {
            double m;
            int g, bits;
            if (mutant_active(2) && !(a == 0 && b == k - 1)) continue;
            sub_chain(ops, dim, a, b, &m, &g);
            if (m == 0.0) continue;
            if (g < why->min_grid) why->min_grid = g;
            bits = isinf(m) ? 9999 : ceil_log2(m) - g;
            if (!fits(m, g) || isinf(m)) {
                if (why->ok || bits > why->bits) {
                    why->bits = bits;
                    why->first = a;
                    why->last = b;
                }
                why->ok = 0;
            } else if (why->ok && bits > why->bits) {
                why->bits = bits;
                why->first = a;
                why->last = b;
            }
        }
    return why->ok;
}

int facts_chain_range(const Fact *ops, const int *dim, int k, ChainCheck *why)
{
    ChainCheck local;
    double limit = ldexp(1.0, 1020);
    int a, b, t;

    if (!why) why = &local;
    check_init(why);

    for (t = 0; t < k; t++)
        if (!ops[t].finite) {
            why->ok = 0;
            why->first = why->last = t;
            return 0;
        }

    for (a = 0; a < k; a++)
        for (b = a + 1; b < k; b++) {
            double m;
            int g;
            sub_chain(ops, dim, a, b, &m, &g);
            if (m == 0.0) continue;
            if (g < why->min_grid) why->min_grid = g;
            if (!(m <= limit)) {
                if (why->ok) { why->first = a; why->last = b; }
                why->ok = 0;
            }
        }
    return why->ok;
}

double facts_chain_bound(const int *dim, int k)
{
    double prod = 1.0;
    int t;
    for (t = 1; t < k; t++) {
        double pu = dim[t] * UNIT_ROUNDOFF;
        prod *= 1.0 + pu / (1.0 - pu);
    }
    return prod - 1.0;
}

/* --- the per-instruction pass ---------------------------------------------- */

typedef struct { const char *name; Fact f; } Binding;

static Binding *env = NULL;
static int      nenv = 0, envcap = 0;
static Fact    *fa = NULL, *fb = NULL;
static int      nfacts = 0;

static void env_set(const char *name, Fact f)
{
    int i;
    for (i = 0; i < nenv; i++)
        if (env[i].name == name || strcmp(env[i].name, name) == 0) {
            env[i].f = f;
            return;
        }
    if (nenv == envcap) {
        envcap = envcap ? envcap * 2 : 32;
        env = (Binding *)xrealloc(env, (size_t)envcap * sizeof *env);
    }
    env[nenv].name = name;
    env[nenv].f = f;
    nenv++;
}

static Fact operand_fact(const char *name)
{
    double v;
    int i, id;

    if (!name) return fact_unknown();
    if (tac_operand_is_const(name, &v)) return fact_of_constant(v);
    if (tac_operand_is_literal(name, &id)) return fact_of_value(litpool_get(id));

    for (i = 0; i < nenv; i++)
        if (env[i].name == name || strcmp(env[i].name, name) == 0)
            return env[i].f;

    /* A declared variable that no instruction has written yet holds the
     * zero value its declaration created. */
    if (sym_lookup(name)) return fact_zeros();
    return fact_unknown();
}

void facts_analyze(void)
{
    int i, n = tac_count();

    nenv = 0;
    if (n > nfacts) {
        fa = (Fact *)xrealloc(fa, (size_t)n * sizeof *fa);
        fb = (Fact *)xrealloc(fb, (size_t)n * sizeof *fb);
        nfacts = n;
    }

    for (i = 0; i < n; i++) {
        Tac *t = tac_at(i);
        Fact r = fact_unknown();

        fa[i] = fb[i] = fact_unknown();
        if (t->removed) continue;

        fa[i] = operand_fact(t->a1);
        fb[i] = operand_fact(t->a2);

        switch (t->op) {
        case TAC_ADD:   r = fact_add(fa[i], fb[i]); break;
        case TAC_SUB:   r = fact_sub(fa[i], fb[i]); break;
        case TAC_NEG:   r = fact_neg(fa[i]); break;
        case TAC_TRANS:
        case TAC_COPY:  r = fa[i]; break;
        case TAC_IDENTITY: r = fact_identity(); break;
        case TAC_ZEROS: r = fact_zeros(); break;
        case TAC_ONES:  r = fact_ones(); break;
        case TAC_INPUT: {
            const InputSpec *s = inputs_get(t->i1);
            r = s ? fact_of_domain(&s->domain) : fact_unknown();
            break;
        }
        case TAC_MUL: {
            Type at = tac_operand_type(t->a1);
            Type bt = tac_operand_type(t->a2);
            if (type_is_matmul(at, bt))      r = fact_matmul(fa[i], fb[i], at.cols);
            else if (type_is_matrix(at))     r = fact_scale(fb[i], fa[i]);
            else                             r = fact_scale(fa[i], fb[i]);
            break;
        }
        case TAC_PRINT:
            break;
        }

        if (t->dst) env_set(t->dst, r);
    }
}

Fact facts_operand(int instr, int which)
{
    if (instr < 0 || instr >= nfacts) return fact_unknown();
    return which == 2 ? fb[instr] : fa[instr];
}

void facts_free(void)
{
    free(env);
    env = NULL;
    nenv = envcap = 0;
    free(fa);
    free(fb);
    fa = fb = NULL;
    nfacts = 0;
}
