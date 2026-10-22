"""Turn the second machine's and the real-data runs into the paper's numbers.

Reads
    results/contracts/e2e.jsonl, e2e_env.json         the first machine (e2e.py)
    results/contracts-linux/e2e.jsonl, e2e_env.json   the second machine, GCC
    results/contracts-linux-clang/e2e.jsonl, ...      the second machine, Clang
    results/contracts-linux/rq4_bench.jsonl, ...      bench.py on the second machine
    results/contracts/e2e_real.jsonl, ..._env.json    e2e_real.py (real data)

and writes
    paper/generated/platforms.tex       LaTeX macros (\\Plat..., \\Real...)
    paper/generated/tab-platforms.tex   RQ4 across machines and compilers
    paper/generated/tab-real.tex        RQ4 on real data
    results/contracts/platforms_summary.json

    python tools/contracts/analyze_platforms.py
"""

import collections
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

ROOT = common.ROOT
GEN = ROOT / "paper" / "generated"
# Macro names cannot hold digits, so the runs are named in words.
RUNS = {"first-gcc": ROOT / "results" / "contracts", "second-gcc": ROOT / "results" / "contracts-linux",
        "second-clang": ROOT / "results" / "contracts-linux-clang"}
CONFIG_WORD = {"strict": "Strict", "bounded-licensed": "Bounded", "algebraic-licensed": "Algebraic",
               "source-fast-math": "FastMath", "strict-licensed": "Clauses", "strict-licensed-8t": "Threads"}
SYNTHETIC = ["walks", "layers", "image", "normal", "lowrank", "diffusion"]
INTEGER = {"walks", "layers", "image", "normal", "cora_walks", "mnist_normal", "mnist_scores"}
REAL = {"cora_walks": ("Cora", "bool"), "cora_diffusion": ("Cora", "real(0,1)"),
        "mnist_normal": ("MNIST", "uint8"), "mnist_scores": ("MNIST", "int8")}
# Like tab-e2e: strict with licensed reductions (+ clauses) is the build to
# compare with the algebraic contract, which also has them.
COLS = [("source-fast-math", "fast-math"), ("strict", "strict"), ("strict-licensed", "+ clauses"),
        ("bounded-licensed", "bounded"), ("algebraic-licensed", "algebraic"),
        ("strict-licensed-8t", "threads")]


def load(path):
    return common.read_jsonl(path) if path.exists() else []


def env(path):
    return json.loads(path.read_text()) if path.exists() else {}


def speed(x):
    return f"{x:,.0f}" if x >= 100 else f"{x:.1f}" if x >= 10 else f"{x:.2f}"


def key(*parts):
    """A macro name from words; configuration names go through CONFIG_WORD."""
    words = [CONFIG_WORD.get(str(part), str(part)) for part in parts]
    name = "".join(p[:1].upper() + p[1:] for w in words for p in w.replace("-", "_").split("_"))
    assert not any(ch.isdigit() for ch in name), name
    return name


def cells(rows, kernel):
    rs = {r["config"]: r for r in rows if r["kernel"] == kernel}
    if "source" not in rs:
        return None
    base = rs["source"]["median_ns"]
    return {"source_ms": base / 1e6, "source_matches_vm": rs["source"]["source_matches_vm"],
            "speedup": {c: base / r["median_ns"] for c, r in rs.items()},
            "same": {c: r["same_as_source"] for c, r in rs.items()},
            "hashes": {c: r["output_sha"] for c, r in rs.items()}}


