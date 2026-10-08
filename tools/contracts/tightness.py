"""RQ3: how close the exactness certificate is to the true boundary.

For chains A*B*C (and one four-operand chain) over int(0,m), the strict
contract reorders exactly when every bracketing returns the correctly rounded
product: every proper sub-chain exact, and the final sums rounding at most
once. This script finds the largest such m with the compiler itself (binary
search on the certificate), compares it with the closed form, and then looks
for witnesses: inputs on which the bracketing the contract refused prints
different bits from the source order. Below the threshold no witness may
exist (soundness); a witness just above it shows the refusal was necessary
(tightness).

Witnesses come from two places. Generic inputs (all entries at the maximum,
near-maximum random entries, seeded random inputs) are run directly. A search
then emulates the virtual machine's evaluation order exactly (an accumulator
starting at +0, one rounded multiplication and one rounded addition per term,
no fused multiply-add) on one output entry and tries inputs at the maximum
with a few entries lowered, chosen so that a partial sum before the last one
is odd and above 2^53 and therefore rounds. Every witness the emulation finds
is confirmed by running both bracketings in the compiler's own virtual
machine; only confirmed witnesses are reported.

    python tools/contracts/tightness.py

Writes results/contracts/rq3_tightness.jsonl and rq3_env.json.
"""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import random
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

# (name, operand shapes, the cheaper bracketing the strict contract must
# refuse above its threshold, as a nested tuple of operand indices). For the
# four-operand chain that is the first segment, A*(B*C), followed by D: the
# rest of the chain stops being exact long before.
FAMILIES = [
    ("100x2", [(100, 2), (2, 100), (100, 2)], (0, (1, 2))),
    ("50x4", [(50, 4), (4, 50), (50, 4)], (0, (1, 2))),
    ("40x8", [(40, 8), (8, 40), (40, 8)], (0, (1, 2))),
    ("24x3x4", [(24, 3), (3, 24), (24, 3), (3, 24)], ((0, (1, 2)), 3)),
]
OFFSETS = [-3, -2, -1, 0, 1, 2, 3]
FACTORS = [1.001, 1.01, 1.1, 1.5, 2.0]
NEAR_MAX = 6
RANDOM_SEEDS = 10
SEARCH_BUDGET = 30000          # emulated candidates per m (half structured, half random)


# --- programs ----------------------------------------------------------------

def names_of(shapes):
    return [chr(ord("A") + i) for i in range(len(shapes))]


def render(tree, names):
    if isinstance(tree, int):
        return names[tree]
    left, right = tree
    return f"({render(left, names)} * {render(right, names)})"


def program(shapes, m, tree=None):
    names = names_of(shapes)
    lines = [f"matrix {n}[{r},{c}] = input(int(0,{m}));" for n, (r, c) in zip(names, shapes)]
    expr = " * ".join(names) if tree is None else render(tree, names)[1:-1]
    lines += [f"matrix R = {expr};", "print(R);"]
    return "\n".join(lines) + "\n"


def certified(path):
    code, out = common.call(["--optimize", "--report", "--cost", "--certificate", path])
    if code:
        raise RuntimeError(out)
    report = common.parse_report(out)
    levels = common.parse_guarantees(out)
    return report["cost_after"] < report["cost_before"] and levels == ["bit-identical"], report


def threshold(shapes, workdir):
    """Largest m whose chain strict reorders, found with the compiler alone."""
    lo, hi = 1, 1 << 27
    path = Path(workdir) / f"search_{len(shapes)}_{shapes[0][0]}_{shapes[0][1]}.ml"
    while lo < hi:
        mid = (lo + hi + 1) // 2
        path.write_text(program(shapes, mid), encoding="utf-8")
        if certified(path)[0]:
            lo = mid
        else:
            hi = mid - 1
    return lo


# --- closed forms --------------------------------------------------------------

def _bound(shapes, m, a, b):
    """|A_a ... A_b| entrywise is at most m^(b-a+1) times the inner dimensions."""
    out = m ** (b - a + 1)
    for p in range(a, b):
        out *= shapes[p][1]
    return out


def _search_m(ok):
    lo, hi = 1, 1 << 27
    while lo < hi:
        mid = (lo + hi + 1) // 2
        lo, hi = (mid, hi) if ok(mid) else (lo, mid - 1)
    return lo


