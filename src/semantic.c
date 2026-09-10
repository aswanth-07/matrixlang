#include "semantic.h"

#include <math.h>
#include <stdio.h>
#include <string.h>

#include "diag.h"
#include "symtab.h"
#include "types.h"
#include "value.h"

static int errors_before;

static Type check_expr(Node *n);

/* ------------------------------------------------------ constant folding --
 *
 * Dimensions have to be known at compile time -- that is the whole premise of
 * the language -- so identity(n), zeros(r,c), ones(r,c) and matrix literal
 * entries accept only expressions that fold to a constant here. Identifiers
 * deliberately do not fold: MatrixLang has no constant variables, and pretending
 * otherwise would make a shape depend on a value the analyser cannot see.
 */
static int const_eval(const Node *n, double *out)
{
    double a, b;

    if (!n) return 0;

    switch (n->kind) {
    case N_NUMBER:
        *out = n->dval;
        return 1;

    case N_NEG:
        if (!const_eval(n->kids[0], &a)) return 0;
        *out = -a;
        return 1;

    case N_BINOP:
        if (!const_eval(n->kids[0], &a)) return 0;
        if (!const_eval(n->kids[1], &b)) return 0;
        if      (strcmp(n->name, "+") == 0) *out = a + b;
        else if (strcmp(n->name, "-") == 0) *out = a - b;
        else if (strcmp(n->name, "*") == 0) *out = a * b;
        else return 0;
        return 1;

    default:
        return 0;
    }
}

/* Folds an expression to a positive whole number, reporting precisely why it
 * could not. `what` names the argument, e.g. "the row count of zeros()". */
static int const_dim(const Node *n, const char *what, int *out)
{
    double v;

    if (!const_eval(n, &v)) {
        diag_report(DIAG_ERROR, DIAG_SEMANTIC, n->line, n->col,
                    "%s must be a constant known at compile time", what);
        diag_detail("MatrixLang decides every shape during compilation, so a\n"
                    "dimension cannot depend on a variable.");
        return 0;
    }
    if (v != floor(v)) {
        diag_report(DIAG_ERROR, DIAG_SEMANTIC, n->line, n->col,
                    "%s must be a whole number, got %g", what, v);
        return 0;
    }
    if (v < 1) {
        diag_report(DIAG_ERROR, DIAG_SEMANTIC, n->line, n->col,
                    "%s must be at least 1, got %g", what, v);
        return 0;
    }

    *out = (int)v;
    return 1;
}

/* ------------------------------------------------------- matrix literals -- */

static Type check_matlit(Node *n)
{
    int rows = n->nkids;
    int cols = -1;
    int i, j;
    Value m;

    if (rows == 0) {
        diag_report(DIAG_ERROR, DIAG_SEMANTIC, n->line, n->col,
                    "a matrix literal must have at least one row");
        return type_error();
    }

    /* Shape first: a ragged literal has no shape, so there is nothing to
     * evaluate and reporting an entry error as well would be noise. */
    for (i = 0; i < rows; i++) {
        Node *row = n->kids[i];
        if (cols < 0) {
            cols = row->nkids;
        } else if (row->nkids != cols) {
            diag_report(DIAG_ERROR, DIAG_SEMANTIC, row->line, row->col,
                        "row %d of this matrix literal has %d entries, "
                        "expected %d", i + 1, row->nkids, cols);
            diag_detail("Every row of a matrix literal must be the same length;\n"
                        "row 1 set the width at %d.", cols);
            return type_error();
        }
    }

    if (cols == 0) {
        diag_report(DIAG_ERROR, DIAG_SEMANTIC, n->line, n->col,
                    "a matrix literal row must have at least one entry");
        return type_error();
    }

    m = value_matrix(rows, cols);

    for (i = 0; i < rows; i++) {
        Node *row = n->kids[i];
        for (j = 0; j < cols; j++) {
            Node *e = row->kids[j];
            double v;
            if (!const_eval(e, &v)) {
                diag_report(DIAG_ERROR, DIAG_SEMANTIC, e->line, e->col,
                            "entry (%d,%d) of this matrix literal is not a "
                            "constant", i + 1, j + 1);
                diag_detail("Literal entries are evaluated at compile time, so\n"
                            "they may not refer to variables.");
                value_free(&m);
                return type_error();
            }
            value_set(&m, i, j, v);
            e->type = type_scalar();
        }
        row->type = type_matrix(1, cols);
    }

    n->lit_id = litpool_add(m);
    return type_matrix(rows, cols);
}

/* -------------------------------------------------------- the shape rules -- */

