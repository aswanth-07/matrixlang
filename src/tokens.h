/* tokens.h -- a side-recording of the token stream.
 *
 * Bison pulls tokens one at a time and discards each once shifted, so after the
 * parse there is no stream left to display. Scanning the file twice would
 * report every lexical error twice, so instead the scanner appends each token
 * here on its way out. The Phase 1 demo -- source in, token table out -- is
 * then a byproduct of the parse rather than separate work.
 */
#ifndef MATRIXLANG_TOKENS_H
#define MATRIXLANG_TOKENS_H

#include <stdio.h>

typedef struct {
    int   code;
    char *category;   /* MATRIX, IDENTIFIER, LBRACKET, ... */
    char *lexeme;
    int   line;
    int   col;
} TokenRec;

void token_record(int code, const char *category, const char *lexeme,
                  int line, int col);

int  token_count(void);

void token_print_table(FILE *out);
void token_free(void);

#endif /* MATRIXLANG_TOKENS_H */
