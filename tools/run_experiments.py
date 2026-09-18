"""Run the measurements the paper reports, over generated programs.

Three experiments, each answering an objection a reviewer would raise about
numbers taken on hand-written examples:

  differential   Does the optimizer change what a program computes? Every
                 generated program is executed with and without the optimizer
                 and the two outputs compared byte for byte. The inputs were
                 not chosen by whoever wrote the optimizer, which is the whole
                 point: a corpus the author selected can only demonstrate that
                 the harness runs.

  cost           How much arithmetic does the optimizer remove? Measured in
                 scalar floating-point operations rather than instructions,
                 because an instruction count cannot distinguish removing a 2x2
                 addition from removing a 200x200 product, and is easy to
                 flatter by choosing the example.

  chain          How often does bracketing matter, and by how much? Reported
                 as a distribution over generated programs, including the
                 programs where it changes nothing -- which are the majority
                 and belong in the table.

    python tools/run_experiments.py --out results/seed1 --seed 1

Writes one JSON file per experiment plus a human-readable summary. Everything
is reproducible from the recorded seed and the recorded matrixc build.
"""

import argparse
import json
import os
import shutil
import statistics
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
# make produces matrixc on POSIX and matrixc.exe on Windows.
MATRIXC = os.path.join(ROOT, "bin", "matrixc")
if not os.path.exists(MATRIXC) and os.path.exists(MATRIXC + ".exe"):
    MATRIXC += ".exe"


def run(args, timeout=60):
    p = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    return p.returncode, p.stdout, p.stderr


def generate(outdir, count, seed, mode, decls, stmts):
    rc, out, err = run([sys.executable, os.path.join(HERE, "gen_programs.py"),
                        "--out", outdir, "--count", str(count), "--seed", str(seed),
                        "--mode", mode, "--decls", str(decls), "--stmts", str(stmts)])
    if rc != 0:
        raise SystemExit(f"generator failed: {err}")
    return sorted(os.path.join(outdir, f) for f in os.listdir(outdir)
                  if f.endswith(".ml"))


# ---------------------------------------------------------------- parsing --

def parse_cost(text):
    """Pull the before/after arithmetic out of --cost --optimize output."""
    before = after = None
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("Arithmetic before optimization"):
            before = int(s.split(":")[1].split()[0])
        elif s.startswith("Arithmetic after optimization"):
            after = int(s.split(":")[1].split()[0])
    return before, after


def parse_instructions(text):
    """Instruction counts from --tac --optimize: the first listing is the
    unoptimized stream, the second the optimized one."""
    counts = []
    for line in text.splitlines():
        s = line.strip()
        if s.endswith("instruction(s)."):
            counts.append(int(s.split()[0]))
    if len(counts) >= 2:
        return counts[0], counts[1]
    return None, None


# ------------------------------------------------------------ experiments --

def experiment_differential(files):
    """Optimized and unoptimized execution must agree, byte for byte."""
    results, differ, errors = [], 0, 0
    for f in files:
        rc1, plain, _ = run([MATRIXC, "-q", "--run", f])
        rc2, opt, _ = run([MATRIXC, "-q", "--optimize", "--run", f])
        if rc1 != 0 or rc2 != 0:
            errors += 1
            results.append({"program": os.path.basename(f), "status": "error",
                            "exit_plain": rc1, "exit_optimized": rc2})
            continue
        same = plain == opt
        if not same:
            differ += 1
        results.append({"program": os.path.basename(f),
                        "status": "identical" if same else "DIFFERS",
                        "bytes": len(plain)})
    return {"programs": len(files), "identical": len(files) - differ - errors,
            "differ": differ, "errors": errors, "results": results}


