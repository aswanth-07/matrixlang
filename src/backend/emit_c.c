#include "emit_c.h"

#include <stdarg.h>
#include <stdlib.h>
#include <string.h>

#include "diag.h"
#include "facts.h"
#include "inputs.h"
#include "optimize.h"
#include "symtab.h"
#include "tac.h"
#include "types.h"
#include "util.h"
#include "value.h"

/* A product whose order of summation is free is emitted as dot products when
 * its output is narrow: at most four columns, or two when it has fewer than
 * four rows (the dot-product form transposes the right operand first). A wider
 * product is left in i-k-j form, which already vectorizes across the columns
 * without reassociation. The limits are where the dot-product form measured
 * faster for an inner dimension of 4,096 on the development machine. */
#define NARROW_OUTPUT 4

/* A sum of fewer terms than this gains nothing from vector lanes. */
#define LONG_SUM 16

static FILE *out;

static void line(const char *fmt, ...)
{
    va_list ap;
    va_start(ap, fmt);
    vfprintf(out, fmt, ap);
    va_end(ap);
    fputc('\n', out);
}

/* The runtime every emitted program carries. Written out verbatim. */
static const char *const runtime[] = {
    "#define _POSIX_C_SOURCE 199309L",
    "#include <math.h>",
    "#include <stdio.h>",
    "#include <stdlib.h>",
    "#include <string.h>",
    "#ifdef _WIN32",
    "#include <windows.h>",
    "static double ml_now(void)",
    "{",
    "    LARGE_INTEGER f, c;",
    "    QueryPerformanceFrequency(&f);",
    "    QueryPerformanceCounter(&c);",
    "    return (double)c.QuadPart / (double)f.QuadPart;",
    "}",
    "#else",
    "#include <time.h>",
    "static double ml_now(void)",
    "{",
    "    struct timespec t;",
    "    clock_gettime(CLOCK_MONOTONIC, &t);",
    "    return (double)t.tv_sec + 1e-9 * (double)t.tv_nsec;",
    "}",
    "#endif",
    "",
    "static double *ml_alloc(size_t n)",
    "{",
    "    double *p = (double *)calloc(n ? n : 1, sizeof(double));",
    "    if (!p) { fputs(\"out of memory\\n\", stderr); exit(1); }",
    "    return p;",
    "}",
    "",
    "static void ml_transpose(double *restrict t, const double *restrict a, int r, int c)",
    "{",
    "    int i, j;",
    "    for (i = 0; i < r; i++)",
    "        for (j = 0; j < c; j++) t[(size_t)j * r + i] = a[(size_t)i * c + j];",
    "}",
    "",
    "static void ml_print_matrix(const char *label, const double *a, int r, int c)",
    "{",
    "    int i, j;",
    "    printf(\"%s = Matrix<%dx%d>\\n\", label, r, c);",
    "    for (i = 0; i < r; i++) {",
    "        printf(\"  [\");",
    "        for (j = 0; j < c; j++) printf(\" %a\", a[(size_t)i * c + j]);",
    "        printf(\" ]\\n\");",
    "    }",
    "}",
    "",
    "static void ml_print_scalar(const char *label, double x)",
    "{",
    "    printf(\"%s = %a\\n\", label, x);",
    "}",
    NULL
};

/* --- names ------------------------------------------------------------------ */

typedef struct {
    const char *name;
    Type        type;
    int         temp;
    int         writes;        /* live instructions with this destination  */
    int         first_write;   /* instruction index, or -1                 */
    int         first_read;
    int         input;         /* aliases this input's buffer, or -1       */
} Name;

static Name *names;
static int   nnames, namecap;

static Name *name_find(const char *s)
{
    int i;
    for (i = 0; i < nnames; i++)
        if (names[i].name == s || strcmp(names[i].name, s) == 0) return &names[i];
    return NULL;
}

static int is_storage(const char *s)
{
    return s && !tac_operand_is_const(s, NULL) && !tac_operand_is_literal(s, NULL);
}

