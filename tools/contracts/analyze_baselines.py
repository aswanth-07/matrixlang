"""RQ7's two added baselines on M1, measured by llvm_eval.py under WSL.

The license and ExactReduce's integer rewrite (EXACT_REDUCE_INTEGER=1) are
compared with the two other ways to make these reductions fast without
changing their bits: rewriting them by hand to accumulate in integers
(llvm/kernels/intacc.c), and LLVM's in-order vector reductions
(-force-ordered-reductions). All builds are timed on one machine in one run.

Reads
    results/contracts-wsl/llvm_bench.jsonl, llvm_stress.jsonl, llvm_env.json

and writes
    paper/generated/baselines.tex        LaTeX macros (\\Base...)
    paper/generated/tab-llvm-baselines.tex
    paper/figures/llvm-routes.pdf        every route, per kernel

    python tools/contracts/analyze_baselines.py
"""

import json
import statistics
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

ROOT = common.ROOT
RUN = ROOT / "results" / "contracts-wsl"
GEN = ROOT / "paper" / "generated"
INTEGER = ["sum_u8", "sumsq_u8", "gram_u8", "qlinear_i8", "degree_u8", "walks2_u8", "gemm_i8",
           "energy_i16", "sum_i32"]
LABEL = {"sum_u8": "sum", "sumsq_u8": "sum of squares", "gram_u8": "Gram matrix",
         "qlinear_i8": "int8 classifier", "degree_u8": "degrees", "walks2_u8": "2-walks",
         "gemm_i8": "GEMM", "energy_i16": "energy", "sum_i32": "sum (int32)"}
COLS = [("clang-ordered", "ordered"), ("clang-licensed", "licensed"),
        ("clang-int-rewrite", "rewrite"), ("int-accumulator", "by hand"),
        ("clang-fast-math", "fast-math")]
FIGURE = ROOT / "paper" / "figures" / "llvm-routes.pdf"


def records(name):
    with open(RUN / name, encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]


def speed(x):
    return f"{x:.3g}" if x < 100 else f"{x:,.0f}"


def main():
    bench = {(r["kernel"], r["config"]): r for r in records("llvm_bench.jsonl")}
    env = json.loads((RUN / "llvm_env.json").read_text(encoding="utf-8"))

    def up(kernel, config):
        return bench[(kernel, "clang-strict")]["median_ns"] / bench[(kernel, config)]["median_ns"]

    m = {"BaseCpu": env["cpu"].replace("(R)", "").replace("(TM)", "").strip(),
         "BaseCores": str(env["cores"]),
         "BaseClang": env["compilers"]["clang"].split("version")[1].split()[0]}
    for config, word in [("clang-licensed", "Licensed"), ("int-accumulator", "Int"),
                         ("clang-ordered", "Ordered"), ("clang-fast-math", "FastMath"),
                         ("clang-int-rewrite", "Rewrite")]:
        s = [up(k, config) for k in INTEGER]
        m[f"Base{word}Lo"], m[f"Base{word}Hi"] = speed(min(s)), speed(max(s))
        m[f"Base{word}Median"] = speed(statistics.median(s))
    # How close the license comes to the hand-written integer code, per kernel.
    ratio = [bench[(k, "int-accumulator")]["median_ns"] / bench[(k, "clang-licensed")]["median_ns"]
             for k in INTEGER]
    m["BaseLicensedOfIntLo"] = f"{100 * min(ratio):.0f}"
    m["BaseLicensedOfIntHi"] = f"{100 * max(ratio):.0f}"
    m["BaseLicensedOfIntMedian"] = f"{100 * statistics.median(ratio):.0f}"
    # How close the automatic integer rewrite comes to the hand-written code.
    rw = [bench[(k, "int-accumulator")]["median_ns"] / bench[(k, "clang-int-rewrite")]["median_ns"]
          for k in INTEGER]
    m["BaseRewriteOfIntLo"] = f"{100 * min(rw):.0f}"
    m["BaseRewriteOfIntHi"] = f"{100 * max(rw):.0f}"
    m["BaseRewriteOfIntMedian"] = f"{100 * statistics.median(rw):.0f}"
    over = [bench[(k, "clang-licensed")]["median_ns"] / bench[(k, "clang-int-rewrite")]["median_ns"]
            for k in INTEGER]
    m["BaseRewriteOverLicensedLo"] = speed(min(over))
    m["BaseRewriteOverLicensedHi"] = speed(max(over))
    m["BaseRewriteOverLicensedMedian"] = speed(statistics.median(over))
    m["BaseShortRewrite"] = speed(up("sum_u8_short", "clang-int-rewrite"))
    same = [bench[(k, c)]["same_as_strict"] for k in INTEGER
            for c in ["clang-licensed", "int-accumulator", "clang-ordered", "clang-int-rewrite"]]
    m["BaseSameBits"], m["BaseSameBitsOf"] = str(sum(same)), str(len(same))
    m["BaseShortLicensed"] = speed(up("sum_u8_short", "clang-licensed"))
    m["BaseShortInt"] = speed(up("sum_u8_short", "int-accumulator"))
    m["BaseShortOrdered"] = speed(up("sum_u8_short", "clang-ordered"))
    controls = ["dot_f64", "sum_u8_f32"]
    m["BaseOrderedControlSame"] = str(sum(bench[(k, "clang-ordered")]["same_as_strict"] for k in controls))
    m["BaseOrderedControlSpeedLo"] = speed(min(up(k, "clang-ordered") for k in controls))
    m["BaseOrderedControlSpeedHi"] = speed(max(up(k, "clang-ordered") for k in controls))
    spread = []
    for r in bench.values():
        q1, _, q3 = statistics.quantiles(r["process_medians_ns"], n=4, method="inclusive")
        spread.append((q3 - q1) / r["median_ns"])
    m["BaseSpreadMedian"] = f"{100 * statistics.median(spread):.0f}"
    m["BaseSpreadMax"] = f"{100 * max(spread):.0f}"

    stress = records("llvm_stress.jsonl")
    m["BaseStressCases"] = str(len(stress))
    for config, word in [("clang-licensed", "Licensed"), ("clang-ordered", "Ordered"),
                         ("clang-fast-math", "FastMath"), ("mutant-extra-bit", "MutantBit"),
                         ("clang-int-rewrite", "Rewrite")]:
        m[f"BaseStress{word}Changed"] = str(sum(not r[config] for r in stress))
    # The real-valued control is where strict builds already disagree (fused
    # multiply-add contraction); the integer kernels are where the bits matter.
    for config, word in [("clang-ordered", "Ordered"), ("clang-licensed", "Licensed"),
                         ("clang-int-rewrite", "Rewrite")]:
        m[f"BaseStress{word}IntChanged"] = str(sum(not r[config] for r in stress if r["kernel"] != "dot_f64"))
        m[f"BaseStress{word}RealChanged"] = str(sum(not r[config] for r in stress if r["kernel"] == "dot_f64"))
    m["BaseStressRealCases"] = str(sum(r["kernel"] == "dot_f64" for r in stress))
    tier = RUN / "llvm_tier32.json"
    if tier.exists():
        t = json.loads(tier.read_text(encoding="utf-8"))
        m["BaseTierCases"] = str(t["cases"])
        m["BaseTierIntegerSame"] = str(t["builds"]["integer"]["same_as_strict"])
        m["BaseTierMutantChanged"] = str(len(t["builds"]["mutant"]["changed"]))

    GEN.mkdir(parents=True, exist_ok=True)
    lines = ["% Generated by tools/contracts/analyze_baselines.py. Do not edit."]
    lines += [f"\\newcommand{{\\{k}}}{{{v}}}" for k, v in sorted(m.items())]
    (GEN / "baselines.tex").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")

    rows = ["\\begin{tabular}{lr" + "r" * len(COLS) + "}", "\\toprule",
            "Kernel & Strict & \\multicolumn{" + str(len(COLS)) + "}{c}{Speedup over strict Clang}\\\\",
            "\\cmidrule(lr){3-" + str(2 + len(COLS)) + "}",
            " & (ms) & " + " & ".join(l for _, l in COLS) + "\\\\", "\\midrule"]
    for k in INTEGER:
        cells = []
        for c, _ in COLS:
            cells.append(speed(up(k, c)) + ("" if bench[(k, c)]["same_as_strict"] else "$^\\dagger$"))
        rows.append(f"{LABEL[k]} & {bench[(k, 'clang-strict')]['median_ns'] / 1e6:.3g} & " +
                    " & ".join(cells) + "\\\\")
    rows += ["\\bottomrule", "\\end{tabular}"]
    (GEN / "tab-llvm-baselines.tex").write_text("\n".join(rows) + "\n", encoding="utf-8", newline="\n")
    figure(bench, up)
    print(f"baselines: {len(m)} macros")
    for k, v in sorted(m.items()):
        print(f"  {k} = {v}")


