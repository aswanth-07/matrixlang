#include "util.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void oom(void)
{
    fprintf(stderr, "matrixc: out of memory\n");
    exit(70);
}

void *xmalloc(size_t n)
{
    void *p = malloc(n ? n : 1);
    if (!p) oom();
    return p;
}

void *xcalloc(size_t count, size_t size)
{
    void *p = calloc(count ? count : 1, size ? size : 1);
    if (!p) oom();
    return p;
}

void *xrealloc(void *p, size_t n)
{
    void *q = realloc(p, n ? n : 1);
    if (!q) oom();
    return q;
}

char *xstrdup(const char *s)
{
    size_t n;
    char *p;
    if (!s) return NULL;
    n = strlen(s) + 1;
    p = (char *)xmalloc(n);
    memcpy(p, s, n);
    return p;
}
