#include "symtab.h"

#include <stdlib.h>
#include <string.h>

#include "util.h"

#define NBUCKETS 211

static Symbol *buckets[NBUCKETS];
static Symbol *order_head = NULL;
static Symbol *order_tail = NULL;
static int     total = 0;

/* djb2 */
static unsigned hash(const char *s)
{
    unsigned h = 5381u;
    while (*s) h = ((h << 5) + h) + (unsigned char)*s++;
    return h % NBUCKETS;
}

void sym_init(void)
{
    sym_free();
}

void sym_free(void)
{
    Symbol *s = order_head;
    while (s) {
        Symbol *next = s->order_next;
        free(s->name);
        free(s);
        s = next;
    }
    order_head = order_tail = NULL;
    total = 0;
    memset(buckets, 0, sizeof buckets);
}

Symbol *sym_lookup(const char *name)
{
    Symbol *s;
    for (s = buckets[hash(name)]; s; s = s->hash_next)
        if (strcmp(s->name, name) == 0) return s;
    return NULL;
}

Symbol *sym_insert(const char *name, Type type, int line, int col)
{
    Symbol *s;
    unsigned b;

    if (sym_lookup(name)) return NULL;

    s = (Symbol *)xcalloc(1, sizeof *s);
    s->name      = xstrdup(name);
    s->type      = type;
    s->decl_line = line;
    s->decl_col  = col;

    b = hash(name);
    s->hash_next = buckets[b];
    buckets[b] = s;

    if (order_tail) order_tail->order_next = s;
    else            order_head = s;
    order_tail = s;
    total++;

    return s;
}

int sym_count(void) { return total; }

Symbol *sym_index(int i)
{
    Symbol *s = order_head;
    while (s && i-- > 0) s = s->order_next;
    return s;
}

void sym_print_table(FILE *out)
{
    Symbol *s;

    if (!order_head) {
        fprintf(out, "(no symbols declared)\n");
        return;
    }

    fprintf(out, "+----------------+--------+------+------+----------+---------+--------+-------+\n");
    /* "Writes" rather than "Initialised": in MatrixLang a declaration always
     * initialises, so an Init column would read "yes" on every row and tell the
     * reader nothing. Writes and Reads are what actually vary. */
    fprintf(out, "| %-14s | %-6s | %-4s | %-4s | %-8s | %-7s | %-6s | %-5s |\n",
            "Name", "Kind", "Rows", "Cols", "Scope", "Decl@Ln", "Writes", "Reads");
    fprintf(out, "+----------------+--------+------+------+----------+---------+--------+-------+\n");

    for (s = order_head; s; s = s->order_next) {
        char rows[8], cols[8];

        if (type_is_matrix(s->type)) {
            snprintf(rows, sizeof rows, "%d", s->type.rows);
            snprintf(cols, sizeof cols, "%d", s->type.cols);
        } else {
            /* A scalar has no shape, and printing 0x0 would suggest it does. */
            snprintf(rows, sizeof rows, "-");
            snprintf(cols, sizeof cols, "-");
        }

        fprintf(out, "| %-14s | %-6s | %4s | %4s | %-8s | %7d | %6d | %5d |\n",
                s->name,
                type_is_matrix(s->type) ? "Matrix" : "Scalar",
                rows, cols,
                "global",
                s->decl_line,
                s->assigns,
                s->reads);
    }
    fprintf(out, "+----------------+--------+------+------+----------+---------+--------+-------+\n");
    fprintf(out, "%d symbol(s).\n", total);
}
