/* inputs.h -- program inputs: declarations, supplied values, domain checks.
 *
 * The semantic pass registers every `input(domain)` declaration here. Values
 * arrive only when the program runs, from a file (--input NAME=PATH) or from a
 * seeded generator that draws from the declared domain (--random-inputs SEED).
 * Compilation and optimization never read them: every optimizer decision is
 * made from the declared domain alone, so the same compiled program is valid
 * for every input the domain admits.
 *
 * inputs_load() checks each value against its domain before execution starts.
 * A value outside the domain stops the run with a diagnostic naming the entry.
 */
#ifndef MATRIXLANG_INPUTS_H
#define MATRIXLANG_INPUTS_H

#include <stdio.h>

#include "domain.h"
#include "types.h"
#include "value.h"

typedef struct {
    const char *name;
    Type        type;
    Domain      domain;
    int         line;
    int         supplied;
    Value       value;
    char        source[64];   /* "file x.txt" or "random seed 7" */
} InputSpec;

int              inputs_add(const char *name, Type type, Domain domain, int line);
int              inputs_count(void);
const InputSpec *inputs_get(int id);

/* Requests recorded from the command line before the program is parsed. */
void inputs_request_file(const char *name, const char *path);
void inputs_request_random(unsigned long long seed);

/* Loads requested values and checks them. Returns 0 on success; reports a
 * runtime diagnostic and returns non-zero otherwise. */
int          inputs_load(void);
const Value *inputs_value(int id);

/* One line per input: name, shape, domain, and where its value came from. */
void inputs_print(FILE *out);

void inputs_free(void);

#endif /* MATRIXLANG_INPUTS_H */
