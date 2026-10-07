#include "inputs.h"

#include <ctype.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>

#include "diag.h"
#include "util.h"

static InputSpec *specs = NULL;
static int        nspecs = 0;
static int        speccap = 0;

typedef struct { char *name; char *path; } FileRequest;

static FileRequest *files = NULL;
static int          nfiles = 0;
static int          filecap = 0;

static int                have_seed = 0;
static unsigned long long random_seed = 0;

int inputs_add(const char *name, Type type, Domain domain, int line)
{
    InputSpec *s;

    if (nspecs == speccap) {
        speccap = speccap ? speccap * 2 : 8;
        specs = (InputSpec *)xrealloc(specs, (size_t)speccap * sizeof *specs);
    }
    s = &specs[nspecs];
    memset(s, 0, sizeof *s);
    s->name   = xstrdup(name);
    s->type   = type;
    s->domain = domain;
    s->line   = line;
    return nspecs++;
}

int inputs_count(void) { return nspecs; }

const InputSpec *inputs_get(int id)
{
    return (id >= 0 && id < nspecs) ? &specs[id] : NULL;
}

void inputs_request_file(const char *name, const char *path)
{
    if (nfiles == filecap) {
        filecap = filecap ? filecap * 2 : 4;
        files = (FileRequest *)xrealloc(files, (size_t)filecap * sizeof *files);
    }
    files[nfiles].name = xstrdup(name);
    files[nfiles].path = xstrdup(path);
    nfiles++;
}

void inputs_request_random(unsigned long long seed)
{
    have_seed = 1;
    random_seed = seed;
}

/* --- seeded generation ----------------------------------------------------
 *
 * splitmix64: small, well distributed, and identical on every platform, so a
 * seed names the same inputs everywhere. Each input gets its own stream keyed
 * by its declaration index, so adding an input does not shift the others. */
static unsigned long long mix(unsigned long long *state)
{
    unsigned long long z = (*state += 0x9E3779B97F4A7C15ULL);
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    return z ^ (z >> 31);
}

static double unit(unsigned long long *state)
{
    return (double)(mix(state) >> 11) * 0x1.0p-53;    /* [0, 1), 53 random bits */
}

static double draw(const Domain *d, unsigned long long *state)
{
    if (d->kind == DOM_INT) {
        unsigned long long span = (unsigned long long)(d->hi - d->lo) + 1ULL;
        return d->lo + (double)(mix(state) % span);
    }
    if (d->bounded) {
        double x = d->lo + (d->hi - d->lo) * unit(state);
        return x > d->hi ? d->hi : x;
    }
    /* An unbounded real domain has no natural distribution. Spread magnitudes
     * over 24 decades, the broad-value population the evaluation also uses. */
    {
        double sign = (mix(state) & 1ULL) ? -1.0 : 1.0;
        double mant = 0.1 + 9.8 * unit(state);
        int    expo = (int)(mix(state) % 25ULL) - 12;
        return sign * mant * pow(10.0, expo);
    }
}

static void fill_random(InputSpec *s, int id)
{
    unsigned long long state = random_seed * 0x2545F4914F6CDD1DULL + (unsigned long long)(id + 1);
    int i, n;

    if (type_is_matrix(s->type)) {
        s->value = value_matrix(s->type.rows, s->type.cols);
        n = s->type.rows * s->type.cols;
        for (i = 0; i < n; i++) s->value.data[i] = draw(&s->domain, &state);
    } else {
        s->value = value_scalar(draw(&s->domain, &state));
    }
    s->supplied = 1;
    snprintf(s->source, sizeof s->source, "random seed %llu", random_seed);
}

/* --- files ----------------------------------------------------------------
 *
 * A value file is a list of numbers in row-major order. Commas, braces,
 * brackets and semicolons are treated as separators, so a MatrixLang literal
 * such as {{1,2},{3,4}} is also a valid file. Hexadecimal floating-point
 * numbers (0x1.8p+1) are accepted, which is how exact values are exchanged. */
static int is_sep(int c)
{
    return isspace(c) || c == ',' || c == '{' || c == '}' || c == '[' ||
           c == ']' || c == ';';
}

