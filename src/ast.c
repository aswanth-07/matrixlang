#include "ast.h"

#include <stdlib.h>
#include <string.h>

#include "util.h"

Node *node_new(NodeKind kind, int line, int col)
{
    Node *n = (Node *)xmalloc(sizeof *n);
    memset(n, 0, sizeof *n);
    n->kind      = kind;
    n->line      = line;
    n->col       = col;
    n->type      = type_unknown();
    n->decl_type = type_unknown();
    return n;
}

Node *node_named(NodeKind kind, int line, int col, const char *name)
{
    Node *n = node_new(kind, line, col);
    n->name = xstrdup(name);
    return n;
}

Node *node_add(Node *parent, Node *child)
{
    if (!parent || !child) return parent;
    if (parent->nkids == parent->cap) {
        parent->cap = parent->cap ? parent->cap * 2 : 4;
        parent->kids = (Node **)xrealloc(parent->kids,
                                         (size_t)parent->cap * sizeof *parent->kids);
    }
    parent->kids[parent->nkids++] = child;
    return parent;
}

void node_free(Node *n)
{
    int i;
    if (!n) return;
    for (i = 0; i < n->nkids; i++) node_free(n->kids[i]);
    free(n->kids);
    free(n->name);
    free(n);
}

const char *ast_kind_name(NodeKind k)
{
    switch (k) {
    case N_PROGRAM:   return "Program";
    case N_DECL:      return "Declare";
    case N_ASSIGN:    return "Assign";
    case N_PRINT:     return "Print";
    case N_BINOP:     return "BinaryOp";
    case N_NEG:       return "Negate";
    case N_TRANSPOSE: return "Transpose";
    case N_IDENTITY:  return "Identity";
    case N_ZEROS:     return "Zeros";
    case N_ONES:      return "Ones";
    case N_MATLIT:    return "MatrixLiteral";
    case N_MATROW:    return "Row";
    case N_NUMBER:    return "Number";
    case N_IDENT:     return "Identifier";
    case N_EMPTY:     return "Empty";
    }
    return "Unknown";
}

/* Trims a double for display: 3.0 prints as 3, 2.5 stays 2.5. Matrix output is
 * unreadable when every entry carries six decimal places. */
static void fmt_number(double v, char *buf, size_t bufsz)
{
    snprintf(buf, bufsz, "%g", v);
}

static void node_label(const Node *n, char *buf, size_t bufsz)
{
    char payload[128];
    char shape[64];
    char typebuf[64];

    payload[0] = '\0';
    shape[0]   = '\0';

    switch (n->kind) {
    case N_DECL:
    case N_ASSIGN:
    case N_IDENT:
    case N_BINOP:
        if (n->name) snprintf(payload, sizeof payload, " %s", n->name);
        break;
    case N_NUMBER:
        payload[0] = ' ';
        fmt_number(n->dval, payload + 1, sizeof payload - 1);
        break;
    default:
        break;
    }

    if (type_is_usable(n->type))
        snprintf(shape, sizeof shape, " : %s", type_name(n->type, typebuf, sizeof typebuf));

    snprintf(buf, bufsz, "%s%s%s  (line %d)",
             ast_kind_name(n->kind), payload, shape, n->line);
}

static void print_rec(FILE *out, const Node *n, const char *prefix, int is_last,
                      int is_root)
{
    char label[256];
    char child_prefix[512];
    int i;

    if (!n) return;

    node_label(n, label, sizeof label);

    if (is_root) {
        fprintf(out, "%s\n", label);
        child_prefix[0] = '\0';
    } else {
        fprintf(out, "%s%s%s\n", prefix, is_last ? "`-- " : "|-- ", label);
        snprintf(child_prefix, sizeof child_prefix, "%s%s",
                 prefix, is_last ? "    " : "|   ");
    }

    for (i = 0; i < n->nkids; i++)
        print_rec(out, n->kids[i], child_prefix, i == n->nkids - 1, 0);
}

void ast_print(FILE *out, Node *root)
{
    if (!root) {
        fprintf(out, "(empty tree)\n");
        return;
    }
    print_rec(out, root, "", 1, 1);
}

/* Bounded, depth-limited rendering. Returns the number of characters written.
 * Anything deeper than a few levels is elided: the point is to identify the
 * operand, not to reproduce the program. */
static int expr_text_rec(const Node *n, char *buf, size_t bufsz, int depth)
{
    char lhs[128], rhs[128];

    if (!n || bufsz == 0) return 0;

    if (depth > 3) return snprintf(buf, bufsz, "...");

    switch (n->kind) {
    case N_IDENT:
        return snprintf(buf, bufsz, "%s", n->name ? n->name : "?");
    case N_NUMBER:
        return snprintf(buf, bufsz, "%g", n->dval);
    case N_BINOP:
        expr_text_rec(n->kids[0], lhs, sizeof lhs, depth + 1);
        expr_text_rec(n->kids[1], rhs, sizeof rhs, depth + 1);
        return snprintf(buf, bufsz, depth == 0 ? "%s %s %s" : "(%s %s %s)",
                        lhs, n->name, rhs);
    case N_NEG:
        expr_text_rec(n->kids[0], lhs, sizeof lhs, depth + 1);
        return snprintf(buf, bufsz, "-%s", lhs);
    case N_TRANSPOSE:
        expr_text_rec(n->kids[0], lhs, sizeof lhs, depth + 1);
        return snprintf(buf, bufsz, "transpose(%s)", lhs);
    case N_IDENTITY:
        return snprintf(buf, bufsz, "identity(...)");
    case N_ZEROS:
        return snprintf(buf, bufsz, "zeros(...)");
    case N_ONES:
        return snprintf(buf, bufsz, "ones(...)");
    case N_MATLIT:
        return snprintf(buf, bufsz, "{...}");
    default:
        return snprintf(buf, bufsz, "<%s>", ast_kind_name(n->kind));
    }
}

void ast_expr_text(const Node *n, char *buf, size_t bufsz)
{
    if (!buf || bufsz == 0) return;
    buf[0] = 0;
    expr_text_rec(n, buf, bufsz, 0);
}

int ast_node_count(Node *root)
{
    int i, total = 1;
    if (!root) return 0;
    for (i = 0; i < root->nkids; i++) total += ast_node_count(root->kids[i]);
    return total;
}

int ast_height(Node *root)
{
    int i, best = 0;
    if (!root) return 0;
    for (i = 0; i < root->nkids; i++) {
        int h = ast_height(root->kids[i]);
        if (h > best) best = h;
    }
    return best + 1;
}
