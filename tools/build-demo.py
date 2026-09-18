"""Collect everything the web demo shows, from the compiler and from results/.

    python tools/build-demo.py

Writes demo/data.js. Nothing in the demo page is typed by hand: the phase
output is captured by running bin/matrixc with one flag per phase, and the
measurement figures are read from results/. Re-run the experiments or change
the compiler, run this, and the page follows.

Long phase output is elided to keep the page small, and every elision is
marked in the text the page shows, never silently trimmed.
"""

import json
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "results")
OUT = os.path.join(ROOT, "demo", "data.js")

MATRIXC = os.path.join(ROOT, "bin", "matrixc")
if not os.path.exists(MATRIXC) and os.path.exists(MATRIXC + ".exe"):
    MATRIXC += ".exe"

# The three programs the demo walks. One accepted, one where the shapes decide
# the bracketing, one rejected before it runs.
PROGRAMS = [
    {
        "id": "multiply",
        "name": "A product",
        "blurb": "Two literal matrices multiplied. C is never given a shape; "
                 "the compiler infers Matrix<2x4> from A and B.",
        "file": "examples/valid/multiply.ml",
    },
    {
        "id": "chain",
        "name": "A chain the shapes re-bracket",
        "blurb": "A * B * C computes the same matrix under either bracketing "
                 "and not the same amount of arithmetic. Which one is cheaper "
                 "depends only on the shapes, and the shapes are in the types.",
        "file": "examples/optimize/chain_order.ml",
    },
    {
        "id": "mismatch",
        "name": "A program that is rejected",
        "blurb": "Matrix<2x3> times Matrix<5x4> is not a type error the "
                 "compiler can shrug off. It is caught in semantic analysis, "
                 "before any code is generated.",
        "file": "examples/errors/mul_mismatch.ml",
    },
]

STAGES = [
    ("lexical", "--tokens", "Token stream"),
    ("syntax", "--ast", "Abstract syntax tree"),
    ("symbols", "--symbols", "Symbol table"),
    ("semantic", "--check", "Diagnostics and verdict"),
    ("tac", "--tac", "Three-address code"),
    ("optimize", "--optimize --explain --cost", "Optimizer"),
    ("target", "--target", "VM target code"),
    ("execute", "--run", "Execution"),
]

MAX_LINES = 26


def capture(flags, path):
    """Run one stage and return the part a reader wants, with the banner and
    the absolute source path removed."""
    argv = [MATRIXC] + flags.split() + [path]
    p = subprocess.run(argv, capture_output=True, text=True, timeout=60)
    text = (p.stdout or "") + (p.stderr or "")

    # Drop the two-line header and the banner rules; keep the phase titles.
    lines = []
    for ln in text.replace("\r\n", "\n").split("\n"):
        if ln.startswith("MatrixLang compiler") or ln.startswith("Source:"):
            continue
        if set(ln.strip()) == {"="} and ln.strip():
            continue
        lines.append(ln.replace(path, os.path.basename(path)))

    # Collapse runs of blank lines, and trim the ends.
    out = []
    for ln in lines:
        if not ln.strip() and (not out or not out[-1].strip()):
            continue
        out.append(ln.rstrip())
    while out and not out[-1].strip():
        out.pop()
    while out and not out[0].strip():
        out.pop(0)

    elided = 0
    if len(out) > MAX_LINES:
        elided = len(out) - MAX_LINES
        head = out[:MAX_LINES - 4]
        tail = out[-3:]
        out = head + ["", "        ... %d more line(s) ..." % elided, ""] + tail

    return {"text": "\n".join(out), "status": p.returncode, "elided": elided,
            "command": "matrixc " + flags + " " + os.path.basename(path)}


def percentiles(values):
    v = sorted(values)
    n = len(v)

    def q(p):
        import math
        k = (n - 1) * p
        lo, hi = math.floor(k), math.ceil(k)
        return v[lo] if lo == hi else v[lo] + (v[hi] - v[lo]) * (k - lo)

    return {"min": v[0], "q1": q(0.25), "median": q(0.5), "q3": q(0.75),
            "p90": q(0.90), "max": v[-1], "n": n}


