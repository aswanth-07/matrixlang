"""RQ3: how close the exactness certificate is to the true boundary.

For chains A*B*C (and one four-operand chain) over int(0,m), the strict
contract reorders exactly when every intermediate of every bracketing fits in
53 significand bits. This script finds the largest such m with the compiler
itself (binary search on the certificate), compares it with the closed form,
and then searches for witnesses: inputs on which reordering changes the
printed bits. Below the threshold no witness may exist (soundness); above it,
the share of m for which a witness is found is a lower bound on how often the
certificate's refusal is necessary (tightness).

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

# (name, operand shapes); every family has a source order that reordering beats.
FAMILIES = [
    ("100x2", [(100, 2), (2, 100), (100, 2)]),
    ("50x4", [(50, 4), (4, 50), (50, 4)]),
    ("40x8", [(40, 8), (8, 40), (40, 8)]),
    ("24x3x4", [(24, 3), (3, 24), (24, 3), (3, 24)]),
]
OFFSETS = [-3, -2, -1, 0, 1, 2, 3]
FACTORS = [1.001, 1.01, 1.1, 1.5, 2.0, 4.0, 16.0]
NEAR_MAX = 6
RANDOM_SEEDS = 10


def program(shapes, m):
    names = [chr(ord("A") + i) for i in range(len(shapes))]
    lines = [f"matrix {n}[{r},{c}] = input(int(0,{m}));" for n, (r, c) in zip(names, shapes)]
    lines += [f"matrix R = {' * '.join(names)};", "print(R);"]
    return "\n".join(lines) + "\n", names


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
        path.write_text(program(shapes, mid)[0], encoding="utf-8")
        if certified(path)[0]:
            lo = mid
        else:
            hi = mid - 1
    return lo


def closed_form(shapes, first=0, last=None):
    """Largest m with every sub-chain bound prod(m) * prod(inner dims) <= 2^53,
    over operands first..last (the whole chain by default). A longer chain is
    reordered segment by segment, so its threshold is that of the best segment."""
    k = len(shapes) if last is None else last + 1

    def fits(m):
        for a in range(first, k):
            for b in range(a, k):
                bound = m ** (b - a + 1)
                for p in range(a, b):
                    bound *= shapes[p][1]
                if bound > 2 ** 53:
                    return False
        return True

    lo, hi = 1, 1 << 27
    while lo < hi:
        mid = (lo + hi + 1) // 2
        lo, hi = (mid, hi) if fits(mid) else (lo, mid - 1)
    return lo


def witness_files(shapes, names, m, workdir, tag):
    """Yields (kind, [--input flags]) for every witness of one m."""
    rng = random.Random(m * 7919 + len(shapes))

    def files(fill):
        flags = []
        for name, (r, c) in zip(names, shapes):
            path = Path(workdir) / f"{tag}_{name}.txt"
            path.write_text(" ".join(str(fill()) for _ in range(r * c)) + "\n", encoding="utf-8")
            flags += ["--input", f"{name}={path}"]
        return flags

    yield "all-max", files(lambda: m)
    for i in range(NEAR_MAX):
        low = max(0, m - max(1, m // 8))
        yield f"near-max-{i}", files(lambda: rng.randint(low, m))
    for s in range(1, RANDOM_SEEDS + 1):
        yield f"random-{s}", ["--random-inputs", str(s)]


def measure(job, workdir):
    family, shapes, m, m_star = job
    tag = f"{family}_{m}"
    src, names = program(shapes, m)
    path = Path(workdir) / f"{tag}.ml"
    path.write_text(src, encoding="utf-8")
    reorders, report = certified(path)
    rows = []
    for kind, inputs in witness_files(shapes, names, m, workdir, tag):
        run = ["-q", "--run", "--exact-output", *inputs, path]
        _, base = common.call(run)
        _, strict = common.call(["--optimize", *run])
        _, algebraic = common.call(["--optimize", "--fp-algebraic", *run])
        rows.append({"family": family, "m": m, "m_star": m_star, "above": m > m_star,
                     "strict_reorders": reorders, "witness": kind,
                     "strict_same": strict == base, "reordered_same": algebraic == base,
                     "cost_before": report["cost_before"], "cost_after_strict": report["cost_after"]})
    return rows


def main():
    common.RESULTS.mkdir(parents=True, exist_ok=True)
    rows, summary = [], {}
    with tempfile.TemporaryDirectory(prefix="tightness-") as workdir:
        jobs = []
        for family, shapes in FAMILIES:
            m_star = threshold(shapes, workdir)
            summary[family] = {"m_star_compiler": m_star, "m_star_closed_form": closed_form(shapes),
                               "m_star_closed_form_first3": closed_form(shapes, 0, 2)}
            print(f"{family}: compiler threshold {m_star}, closed form {summary[family]['m_star_closed_form']}", flush=True)
            ms = sorted({m_star + d for d in OFFSETS} | {int(m_star * f) for f in FACTORS})
            jobs += [(family, shapes, m, m_star) for m in ms if m >= 1]
        with ThreadPoolExecutor(max_workers=16) as pool:
            for result in pool.map(lambda job: measure(job, workdir), jobs):
                rows.extend(result)
    common.write_jsonl(common.RESULTS / "rq3_tightness.jsonl", rows)
    common.write_json(common.RESULTS / "rq3_env.json", common.environment(
        {"families": {name: shapes for name, shapes in FAMILIES}, "offsets": OFFSETS, "factors": FACTORS,
         "near_max_witnesses": NEAR_MAX, "random_witness_seeds": RANDOM_SEEDS, "thresholds": summary}))
    print(f"RQ3: {len(rows)} witness runs over {len(jobs)} values of m")


if __name__ == "__main__":
    main()