def main():
    m, summary = {}, {"synthetic": {}, "real": {}}
    runs = {name: load(path / "e2e.jsonl") for name, path in RUNS.items()}
    envs = {name: env(path / "e2e_env.json") for name, path in RUNS.items()}
    for kernel in SYNTHETIC:
        per = {name: cells(rows, kernel) for name, rows in runs.items() if rows}
        per = {k: v for k, v in per.items() if v}
        if not per:
            continue
        hashes = {h for v in per.values() for h in v["hashes"].values()}
        sources = {v["hashes"]["source"] for v in per.values()}
        summary["synthetic"][kernel] = {"runs": per, "distinct_results": len(hashes),
                                        "source_results": len(sources)}
        for name, v in per.items():
            for c in ["strict", "strict-licensed", "bounded-licensed", "algebraic-licensed",
                      "source-fast-math", "strict-licensed-8t"]:
                m[key("Plat", kernel, c, name)] = speed(v["speedup"][c])
    syn = summary["synthetic"]
    if syn:
        m["PlatRuns"] = str(len([r for r in runs.values() if r]))
        m["PlatSourceAgree"] = str(sum(v["source_results"] == 1 for v in syn.values()))
        m["PlatIntegerOneResult"] = str(sum(v["distinct_results"] == 1 for k, v in syn.items()
                                            if k in INTEGER))
        m["PlatIntegerKernels"] = str(sum(k in INTEGER for k in syn))
        for name in runs:
            fm = [v["runs"][name]["speedup"]["source-fast-math"] for v in syn.values() if name in v["runs"]]
            if fm:
                m[key("Plat", "FastMathHi", name)] = speed(max(fm))
        # Strict with licensed reductions against the unproved reordering, on
        # the integer kernels, every run: the price of proving.
        ratios = [v["runs"][n]["speedup"]["strict-licensed"] / v["runs"][n]["speedup"]["algebraic-licensed"]
                  for k, v in syn.items() if k in INTEGER for n in v["runs"]]
        m["PlatStrictOfAlgebraicLo"] = f"{100 * min(ratios):.0f}"
        m["PlatStrictOfAlgebraicHi"] = f"{100 * max(ratios):.0f}"
        m["PlatStrictOfAlgebraicMedian"] = f"{100 * sorted(ratios)[len(ratios) // 2]:.0f}"
        real_kernels = [k for k in syn if k not in INTEGER]
        m["PlatRealResultsMax"] = str(max(syn[k]["distinct_results"] for k in real_kernels))
    for name, e in envs.items():
        if e:
            text = e.get("gcc", "")
            versions = [t for t in text.replace("(", " ").replace(")", " ").split()
                        if t.replace(".", "").isdigit() and t.count(".") >= 1]
            m[key("Plat", "Cc", name)] = ("Clang " if "clang" in text else "GCC ") + versions[-1]
            m[key("Plat", "Cpu", name)] = e.get("cpu", "").replace("(R)", "").replace("(TM)", "").strip()

    real = load(RUNS["first-gcc"] / "e2e_real.jsonl")
    renv = env(RUNS["first-gcc"] / "e2e_real_env.json")
    if real:
        for kernel in REAL:
            for cc in sorted({r["cc"] for r in real}):
                c = cells([r for r in real if r["cc"] == cc], kernel)
                if not c:
                    continue
                summary["real"].setdefault(kernel, {})[cc] = c
                for config in ["strict", "bounded-licensed", "algebraic-licensed", "source-fast-math",
                               "strict-licensed", "strict-licensed-8t"]:
                    m[key("Real", kernel, config, cc)] = speed(c["speedup"][config])
                m[key("Real", kernel, "SourceS", cc)] = f"{c['source_ms'] / 1000:.3g}"
            hashes = {h for c in summary["real"].get(kernel, {}).values() for h in c["hashes"].values()}
            summary["real"].setdefault(kernel, {})["distinct_results"] = len(hashes)
            m[key("Real", kernel, "Results")] = str(len(hashes))
        m["RealCpu"] = renv.get("cpu", "").replace("(R)", "").strip()
        m["RealAllMatchVm"] = "yes" if all(c["source_matches_vm"] for k in summary["real"].values()
                                           for cc, c in k.items() if cc != "distinct_results") else "no"

    GEN.mkdir(parents=True, exist_ok=True)
    lines = ["% Generated by tools/contracts/analyze_platforms.py. Do not edit."]
    lines += [f"\\newcommand{{\\{k}}}{{{v}}}" for k, v in sorted(m.items())]
    (GEN / "platforms.tex").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")

    def row(label, inputs, c, results):
        def fmt(cfg):
            return speed(c["speedup"][cfg]) + ("" if c["same"][cfg] else "$^\\dagger$")
        return (f"{label} & {inputs} & {c['source_ms']:.3g} & " + " & ".join(fmt(cfg) for cfg, _ in COLS) +
                f" & {results}\\\\")

    if syn:
        names = {"first-gcc": "M1, GCC", "second-gcc": "M2, GCC", "second-clang": "M2, Clang"}
        lines = ["\\begin{tabular}{llr" + "r" * len(COLS) + "r}", "\\toprule",
                 "Kernel & Build & Source & \\multicolumn{" + str(len(COLS)) +
                 "}{c}{Speedup over source} & Results\\\\",
                 "\\cmidrule(lr){4-" + str(3 + len(COLS)) + "}",
                 " & & (ms) & " + " & ".join(l for _, l in COLS) + " & \\\\", "\\midrule"]
        for i, (kernel, v) in enumerate(syn.items()):
            if i:
                lines.append("\\addlinespace")
            for j, (name, c) in enumerate(v["runs"].items()):
                label = f"\\texttt{{{kernel}}}" if j == 0 else ""
                results = str(v["distinct_results"]) if j == 0 else ""
                lines.append(row(label, names[name], c, results))
        lines += ["\\bottomrule", "\\end{tabular}"]
        (GEN / "tab-platforms.tex").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    if summary["real"]:
        lines = ["\\begin{tabular}{llr" + "r" * len(COLS) + "r}", "\\toprule",
                 "Kernel & Build & Source & \\multicolumn{" + str(len(COLS)) +
                 "}{c}{Speedup over source} & Results\\\\",
                 "\\cmidrule(lr){4-" + str(3 + len(COLS)) + "}",
                 " & & (ms) & " + " & ".join(l for _, l in COLS) + " & \\\\", "\\midrule"]
        for i, (kernel, per) in enumerate(summary["real"].items()):
            if i:
                lines.append("\\addlinespace")
            data, dom = REAL[kernel]
            for j, cc in enumerate([c for c in per if c != "distinct_results"]):
                label = f"\\texttt{{{kernel.replace('_', chr(92) + '_')}}}" if j == 0 else ""
                results = str(per["distinct_results"]) if j == 0 else ""
                lines.append(row(label, {"gcc": "GCC", "clang": "Clang"}.get(cc, cc), per[cc], results))
        lines += ["\\bottomrule", "\\end{tabular}"]
        (GEN / "tab-real.tex").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    common.write_json(ROOT / "results" / "contracts" / "platforms_summary.json", summary)
    print(f"platforms: {len(m)} macros")


if __name__ == "__main__":
    main()