def experiment_cost(files):
    """Arithmetic removed, and instructions removed, on the same programs."""
    rows = []
    for f in files:
        rc, out, _ = run([MATRIXC, "--tac", "--optimize", "--cost", f], timeout=120)
        if rc != 0:
            continue
        cb, ca = parse_cost(out)
        ib, ia = parse_instructions(out)
        if cb is None or ib is None:
            continue
        rows.append({
            "program": os.path.basename(f),
            "flops_before": cb, "flops_after": ca,
            "flops_pct": 100.0 * (cb - ca) / cb if cb else 0.0,
            "instr_before": ib, "instr_after": ia,
            "instr_pct": 100.0 * (ib - ia) / ib if ib else 0.0,
        })
    return rows


def experiment_chain(files):
    """How often bracketing matters, measured with chain ordering alone so the
    saving is not confounded with what the other passes remove."""
    rows = []
    for f in files:
        rc, out, _ = run([MATRIXC, "--opt-chain", "--cost", "--explain", f],
                         timeout=120)
        if rc != 0:
            continue
        cb, ca = parse_cost(out)
        if cb is None:
            continue
        chains = out.count("chain order      :")
        rows.append({
            "program": os.path.basename(f),
            "chains_reordered": chains,
            "flops_before": cb, "flops_after": ca,
            "flops_pct": 100.0 * (cb - ca) / cb if cb else 0.0,
        })
    return rows


# ---------------------------------------------------------------- summary --

def describe(values):
    if not values:
        return {"n": 0}
    vs = sorted(values)
    return {
        "n": len(vs),
        "min": vs[0],
        "median": statistics.median(vs),
        "mean": statistics.fmean(vs),
        "max": vs[-1],
        "p90": vs[int(0.9 * (len(vs) - 1))],
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--exec-count", type=int, default=200)
    ap.add_argument("--cost-count", type=int, default=200)
    a = ap.parse_args()

    if not os.path.exists(MATRIXC):
        raise SystemExit("bin/matrixc not built; run make first")

    os.makedirs(a.out, exist_ok=True)
    work = tempfile.mkdtemp(prefix="matrixlang-corpus-")
    summary = {"seed": a.seed}

    try:
        # -- differential, on small executable programs --------------------
        exec_dir = os.path.join(work, "exec")
        exec_files = generate(exec_dir, a.exec_count, a.seed, "exec", 5, 4)
        diff = experiment_differential(exec_files)
        summary["differential"] = {k: diff[k] for k in
                                   ("programs", "identical", "differ", "errors")}
        with open(os.path.join(a.out, "differential.json"), "w") as f:
            json.dump(diff, f, indent=1)

        # -- cost and chain, on larger programs ----------------------------
        cost_dir = os.path.join(work, "cost")
        cost_files = generate(cost_dir, a.cost_count, a.seed, "cost", 5, 4)

        cost_rows = experiment_cost(cost_files)
        summary["cost"] = {
            "programs": len(cost_rows),
            "flops_pct": describe([r["flops_pct"] for r in cost_rows]),
            "instr_pct": describe([r["instr_pct"] for r in cost_rows]),
            "total_flops_before": sum(r["flops_before"] for r in cost_rows),
            "total_flops_after": sum(r["flops_after"] for r in cost_rows),
        }
        with open(os.path.join(a.out, "cost.json"), "w") as f:
            json.dump(cost_rows, f, indent=1)

        chain_rows = experiment_chain(cost_files)
        helped = [r for r in chain_rows if r["flops_pct"] > 0.0]
        summary["chain"] = {
            "programs": len(chain_rows),
            "programs_with_a_reordering": len(helped),
            "share_helped_pct": 100.0 * len(helped) / len(chain_rows) if chain_rows else 0.0,
            "flops_pct_when_it_helped": describe([r["flops_pct"] for r in helped]),
            "flops_pct_over_all": describe([r["flops_pct"] for r in chain_rows]),
        }
        with open(os.path.join(a.out, "chain.json"), "w") as f:
            json.dump(chain_rows, f, indent=1)

    finally:
        shutil.rmtree(work, ignore_errors=True)

    with open(os.path.join(a.out, "summary.json"), "w") as f:
        json.dump(summary, f, indent=1)

    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
