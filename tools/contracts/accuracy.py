"""RQ6: is the cost-optimal bracketing of a real-valued chain more accurate?

The confirmatory study preregistered as IG-RD-010. For each chain instance it
evaluates the source (left-to-right) bracketing and the cost-optimal one in
the compiler's own evaluation order -- every product entry starts at +0 and
accumulates its k terms in order, one rounded multiply and one rounded add per
term, no fused multiply-add -- and measures

    error = max_ij |computed_ij - exact_ij| / (|A1| ... |Ak|)_ij / u,  u = 2^-53

against an exact reference computed in integers. The control pairs two
distinct bracketings of equal modeled cost (the equal-cost ablation).

Adaptations of the registered design, stated in the paper:
  * profiles: the generator's shape distributions for chains are
    heterogeneous (dimensions 1..200), narrow (8..12) and square (one
    dimension); balanced draws the same chain shapes as heterogeneous, and
    elementwise has no chains, so neither adds a distinct population. Square
    chains have no cheaper bracketing and contribute to the ablation only.
  * real matrices: no datasets can be downloaded on this machine, so the
    value distributions are uniform [-1,1], non-negative [0,1] and broad
    (magnitudes 10^-12..10^12), with no SuiteSparse subset.
  * chains whose exact reference needs more than MAX_EXACT scalar products
    are redrawn, which caps the largest products at about 120^3.

    "C:/.../Python310/python.exe" tools/contracts/accuracy.py [--quick]

Writes results/contracts/rq6_accuracy.jsonl, rq6_validation.jsonl, rq6_env.json.
"""

import argparse
from functools import lru_cache
import itertools
import math
from multiprocessing import Pool
import os
from pathlib import Path
import sys
import tempfile

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

COST_DIMS = [1, 2, 3, 5, 8, 12, 20, 32, 50, 80, 120, 200]
PROFILES = ["heterogeneous", "narrow", "square"]
DISTRIBUTIONS = ["uniform", "nonneg", "broad"]
SEEDS = list(range(101, 111))          # new seeds: the preliminary run (#69) used others
MAX_EXACT = 1_500_000
U = 2.0 ** -53


# -- chains -----------------------------------------------------------------

def shapes(rng, profile):
    k = int(rng.integers(3, 6))
    if profile == "narrow":
        dims = [int(rng.integers(8, 13)) for _ in range(k + 1)]
    elif profile == "square":
        d = int(rng.choice([8, 20, 50]))
        dims = [d] * (k + 1)
    else:
        dims = [int(rng.choice(COST_DIMS)) for _ in range(k + 1)]
    return dims


def values(rng, distribution, r, c):
    if distribution == "uniform":
        return rng.uniform(-1.0, 1.0, (r, c))
    if distribution == "nonneg":
        return rng.uniform(0.0, 1.0, (r, c))
    sign = rng.choice([-1.0, 1.0], (r, c))
    return sign * rng.uniform(0.1, 9.9, (r, c)) * 10.0 ** rng.integers(-12, 13, (r, c)).astype(float)


def product_cost(m, n, p):
    """The compiler's model: m*p entries of n multiplies and n-1 adds."""
    return m * p * (2 * n - 1)


def trees(i, j):
    """Every bracketing of operands i..j, as nested tuples of indices."""
    if i == j:
        return [i]
    out = []
    for s in range(i, j):
        for left in trees(i, s):
            for right in trees(s + 1, j):
                out.append((left, right))
    return out


def span(tree):
    if isinstance(tree, int):
        return tree, tree
    return span(tree[0])[0], span(tree[1])[1]


def tree_cost(tree, dims):
    if isinstance(tree, int):
        return 0
    (a, s), (t, b) = span(tree[0]), span(tree[1])
    return tree_cost(tree[0], dims) + tree_cost(tree[1], dims) + product_cost(dims[a], dims[s + 1], dims[b + 1])


def intermediates(tree, dims):
    """Entries held in intermediate products (the root excluded)."""
    def walk(t, root):
        if isinstance(t, int):
            return 0
        a, b = span(t)
        own = 0 if root else dims[a] * dims[b + 1]
        return own + walk(t[0], False) + walk(t[1], False)
    return walk(tree, True)


def source_tree(k):
    t = 0
    for i in range(1, k):
        t = (t, i)
    return t


