/* diag.h -- one collection point for every message the compiler produces.
 *
 * The lexer, parser, semantic analyser and the runtime all report here rather
 * than printing directly. That is what lets messages come out ordered by source
 * position regardless of which pass found them, lets errors be counted so the
 * exit status means something, and keeps the wording in one place.
 */
#ifndef MATRIXLANG_DIAG_H
#define MATRIXLANG_DIAG_H

#include <stdio.h>

typedef enum { DIAG_ERROR, DIAG_WARNING } DiagLevel;

typedef enum {
    DIAG_LEXICAL,
    DIAG_SYNTAX,
    DIAG_SEMANTIC,
    DIAG_RUNTIME
} DiagPhase;

typedef struct {
    DiagLevel level;
    DiagPhase phase;
    int   line;
    int   col;
    char *message;
    char *detail;   /* optional multi-line explanation, printed indented */
} Diag;

void diag_report(DiagLevel level, DiagPhase phase, int line, int col,
                 const char *fmt, ...);

/* Attaches an indented explanation to the diagnostic just reported. Matrix
 * dimension errors are unreadable as a single line -- the reader needs to see
 * both operand shapes and the rule that was violated. */
void diag_detail(const char *fmt, ...);

int  diag_count(void);
const Diag *diag_at(int i);
int  diag_error_count(void);
int  diag_warning_count(void);

const char *diag_level_name(DiagLevel l);
const char *diag_phase_name(DiagPhase p);

void diag_print_all(FILE *out);
void diag_free(void);

#endif /* MATRIXLANG_DIAG_H */