def closed_form(shapes, first=0, last=None):
    """Largest m for which every bracketing of operands first..last returns the
    correctly rounded product: proper sub-chains fit in 53 bits, and for every
    split of the whole, (inner dimension - 1) terms fit."""
    k = len(shapes) if last is None else last + 1

    def ok(m):
        for a in range(first, k):
            for b in range(a + 1, k):
                if _bound(shapes, m, a, b) <= 2 ** 53:
                    continue
                if (a, b) != (first, k - 1):
                    return False
                for s in range(a, b):
                    part = _bound(shapes, m, a, s) * _bound(shapes, m, s + 1, b) * (shapes[s][1] - 1)
                    if part > 2 ** 53:
                        return False
        return True

    return _search_m(ok)


def closed_form_exact(shapes, first=0, last=None):
    """The earlier, stronger condition: every sub-chain, the whole included,
    fits in 53 bits, so nothing rounds at all."""
    k = len(shapes) if last is None else last + 1
    return _search_m(lambda m: all(_bound(shapes, m, a, b) <= 2 ** 53
                                   for a in range(first, k) for b in range(a + 1, k)))


# --- exact emulation of the virtual machine on one output entry --------------

def _dot(xs, ys):
    acc = 0.0                       # the VM's accumulator starts at +0
    for x, y in zip(xs, ys):
        acc = acc + x * y           # one rounded product, one rounded sum
    return acc


def _rows(tree, mats):
    if isinstance(tree, int):
        return mats[tree]
    left, right = tree
    lr = _rows(left, mats)
    cols = list(zip(*_rows(right, mats)))
    return [[_dot(r, c) for c in cols] for r in lr]


def _row0(tree, mats):
    """Row 0 of the product the tree computes, with the VM's arithmetic. Each
    entry is summed exactly as the full product would sum it."""
    if isinstance(tree, int):
        return mats[tree][0]
    left, right = tree
    r = _row0(left, mats)
    cols = list(zip(*_rows(right, mats)))
    return [_dot(r, c) for c in cols]


def source_tree(k):
    tree = 0
    for i in range(1, k):
        tree = (tree, i)
    return tree


def search(shapes, alt, m, rng):
    """Inputs at the maximum with a few entries lowered, emulated on entry
    (0,0) under the source order and the refused bracketing. Returns the
    matrices of the first input on which they differ, or None."""
    k = len(shapes)
    src = source_tree(k)
    for n in range(SEARCH_BUDGET):
        mats = [[[float(m)] * c for _ in range(r)] for (r, c) in shapes]
        if n % 2 == 0:
            # Structured: one odd term on the path to entry (0,0), and
            # optionally the last term of each sum, which decides whether two
            # roundings land on the same neighbour.
            row = 0
            for t in range(k):
                rows_t, cols_t = shapes[t]
                col = 0 if t == k - 1 else rng.randrange(cols_t)
                mats[t][row][col] = float(m - 1)
                if t > 0 and rng.random() < 0.5:
                    mats[t][rows_t - 1][col] = float(m - 1)
                if 0 < t < k - 1 and rng.random() < 0.5:
                    mats[t][row][cols_t - 1] = float(m - 1)
                row = col
            extra = rng.randint(0, 2)
        else:
            extra = rng.randint(1, 8)
        for _ in range(extra):
            t = rng.randrange(k)
            i, j = rng.randrange(shapes[t][0]), rng.randrange(shapes[t][1])
            mats[t][i][j] = float(m - rng.randint(1, 3))
        if _row0(src, mats)[0] != _row0(alt, mats)[0]:
            return mats, n + 1
    return None, SEARCH_BUDGET


# --- measurement ---------------------------------------------------------------

def input_flags(shapes, workdir, tag, fill=None, mats=None):
    flags = []
    for t, (name, (r, c)) in enumerate(zip(names_of(shapes), shapes)):
        path = Path(workdir) / f"{tag}_{name}.txt"
        if mats is not None:
            text = " ".join(str(int(x)) for row in mats[t] for x in row)
        else:
            text = " ".join(str(fill()) for _ in range(r * c))
        path.write_text(text + "\n", encoding="utf-8")
        flags += ["--input", f"{name}={path}"]
    return flags


