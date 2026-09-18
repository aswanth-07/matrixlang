/* symtab.h -- the MatrixLang symbol table.
 *
 * One hash table, one scope. MatrixLang has no blocks and no functions -- a
 * deliberate language decision rather than a gap -- so there is no scope stack
 * to push, pop or walk. The printed table's Scope column reads "global" on
 * every row because that is the truth, not because the nesting is unfinished.
 *
 * The entry that matters is Type: for a matrix it carries rows and columns, so
 * the symbol table is what every dimension check ultimately consults.
 */
#ifndef MATRIXLANG_SYMTAB_H
#define MATRIXLANG_SYMTAB_H

#include <stdio.h>

#include "types.h"

typedef struct Symbol {
    char *name;
    Type  type;

    int   decl_line;
    int   decl_col;

    int   used;
    int   reads;
    int   assigns;

    struct Symbol *hash_next;
    struct Symbol *order_next;
} Symbol;

void sym_init(void);
void sym_free(void);

/* Inserts a new name. Returns NULL when the name already exists; the caller
 * looks the previous one up to report the duplicate. */
Symbol *sym_insert(const char *name, Type type, int line, int col);

Symbol *sym_lookup(const char *name);

int     sym_count(void);
Symbol *sym_index(int i);   /* declaration order */

void sym_print_table(FILE *out);

#endif /* MATRIXLANG_SYMTAB_H */
