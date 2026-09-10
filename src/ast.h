/* ast.h -- the abstract syntax tree the parser builds.
 *
 * One generic node struct with a child vector rather than a union of
 * per-construct structs. Four passes walk this tree -- semantic analysis, the
 * pretty printer, TAC generation, and the shape reporter -- and a uniform node
 * makes each of them one switch over NodeKind instead of a bespoke traversal
 * that has to be kept in step with the others.
 */
#ifndef MATRIXLANG_AST_H
#define MATRIXLANG_AST_H

#include <stddef.h>
#include <stdio.h>

#include "types.h"

typedef enum {
    N_PROGRAM,     /* kids: statements                                        */

    N_DECL,        /* name; decl_type carries the declared shape.
                    * kids: initialiser expression (0 or 1)                   */
    N_ASSIGN,      /* name; kids: value expression                            */
    N_PRINT,       /* kids: expression                                        */

    N_BINOP,       /* name: "+", "-", "*"; kids: left, right                  */
    N_NEG,         /* kids: operand                                           */
    N_TRANSPOSE,   /* kids: operand                                           */

    N_IDENTITY,    /* kids: size expression                                   */
    N_ZEROS,       /* kids: rows, cols                                        */
    N_ONES,        /* kids: rows, cols                                        */

    N_MATLIT,      /* kids: N_MATROW...                                       */
    N_MATROW,      /* kids: N_NUMBER...                                       */

    N_NUMBER,      /* dval                                                    */
    N_IDENT,       /* name                                                    */
    N_EMPTY        /* a statement dropped by error recovery                   */
} NodeKind;

typedef struct Node {
    NodeKind kind;
    int      line;
    int      col;

    char    *name;     /* identifier or operator spelling */
    double   dval;     /* N_NUMBER */

    /* N_DECL only: the shape written in the source. rows == -1 means the
     * declaration had no bracket list and the shape is inferred from the
     * initialiser. */
    Type     decl_type;
    int      has_dims;

    Type     type;     /* inferred by the semantic pass */

    /* Filled in by the semantic pass, which is the first place that can
     * evaluate them. N_MATLIT records where its data landed in the literal
     * pool; identity/zeros/ones record their folded dimensions so that later
     * phases never re-evaluate the argument expressions. */
    int      lit_id;
    int      d1, d2;

    struct Node **kids;
    int      nkids;
    int      cap;
} Node;

Node *node_new(NodeKind kind, int line, int col);
Node *node_named(NodeKind kind, int line, int col, const char *name);
Node *node_add(Node *parent, Node *child);
void  node_free(Node *n);

const char *ast_kind_name(NodeKind k);

/* Renders the tree with connectors, annotating every expression with the shape
 * the semantic pass inferred. Seeing Matrix<2x4> appear on an interior node is
 * the clearest evidence that dimension inference works. */
void ast_print(FILE *out, Node *root);

/* Renders an expression back into readable source text. Dimension errors are
 * far easier to act on when they name the operand -- "left : A * B" beats
 * "left operand". Deep trees are elided rather than truncated mid-token. */
void ast_expr_text(const Node *n, char *buf, size_t bufsz);

int ast_node_count(Node *root);
int ast_height(Node *root);

#endif /* MATRIXLANG_AST_H */
