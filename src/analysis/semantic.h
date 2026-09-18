/* semantic.h -- name resolution, dimension inference and dimension checking.
 *
 * This is where MatrixLang earns its name. The pass walks the AST, populates
 * the symbol table with shapes, annotates every expression node with the shape
 * it produces, and rejects the operations whose shapes do not combine --
 * before a single element has been multiplied.
 */
#ifndef MATRIXLANG_SEMANTIC_H
#define MATRIXLANG_SEMANTIC_H

#include "ast.h"

/* Returns the number of semantic errors found. Diagnostics go to diag.c and
 * the symbol table is left populated for reporting. */
int semantic_check(Node *root);

#endif /* MATRIXLANG_SEMANTIC_H */