def optimal_tree(dims):
    """Classical DP; ties keep the earliest split, as src/ir/chain.c does."""
    k = len(dims) - 1

    @lru_cache(maxsize=None)
    def best(i, j):
        if i == j:
            return 0, i
        choice = None
        for s in range(i, j):
            cost = best(i, s)[0] + best(s + 1, j)[0] + product_cost(dims[i], dims[s + 1], dims[j + 1])
            if choice is None or cost < choice[0]:
                choice = (cost, (best(i, s)[1], best(s + 1, j)[1]))
        return choice
    return best(0, k - 1)[1]


# -- arithmetic ---------------------------------------------------------------

def vm_matmul(a, b):
    """The VM's order: +0, then entry += a[i,k] * b[k,j] for k in order."""
    out = np.zeros((a.shape[0], b.shape[1]))
    for k in range(a.shape[1]):
        out = out + np.multiply.outer(a[:, k], b[k, :])
    return out


def evaluate(tree, mats, matmul):
    if isinstance(tree, int):
        return mats[tree]
    return matmul(evaluate(tree[0], mats, matmul), evaluate(tree[1], mats, matmul))


def to_integers(m):
    """m == ints * 2^e exactly, with ints a Python-int object array."""
    ratios = [float(x).as_integer_ratio() for x in m.ravel()]      # x = num / 2^s
    e = min((-(d.bit_length() - 1) for n, d in ratios if n), default=0)
    ints = np.empty(m.size, dtype=object)
    for i, (n, d) in enumerate(ratios):
        ints[i] = n << (-(d.bit_length() - 1) - e)
    return ints.reshape(m.shape), e


def exact_chain(mats, tree):
    ints, exps = zip(*(to_integers(m) for m in mats))
    return evaluate(tree, list(ints), lambda a, b: a.dot(b)), sum(exps)


def error_of(computed, exact, exp, scale):
    """max |computed - exact| / scale / u, with the difference taken exactly."""
    worst = 0.0
    for idx, x in np.ndenumerate(computed):
        num, den = float(x).as_integer_ratio()                  # x = num / den, den a power of two
        shift = den.bit_length() - 1
        # exact value = exact[idx] * 2^exp; computed = num * 2^-shift
        lo = min(exp, -shift)
        diff = (num << (-shift - lo)) - (exact[idx] << (exp - lo))
        # int / int is correctly rounded in Python, however large the operands.
        value = abs(diff) / (1 << -lo) if lo < 0 else float(abs(diff) << lo)
        err = value / scale[idx] if scale[idx] > 0 else 0.0
        worst = max(worst, err)
    return worst / U


def bound_coefficient(dims):
    """prod over inner dimensions of (1 + gamma_p) - 1, gamma_p = p u / (1 - p u)."""
    c = 1.0
    for p in dims[1:-1]:
        c *= 1.0 + p * U / (1.0 - p * U)
    return (c - 1.0) / U


# -- one instance -------------------------------------------------------------

def instance(job):
    seed, profile, distribution, index = job
    rng = np.random.default_rng([seed, PROFILES.index(profile), DISTRIBUTIONS.index(distribution), index])
    while True:
        dims = shapes(rng, profile)
        k = len(dims) - 1
        best = optimal_tree(dims)
        if tree_cost(best, dims) <= MAX_EXACT:
            break
    mats = [values(rng, distribution, dims[i], dims[i + 1]) for i in range(k)]
    exact, exp = exact_chain(mats, best)
    scale = evaluate(source_tree(k), [np.abs(m) for m in mats], lambda a, b: a @ b)
    src, opt = source_tree(k), best
    row = {"seed": seed, "profile": profile, "distribution": distribution, "index": index,
           "dims": dims, "source_cost": tree_cost(src, dims), "optimal_cost": tree_cost(opt, dims),
           "bound_over_u": bound_coefficient(dims)}
    errs = {}
    for name, tree in (("source", src), ("optimal", opt)):
        errs[name] = error_of(evaluate(tree, mats, vm_matmul), exact, exp, scale)
    row["source_err"], row["optimal_err"] = errs["source"], errs["optimal"]
    row["distinct"] = repr(src) != repr(opt)
    # Equal-cost control: two distinct bracketings with the same modeled cost.
    # "First" holds fewer intermediate entries when the two differ there, and
    # is otherwise the earlier one in enumeration order (an arbitrary label).
    groups = {}
    for t in trees(0, k - 1):
        groups.setdefault(tree_cost(t, dims), []).append(t)
    pairs = [(a, b) for g in groups.values() for a, b in itertools.combinations(g, 2)]
    if pairs:
        a, b = pairs[int(rng.integers(len(pairs)))]
        if intermediates(a, dims) > intermediates(b, dims):
            a, b = b, a
        row["ablation_orientation"] = "intermediates" if intermediates(a, dims) != intermediates(b, dims) else "enumeration"
        row["ablation_first_err"] = error_of(evaluate(a, mats, vm_matmul), exact, exp, scale)
        row["ablation_second_err"] = error_of(evaluate(b, mats, vm_matmul), exact, exp, scale)
        row["ablation_cost"] = tree_cost(a, dims)
    return row