static int read_file(InputSpec *s, const char *path)
{
    FILE *f = fopen(path, "rb");
    char *text;
    long len;
    int want, got = 0;
    char *p;

    if (!f) {
        diag_report(DIAG_ERROR, DIAG_RUNTIME, s->line, 1,
                    "cannot open the value file '%s' for input '%s'", path, s->name);
        return 0;
    }
    fseek(f, 0, SEEK_END);
    len = ftell(f);
    fseek(f, 0, SEEK_SET);
    text = (char *)xmalloc((size_t)len + 1);
    len = (long)fread(text, 1, (size_t)len, f);
    text[len] = '\0';
    fclose(f);

    want = type_is_matrix(s->type) ? s->type.rows * s->type.cols : 1;
    s->value = type_is_matrix(s->type) ? value_matrix(s->type.rows, s->type.cols)
                                       : value_scalar(0.0);

    p = text;
    for (;;) {
        char *end;
        double v;
        while (*p && is_sep((unsigned char)*p)) p++;
        if (!*p) break;
        v = strtod(p, &end);
        if (end == p) {
            diag_report(DIAG_ERROR, DIAG_RUNTIME, s->line, 1,
                        "value file '%s' for input '%s' contains a token that "
                        "is not a number", path, s->name);
            free(text);
            return 0;
        }
        if (got < want) {
            if (type_is_matrix(s->type)) s->value.data[got] = v;
            else                         s->value.scalar = v;
        }
        got++;
        p = end;
    }
    free(text);

    if (got != want) {
        diag_report(DIAG_ERROR, DIAG_RUNTIME, s->line, 1,
                    "value file '%s' holds %d number(s); input '%s' needs %d",
                    path, got, s->name, want);
        return 0;
    }
    s->supplied = 1;
    snprintf(s->source, sizeof s->source, "file %.58s", path);
    return 1;
}

static int check_domain(InputSpec *s)
{
    int i, n;
    double *v;

    if (type_is_matrix(s->type)) {
        n = s->type.rows * s->type.cols;
        v = s->value.data;
    } else {
        n = 1;
        v = &s->value.scalar;
    }

    for (i = 0; i < n; i++) {
        if (!domain_contains(&s->domain, v[i])) {
            char desc[96];
            domain_describe(&s->domain, desc, sizeof desc);
            if (type_is_matrix(s->type))
                diag_report(DIAG_ERROR, DIAG_RUNTIME, s->line, 1,
                            "input '%s' entry (%d,%d) = %.17g is outside its "
                            "declared domain %s", s->name, i / s->type.cols + 1,
                            i % s->type.cols + 1, v[i], s->domain.name);
            else
                diag_report(DIAG_ERROR, DIAG_RUNTIME, s->line, 1,
                            "input '%s' = %.17g is outside its declared domain %s",
                            s->name, v[i], s->domain.name);
            diag_detail("The domain admits %s. The optimizer's numerical\n"
                        "guarantees are proved for that domain, so a value\n"
                        "outside it is rejected before execution.", desc);
            return 0;
        }
        v[i] = domain_canonical(&s->domain, v[i]);
    }
    return 1;
}

int inputs_load(void)
{
    int i, j, ok = 1;

    for (j = 0; j < nfiles; j++) {
        int found = 0;
        for (i = 0; i < nspecs; i++)
            if (strcmp(specs[i].name, files[j].name) == 0) { found = 1; break; }
        if (!found) {
            diag_report(DIAG_ERROR, DIAG_RUNTIME, 0, 0,
                        "--input names '%s', which is not declared with input(...)",
                        files[j].name);
            ok = 0;
        }
    }
    if (!ok) return 1;

    for (i = 0; i < nspecs; i++) {
        InputSpec *s = &specs[i];
        const char *path = NULL;

        if (s->supplied) { value_free(&s->value); s->supplied = 0; }

        for (j = 0; j < nfiles; j++)
            if (strcmp(files[j].name, s->name) == 0) path = files[j].path;

        if (path) {
            if (!read_file(s, path)) { ok = 0; continue; }
        } else if (have_seed) {
            fill_random(s, i);
        } else {
            diag_report(DIAG_ERROR, DIAG_RUNTIME, s->line, 1,
                        "input '%s' has no value", s->name);
            diag_detail("Supply one with --input %s=FILE, or draw every input\n"
                        "from its domain with --random-inputs SEED.", s->name);
            ok = 0;
            continue;
        }
        if (!check_domain(s)) ok = 0;
    }
    return ok ? 0 : 1;
}

const Value *inputs_value(int id)
{
    const InputSpec *s = inputs_get(id);
    return (s && s->supplied) ? &s->value : NULL;
}

void inputs_print(FILE *out)
{
    int i;
    char desc[96], shape[32];

    if (nspecs == 0) return;
    fprintf(out, "\nInputs (values are supplied at run time and checked "
                 "against the declared domain):\n");
    for (i = 0; i < nspecs; i++) {
        const InputSpec *s = &specs[i];
        domain_describe(&s->domain, desc, sizeof desc);
        fprintf(out, "  %-12s %-14s %-18s %s\n", s->name,
                type_name(s->type, shape, sizeof shape), s->domain.name, desc);
    }
}

void inputs_free(void)
{
    int i;
    for (i = 0; i < nspecs; i++) {
        free((char *)specs[i].name);
        if (specs[i].supplied) value_free(&specs[i].value);
    }
    free(specs);
    specs = NULL;
    nspecs = speccap = 0;

    for (i = 0; i < nfiles; i++) { free(files[i].name); free(files[i].path); }
    free(files);
    files = NULL;
    nfiles = filecap = 0;
    have_seed = 0;
}