def witnesses(shapes, alt, m, workdir, tag):
    """Yields (kind, [--input flags], search candidates tried or None)."""
    rng = random.Random(m * 7919 + len(shapes))
    yield "all-max", input_flags(shapes, workdir, f"{tag}_max", fill=lambda: m), None
    for i in range(NEAR_MAX):
        low = max(0, m - max(1, m // 8))
        yield f"near-max-{i}", input_flags(shapes, workdir, f"{tag}_near{i}",
                                           fill=lambda: rng.randint(low, m)), None
    for s in range(1, RANDOM_SEEDS + 1):
        yield f"random-{s}", ["--random-inputs", str(s)], None
    mats, tried = search(shapes, alt, m, random.Random(m * 104729 + len(shapes)))
    if mats is not None:
        yield "search", input_flags(shapes, workdir, f"{tag}_search", mats=mats), tried
    else:
        yield "search-none", None, tried


def measure(job, workdir):
    family, shapes, alt, m, m_star = job
    tag = f"{family}_{m}"
    src_path = Path(workdir) / f"{tag}.ml"
    alt_path = Path(workdir) / f"{tag}_alt.ml"
    src_path.write_text(program(shapes, m), encoding="utf-8")
    alt_path.write_text(program(shapes, m, alt), encoding="utf-8")
    reorders, report = certified(src_path)
    rows = []
    for kind, inputs, tried in witnesses(shapes, alt, m, workdir, tag):
        row = {"family": family, "m": m, "m_star": m_star, "above": m > m_star,
               "strict_reorders": reorders, "witness": kind, "search_tried": tried,
               "cost_before": report["cost_before"], "cost_after_strict": report["cost_after"]}
        if inputs is None:
            row.update({"strict_same": None, "alt_same": None, "algebraic_same": None})
            rows.append(row)
            continue
        run = ["-q", "--run", "--exact-output", *inputs]
        _, base = common.call([*run, src_path])
        _, refused = common.call([*run, alt_path])
        _, strict = common.call(["--optimize", *run, src_path])
        _, algebraic = common.call(["--optimize", "--fp-algebraic", *run, src_path])
        row.update({"strict_same": strict == base, "alt_same": refused == base,
                    "algebraic_same": algebraic == base})
        rows.append(row)
    return rows


def main():
    common.RESULTS.mkdir(parents=True, exist_ok=True)
    rows, summary = [], {}
    with tempfile.TemporaryDirectory(prefix="tightness-") as workdir:
        jobs = []
        for family, shapes, alt in FAMILIES:
            m_star = threshold(shapes, workdir)
            last = 2 if len(shapes) > 3 else None
            summary[family] = {
                "m_star_compiler": m_star,
                "m_star_closed_form": closed_form(shapes, 0, last),
                "m_star_exact_only": closed_form_exact(shapes, 0, last),
                "m_star_whole_chain": closed_form(shapes),
                "refused": render(alt, names_of(shapes))[1:-1],
            }
            print(f"{family}: compiler threshold {m_star}, closed form "
                  f"{summary[family]['m_star_closed_form']}, exact-only "
                  f"{summary[family]['m_star_exact_only']}", flush=True)
            ms = sorted({m_star + d for d in OFFSETS} | {int(m_star * f) for f in FACTORS})
            jobs += [(family, shapes, alt, m, m_star) for m in ms if m >= 1]
        with ThreadPoolExecutor(max_workers=16) as pool:
            for result in pool.map(lambda job: measure(job, workdir), jobs):
                rows.extend(result)
    common.write_jsonl(common.RESULTS / "rq3_tightness.jsonl", rows)
    common.write_json(common.RESULTS / "rq3_env.json", common.environment(
        {"families": {name: shapes for name, shapes, _ in FAMILIES}, "offsets": OFFSETS,
         "factors": FACTORS, "near_max_witnesses": NEAR_MAX, "random_witness_seeds": RANDOM_SEEDS,
         "search_budget": SEARCH_BUDGET, "thresholds": summary}))
    print(f"RQ3: {len(rows)} witness runs over {len(jobs)} values of m")


if __name__ == "__main__":
    main()
