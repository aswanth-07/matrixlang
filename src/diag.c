#include "diag.h"

#include <stdarg.h>
#include <stdlib.h>
#include <string.h>

#include "util.h"

static Diag *diags = NULL;
static int   ndiags = 0;
static int   cap = 0;
static int   nerrors = 0;
static int   nwarnings = 0;

void diag_report(DiagLevel level, DiagPhase phase, int line, int col,
                 const char *fmt, ...)
{
    char buf[512];
    va_list ap;

    va_start(ap, fmt);
    vsnprintf(buf, sizeof buf, fmt, ap);
    va_end(ap);

    if (ndiags == cap) {
        cap = cap ? cap * 2 : 16;
        diags = (Diag *)xrealloc(diags, (size_t)cap * sizeof *diags);
    }
    diags[ndiags].level   = level;
    diags[ndiags].phase   = phase;
    diags[ndiags].line    = line;
    diags[ndiags].col     = col;
    diags[ndiags].message = xstrdup(buf);
    diags[ndiags].detail  = NULL;
    ndiags++;

    if (level == DIAG_ERROR) nerrors++;
    else                     nwarnings++;
}

void diag_detail(const char *fmt, ...)
{
    char buf[512];
    va_list ap;

    if (ndiags == 0) return;

    va_start(ap, fmt);
    vsnprintf(buf, sizeof buf, fmt, ap);
    va_end(ap);

    free(diags[ndiags - 1].detail);
    diags[ndiags - 1].detail = xstrdup(buf);
}

int diag_count(void) { return ndiags; }
const Diag *diag_at(int i) { return (i >= 0 && i < ndiags) ? &diags[i] : NULL; }
int diag_error_count(void) { return nerrors; }
int diag_warning_count(void) { return nwarnings; }

const char *diag_level_name(DiagLevel l)
{
    return l == DIAG_ERROR ? "error" : "warning";
}

const char *diag_phase_name(DiagPhase p)
{
    switch (p) {
    case DIAG_LEXICAL:  return "lexical";
    case DIAG_SYNTAX:   return "syntax";
    case DIAG_SEMANTIC: return "semantic";
    case DIAG_RUNTIME:  return "runtime";
    }
    return "?";
}

static int diag_cmp(const void *a, const void *b)
{
    const Diag *x = (const Diag *)a, *y = (const Diag *)b;
    if (x->line != y->line) return x->line - y->line;
    return x->col - y->col;
}

/* Prints one detail block indented under its message, preserving the newlines
 * the caller put in it. */
static void print_detail(FILE *out, const char *detail)
{
    const char *p = detail;
    while (*p) {
        const char *nl = strchr(p, '\n');
        int len = nl ? (int)(nl - p) : (int)strlen(p);
        fprintf(out, "        %.*s\n", len, p);
        if (!nl) break;
        p = nl + 1;
    }
}

void diag_print_all(FILE *out)
{
    int i;

    if (ndiags == 0) {
        fprintf(out, "No diagnostics. The program is valid MatrixLang.\n");
        return;
    }

    qsort(diags, (size_t)ndiags, sizeof *diags, diag_cmp);

    for (i = 0; i < ndiags; i++) {
        fprintf(out, "%d:%d: %s [%s] %s\n",
                diags[i].line, diags[i].col,
                diag_level_name(diags[i].level),
                diag_phase_name(diags[i].phase),
                diags[i].message);
        if (diags[i].detail) {
            print_detail(out, diags[i].detail);
            fputc('\n', out);
        }
    }
    fprintf(out, "%d error(s), %d warning(s).\n", nerrors, nwarnings);
}

void diag_free(void)
{
    int i;
    for (i = 0; i < ndiags; i++) {
        free(diags[i].message);
        free(diags[i].detail);
    }
    free(diags);
    diags = NULL;
    ndiags = cap = nerrors = nwarnings = 0;
}
