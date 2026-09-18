#include "types.h"

#include <stdio.h>

Type type_scalar(void)
{
    Type t; t.kind = TK_SCALAR; t.rows = t.cols = 0; return t;
}

Type type_matrix(int rows, int cols)
{
    Type t; t.kind = TK_MATRIX; t.rows = rows; t.cols = cols; return t;
}

Type type_error(void)
{
    Type t; t.kind = TK_ERROR; t.rows = t.cols = 0; return t;
}

Type type_unknown(void)
{
    Type t; t.kind = TK_UNKNOWN; t.rows = t.cols = 0; return t;
}

int type_is_scalar(Type t) { return t.kind == TK_SCALAR; }
int type_is_matrix(Type t) { return t.kind == TK_MATRIX; }
int type_is_error(Type t)  { return t.kind == TK_ERROR; }

int type_is_usable(Type t)
{
    return t.kind == TK_SCALAR || t.kind == TK_MATRIX;
}

int type_same(Type a, Type b)
{
    if (a.kind != b.kind) return 0;
    if (a.kind != TK_MATRIX) return 1;
    return a.rows == b.rows && a.cols == b.cols;
}

const char *type_name(Type t, char *buf, unsigned bufsz)
{
    switch (t.kind) {
    case TK_SCALAR:  snprintf(buf, bufsz, "Scalar"); break;
    case TK_MATRIX:  snprintf(buf, bufsz, "Matrix<%dx%d>", t.rows, t.cols); break;
    case TK_ERROR:   snprintf(buf, bufsz, "<error>"); break;
    default:         snprintf(buf, bufsz, "<unknown>"); break;
    }
    return buf;
}

Type type_add(Type a, Type b)
{
    if (!type_is_usable(a) || !type_is_usable(b)) return type_error();

    if (type_is_scalar(a) && type_is_scalar(b)) return type_scalar();

    /* Deliberately no scalar-plus-matrix broadcasting. It would have to mean
     * "add to every element", which reads like matrix addition but is not, and
     * silently accepting it is how shape bugs survive to runtime. */
    if (type_is_scalar(a) || type_is_scalar(b)) return type_error();

    if (a.rows == b.rows && a.cols == b.cols) return type_matrix(a.rows, a.cols);

    return type_error();
}

Type type_mul(Type a, Type b)
{
    if (!type_is_usable(a) || !type_is_usable(b)) return type_error();

    if (type_is_scalar(a) && type_is_scalar(b)) return type_scalar();

    /* Scaling: a scalar on either side multiplies every element, and the shape
     * is unchanged. */
    if (type_is_scalar(a)) return type_matrix(b.rows, b.cols);
    if (type_is_scalar(b)) return type_matrix(a.rows, a.cols);

    /* The central rule of the language. */
    if (a.cols == b.rows) return type_matrix(a.rows, b.cols);

    return type_error();
}

Type type_transpose(Type a)
{
    if (type_is_matrix(a)) return type_matrix(a.cols, a.rows);
    /* transpose(scalar) is rejected rather than treated as a no-op: it is
     * almost always a sign the author thought the operand was a matrix. */
    return type_error();
}

Type type_negate(Type a)
{
    if (!type_is_usable(a)) return type_error();
    return a;
}

int type_is_matmul(Type a, Type b)
{
    return type_is_matrix(a) && type_is_matrix(b);
}

int type_is_scaling(Type a, Type b)
{
    return (type_is_scalar(a) && type_is_matrix(b)) ||
           (type_is_matrix(a) && type_is_scalar(b));
}
