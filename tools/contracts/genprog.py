"""Generate MatrixLang programs whose matrices are inputs with declared domains.

Programs are shape-correct by construction and reproducible from a seed. The
shape profiles are those of the earlier study (tools/gen_programs.py), so the
arithmetic each program performs is drawn from the same populations; what is
new is that every matrix is an `input(DOMAIN)` whose values the compiler never
sees, which is the setting in which a numerical contract is a proof obligation.

Value domains:
    bool uint8 int8 int16 int32   integer domains
    real                          real(1): finite values in [-1, 1]
    realx                         real: any finite value (no magnitude bound)
    mixed                         each matrix draws one of uint8, int8, int16, real(1)

The `algebraic` profile adds the expressions identity and zero rewrites act on,
together with negations and negative scalings that create -0 from +0 entries.
`literals` replaces inputs with literal values (dyadic or broad), which is the
population the earlier execution study used.
"""

import random

DOMAINS = ["bool", "uint8", "int8", "int16", "int32", "real", "realx", "mixed"]
DOMAIN_SPELLING = {
    "bool": "bool", "uint8": "uint8", "int8": "int8", "int16": "int16",
    "int32": "int32", "real": "real(1)", "realx": "real",
}
MIXED = ["uint8", "int8", "int16", "real"]
PROFILES = ["heterogeneous", "square", "narrow", "balanced", "elementwise", "algebraic"]

COST_DIMS = [1, 2, 3, 5, 8, 12, 20, 32, 50, 80, 120, 200]
EXEC_DIMS = [1, 2, 3, 5, 8, 12, 20]


