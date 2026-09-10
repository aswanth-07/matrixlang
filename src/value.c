#include "value.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

#include "util.h"

Value value_scalar(double v)
{
    Value r;
    memset(&r, 0, sizeof r);
    r.is_matrix = 0;
    r.scalar    = v;
    return r;
}

Value value_matrix(int rows, int cols)
{
    Value r;
    memset(&r, 0, sizeof r);
    r.is_matrix = 1;
    r.rows = rows;
    r.cols = cols;
    r.data = (double *)xcalloc((size_t)(rows * cols), sizeof(double));
    return r;
}

Value value_copy(Value v)
{
    Value r = v;
    if (v.is_matrix) {
        size_t n = (size_t)(v.rows * v.cols);
        r.data = (double *)xmalloc(n * sizeof(double));
        memcpy(r.data, v.data, n * sizeof(double));
    }
    return r;
}

void value_free(Value *v)
{
    if (v && v->is_matrix) {
        free(v->data);
        v->data = NULL;
    }
}

double value_get(const Value *m, int r, int c)
{
    return m->data[r * m->cols + c];
}

void value_set(Value *m, int r, int c, double x)
{
    m->data[r * m->cols + c] = x;
}

Value value_add(Value a, Value b)
{
    int i, n;
    Value r;

    if (!a.is_matrix && !b.is_matrix) return value_scalar(a.scalar + b.scalar);

    r = value_matrix(a.rows, a.cols);
    n = a.rows * a.cols;
    for (i = 0; i < n; i++) r.data[i] = a.data[i] + b.data[i];
    return r;
}

Value value_sub(Value a, Value b)
{
    int i, n;
    Value r;

    if (!a.is_matrix && !b.is_matrix) return value_scalar(a.scalar - b.scalar);

    r = value_matrix(a.rows, a.cols);
    n = a.rows * a.cols;
    for (i = 0; i < n; i++) r.data[i] = a.data[i] - b.data[i];
    return r;
}

Value value_matmul(Value a, Value b)
{
    int i, j, k;
    Value r = value_matrix(a.rows, b.cols);

    /* The textbook triple loop. MatrixLang is a compiler-construction project,
     * not a BLAS: a blocked or Strassen product would obscure the one thing
     * this function is here to demonstrate. */
    for (i = 0; i < a.rows; i++) {
        for (j = 0; j < b.cols; j++) {
            double sum = 0.0;
            for (k = 0; k < a.cols; k++)
                sum += value_get(&a, i, k) * value_get(&b, k, j);
            value_set(&r, i, j, sum);
        }
    }
    return r;
}

Value value_scale(Value m, double k)
{
    int i, n;
    Value r;

    if (!m.is_matrix) return value_scalar(m.scalar * k);

    r = value_matrix(m.rows, m.cols);
    n = m.rows * m.cols;
    for (i = 0; i < n; i++) r.data[i] = m.data[i] * k;
    return r;
}

Value value_transpose(Value a)
{
    int i, j;
    Value r = value_matrix(a.cols, a.rows);

    for (i = 0; i < a.rows; i++)
        for (j = 0; j < a.cols; j++)
            value_set(&r, j, i, value_get(&a, i, j));

    return r;
}

Value value_negate(Value a)
{
    if (!a.is_matrix) return value_scalar(-a.scalar);
    return value_scale(a, -1.0);
}

Value value_identity(int n)
{
    int i;
    Value r = value_matrix(n, n);
    for (i = 0; i < n; i++) value_set(&r, i, i, 1.0);
    return r;
}

Value value_zeros(int rows, int cols)
{
    return value_matrix(rows, cols);   /* xcalloc already zeroed it */
}

Value value_ones(int rows, int cols)
{
    int i, n = rows * cols;
    Value r = value_matrix(rows, cols);
    for (i = 0; i < n; i++) r.data[i] = 1.0;
    return r;
}

/* Entries are compared against exact 0 and 1 rather than with a tolerance.
 * These matrices come from literals and from identity()/zeros(), so their
 * entries are exact; an epsilon here would let a computed matrix that is
 * merely close to the identity silently change the program's meaning. */
int value_is_identity(const Value *v)
{
    int i, j;

    if (!v->is_matrix || v->rows != v->cols) return 0;

    for (i = 0; i < v->rows; i++)
        for (j = 0; j < v->cols; j++) {
            double want = (i == j) ? 1.0 : 0.0;
            if (value_get(v, i, j) != want) return 0;
        }
    return 1;
}

int value_is_zero(const Value *v)
{
    int i, n;

    if (!v->is_matrix) return v->scalar == 0.0;

    n = v->rows * v->cols;
    for (i = 0; i < n; i++)
        if (v->data[i] != 0.0) return 0;
    return 1;
}

/* Column-aligned so that a printed matrix looks like a matrix. */
void value_print(FILE *out, const Value *v)
{
    int i, j;
    int width = 1;
    char buf[64];

    if (!v->is_matrix) {
        fprintf(out, "%g\n", v->scalar);
        return;
    }

    for (i = 0; i < v->rows * v->cols; i++) {
        int len = snprintf(buf, sizeof buf, "%g", v->data[i]);
        if (len > width) width = len;
    }

    for (i = 0; i < v->rows; i++) {
        fprintf(out, "  [");
        for (j = 0; j < v->cols; j++)
            fprintf(out, " %*g", width, value_get(v, i, j));
        fprintf(out, " ]\n");
    }
}

void value_print_named(FILE *out, const char *name, const Value *v)
{
    if (v->is_matrix)
        fprintf(out, "%s = Matrix<%dx%d>\n", name, v->rows, v->cols);
    else
        fprintf(out, "%s = ", name);
    value_print(out, v);
}

/* --- literal pool -------------------------------------------------------- */

static Value *pool = NULL;
static int    npool = 0;
static int    poolcap = 0;

int litpool_add(Value v)
{
    if (npool == poolcap) {
        poolcap = poolcap ? poolcap * 2 : 8;
        pool = (Value *)xrealloc(pool, (size_t)poolcap * sizeof *pool);
    }
    pool[npool] = v;
    return npool++;
}

const Value *litpool_get(int id)
{
    return (id >= 0 && id < npool) ? &pool[id] : NULL;
}

int litpool_count(void) { return npool; }

void litpool_free(void)
{
    int i;
    for (i = 0; i < npool; i++) value_free(&pool[i]);
    free(pool);
    pool = NULL;
    npool = poolcap = 0;
}
