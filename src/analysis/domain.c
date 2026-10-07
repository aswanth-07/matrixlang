#include "domain.h"

#include <float.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

typedef struct {
    const char *name;
    double      lo, hi;
} NamedInt;

/* The fixed-width integer domains. These are the types numerical data most
 * often arrives in before it is converted to floating point: pixels, quantized
 * weights, adjacency flags, audio samples, counters. */
static const NamedInt named_ints[] = {
    { "bool",   0.0,            1.0           },
    { "uint8",  0.0,            255.0         },
    { "int8",   -128.0,         127.0         },
    { "uint16", 0.0,            65535.0       },
    { "int16",  -32768.0,       32767.0       },
    { "int32",  -2147483648.0,  2147483647.0  },
};

const char *domain_named_list(void)
{
    return "bool, uint8, int8, uint16, int16, int32, int(lo,hi), "
           "real, real(bound), real(lo,hi)";
}

static int is_whole(double x)
{
    return isfinite(x) && x == floor(x);
}

int domain_resolve(const char *name, int nargs, const double *args,
                   Domain *out, char *why, unsigned whysz)
{
    unsigned i;

    memset(out, 0, sizeof *out);

    for (i = 0; i < sizeof named_ints / sizeof named_ints[0]; i++) {
        if (strcmp(name, named_ints[i].name) != 0) continue;
        if (nargs != 0) {
            snprintf(why, whysz, "domain '%s' takes no arguments", name);
            return 0;
        }
        out->kind = DOM_INT;
        out->lo = named_ints[i].lo;
        out->hi = named_ints[i].hi;
        out->bounded = 1;
        snprintf(out->name, sizeof out->name, "%s", name);
        return 1;
    }

    if (strcmp(name, "int") == 0) {
        if (nargs != 2) {
            snprintf(why, whysz, "domain 'int' needs two bounds: int(lo,hi)");
            return 0;
        }
        if (!is_whole(args[0]) || !is_whole(args[1])) {
            snprintf(why, whysz, "the bounds of int(lo, hi) must be whole numbers");
            return 0;
        }
        if (fabs(args[0]) > DOMAIN_INT_LIMIT || fabs(args[1]) > DOMAIN_INT_LIMIT) {
            snprintf(why, whysz, "the bounds of int(lo, hi) must lie within "
                                 "+/-2^53, where every integer is representable");
            return 0;
        }
        if (args[0] > args[1]) {
            snprintf(why, whysz, "int(lo, hi) needs lo <= hi, got %g > %g",
                     args[0], args[1]);
            return 0;
        }
        out->kind = DOM_INT;
        out->lo = args[0] == 0.0 ? 0.0 : args[0];
        out->hi = args[1] == 0.0 ? 0.0 : args[1];
        out->bounded = 1;
        snprintf(out->name, sizeof out->name, "int(%.17g,%.17g)", out->lo, out->hi);
        return 1;
    }

    if (strcmp(name, "real") == 0) {
        out->kind = DOM_REAL;
        if (nargs == 0) {
            out->lo = -DBL_MAX;
            out->hi = DBL_MAX;
            out->bounded = 0;
            snprintf(out->name, sizeof out->name, "real");
            return 1;
        }
        if (nargs == 1) {
            if (!isfinite(args[0]) || args[0] <= 0.0) {
                snprintf(why, whysz, "the bound of real(bound) must be finite and positive");
                return 0;
            }
            out->lo = -args[0];
            out->hi = args[0];
            out->bounded = 1;
            snprintf(out->name, sizeof out->name, "real(%.17g)", args[0]);
            return 1;
        }
        if (!isfinite(args[0]) || !isfinite(args[1]) || args[0] > args[1]) {
            snprintf(why, whysz, "real(lo, hi) needs finite bounds with lo <= hi");
            return 0;
        }
        out->lo = args[0] == 0.0 ? 0.0 : args[0];
        out->hi = args[1] == 0.0 ? 0.0 : args[1];
        out->bounded = 1;
        snprintf(out->name, sizeof out->name, "real(%.17g,%.17g)", out->lo, out->hi);
        return 1;
    }

    snprintf(why, whysz, "unknown value domain '%s'", name);
    return 0;
}

int domain_contains(const Domain *d, double x)
{
    if (!isfinite(x)) return 0;
    if (d->kind == DOM_INT && x != floor(x)) return 0;
    if (!d->bounded) return 1;
    return x >= d->lo && x <= d->hi;
}

double domain_canonical(const Domain *d, double x)
{
    if (x == 0.0 && (d->kind == DOM_INT || d->lo >= 0.0)) return 0.0;
    return x;
}

void domain_describe(const Domain *d, char *buf, unsigned bufsz)
{
    if (d->kind == DOM_INT)
        snprintf(buf, bufsz, "integers in [%.17g, %.17g]", d->lo, d->hi);
    else if (!d->bounded)
        snprintf(buf, bufsz, "finite reals");
    else
        snprintf(buf, bufsz, "finite reals in [%.17g, %.17g]", d->lo, d->hi);
}
