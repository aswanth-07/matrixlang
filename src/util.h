/* util.h -- allocation helpers that abort rather than return NULL.
 *
 * A compiler that has run out of memory has nothing useful to say, so the
 * check lives here once instead of at every allocation site.
 */
#ifndef MATRIXLANG_UTIL_H
#define MATRIXLANG_UTIL_H

#include <stddef.h>

void *xmalloc(size_t n);
void *xcalloc(size_t count, size_t size);
void *xrealloc(void *p, size_t n);
char *xstrdup(const char *s);

#endif /* MATRIXLANG_UTIL_H */
