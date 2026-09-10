/* types.h -- the MatrixLang type lattice.
 *
 * The distinguishing feature of this language is that a type is not just a
 * name: a matrix type carries its shape. Matrix<2,3> and Matrix<3,2> are
 * different types, and almost every semantic rule in the language is a
 * statement about shapes. That is why this is a struct rather than an enum,
 * and why the shape rules live here rather than being scattered through the
 * analyser.
 */
#ifndef MATRIXLANG_TYPES_H
#define MATRIXLANG_TYPES_H

typedef enum {
    TK_UNKNOWN = 0,   /* not yet analysed                                    */
    TK_SCALAR,        /* a single number                                     */
    TK_MATRIX,        /* rows x cols                                         */
    TK_ERROR          /* poison: already reported, do not report again       */
} TypeKind;

typedef struct {
    TypeKind kind;
    int rows;   /* meaningful only when kind == TK_MATRIX */
    int cols;
} Type;

Type type_scalar(void);
Type type_matrix(int rows, int cols);
Type type_error(void);
Type type_unknown(void);

int type_is_scalar(Type t);
int type_is_matrix(Type t);
int type_is_error(Type t);
int type_is_usable(Type t);        /* scalar or matrix: safe to reason about */
int type_same(Type a, Type b);     /* same kind and, for matrices, same shape */

/* Renders "Scalar" or "Matrix<2x3>" into a caller-supplied buffer, so several
 * shapes can appear in one diagnostic without a static buffer clobbering
 * itself. */
const char *type_name(Type t, char *buf, unsigned bufsz);

/* --- the shape rules -----------------------------------------------------
 *
 * Each returns the result type, or TK_ERROR when the operands do not combine.
 * They report nothing themselves: the caller owns the diagnostic, because only
 * it knows the source position and the operand spelling.
 */
Type type_add(Type a, Type b);        /* a + b, a - b: identical shapes       */
Type type_mul(Type a, Type b);        /* a * b: cols(a) == rows(b), or scalar */
Type type_transpose(Type a);          /* Matrix<r,c> -> Matrix<c,r>           */
Type type_negate(Type a);             /* shape preserving                     */

/* True when a * b is a matrix product rather than a scaling. Codegen needs the
 * distinction and so does the optimizer. */
int type_is_matmul(Type a, Type b);
int type_is_scaling(Type a, Type b);

#endif /* MATRIXLANG_TYPES_H */
