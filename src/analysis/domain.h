/* domain.h -- declared value domains for program inputs.
 *
 * A MatrixLang input is declared with the set of values it may hold:
 *
 *     matrix A[100,2] = input(int8);
 *     matrix W[2,100] = input(int(0, 1000));
 *     matrix X[100,2] = input(real(1));
 *     scalar s        = input(real);
 *
 * The compiler never sees the values themselves. It sees the domain, and the
 * domain is what the optimizer's numerical facts are derived from: an int8
 * entry is an integer of magnitude at most 128, so a product chain over int8
 * inputs can be shown to need fewer than 53 significand bits at every step.
 *
 * The run-time loader checks every supplied value against its declared domain
 * before execution starts. That check is what makes the static facts sound: a
 * value outside the domain stops the program instead of invalidating a proof.
 */
#ifndef MATRIXLANG_DOMAIN_H
#define MATRIXLANG_DOMAIN_H

typedef enum {
    DOM_INT,     /* integers in [lo, hi]                     */
    DOM_REAL     /* finite values in [lo, hi], or any finite */
} DomainKind;

typedef struct {
    DomainKind kind;
    double     lo, hi;     /* inclusive bounds; for an unbounded real, -/+DBL_MAX */
    int        bounded;    /* DOM_REAL only: 0 means any finite value            */
    char       name[64];   /* the spelling used in listings, e.g. "int(0,1000)"  */
} Domain;

/* Integer domains are limited to |lo|, |hi| <= 2^53, the range in which every
 * integer is exactly representable in binary64. */
#define DOMAIN_INT_LIMIT 9007199254740992.0

/* Resolves a domain from its spelling and constant arguments. `nargs` is 0, 1
 * or 2. On failure returns 0 and writes a one-line reason into `why`. */
int domain_resolve(const char *name, int nargs, const double *args,
                   Domain *out, char *why, unsigned whysz);

/* The names accepted without arguments, for diagnostics. */
const char *domain_named_list(void);

/* True when `x` belongs to the domain. Integer domains require an integral
 * value; every domain requires a finite one. */
int domain_contains(const Domain *d, double x);

/* The canonical stored form of an admitted value. Integer and non-negative
 * domains have no negative zero, so -0 is stored as +0. */
double domain_canonical(const Domain *d, double x);

/* "integers in [-128, 127]" or "finite reals in [-1, 1]", for listings. */
void domain_describe(const Domain *d, char *buf, unsigned bufsz);

#endif /* MATRIXLANG_DOMAIN_H */