static Type check_binop(Node *n)
{
    Node *ln = n->kids[0], *rn = n->kids[1];
    Type lt = check_expr(ln);
    Type rt = check_expr(rn);
    Type result;
    char lbuf[64], rbuf[64], ltxt[128], rtxt[128];

    /* An operand that is already TY_ERROR has been reported once. Staying
     * silent about it here is what stops a single mistake from producing an
     * error at every operator above it. */
    if (type_is_error(lt) || type_is_error(rt)) return type_error();

    ast_expr_text(ln, ltxt, sizeof ltxt);
    ast_expr_text(rn, rtxt, sizeof rtxt);
    type_name(lt, lbuf, sizeof lbuf);
    type_name(rt, rbuf, sizeof rbuf);

    if (strcmp(n->name, "*") == 0) {
        result = type_mul(lt, rt);
        if (type_is_error(result)) {
            diag_report(DIAG_ERROR, DIAG_SEMANTIC, n->line, n->col,
                        "cannot multiply %s by %s", lbuf, rbuf);
            diag_detail("left   : %s -> %s\n"
                        "right  : %s -> %s\n"
                        "rule   : columns(left) must equal rows(right)\n"
                        "found  : %d != %d",
                        ltxt, lbuf, rtxt, rbuf, lt.cols, rt.rows);
        }
        return result;
    }

    /* '+' and '-' share a rule and therefore share a message. */
    result = type_add(lt, rt);
    if (type_is_error(result)) {
        const char *word = (strcmp(n->name, "+") == 0) ? "addition" : "subtraction";

        if (type_is_scalar(lt) != type_is_scalar(rt)) {
            diag_report(DIAG_ERROR, DIAG_SEMANTIC, n->line, n->col,
                        "cannot combine %s with %s using '%s'",
                        lbuf, rbuf, n->name);
            diag_detail("left   : %s -> %s\n"
                        "right  : %s -> %s\n"
                        "rule   : matrix %s needs a matrix on both sides\n"
                        "         (MatrixLang does not broadcast a scalar\n"
                        "          across a matrix)",
                        ltxt, lbuf, rtxt, rbuf, word);
        } else {
            diag_report(DIAG_ERROR, DIAG_SEMANTIC, n->line, n->col,
                        "matrix %s requires identical dimensions", word);
            diag_detail("left   : %s -> %s\n"
                        "right  : %s -> %s\n"
                        "rule   : rows and columns must match on both sides\n"
                        "found  : %dx%d against %dx%d",
                        ltxt, lbuf, rtxt, rbuf,
                        lt.rows, lt.cols, rt.rows, rt.cols);
        }
    }
    return result;
}

static Type check_expr(Node *n)
{
    if (!n) return type_error();

    switch (n->kind) {
    case N_NUMBER:
        n->type = type_scalar();
        return n->type;

    case N_IDENT: {
        Symbol *s = sym_lookup(n->name);
        if (!s) {
            diag_report(DIAG_ERROR, DIAG_SEMANTIC, n->line, n->col,
                        "use of undeclared variable '%s'", n->name);
            n->type = type_error();
            return n->type;
        }
        /* No use-before-initialisation warning: in MatrixLang a declaration
         * *is* an initialisation. "matrix A[2,3];" means a 2x3 matrix of
         * zeros, and the VM creates it that way, so reading A before any
         * assignment is defined behaviour rather than a mistake. */
        s->used = 1;
        s->reads++;
        n->type = s->type;
        return n->type;
    }

    case N_BINOP:
        n->type = check_binop(n);
        return n->type;

    case N_NEG:
        n->type = type_negate(check_expr(n->kids[0]));
        return n->type;

    case N_TRANSPOSE: {
        Type t = check_expr(n->kids[0]);
        if (type_is_error(t)) { n->type = type_error(); return n->type; }

        n->type = type_transpose(t);
        if (type_is_error(n->type)) {
            char buf[64], txt[128];
            ast_expr_text(n->kids[0], txt, sizeof txt);
            diag_report(DIAG_ERROR, DIAG_SEMANTIC, n->line, n->col,
                        "transpose() expects a matrix, got %s",
                        type_name(t, buf, sizeof buf));
            diag_detail("operand: %s -> %s\n"
                        "A scalar has no rows or columns to exchange.",
                        txt, buf);
        }
        return n->type;
    }

    case N_IDENTITY: {
        int size;
        if (!const_dim(n->kids[0], "the size of identity()", &size)) {
            n->type = type_error();
            return n->type;
        }
        n->d1 = n->d2 = size;
        n->kids[0]->type = type_scalar();
        n->type = type_matrix(size, size);
        return n->type;
    }

    case N_ZEROS:
    case N_ONES: {
        const char *fn = (n->kind == N_ZEROS) ? "zeros()" : "ones()";
        char what[64];
        int r, c;

        snprintf(what, sizeof what, "the row count of %s", fn);
        if (!const_dim(n->kids[0], what, &r)) { n->type = type_error(); return n->type; }

        snprintf(what, sizeof what, "the column count of %s", fn);
        if (!const_dim(n->kids[1], what, &c)) { n->type = type_error(); return n->type; }

        n->d1 = r;
        n->d2 = c;
        n->kids[0]->type = type_scalar();
        n->kids[1]->type = type_scalar();
        n->type = type_matrix(r, c);
        return n->type;
    }

    case N_MATLIT:
        n->type = check_matlit(n);
        return n->type;

    default:
        n->type = type_error();
        return n->type;
    }
}

/* --------------------------------------------------------- statements ---- */