# -- validation of the emulation against the compiler -------------------------

def program_text(dims, tree):
    def expr(t):
        if isinstance(t, int):
            return f"A{t}"
        return f"({expr(t[0])} * {expr(t[1])})"
    lines = [f"matrix A{i}[{dims[i]},{dims[i + 1]}] = input(real);" for i in range(len(dims) - 1)]
    return "\n".join(lines + [f"matrix R = {expr(tree)};", "print(R);"]) + "\n"


def validate(count, workdir):
    rows = []
    rng = np.random.default_rng(7)
    for n in range(count):
        dims = [int(rng.integers(1, 9)) for _ in range(int(rng.integers(3, 6)) + 1)]
        k = len(dims) - 1
        mats = [values(rng, DISTRIBUTIONS[n % 3], dims[i], dims[i + 1]) for i in range(k)]
        for name, tree in (("source", source_tree(k)), ("optimal", optimal_tree(dims))):
            path = Path(workdir) / f"v{n}_{name}.ml"
            path.write_text(program_text(dims, tree), encoding="utf-8")
            flags = []
            for i, m in enumerate(mats):
                f = Path(workdir) / f"v{n}_A{i}.txt"
                f.write_text(" ".join(float(x).hex() for x in m.ravel()) + "\n", encoding="utf-8")
                flags += ["--input", f"A{i}={f}"]
            code, out = common.call(["-q", "--run", "--exact-output", *flags, path])
            emulated = evaluate(tree, mats, vm_matmul)
            printed = [tok for line in out.splitlines()[1:] for tok in line.replace("[", " ").replace("]", " ").split()]
            same = code == 0 and len(printed) == emulated.size and all(
                float.fromhex(tok) == x and math.copysign(1, float.fromhex(tok)) == math.copysign(1, x)
                for tok, x in zip(printed, emulated.ravel()))
            rows.append({"case": n, "tree": name, "dims": dims, "status": code, "bit_identical": same})
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--quick", action="store_true")
    parser.add_argument("--per-cell", type=int, default=30)
    parser.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 4))
    args = parser.parse_args()
    per_cell = 2 if args.quick else args.per_cell
    seeds = SEEDS[:2] if args.quick else SEEDS
    common.RESULTS.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="accuracy-") as workdir:
        checks = validate(6 if args.quick else 60, workdir)
    common.write_jsonl(common.RESULTS / "rq6_validation.jsonl", checks)
    print(f"emulation: {sum(r['bit_identical'] for r in checks)}/{len(checks)} bracketings bit-identical to matrixc", flush=True)
    jobs = [(s, p, d, i) for s in seeds for p in PROFILES for d in DISTRIBUTIONS for i in range(per_cell)]
    with Pool(args.workers) as pool:
        rows = []
        for n, row in enumerate(pool.imap(instance, jobs, chunksize=2), 1):
            rows.append(row)
            if n % 200 == 0:
                print(f"  {n}/{len(jobs)} chains", flush=True)
    common.write_jsonl(common.RESULTS / "rq6_accuracy.jsonl", rows)
    common.write_json(common.RESULTS / "rq6_env.json", common.environment(
        {"numpy": np.__version__, "seeds": seeds, "per_cell": per_cell, "profiles": PROFILES,
         "distributions": DISTRIBUTIONS, "max_exact_products": MAX_EXACT, "contract": "IG-RD-010 revision 1"}))
    print(f"RQ6: {len(rows)} chains", flush=True)


if __name__ == "__main__":
    main()
