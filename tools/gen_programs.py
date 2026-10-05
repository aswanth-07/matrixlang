"""Generate random, semantically valid MatrixLang programs.

Programs are shape-correct by construction and reproducible from seeds. The
author-designed distribution deliberately supplies compatible products and
chains; random sampling does not remove that design bias. Research evaluation
therefore compares shape and expression profiles, retains zero-saving cases,
and limits inference to the declared generator populations.

    python tools/gen_programs.py --out corpus/ --count 200 --seed 1 --mode exec
    python tools/gen_programs.py --out corpus/ --count 200 --seed 1 --mode cost

`exec` mode keeps dimensions small and initialises every matrix from a literal,
so the programs run quickly and their printed output can be compared. `cost`
mode draws much larger dimensions, because arithmetic cost is computed from the
shapes and never needs the program to run.
"""

import argparse
import os
import random


class Gen:
    def __init__(self, rng, mode, profile="heterogeneous", values="dyadic"):
        self.rng = rng
        self.mode = mode
        self.profile = profile
        self.values = values
        self.square_dim = rng.choice([2, 8, 32, 120]) if profile == "square" else None
        self.lines = []
        self.mats = []          # (name, rows, cols)
        self.scalars = []
        self.n = 0

    # -- dimensions --------------------------------------------------------

    def dim(self):
        if self.mode == "exec":
            return self.rng.randint(1, 4)
        if self.profile == "square":
            return self.square_dim
        if self.profile == "narrow":
            return self.rng.choice([8, 9, 10, 11, 12])
        # Cost mode spans two orders of magnitude on purpose: bracketing only
        # matters when the dimensions differ, and a corpus of near-square
        # matrices would report that chain ordering never helps.
        return self.rng.choice([1, 2, 3, 5, 8, 12, 20, 32, 50, 80, 120, 200])

    def name(self, prefix="m"):
        self.n += 1
        return f"{prefix}{self.n}"

    # -- declarations ------------------------------------------------------

    def literal(self, r, c):
        rows = []
        for _ in range(r):
            if self.values == "broad":
                vals = ", ".join(format(self.rng.choice([-1, 1]) *
                    self.rng.uniform(0.1, 9.9) * 10 ** self.rng.randint(-12, 12), ".17g")
                    for _ in range(c))
            else:
                vals = ", ".join(str(self.rng.randint(-3, 5)) for _ in range(c))
            rows.append("{" + vals + "}")
        return "{" + ", ".join(rows) + "}"

    def declare_matrix(self, r=None, c=None):
        r = r if r is not None else self.dim()
        c = c if c is not None else self.dim()
        nm = self.name("M")
        if self.mode == "exec":
            self.lines.append(f"matrix {nm}[{r},{c}] = {self.literal(r, c)};")
        else:
            self.lines.append(f"matrix {nm}[{r},{c}];")
        self.mats.append((nm, r, c))
        return (nm, r, c)

    def declare_scalar(self):
        nm = self.name("s")
        v = self.rng.choice(["2", "3", "0.5", "1.5", "-2"])
        self.lines.append(f"scalar {nm} = {v};")
        self.scalars.append(nm)
        return nm

    # -- expressions -------------------------------------------------------

    def pick_matrix(self, rows=None, cols=None, avoid=None):
        pool = [m for m in self.mats
                if (rows is None or m[1] == rows) and (cols is None or m[2] == cols)]
        # Prefer an operand that is not textually the one already chosen.
        # Without this the generator produces a great deal of M - M, which is
        # real MatrixLang but tells the optimizer nothing interesting.
        if avoid is not None:
            distinct = [m for m in pool if m[0] not in avoid]
            if distinct:
                pool = distinct
        return self.rng.choice(pool) if pool else None

    def expr(self, depth):
        """Returns (text, rows, cols). Shape-correct by construction."""
        if depth <= 0 or not self.mats:
            nm, r, c = self.rng.choice(self.mats)
            return nm, r, c

        # Weighted so that products and chains dominate: they are what this
        # language is about, and what both the cost model and chain ordering
        # have anything to say about.
        kinds = ["chain", "chain", "chain", "mul", "mul",
                 "add", "sub", "transpose", "scale", "var"]
        if self.profile == "elementwise":
            kinds = ["add", "sub", "transpose", "scale", "var"]
        elif self.profile == "balanced":
            kinds = ["chain", "mul", "add", "sub", "transpose", "scale", "var"]
        kind = self.rng.choice(kinds)

        if kind == "var":
            nm, r, c = self.rng.choice(self.mats)
            return nm, r, c

        if kind in ("add", "sub"):
            a, r, c = self.expr(depth - 1)
            other = self.pick_matrix(r, c, avoid=a)
            if other is None:
                return a, r, c
            op = "+" if kind == "add" else "-"
            return f"({a} {op} {other[0]})", r, c

        if kind == "mul":
            a, r, c = self.expr(depth - 1)
            other = self.pick_matrix(rows=c)
            if other is None:
                return a, r, c
            return f"({a} * {other[0]})", r, other[2]

        if kind == "chain":
            # A run of three to five products. These are what chain ordering
            # exists for, and a corpus without them would measure nothing.
            start = self.pick_matrix()
            if start is None:
                return self.expr(0)
            text, r, c = start[0], start[1], start[2]
            for _ in range(self.rng.randint(2, 4)):
                nxt = self.pick_matrix(rows=c)
                if nxt is None:
                    break
                text = f"{text} * {nxt[0]}"
                c = nxt[2]
            return text, r, c

        if kind == "transpose":
            a, r, c = self.expr(depth - 1)
            return f"transpose({a})", c, r

        # scale
        a, r, c = self.expr(depth - 1)
        if not self.scalars:
            return a, r, c
        return f"({self.rng.choice(self.scalars)} * {a})", r, c

    # -- whole programs ----------------------------------------------------

    def build(self, n_decls, n_stmts):
        self.declare_scalar()

        # A run of matrices whose shapes chain end to end, so that a generated
        # chain has operands to find. Two such runs, so chains are not all
        # drawn from one sequence of shapes.
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


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", required=True)
    ap.add_argument("--count", type=int, default=100)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--mode", choices=["exec", "cost"], default="exec")
    ap.add_argument("--profile", choices=["heterogeneous", "square", "narrow", "balanced", "elementwise"], default="heterogeneous")
    ap.add_argument("--values", choices=["dyadic", "broad"], default="dyadic")
    ap.add_argument("--decls", type=int, default=5)
    ap.add_argument("--stmts", type=int, default=4)
    a = ap.parse_args()

    os.makedirs(a.out, exist_ok=True)
    for i in range(a.count):
        # Each program has a separate reproducible stream.
        rng = random.Random(a.seed * 1000003 + i)
        g = Gen(rng, a.mode, a.profile, a.values)
        text = g.build(a.decls, a.stmts)
        with open(os.path.join(a.out, f"g{i:04d}.ml"), "w", newline="\n") as f:
            f.write(f"/* generated: seed={a.seed} index={i} mode={a.mode} */\n")
            f.write(text)

    print(f"wrote {a.count} programs to {a.out} (seed {a.seed}, mode {a.mode})")


if __name__ == "__main__":
    main()