static Name *name_note(const char *s)
{
    Name *n;
    if (!is_storage(s)) return NULL;
    n = name_find(s);
    if (n) return n;
    if (nnames == namecap) {
        namecap = namecap ? namecap * 2 : 32;
        names = (Name *)xrealloc(names, (size_t)namecap * sizeof *names);
    }
    n = &names[nnames++];
    n->name = s;
    n->type = tac_operand_type(s);
    n->temp = tac_operand_is_temp(s);
    n->writes = 0;
    n->first_write = n->first_read = -1;
    n->input = -1;
    return n;
}

static int is_matrix_name(const char *s) { return type_is_matrix(tac_operand_type(s)); }

static int size_of(Type t) { return type_is_matrix(t) ? t.rows * t.cols : 1; }

/* A C identifier for a storage name. Program names are identifiers already;
 * the prefix keeps them clear of C keywords and of the runtime's names. */
static void cname(const char *s, char *buf, size_t n)
{
    size_t i, o = 0;
    o += (size_t)snprintf(buf, n, "v_");
    for (i = 0; s[i] && o + 1 < n; i++) {
        char c = s[i];
        buf[o++] = ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
                    (c >= '0' && c <= '9') || c == '_') ? c : '_';
    }
    buf[o] = '\0';
}

/* An operand as a C expression: a pointer for a matrix, a value for a scalar. */
static void expr(const char *s, char *buf, size_t n)
{
    double v;
    int id;

    if (tac_operand_is_const(s, &v)) {
        snprintf(buf, n, "(%a)", v);
        return;
    }
    if (tac_operand_is_literal(s, &id)) {
        const Value *lit = litpool_get(id);
        if (lit && lit->is_matrix) snprintf(buf, n, "lit_%d", id);
        else snprintf(buf, n, "(%a)", lit ? lit->scalar : 0.0);
        return;
    }
    cname(s, buf, n);
}

static int redefined_after(const char *s, int idx)
{
    int i;
    for (i = idx + 1; i < tac_count(); i++) {
        Tac *t = tac_at(i);
        if (!t->removed && t->dst && strcmp(t->dst, s) == 0) return 1;
    }
    return 0;
}

static void c_string(const char *s, char *buf, size_t n)
{
    size_t o = 0;
    for (; *s && o + 3 < n; s++) {
        if (*s == '"' || *s == '\\') buf[o++] = '\\';
        buf[o++] = (*s == '\n') ? ' ' : *s;
    }
    buf[o] = '\0';
}

/* --- reductions ---------------------------------------------------------------- */

typedef struct {
    int level;          /* NumGuarantee of reassociating this product's sums */
    int licensed;       /* admitted by the contract                          */
    const char *form;   /* "ordered", "reduce" or "dot"                       */
} Reduction;

static Reduction reduction_of(int idx, int max_level, int use_proofs)
{
    Tac *t = tac_at(idx);
    Type at = tac_operand_type(t->a1), bt = tac_operand_type(t->a2);
    Fact fa = facts_operand(idx, 1), fb = facts_operand(idx, 2);
    Reduction r;

    if (!use_proofs)                                       r.level = NG_RELAXED;
    else if (facts_product_reassociable(fa, fb, at.cols))  r.level = NG_BITWISE;
    else if (facts_product_range(fa, fb, at.cols))         r.level = NG_BOUNDED;
    else                                                   r.level = NG_RELAXED;

    r.licensed = max_level >= 0 && r.level <= max_level;
    if (!r.licensed || at.cols < LONG_SUM) r.form = "ordered";
    else if (at.rows == 1 && bt.cols == 1) r.form = "dot";
    else if (bt.cols <= 2 || (bt.cols <= NARROW_OUTPUT && at.rows >= 4)) r.form = "reduce";
    else                                   r.form = "ordered";
    return r;
}

static const char *reason_of(int level)
{
    switch (level) {
    case NG_BITWISE: return "every term and partial sum is exact, so every order gives the same bits";
    case NG_BOUNDED: return "no partial sum can overflow, so every order keeps the inner-product bound";
    default:         return "no fact bounds this product's sums";
    }
}

