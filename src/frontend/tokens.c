#include "tokens.h"

#include <stdlib.h>
#include <string.h>

#include "util.h"

static TokenRec *toks = NULL;
static int ntoks = 0;
static int cap = 0;

void token_record(int code, const char *category, const char *lexeme,
                  int line, int col)
{
    if (ntoks == cap) {
        cap = cap ? cap * 2 : 64;
        toks = (TokenRec *)xrealloc(toks, (size_t)cap * sizeof *toks);
    }
    toks[ntoks].code     = code;
    toks[ntoks].category = xstrdup(category);
    toks[ntoks].lexeme   = xstrdup(lexeme);
    toks[ntoks].line     = line;
    toks[ntoks].col      = col;
    ntoks++;
}

int token_count(void) { return ntoks; }

void token_print_table(FILE *out)
{
    int i;
    int last_line = -1;

    if (ntoks == 0) {
        fprintf(out, "(no tokens)\n");
        return;
    }

    fprintf(out, "%-4s  %-12s  %-16s  %s\n", "#", "TOKEN", "LEXEME", "LINE:COL");
    fprintf(out, "----  ------------  ----------------  --------\n");

    for (i = 0; i < ntoks; i++) {
        /* A blank line between source lines is the difference between a token
         * table you can read at a glance and one you have to count through. */
        if (last_line != -1 && toks[i].line != last_line) fputc('\n', out);
        last_line = toks[i].line;

        fprintf(out, "%-4d  %-12s  %-16s  %d:%d\n",
                i + 1, toks[i].category, toks[i].lexeme,
                toks[i].line, toks[i].col);
    }
    fprintf(out, "\n%d token(s).\n", ntoks);
}

void token_free(void)
{
    int i;
    for (i = 0; i < ntoks; i++) {
        free(toks[i].category);
        free(toks[i].lexeme);
    }
    free(toks);
    toks = NULL;
    ntoks = cap = 0;
}