/* Reports a shape that does not fit the destination it is being stored into.
 * Used by both declaration-with-initialiser and plain assignment, because the
 * rule and the wording are the same. */
static void report_store_mismatch(const char *name, Type want, Type got,
                                  Node *value, int line, int col,
                                  const char *context)
{
    char wbuf[64], gbuf[64], txt[128];

    ast_expr_text(value, txt, sizeof txt);
    type_name(want, wbuf, sizeof wbuf);
    type_name(got,  gbuf, sizeof gbuf);

    diag_report(DIAG_ERROR, DIAG_SEMANTIC, line, col,
                "%s '%s' expects %s but the expression produces %s",
                context, name, wbuf, gbuf);
    diag_detail("target     : %s -> %s\n"
                "expression : %s -> %s\n"
                "rule       : a value may only be stored into a variable of\n"
                "             exactly the same shape",
                name, wbuf, txt, gbuf);
}

static void check_decl(Node *n)
{
    Type    declared = n->decl_type;
    Type    init_type = type_unknown();
    Symbol *s;
    int     has_init = (n->nkids == 1);

    /* The initialiser is analysed before the name is inserted, so
     * "matrix A = A;" reports A as undeclared rather than reading itself. */
    if (has_init) init_type = check_expr(n->kids[0]);

    if (n->has_dims && type_is_matrix(declared)) {
        if (declared.rows < 1 || declared.cols < 1) {
            diag_report(DIAG_ERROR, DIAG_SEMANTIC, n->line, n->col,
                        "matrix '%s' declared with dimensions %dx%d; both must "
                        "be at least 1", n->name, declared.rows, declared.cols);
            declared = type_error();
        }
    }

    if (!n->has_dims) {
        /* "matrix C = <expr>;" -- the shape comes from the expression. */
        if (type_is_error(init_type)) {
            declared = type_error();
        } else if (!type_is_matrix(init_type)) {
            char buf[64];
            diag_report(DIAG_ERROR, DIAG_SEMANTIC, n->line, n->col,
                        "'matrix %s' is initialised with %s", n->name,
                        type_name(init_type, buf, sizeof buf));
            diag_detail("Declare it as 'scalar %s' instead, or give the\n"
                        "expression a matrix value.", n->name);
            declared = type_error();
        } else {
            declared = init_type;
        }
    } else if (has_init && type_is_usable(declared) && type_is_usable(init_type)) {
        if (!type_same(declared, init_type))
            report_store_mismatch(n->name, declared, init_type, n->kids[0],
                                  n->line, n->col, "declaration of");
    }

    s = sym_insert(n->name, declared, n->line, n->col);
    if (!s) {
        Symbol *prev = sym_lookup(n->name);
        diag_report(DIAG_ERROR, DIAG_SEMANTIC, n->line, n->col,
                    "duplicate declaration of '%s'", n->name);
        diag_detail("'%s' was already declared at line %d.",
                    n->name, prev ? prev->decl_line : 0);
        n->type = type_error();
        return;
    }

    n->type = declared;
    if (has_init) s->assigns++;
}

static void check_assign(Node *n)
{
    Type    vt = check_expr(n->kids[0]);
    Symbol *s  = sym_lookup(n->name);

    if (!s) {
        diag_report(DIAG_ERROR, DIAG_SEMANTIC, n->line, n->col,
                    "assignment to undeclared variable '%s'", n->name);
        diag_detail("Declare it first, for example:\n"
                    "    matrix %s[rows,cols];", n->name);
        n->type = type_error();
        return;
    }

    if (type_is_usable(s->type) && type_is_usable(vt) && !type_same(s->type, vt))
        report_store_mismatch(n->name, s->type, vt, n->kids[0],
                              n->line, n->col, "assignment to");

    s->assigns++;
    n->type = s->type;
}

static void check_stmt(Node *n)
{
    int i;

    if (!n) return;

    switch (n->kind) {
    case N_PROGRAM:
        for (i = 0; i < n->nkids; i++) check_stmt(n->kids[i]);
        break;

    case N_DECL:
        check_decl(n);
        break;

    case N_ASSIGN:
        check_assign(n);
        break;

    case N_PRINT: {
        Type t = check_expr(n->kids[0]);
        if (!type_is_error(t) && !type_is_usable(t))
            diag_report(DIAG_ERROR, DIAG_SEMANTIC, n->line, n->col,
                        "print() expects a scalar or a matrix");
        n->type = t;
        break;
    }

    case N_EMPTY:
        break;

    default:
        check_expr(n);
        break;
    }
}

/* Declared-but-never-read is the one check that must wait until the whole
 * program has been walked. */
static void report_unused(void)
{
    int i;
    for (i = 0; i < sym_count(); i++) {
        Symbol *s = sym_index(i);
        if (!s->used)
            diag_report(DIAG_WARNING, DIAG_SEMANTIC, s->decl_line, s->decl_col,
                        "'%s' is declared but never read", s->name);
    }
}

int semantic_check(Node *root)
{
    errors_before = diag_error_count();

    sym_init();
    check_stmt(root);
    report_unused();

    return diag_error_count() - errors_before;
}