/* --- emission ------------------------------------------------------------------ */

/* Products are written out in place with literal sizes, so the C compiler
 * sees every trip count, including inside the functions OpenMP outlines, and
 * with restrict-qualified locals, since an instruction never writes an
 * operand (a destination that is also an operand goes to a scratch buffer). */
static void emit_product(int idx, const Reduction *r, const char *d, const char *a,
                         const char *b, Type at, Type bt)
{
    int m = at.rows, n = at.cols, p = bt.cols;
    double work = (double)m * n * p;

    line("    {");
    line("        double *restrict d_ = %s;", d);
    line("        const double *restrict a_ = %s;", a);
    if (strcmp(r->form, "dot") == 0) {
        /* One entry: its sum may be split across threads as well as lanes. */
        line("        const double *restrict b_ = %s;", b);
        line("        double acc = 0.0;");
        if (n > 32768)
            line("#pragma omp parallel for simd reduction(+:acc) schedule(static)");
        else
            line("#pragma omp simd reduction(+:acc)");
        line("        for (int k = 0; k < %d; k++) acc += a_[k] * b_[k];", n);
        line("        d_[0] = acc;");
    } else if (strcmp(r->form, "reduce") == 0) {
        /* Dot products over rows of a_ and rows of b transposed. */
        if (p == 1) {
            line("        const double *restrict b_ = %s;", b);
        } else {
            line("        ml_transpose(bt_%d, %s, %d, %d);", idx, b, n, p);
            line("        const double *restrict b_ = bt_%d;", idx);
        }
        if (work > 65536.0 && m > 1)
            line("#pragma omp parallel for schedule(static)");
        line("        for (int i = 0; i < %d; i++)", m);
        line("            for (int j = 0; j < %d; j++) {", p);
        line("                double acc = 0.0;");
        line("#pragma omp simd reduction(+:acc)");
        line("                for (int k = 0; k < %d; k++)", n);
        line("                    acc += a_[(size_t)i * %d + k] * b_[(size_t)j * %d + k];", n, n);
        line("                d_[(size_t)i * %d + j] = acc;", p);
        line("            }");
    } else {
        /* The machine's order: every entry summed from +0 over k ascending.
         * Rows are independent; the j loop vectorizes without reassociation. */
        line("        const double *restrict b_ = %s;", b);
        if (work > 65536.0 && m > 1)
            line("#pragma omp parallel for schedule(static)");
        line("        for (int i = 0; i < %d; i++) {", m);
        line("            double *restrict c_ = d_ + (size_t)i * %d;", p);
        line("            for (int j = 0; j < %d; j++) c_[j] = 0.0;", p);
        line("            for (int k = 0; k < %d; k++) {", n);
        line("                const double aik = a_[(size_t)i * %d + k];", n);
        line("                for (int j = 0; j < %d; j++) c_[j] += aik * b_[(size_t)k * %d + j];", p, p);
        line("            }");
        line("        }");
    }
    line("    }");
}