def main():
    if not os.path.exists(MATRIXC):
        print("bin/matrixc not found; run make first", file=sys.stderr)
        return 1

    programs = []
    work = tempfile.mkdtemp(prefix="matrixlang-demo-")
    for spec in PROGRAMS:
        path = os.path.join(ROOT, spec["file"])
        with open(path) as f:
            source = f.read()
        # Strip the block comment the example files open with: the page
        # explains the program in its own words beside the code. The compiler
        # is then run on the stripped copy, under the same basename, so the
        # line:column numbers it prints match the source the page shows.
        source = re.sub(r"^/\*.*?\*/\s*", "", source, flags=re.S).strip() + "\n"
        shown = os.path.join(work, os.path.basename(spec["file"]))
        with open(shown, "w", newline="\n") as f:
            f.write(source)
        stages = {}
        for key, flags, title in STAGES:
            stages[key] = capture(flags, shown)
            stages[key]["title"] = title
        programs.append({
            "id": spec["id"], "name": spec["name"], "blurb": spec["blurb"],
            "file": spec["file"], "source": source.strip(), "stages": stages,
        })
        print("captured %s (%d stages)" % (spec["id"], len(stages)))

    cost, chain = [], []
    identical = total = 0
    seeds = []
    for seed in (1, 2):
        d = os.path.join(DATA, "seed%d" % seed)
        with open(os.path.join(d, "cost.json")) as f:
            c = json.load(f)
        with open(os.path.join(d, "chain.json")) as f:
            ch = json.load(f)
        with open(os.path.join(d, "differential.json")) as f:
            diff = json.load(f)
        identical += diff["identical"]
        total += diff["programs"]
        seeds.append({
            "seed": seed,
            "flops": percentiles([r["flops_pct"] for r in c])["median"],
            "instr": percentiles([r["instr_pct"] for r in c])["median"],
            "programs": len(c),
        })
        cost += c
        chain += ch

    helped = [r["flops_pct"] for r in chain if r["flops_pct"] > 0]
    with open(os.path.join(DATA, "baseline-comparison.json")) as f:
        baselines = json.load(f)

    payload = {
        "programs": programs,
        "measurement": {
            "n": len(cost),
            "flops": percentiles([r["flops_pct"] for r in cost]),
            "instr": percentiles([r["instr_pct"] for r in cost]),
            # The page draws two cumulative curves; one point per program is
            # all it needs, rounded to a tenth to keep the file small.
            "flopsAll": sorted(round(r["flops_pct"], 1) for r in cost),
            "instrAll": sorted(round(r["instr_pct"], 1) for r in cost),
            "seeds": seeds,
            "differential": {"identical": identical, "programs": total},
            "chain": {
                "helped": len(helped), "total": len(chain),
                "sharePct": 100.0 * len(helped) / len(chain),
                "medianWhenHelped": percentiles(helped)["median"],
            },
        },
        "baselines": [
            {"name": c["name"], "phases": c["phase_count"]}
            for c in baselines["compilers"]
        ],
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", newline="\n") as f:
        f.write("/* Generated by tools/build-demo.py. Do not edit by hand:\n"
                "   every figure here is captured from bin/matrixc or read\n"
                "   from results/, so editing this file would make the page\n"
                "   disagree with the compiler it describes. */\n")
        f.write("window.MATRIXLANG = ")
        json.dump(payload, f, indent=1, sort_keys=False)
        f.write(";\n")

    print("wrote %s (%.0f KB)" % (OUT, os.path.getsize(OUT) / 1024.0))
    m = payload["measurement"]
    print("  %d programs, arithmetic median %.1f%%, instruction median %.1f%%"
          % (m["n"], m["flops"]["median"], m["instr"]["median"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