class Program:
    def __init__(self, rng, mode="cost", profile="heterogeneous", domain="int8",
                 literals=None):
        self.rng = rng
        self.mode = mode
        self.profile = profile
        self.domain = domain
        self.literals = literals          # None, "dyadic" or "broad"
        self.square_dim = rng.choice([2, 8, 32, 120]) if profile == "square" else None
        self.lines = []
        self.mats = []                    # (name, rows, cols)
        self.scalars = []
        self.n = 0

    # -- shapes and names ---------------------------------------------------

    def dim(self):
        if self.profile == "square":
            return self.square_dim if self.mode == "cost" else self.rng.choice([2, 3, 5])
        if self.profile == "narrow":
            return self.rng.choice([8, 9, 10, 11, 12]) if self.mode == "cost" \
                else self.rng.choice([2, 3, 4])
        return self.rng.choice(COST_DIMS if self.mode == "cost" else EXEC_DIMS)

    def name(self, prefix):
        self.n += 1
        return f"{prefix}{self.n}"

    # -- declarations -------------------------------------------------------

    def literal(self, r, c):
        rows = []
        for _ in range(r):
            if self.literals == "broad":
                vals = ", ".join(format(self.rng.choice([-1, 1]) *
                                        self.rng.uniform(0.1, 9.9) *
                                        10 ** self.rng.randint(-12, 12), ".17g")
                                 for _ in range(c))
            else:
                vals = ", ".join(str(self.rng.randint(-3, 5)) for _ in range(c))
            rows.append("{" + vals + "}")
        return "{" + ", ".join(rows) + "}"

    def declare_matrix(self, r=None, c=None):
        r = r if r is not None else self.dim()
        c = c if c is not None else self.dim()
        nm = self.name("M")
        if self.literals:
            self.lines.append(f"matrix {nm}[{r},{c}] = {self.literal(r, c)};")
        else:
            d = self.domain if self.domain != "mixed" else self.rng.choice(MIXED)
            self.lines.append(f"matrix {nm}[{r},{c}] = input({DOMAIN_SPELLING[d]});")
        self.mats.append((nm, r, c))
        return nm, r, c

    def declare_scalar(self):
        nm = self.name("s")
        v = self.rng.choice(["2", "3", "0.5", "1.5", "-2"])
        self.lines.append(f"scalar {nm} = {v};")
        self.scalars.append(nm)
        return nm

    # -- expressions --------------------------------------------------------

    def pick(self, rows=None, cols=None, avoid=None):
        pool = [m for m in self.mats
                if (rows is None or m[1] == rows) and (cols is None or m[2] == cols)]
        if avoid is not None:
            distinct = [m for m in pool if m[0] not in avoid]
            if distinct:
                pool = distinct
        return self.rng.choice(pool) if pool else None

    def kinds(self):
        if self.profile == "elementwise":
            return ["add", "sub", "transpose", "scale", "var"]
        if self.profile == "balanced":
            return ["chain", "mul", "add", "sub", "transpose", "scale", "var"]
        if self.profile == "algebraic":
            return ["chain", "mul", "idmul", "zadd", "zmul", "one", "neg", "nscale",
                    "add", "transpose", "var"]
        return ["chain", "chain", "chain", "mul", "mul", "add", "sub", "transpose",
                "scale", "var"]

    def expr(self, depth):
        """Returns (text, rows, cols)."""
        if depth <= 0:
            nm, r, c = self.rng.choice(self.mats)
            return nm, r, c

        kind = self.rng.choice(self.kinds())

        if kind == "var":
            nm, r, c = self.rng.choice(self.mats)
            return nm, r, c

        if kind in ("add", "sub"):
            a, r, c = self.expr(depth - 1)
            other = self.pick(r, c, avoid=a)
            if other is None:
                return a, r, c
            return f"({a} {'+' if kind == 'add' else '-'} {other[0]})", r, c

        if kind == "mul":
            a, r, c = self.expr(depth - 1)
            other = self.pick(rows=c)
            if other is None:
                return a, r, c
            return f"({a} * {other[0]})", r, other[2]

        if kind == "chain":
            start = self.pick()
            text, r, c = start
            for _ in range(self.rng.randint(2, 4)):
                nxt = self.pick(rows=c)
                if nxt is None:
                    break
                text = f"{text} * {nxt[0]}"
                c = nxt[2]
            return text, r, c

        if kind == "transpose":
            a, r, c = self.expr(depth - 1)
            return f"transpose({a})", c, r

        if kind == "idmul":
            a, r, c = self.expr(depth - 1)
            if self.rng.random() < 0.5:
                return f"({a} * identity({c}))", r, c
            return f"(identity({r}) * {a})", r, c

        if kind == "zadd":
            a, r, c = self.expr(depth - 1)
            form = self.rng.choice(["{a} + zeros({r},{c})", "zeros({r},{c}) + {a}",
                                    "{a} - zeros({r},{c})"])
            return "(" + form.format(a=a, r=r, c=c) + ")", r, c

        if kind == "zmul":
            a, r, c = self.expr(depth - 1)
            if self.rng.random() < 0.5:
                return f"({a} * zeros({c},{c}))", r, c
            return f"(0 * {a})", r, c

        if kind == "one":
            a, r, c = self.expr(depth - 1)
            return f"(1 * {a})", r, c

        if kind == "neg":
            a, r, c = self.expr(depth - 1)
            return f"(-{a})", r, c

        if kind == "nscale":
            a, r, c = self.expr(depth - 1)
            return f"(-2 * {a})", r, c

        # scale
        a, r, c = self.expr(depth - 1)
        return f"({self.rng.choice(self.scalars)} * {a})", r, c

    # -- whole programs -----------------------------------------------------

    def build(self, n_decls=5, n_stmts=4):
        self.declare_scalar()
        for _ in range(2):
            d = self.dim()
            for _ in range(n_decls):
                nxt = self.dim()
                self.declare_matrix(d, nxt)
                d = nxt
        for _ in range(max(1, n_decls // 2)):
            self.declare_matrix()

        printed = []
        for _ in range(n_stmts):
            text, r, c = self.expr(self.rng.randint(2, 4))
            nm = self.name("R")
            self.lines.append(f"matrix {nm} = {text};")
            self.mats.append((nm, r, c))
            printed.append(nm)
        for nm in printed:
            self.lines.append(f"print({nm});")
        return "\n".join(self.lines) + "\n"


def program(seed, index, mode, profile, domain, literals=None):
    """The program for one (seed, index) cell; a separate stream per program."""
    salt = sum(ord(ch) for ch in f"{mode}/{profile}/{domain}/{literals}")
    rng = random.Random(seed * 1000003 + index * 7919 + salt)
    return Program(rng, mode, profile, domain, literals).build()
