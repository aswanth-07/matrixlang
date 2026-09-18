#include "tac.h"

#include <ctype.h>
#include <stdlib.h>
#include <string.h>

#include "symtab.h"
#include "util.h"
#include "value.h"

/* --- interned operand strings -------------------------------------------
 *
 * Small programs, so a linear table is fine and keeps this readable. The point
 * of interning is lifetime, not speed: every operand pointer stays valid until
 * tac_free, so passes may copy operand pointers freely. */
static char **interns = NULL;
static int    ninterns = 0;
static int    interncap = 0;

const char *tac_intern(const char *s)
{
    int i;
    if (!s) return NULL;

    for (i = 0; i < ninterns; i++)
        if (strcmp(interns[i], s) == 0) return interns[i];

    if (ninterns == interncap) {
        interncap = interncap ? interncap * 2 : 32;
        interns = (char **)xrealloc(interns, (size_t)interncap * sizeof *interns);
    }
    interns[ninterns] = xstrdup(s);
    return interns[ninterns++];
}

/* --- instruction stream -------------------------------------------------- */

static Tac *code = NULL;
static int  ncode = 0;
static int  codecap = 0;

static int  next_temp = 1;

/* Temps are typed as they are created; nothing else records their shape. */
typedef struct { const char *name; Type type; } TempType;
static TempType *temps = NULL;
static int ntemps = 0;
static int tempcap = 0;

static void temp_record(const char *name, Type t)
{
    if (ntemps == tempcap) {
        tempcap = tempcap ? tempcap * 2 : 32;
        temps = (TempType *)xrealloc(temps, (size_t)tempcap * sizeof *temps);
    }
    temps[ntemps].name = name;
    temps[ntemps].type = t;
    ntemps++;
}

void tac_init(void)
{
    tac_free();
}

void tac_free(void)
{
    int i;
    for (i = 0; i < ninterns; i++) free(interns[i]);
    free(interns);
    interns = NULL;
    ninterns = interncap = 0;

    free(code);
    code = NULL;
    ncode = codecap = 0;
    next_temp = 1;

    free(temps);
    temps = NULL;
    ntemps = tempcap = 0;
}

static Tac *emit(TacOp op, const char *dst, const char *a1, const char *a2,
                 Type type, int line)
{
    Tac *t;

    if (ncode == codecap) {
        codecap = codecap ? codecap * 2 : 64;
        code = (Tac *)xrealloc(code, (size_t)codecap * sizeof *code);
    }
    t = &code[ncode++];
    memset(t, 0, sizeof *t);
    t->op   = op;
    t->dst  = dst;
    t->a1   = a1;
    t->a2   = a2;
    t->type = type;
    t->line = line;
    return t;
}

const char *tac_new_temp(Type t)
{
    char buf[32];
    const char *name;

    snprintf(buf, sizeof buf, "t%d", next_temp++);
    name = tac_intern(buf);
    temp_record(name, t);
    return name;
}

int  tac_count(void) { return ncode; }
Tac *tac_at(int i)   { return (i >= 0 && i < ncode) ? &code[i] : NULL; }

int tac_live_count(void)
{
    int i, n = 0;
    for (i = 0; i < ncode; i++) if (!code[i].removed) n++;
    return n;
}

int tac_is_pure(const Tac *t)
{
    return t->op != TAC_PRINT;
}

/* --- operand classification ---------------------------------------------- */

int tac_operand_is_const(const char *name, double *out)
{
    char *end;
    double v;

    if (!name || !*name) return 0;
    if (!(isdigit((unsigned char)name[0]) ||
          (name[0] == '-' && isdigit((unsigned char)name[1])) ||
          name[0] == '.'))
        return 0;

    v = strtod(name, &end);
    if (*end != '\0') return 0;
    if (out) *out = v;
    return 1;
}

int tac_operand_is_literal(const char *name, int *lit_id)
{
    if (!name || name[0] != '#') return 0;
    if (lit_id) *lit_id = atoi(name + 1);
    return 1;
}

int tac_operand_is_temp(const char *name)
{
    if (!name || name[0] != 't') return 0;
    return isdigit((unsigned char)name[1]) != 0;
}

Type tac_operand_type(const char *name)
{
    int i, id;
    Symbol *s;

    if (!name) return type_unknown();

    if (tac_operand_is_const(name, NULL)) return type_scalar();

    if (tac_operand_is_literal(name, &id)) {
        const Value *v = litpool_get(id);
        if (v && v->is_matrix) return type_matrix(v->rows, v->cols);
        return type_scalar();
    }

    for (i = 0; i < ntemps; i++)
        if (temps[i].name == name || strcmp(temps[i].name, name) == 0)
            return temps[i].type;

    s = sym_lookup(name);
    if (s) return s->type;

    return type_unknown();
}

/* --- formatting ---------------------------------------------------------- */