def figure(bench, up):
    """Speedup over strict Clang per kernel and route, on a log scale.

    Greyscale and colour-blind safe: the routes differ in grey level and hatch.
    A ring marks every bar whose output differs from strict Clang (none does).
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    plt.rcParams.update({"font.family": "serif", "font.size": 7.5, "pdf.fonttype": 42,
                         "axes.linewidth": 0.6})
    routes = [("clang-ordered", "in-order reductions", "0.85", ""),
              ("clang-licensed", "ExactReduce license", "0.6", ""),
              ("clang-int-rewrite", "ExactReduce integer rewrite", "0.15", ""),
              ("int-accumulator", "integer code by hand", "white", "////"),
              ("clang-fast-math", "-ffast-math", "white", "....")]
    short = {"sum_u8": "sum", "sumsq_u8": "sum sq.", "gram_u8": "Gram", "qlinear_i8": "int8 clf.",
             "degree_u8": "degrees", "walks2_u8": "2-walks", "gemm_i8": "GEMM",
             "energy_i16": "energy", "sum_i32": "sum i32"}
    fig, ax = plt.subplots(figsize=(5.4, 1.7))
    width = 0.16
    for j, (config, label, grey, hatch) in enumerate(routes):
        xs = [i + (j - 2) * width for i in range(len(INTEGER))]
        ys = [up(k, config) for k in INTEGER]
        ax.bar(xs, ys, width, label=label, color=grey, hatch=hatch, edgecolor="black", linewidth=0.4)
        for x, k, y in zip(xs, INTEGER, ys):
            if not bench[(k, config)]["same_as_strict"]:
                ax.plot([x], [y], marker="o", mfc="none", mec="black", ms=5)
    ax.axhline(1.0, color="black", linewidth=0.5)
    ax.set_yscale("log")
    ax.set_ylim(0.8, 25)
    ax.set_yticks([1, 2, 5, 10, 20])
    ax.set_yticklabels(["1", "2", "5", "10", "20"])
    ax.set_ylabel("speedup over strict Clang")
    ax.set_xticks(range(len(INTEGER)))
    ax.set_xticklabels([short[k] for k in INTEGER])
    ax.set_xlim(-0.55, len(INTEGER) - 0.45)
    ax.legend(ncol=3, fontsize=6.8, frameon=False, loc="lower center", bbox_to_anchor=(0.5, 1.0),
              handlelength=1.8, columnspacing=1.4)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    FIGURE.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(FIGURE, bbox_inches="tight", pad_inches=0.02)
    plt.close(fig)


if __name__ == "__main__":
    main()