int emit_c(FILE *dst_file, const char *source_name, int max_level, int use_proofs)
{
    int i, k, nin = inputs_count();
    int products = 0, free_products = 0, by_level[3] = {0, 0, 0};
    char a[128], b[128], d[128], buf[256];
    static const char *level_word[] = { "bit-identical", "bound-preserving", "relaxed" };
    static const char *contract_word[] = { "strict", "bounded", "algebraic" };

    out = dst_file;
    nnames = 0;
    facts_analyze();

    /* Storage, reads and writes. */
    for (i = 0; i < tac_count(); i++) {
        Tac *t = tac_at(i);
        Name *n;
        if (t->removed) continue;
        if ((n = name_note(t->a1)) && n->first_read < 0) n->first_read = i;
        if ((n = name_note(t->a2)) && n->first_read < 0) n->first_read = i;
        if ((n = name_note(t->dst))) {
            n->writes++;
            if (n->first_write < 0) n->first_write = i;
        }
        if (t->op == TAC_MUL && type_is_matmul(tac_operand_type(t->a1), tac_operand_type(t->a2))) {
            Reduction r = reduction_of(i, max_level, use_proofs);
            products++;
            if (r.licensed) { free_products++; by_level[r.level]++; }
        }
    }
    /* An input that nothing else writes reads the loaded buffer directly. */
    for (i = 0; i < tac_count(); i++) {
        Tac *t = tac_at(i);
        Name *n;
        if (t->removed || t->op != TAC_INPUT) continue;
        n = name_find(t->dst);
        if (n && n->writes == 1 && type_is_matrix(n->type) &&
            (n->first_read < 0 || n->first_read > i))
            n->input = t->i1;
    }

    line("/* Generated by matrixc from %s.", source_name);
    if (max_level < 0)
        line(" * Every matrix product keeps the virtual machine's order of summation.");
    else
        line(" * Contract: %s%s. Products whose order of summation is free: %d of %d",
             contract_word[max_level], use_proofs ? "" : " (no proofs)", free_products, products);
    if (max_level >= 0)
        line(" * (bit-identical %d, bound-preserving %d, relaxed %d).",
             by_level[0], by_level[1], by_level[2]);
    line(" *");
    line(" * Build: gcc -std=c11 -O3 -ffp-contract=off [-fopenmp-simd | -fopenmp] prog.c -lm");
    line(" * Run:   prog INPUTS.bin [REPETITIONS]   (inputs from matrixc --dump-inputs)");
    line(" * Without OpenMP every pragma is ignored and every sum keeps the machine's");
    line(" * order. The outputs print as matrixc --exact-output prints them. */");
    for (k = 0; runtime[k]; k++) line("%s", runtime[k]);
    line("");

    /* Literals. */
    for (k = 0; k < litpool_count(); k++) {
        const Value *v = litpool_get(k);
        int e, cnt;
        if (!v || !v->is_matrix) continue;
        cnt = v->rows * v->cols;
        fprintf(out, "static const double lit_%d[%d] = {", k, cnt);
        for (e = 0; e < cnt; e++) fprintf(out, "%s%a", e ? ", " : " ", v->data[e]);
        line(" };");
    }

    /* Storage. */
    line("#define ML_NINPUTS %d", nin);
    line("static double *ml_in[ML_NINPUTS + 1];");
    for (i = 0; i < nnames; i++) {
        cname(names[i].name, d, sizeof d);
        line(type_is_matrix(names[i].type) ? "static double *%s;" : "static double %s;", d);
    }
    for (i = 0; i < tac_count(); i++) {
        Tac *t = tac_at(i);
        if (t->removed) continue;
        if (t->dst && ((t->a1 && strcmp(t->a1, t->dst) == 0) || (t->a2 && strcmp(t->a2, t->dst) == 0)) &&
            type_is_matrix(t->type))
            line("static double *x_%d;", i);
        if (t->op == TAC_MUL && type_is_matmul(tac_operand_type(t->a1), tac_operand_type(t->a2))) {
            Reduction r = reduction_of(i, max_level, use_proofs);
            if (strcmp(r.form, "reduce") == 0 && tac_operand_type(t->a2).cols > 1)
                line("static double *bt_%d;", i);
        }
        if (t->op == TAC_PRINT)
            line(is_matrix_name(t->a1) ? "static const double *p_%d;" : "static double p_%d;", i);
        if (t->op == TAC_PRINT && is_matrix_name(t->a1) && is_storage(t->a1) &&
            redefined_after(t->a1, i))
            line("static double *ps_%d;", i);
    }
    line("");

    /* Inputs: load, then check against the declared domains as the machine does. */
    line("static const int ml_in_size[ML_NINPUTS + 1] = {");
    for (k = 0; k < nin; k++) line("    %d,", size_of(inputs_get(k)->type));
    line("    0 };");
    line("");
    line("static int ml_load(const char *path)");
    line("{");
    line("    FILE *f = fopen(path, \"rb\");");
    line("    int t;");
    line("    if (!f) { fprintf(stderr, \"cannot open %%s\\n\", path); return 1; }");
    line("    for (t = 0; t < ML_NINPUTS; t++) {");
    line("        ml_in[t] = ml_alloc((size_t)ml_in_size[t]);");
    line("        if (fread(ml_in[t], sizeof(double), (size_t)ml_in_size[t], f) != (size_t)ml_in_size[t]) {");
    line("            fprintf(stderr, \"%%s holds too few values\\n\", path);");
    line("            fclose(f);");
    line("            return 1;");
    line("        }");
    line("    }");
    line("    if (fgetc(f) != EOF) { fprintf(stderr, \"%%s holds too many values\\n\", path); fclose(f); return 1; }");
    line("    fclose(f);");
    line("    return 0;");
    line("}");
    line("");
    line("static int ml_check(void)");
    line("{");
    line("    int i;");
    for (k = 0; k < nin; k++) {
        const InputSpec *s = inputs_get(k);
        const Domain *dm = &s->domain;
        int canon = dm->kind == DOM_INT || dm->lo >= 0.0;
        char nm[160];
        c_string(s->name, nm, sizeof nm);
        line("    for (i = 0; i < %d; i++) {   /* %s: %s */", size_of(s->type), nm, dm->name);
        line("        double x = ml_in[%d][i];", k);
        line("        if (!isfinite(x)) goto bad%d;", k);
        if (dm->kind == DOM_INT) line("        if (x != floor(x)) goto bad%d;", k);
        if (dm->bounded) line("        if (x < %a || x > %a) goto bad%d;", dm->lo, dm->hi, k);
        if (canon) line("        if (x == 0.0) ml_in[%d][i] = 0.0;", k);
        line("    }");
    }
    line("    return 0;");
    for (k = 0; k < nin; k++) {
        char nm[160];
        c_string(inputs_get(k)->name, nm, sizeof nm);
        line("bad%d:", k);
        line("    fprintf(stderr, \"input '%s' entry %%d is outside its declared domain\\n\", i + 1);", nm);
        line("    return 1;");
    }
    line("}");
    line("");

    /* Allocation, once. */
    line("static void ml_setup(void)");
    line("{");
    for (i = 0; i < nnames; i++) {
        if (!type_is_matrix(names[i].type)) continue;
        cname(names[i].name, d, sizeof d);
        if (names[i].input >= 0) line("    %s = ml_in[%d];", d, names[i].input);
        else line("    %s = ml_alloc(%d);", d, size_of(names[i].type));
    }
    for (i = 0; i < tac_count(); i++) {
        Tac *t = tac_at(i);
        if (t->removed) continue;
        if (t->dst && ((t->a1 && strcmp(t->a1, t->dst) == 0) || (t->a2 && strcmp(t->a2, t->dst) == 0)) &&
            type_is_matrix(t->type))
            line("    x_%d = ml_alloc(%d);", i, size_of(t->type));
        if (t->op == TAC_MUL && type_is_matmul(tac_operand_type(t->a1), tac_operand_type(t->a2))) {
            Reduction r = reduction_of(i, max_level, use_proofs);
            if (strcmp(r.form, "reduce") == 0 && tac_operand_type(t->a2).cols > 1)
                line("    bt_%d = ml_alloc(%d);", i, size_of(tac_operand_type(t->a2)));
        }
        if (t->op == TAC_PRINT && is_matrix_name(t->a1) && is_storage(t->a1) &&
            redefined_after(t->a1, i))
            line("    ps_%d = ml_alloc(%d);", i, size_of(tac_operand_type(t->a1)));
    }
    line("}");
    line("");

    /* The program. */
    line("static void ml_compute(void)");
    line("{");
    line("    size_t e;");
    line("    (void)e;");
    /* A declared variable read before any write holds the zero its
     * declaration created, on every run. */
    for (i = 0; i < nnames; i++) {
        Name *n = &names[i];
        if (n->temp || n->input >= 0) continue;
        if (n->first_read >= 0 && (n->first_write < 0 || n->first_read <= n->first_write)) {
            cname(n->name, d, sizeof d);
            if (type_is_matrix(n->type))
                line("    memset(%s, 0, %d * sizeof(double));", d, size_of(n->type));
            else
                line("    %s = 0.0;", d);
        }
    }
    for (i = 0; i < tac_count(); i++) {
        Tac *t = tac_at(i);
        Type at, bt, ty;
        int scratch, sz;
        char target[160];

        if (t->removed) continue;
        tac_format(t, buf, sizeof buf);
        ty = t->type;
        sz = size_of(ty);
        if (t->a1) expr(t->a1, a, sizeof a);
        if (t->a2) expr(t->a2, b, sizeof b);
        if (t->dst) expr(t->dst, d, sizeof d);
        scratch = t->dst && type_is_matrix(ty) &&
                  ((t->a1 && strcmp(t->a1, t->dst) == 0) || (t->a2 && strcmp(t->a2, t->dst) == 0));
        if (scratch) snprintf(target, sizeof target, "x_%d", i);
        else snprintf(target, sizeof target, "%s", d);

        switch (t->op) {
        case TAC_ADD:
        case TAC_SUB: {
            const char *op = t->op == TAC_ADD ? "+" : "-";
            line("    /* %s */", buf);
            if (type_is_matrix(ty))
                line("    for (e = 0; e < %d; e++) %s[e] = %s[e] %s %s[e];", sz, target, a, op, b);
            else
                line("    %s = %s %s %s;", d, a, op, b);
            break;
        }
        case TAC_MUL:
            at = tac_operand_type(t->a1);
            bt = tac_operand_type(t->a2);
            if (type_is_matmul(at, bt)) {
                Reduction r = reduction_of(i, max_level, use_proofs);
                if (max_level < 0)
                    line("    /* %s  (machine order) */", buf);
                else if (r.licensed)
                    line("    /* %s  order of summation free, %s: %s */", buf,
                         level_word[r.level], reason_of(r.level));
                else
                    line("    /* %s  order of summation kept: reassociating it would be %s */",
                         buf, level_word[r.level]);
                emit_product(i, &r, target, a, b, at, bt);
            } else if (type_is_matrix(at)) {
                line("    /* %s */", buf);
                line("    for (e = 0; e < %d; e++) %s[e] = %s[e] * %s;", sz, target, a, b);
            } else if (type_is_matrix(bt)) {
                line("    /* %s */", buf);
                line("    for (e = 0; e < %d; e++) %s[e] = %s[e] * %s;", sz, target, b, a);
            } else {
                line("    /* %s */", buf);
                line("    %s = %s * %s;", d, a, b);
            }
            break;
        case TAC_NEG:
            line("    /* %s */", buf);
            if (type_is_matrix(ty))
                line("    for (e = 0; e < %d; e++) %s[e] = %s[e] * -1.0;", sz, target, a);
            else
                line("    %s = -%s;", d, a);
            break;
        case TAC_TRANS:
            at = tac_operand_type(t->a1);
            line("    /* %s */", buf);
            line("    ml_transpose(%s, %s, %d, %d);", target, a, at.rows, at.cols);
            break;
        case TAC_COPY:
            line("    /* %s */", buf);
            if (type_is_matrix(ty)) {
                if (strcmp(a, d) != 0) line("    memcpy(%s, %s, %d * sizeof(double));", d, a, sz);
            } else {
                line("    %s = %s;", d, a);
            }
            break;
        case TAC_IDENTITY:
            line("    /* %s */", buf);
            line("    memset(%s, 0, %d * sizeof(double));", d, sz);
            line("    for (e = 0; e < %d; e++) %s[e * %d] = 1.0;", t->i1, d, t->i1 + 1);
            break;
        case TAC_ZEROS:
            line("    /* %s */", buf);
            line("    memset(%s, 0, %d * sizeof(double));", d, sz);
            break;
        case TAC_ONES:
            line("    /* %s */", buf);
            line("    for (e = 0; e < %d; e++) %s[e] = 1.0;", sz, d);
            break;
        case TAC_INPUT: {
            Name *n = name_find(t->dst);
            line("    /* %s */", buf);
            if (n && n->input >= 0)
                line("    /* reads the loaded buffer in place */");
            else if (type_is_matrix(ty))
                line("    memcpy(%s, ml_in[%d], %d * sizeof(double));", d, t->i1, sz);
            else
                line("    %s = ml_in[%d][0];", d, t->i1);
            break;
        }
        case TAC_PRINT:
            line("    /* %s */", buf);
            if (is_matrix_name(t->a1) && is_storage(t->a1) && redefined_after(t->a1, i)) {
                line("    memcpy(ps_%d, %s, %d * sizeof(double));", i, a,
                     size_of(tac_operand_type(t->a1)));
                line("    p_%d = ps_%d;", i, i);
            } else {
                line("    p_%d = %s;", i, a);
            }
            break;
        }
        if (scratch)
            line("    { double *sw = %s; %s = x_%d; x_%d = sw; }", d, d, i, i);
    }
    line("}");
    line("");

    line("static void ml_output(void)");
    line("{");
    for (i = 0; i < tac_count(); i++) {
        Tac *t = tac_at(i);
        char label[256];
        if (t->removed || t->op != TAC_PRINT) continue;
        c_string(t->label ? t->label : t->a1, label, sizeof label);
        if (is_matrix_name(t->a1)) {
            Type pt = tac_operand_type(t->a1);
            line("    ml_print_matrix(\"%s\", p_%d, %d, %d);", label, i, pt.rows, pt.cols);
        } else {
            line("    ml_print_scalar(\"%s\", p_%d);", label, i);
        }
    }
    line("}");
    line("");

    line("int main(int argc, char **argv)");
    line("{");
    line("    int reps = argc > 2 ? atoi(argv[2]) : 1, r;");
    line("    double t0, *times;");
    line("    if (reps < 1) reps = 1;");
    line("    if (ML_NINPUTS > 0) {");
    line("        if (argc < 2) { fprintf(stderr, \"usage: %%s INPUTS.bin [REPETITIONS]\\n\", argv[0]); return 2; }");
    line("        if (ml_load(argv[1])) return 1;");
    line("    }");
    line("    t0 = ml_now();");
    line("    if (ml_check()) return 1;");
    line("    fprintf(stderr, \"ml-check-ns %%.0f\\n\", (ml_now() - t0) * 1e9);");
    line("    ml_setup();");
    line("    times = ml_alloc((size_t)reps);");
    line("    for (r = 0; r < reps; r++) {");
    line("        t0 = ml_now();");
    line("        ml_compute();");
    line("        times[r] = ml_now() - t0;");
    line("    }");
    line("    ml_output();");
    line("    fprintf(stderr, \"ml-times-ns\");");
    line("    for (r = 0; r < reps; r++) fprintf(stderr, \" %%.0f\", times[r] * 1e9);");
    line("    fputc('\\n', stderr);");
    line("    return 0;");
    line("}");

    free(names);
    names = NULL;
    nnames = namecap = 0;
    return 0;
}

int emit_c_dump_inputs(const char *path)
{
    FILE *f;
    int k;

    if (inputs_load() != 0) return 1;
    f = fopen(path, "wb");
    if (!f) {
        diag_report(DIAG_ERROR, DIAG_RUNTIME, 0, 0, "cannot write '%s'", path);
        return 1;
    }
    for (k = 0; k < inputs_count(); k++) {
        const Value *v = inputs_value(k);
        if (!v) continue;
        if (v->is_matrix)
            fwrite(v->data, sizeof(double), (size_t)(v->rows * v->cols), f);
        else
            fwrite(&v->scalar, sizeof(double), 1, f);
    }
    fclose(f);
    return 0;
}