void tac_format(const Tac *t, char *buf, size_t bufsz)
{
    switch (t->op) {
    case TAC_ADD:      snprintf(buf, bufsz, "%s = %s + %s", t->dst, t->a1, t->a2); break;
    case TAC_SUB:      snprintf(buf, bufsz, "%s = %s - %s", t->dst, t->a1, t->a2); break;
    case TAC_MUL:      snprintf(buf, bufsz, "%s = %s * %s", t->dst, t->a1, t->a2); break;
    case TAC_NEG:      snprintf(buf, bufsz, "%s = -%s", t->dst, t->a1); break;
    case TAC_TRANS:    snprintf(buf, bufsz, "%s = transpose(%s)", t->dst, t->a1); break;
    case TAC_COPY:     snprintf(buf, bufsz, "%s = %s", t->dst, t->a1); break;
    case TAC_IDENTITY: snprintf(buf, bufsz, "%s = identity(%d)", t->dst, t->i1); break;
    case TAC_ZEROS:    snprintf(buf, bufsz, "%s = zeros(%d,%d)", t->dst, t->i1, t->i2); break;
    case TAC_ONES:     snprintf(buf, bufsz, "%s = ones(%d,%d)", t->dst, t->i1, t->i2); break;
    case TAC_PRINT:    snprintf(buf, bufsz, "print %s", t->a1); break;
    }
}

void tac_print(FILE *out, const char *title)
{
    int i, n = 0;
    char buf[256];
    char tbuf[64];

    if (title) fprintf(out, "%s\n\n", title);

    if (tac_live_count() == 0) {
        fprintf(out, "(no instructions)\n");
        return;
    }

    for (i = 0; i < ncode; i++) {
        if (code[i].removed) continue;
        tac_format(&code[i], buf, sizeof buf);
        /* The shape column is the reason this IR is worth reading: it shows
         * dimension inference surviving into the intermediate code. */
        fprintf(out, "  %3d  %-34s  %s\n", ++n, buf,
                type_is_usable(code[i].type)
                    ? type_name(code[i].type, tbuf, sizeof tbuf) : "");
    }
    fprintf(out, "\n%d instruction(s).\n", n);
}

/* --- generation ---------------------------------------------------------- */

static const char *gen_expr(Node *n);

/* Renders a numeric constant as an operand string. */
static const char *const_operand(double v)
{
    char buf[64];
    snprintf(buf, sizeof buf, "%g", v);
    return tac_intern(buf);
}

static const char *gen_binop(Node *n)
{
    const char *a = gen_expr(n->kids[0]);
    const char *b = gen_expr(n->kids[1]);
    const char *dst = tac_new_temp(n->type);
    TacOp op;

    if      (strcmp(n->name, "+") == 0) op = TAC_ADD;
    else if (strcmp(n->name, "-") == 0) op = TAC_SUB;
    else                                op = TAC_MUL;

    emit(op, dst, a, b, n->type, n->line);
    return dst;
}

static const char *gen_expr(Node *n)
{
    if (!n) return tac_intern("?");

    switch (n->kind) {
    case N_NUMBER:
        return const_operand(n->dval);

    case N_IDENT:
        return tac_intern(n->name);

    case N_MATLIT: {
        char buf[32];
        snprintf(buf, sizeof buf, "#%d", n->lit_id);
        return tac_intern(buf);
    }

    case N_BINOP:
        return gen_binop(n);

    case N_NEG: {
        const char *a = gen_expr(n->kids[0]);
        const char *dst = tac_new_temp(n->type);
        emit(TAC_NEG, dst, a, NULL, n->type, n->line);
        return dst;
    }

    case N_TRANSPOSE: {
        const char *a = gen_expr(n->kids[0]);
        const char *dst = tac_new_temp(n->type);
        emit(TAC_TRANS, dst, a, NULL, n->type, n->line);
        return dst;
    }

    case N_IDENTITY: {
        const char *dst = tac_new_temp(n->type);
        Tac *t = emit(TAC_IDENTITY, dst, NULL, NULL, n->type, n->line);
        t->i1 = n->d1;
        t->i2 = n->d2;
        return dst;
    }

    case N_ZEROS:
    case N_ONES: {
        const char *dst = tac_new_temp(n->type);
        Tac *t = emit(n->kind == N_ZEROS ? TAC_ZEROS : TAC_ONES,
                      dst, NULL, NULL, n->type, n->line);
        t->i1 = n->d1;
        t->i2 = n->d2;
        return dst;
    }

    default:
        return tac_intern("?");
    }
}

static void gen_stmt(Node *n)
{
    int i;

    if (!n) return;

    switch (n->kind) {
    case N_PROGRAM:
        for (i = 0; i < n->nkids; i++) gen_stmt(n->kids[i]);
        break;

    case N_DECL:
        /* A declaration with no initialiser emits nothing. The VM creates every
         * declared variable zero-filled at its declared shape, which is both
         * the natural default and what keeps the IR free of noise. */
        if (n->nkids == 1) {
            const char *src = gen_expr(n->kids[0]);
            emit(TAC_COPY, tac_intern(n->name), src, NULL, n->type, n->line);
        }
        break;

    case N_ASSIGN: {
        const char *src = gen_expr(n->kids[0]);
        emit(TAC_COPY, tac_intern(n->name), src, NULL, n->type, n->line);
        break;
    }

    case N_PRINT: {
        const char *src = gen_expr(n->kids[0]);
        char text[128];
        Tac *t;
        ast_expr_text(n->kids[0], text, sizeof text);
        t = emit(TAC_PRINT, NULL, src, NULL, n->kids[0]->type, n->line);
        t->label = tac_intern(text);
        break;
    }

    default:
        break;
    }
}

void tac_generate(Node *root)
{
    gen_stmt(root);
}
