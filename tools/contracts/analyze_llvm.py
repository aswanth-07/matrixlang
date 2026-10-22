"""Turn the LLVM study's raw files into the paper's numbers and tables.

Reads results/contracts/llvm_*.json(l) (written by llvm_data.py, llvm_eval.py,
llvm_scan.py and llvm_audioop.py) and writes

    paper/generated/llvm.tex             LaTeX macros (\\Llvm...)
    paper/generated/tab-llvm-bench.tex   RQ7: speed and bits per kernel
    paper/generated/tab-llvm-stress.tex  RQ8: mismatching stress cases per build
    paper/generated/tab-llvm-scan.tex    RQ9: decisions in existing code bases
    results/contracts/llvm_summary.json  every statistic above

    python tools/contracts/analyze_llvm.py
"""

import collections
import json
from pathlib import Path
import statistics
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

R = common.RESULTS
GEN = common.ROOT / "paper" / "generated"

# kernel: (label, data, element type)
KERNELS = {
    "sum_u8": ("sum", "MNIST", "uint8"),
    "sumsq_u8": ("sum of squares", "MNIST", "uint8"),
    "gram_u8": ("Gram matrix", "MNIST", "uint8"),
    "qlinear_i8": ("int8 classifier", "MNIST", "int8, binary32"),
    "degree_u8": ("degrees", "Cora", "uint8"),
    "walks2_u8": ("2-walks", "Cora", "uint8, int16"),
    "gemm_i8": ("GEMM", "generated", "int8"),
    "energy_i16": ("energy", "generated", "int16"),
    "sum_i32": ("sum", "generated", "int32"),
    "dot_f64": ("dot product", "generated", "binary64"),
    "sum_u8_f32": ("sum, binary32", "MNIST", "uint8, binary32"),
}
CONTROLS = {"dot_f64", "sum_u8_f32"}
# Each guarded stress kernel's admissible trip count (2^p / K), from kernels.c.
LIMITS = {"sum_u8_f32": (1 << 24) // 255, "energy_i16": 1 << 23, "sum_i32": 1 << 22,
          "qlinear_i8": 1024}
SCAN_LABEL = {"audioop": "CPython \\texttt{audioop}", "pillow": "Pillow \\texttt{libImaging}",
              "ndimage": "SciPy \\texttt{ndimage}", "polybench": "PolyBench/C"}


def load(name):
    path = R / name
    return common.read_jsonl(path) if path.exists() else []


def num(x):
    return f"{x:,}"


WORDS = {"2": "Two", "8": "Eight", "16": "Sixteen", "32": "ThirtyTwo", "64": "SixtyFour"}


def words(name):
    """A macro name part with digits spelled out (u8 -> UEight)."""
    out = ""
    for part in name.replace("-", "_").split("_"):
        head = part.rstrip("0123456789")
        digits = part[len(head):]
        out += head[:1].upper() + head[1:] + WORDS.get(digits, digits)
    assert not any(ch.isdigit() for ch in out), name
    return out


def speed(x):
    return f"{x:,.0f}" if x >= 100 else f"{x:.1f}" if x >= 10 else f"{x:.2f}"


def write(name, lines):
    (GEN / name).write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


def kernel_of(function):
    return function[2:] if function.startswith("k_") else function


def bench(rows, decisions):
    by = {(r["kernel"], r["config"]): r for r in rows}
    decided = {kernel_of(d["function"]): d for d in decisions}
    out = {}
    for k in KERNELS:
        if (k, "clang-strict") not in by:
            continue
        base = by[(k, "clang-strict")]["median_ns"]
        cell = {"strict_ms": base / 1e6, "decision": decided[k]["decision"] if k in decided else None,
                "configs": {}}
        for (kk, c), r in by.items():
            if kk == k:
                cell["configs"][c] = {"speedup": base / r["median_ns"], "same": r["same_as_strict"],
                                      "deterministic": r["deterministic"]}
        out[k] = cell
    return out


def stress(rows):
    configs = [c for c in rows[0] if c not in ("kernel", "family", "n", "strict")] if rows else []
    out = {"cases": len(rows), "kernels": len({r["kernel"] for r in rows}),
           "families": len({r["family"] for r in rows}), "configs": {}}
    for c in configs:
        bad = [r for r in rows if not r[c]]
        ints = [r for r in bad if r["kernel"] != "dot_f64"]
        out["configs"][c] = {"integer": len(ints),
                             "real": sum(r["kernel"] == "dot_f64" for r in bad),
                             "by_kernel": dict(collections.Counter(r["kernel"] for r in bad)),
                             # integer mismatches at or below the guard's limit, and
                             # the largest trip count relative to it
                             "within_limit": sum(r["kernel"] not in LIMITS or
                                                 r["n"] <= LIMITS[r["kernel"]] for r in ints),
                             "max_over_limit": max((r["n"] / LIMITS[r["kernel"]] for r in ints
                                                    if r["kernel"] in LIMITS), default=0)}
    out["integer_cases"] = sum(r["kernel"] != "dot_f64" for r in rows)
    out["real_cases"] = sum(r["kernel"] == "dot_f64" for r in rows)
    return out


def reason_class(reason):
    if reason.startswith("a term has no grid fact") or reason.startswith("the chain"):
        return "no fact"
    if "not exact" in reason or "not even one" in reason or "exceed the admissible" in reason:
        return "inexact"
    return "shape"


def scan(rows):
    out = {}
    for cb in SCAN_LABEL:
        mine = [r for r in rows if r["code_base"] == cb]
        reds = [d for r in mine if not r["skipped"] for d in r["reductions"]]
        declined = [d for d in reds if d["decision"] == "declined"]
        out[cb] = {"files": len(mine), "skipped": sum(bool(r["skipped"]) for r in mine),
                   "reductions": len(reds),
                   "licensed": sum(d["decision"] == "licensed" for d in reds),
                   "versioned": sum(d["decision"] == "versioned" for d in reds),
                   "declined": len(declined),
                   "reasons": dict(collections.Counter(reason_class(d["reason"]) for d in declined)),
                   "functions": sorted({d["function"] for d in reds if d["decision"] != "declined"})}
    return out


def audioop(rows):
    results = [r for r in rows if r["kind"] == "result"]
    times = {r["function"]: r["strict_ns"] / r["licensed_ns"] for r in rows if r["kind"] == "time"}
    return {"results": len(results), "identical": sum(r["same"] for r in results),
            "functions": sorted({r["function"] for r in results}), "speedup": times}


def compile_cost(rows):
    by = {r["config"]: r for r in rows}
    if not by:
        return {}
    s, l = by["clang-strict"], by["clang-licensed"]
    return {"strict_s": s["median_s"], "licensed_s": l["median_s"],
            "time_ratio": l["median_s"] / s["median_s"],
            "text_growth": l["text_bytes"] / s["text_bytes"] - 1}


def macros(s):
    m = {}
    b = s["bench"]
    ints = [k for k in b if k not in CONTROLS]
    if ints:
        def rng(config):
            xs = [b[k]["configs"][config]["speedup"] for k in ints]
            return min(xs), max(xs)
        for config, key in [("clang-licensed", "Licensed"), ("clang-fast-math", "FastMath"),
                            ("clang-licensed-sse2", "LicensedSse"), ("gcc-fast-math", "GccFastMath"),
                            ("gcc-strict", "GccStrict")]:
            lo, hi = rng(config)
            m[f"Bench{key}Lo"], m[f"Bench{key}Hi"] = speed(lo), speed(hi)
        for k in b:
            for config, ck in [("clang-licensed", "Licensed"), ("clang-fast-math", "FastMath"),
                               ("clang-licensed-sse2", "LicensedSse")]:
                m[f"Kernel{words(k)}{ck}"] = speed(b[k]["configs"][config]["speedup"])
        m["BenchKernels"] = num(len(b))
        m["BenchIntKernels"] = num(len(ints))
        m["BenchIntSame"] = num(sum(all(c["same"] for c in b[k]["configs"].values()) for k in ints))
        dec = collections.Counter(b[k]["decision"] for k in b)
        m["BenchStatic"], m["BenchGuarded"], m["BenchDeclined"] = (
            num(dec["licensed"]), num(dec["versioned"]), num(dec["declined"]))
        for k in CONTROLS & set(b):
            key = {"dot_f64": "DotReal", "sum_u8_f32": "SumSingle"}[k]
            for config, ck in [("clang-licensed", "Licensed"), ("clang-fast-math", "FastMath")]:
                m[f"Bench{key}{ck}"] = speed(b[k]["configs"][config]["speedup"])
        best = max(ints, key=lambda k: b[k]["configs"]["clang-licensed"]["speedup"] /
                   b[k]["configs"]["clang-fast-math"]["speedup"])
        ratios = [b[k]["configs"]["clang-licensed"]["speedup"] / b[k]["configs"]["clang-fast-math"]["speedup"]
                  for k in ints]
        m["BenchOfFastMathLo"] = f"{100 * min(ratios):.0f}"
        m["BenchOfFastMathHi"] = f"{100 * max(ratios):.0f}"
        del best
    st = s["stress"]
    if st["cases"]:
        m["StressCases"], m["StressKernels"], m["StressFamilies"] = (
            num(st["cases"]), num(st["kernels"]), num(st["families"]))
        m["StressIntCases"], m["StressRealCases"] = num(st["integer_cases"]), num(st["real_cases"])
        for c, key in [("clang-licensed", "Licensed"), ("clang-licensed-sse2", "LicensedSse"),
                       ("clang-fast-math", "FastMath"), ("gcc-strict", "GccStrict"),
                       ("gcc-fast-math", "GccFastMath"), ("mutant-extra-bit", "MutantBit"),
                       ("mutant-force", "MutantForce")]:
            m[f"Stress{key}Int"] = num(st["configs"][c]["integer"])
            m[f"Stress{key}Real"] = num(st["configs"][c]["real"])
            m[f"Stress{key}Within"] = num(st["configs"][c]["within_limit"])
    sc = s["scan"]
    if sc:
        tot = {k: sum(v[k] for v in sc.values()) for k in
               ["files", "skipped", "reductions", "licensed", "versioned", "declined"]}
        for k, v in tot.items():
            m[f"Scan{k.capitalize()}"] = num(v)
        reasons = collections.Counter()
        for v in sc.values():
            reasons.update(v["reasons"])
        m["ScanNoFact"], m["ScanInexact"], m["ScanShape"] = (
            num(reasons["no fact"]), num(reasons["inexact"]), num(reasons["shape"]))
        for cb, v in sc.items():
            key = cb.capitalize()
            m[f"Scan{key}Reductions"] = num(v["reductions"])
            m[f"Scan{key}Versioned"] = num(v["versioned"])
            m[f"Scan{key}Licensed"] = num(v["licensed"])
            m[f"Scan{key}Declined"] = num(v["declined"])
    a = s["audioop"]
    if a.get("results"):
        m["AudioopResults"], m["AudioopIdentical"] = num(a["results"]), num(a["identical"])
        for fn, x in a["speedup"].items():
            m["Audioop" + words(fn)] = speed(x)
    c = s["compile"]
    if c:
        m["CompileStrictMs"] = f"{1000 * c['strict_s']:.0f}"
        m["CompileLicensedMs"] = f"{1000 * c['licensed_s']:.0f}"
        m["CompileOverheadPct"] = f"{100 * (c['time_ratio'] - 1):.0f}"
        m["CompileTextGrowthPct"] = f"{100 * c['text_growth']:.0f}"
    d = s["data"]
    if d:
        m["DataMnistAccuracy"] = f"{100 * d['mnist']['int8_accuracy']:.1f}"
        m["DataMnistFloatAccuracy"] = f"{100 * d['mnist']['float_accuracy']:.1f}"
        m["DataCoraVertices"] = num(d["cora"]["vertices"])
        m["DataCoraEdges"] = num(d["cora"]["undirected_edges"])
        m["DataCoraMaxDegree"] = num(d["cora"]["max_degree"])
    m["PassLoc"] = num(len((common.ROOT / "llvm" / "ExactReduce.cpp").read_text().splitlines()))
    env = s["env"]
    if env:
        m["Clang"] = env["compilers"]["clang"].split("version")[1].split()[0]
        m["Gcc"] = env["compilers"]["gcc"].split()[-1]
        m["Cpu"] = env["cpu"].replace("(R)", "").replace("@ ", "").strip()
        m["Cores"] = num(env["cores"])
    lines = ["% Generated by tools/contracts/analyze_llvm.py from results/contracts/llvm_*. Do not edit."]
    for key in sorted(m):
        assert not any(ch.isdigit() for ch in key), key
        lines.append(f"\\newcommand{{\\Llvm{key}}}{{{m[key]}}}")
    write("llvm.tex", lines)
    return m


def tables(s):
    b = s["bench"]
    if b:
        cols = [("clang-licensed", "licensed"), ("clang-fast-math", "fast-math"),
                ("clang-licensed-sse2", "lic.\\ SSE2"), ("gcc-strict", "GCC"),
                ("gcc-fast-math", "GCC f.-m.")]
        word = {"licensed": "static", "versioned": "guarded", "declined": "declined"}
        lines = ["\\begin{tabular}{lllrrrrrr}", "\\toprule",
                 "Kernel & Data & Licence & Strict & \\multicolumn{5}{c}{Speedup over strict Clang}\\\\",
                 "\\cmidrule(lr){5-9}",
                 " & & & (ms) & " + " & ".join(l for _, l in cols) + "\\\\", "\\midrule"]
        for k, cell in b.items():
            label, data, _ = KERNELS[k]
            if k == "dot_f64":
                lines.append("\\midrule")
            def fmt(c):
                x = cell["configs"][c]
                return speed(x["speedup"]) + ("" if x["same"] else "$^\\dagger$")
            lines.append(f"{label} & {data} & {word.get(cell['decision'], '--')} & "
                         f"{cell['strict_ms']:.3g} & " + " & ".join(fmt(c) for c, _ in cols) + "\\\\")
        lines += ["\\bottomrule", "\\end{tabular}"]
        write("tab-llvm-bench.tex", lines)
    st = s["stress"]
    if st["cases"]:
        names = [("clang-licensed", "Clang + ExactReduce"), ("clang-licensed-sse2", "Clang + ExactReduce, SSE2"),
                 ("gcc-strict", "GCC, strict"), ("clang-fast-math", "Clang \\texttt{-ffast-math}"),
                 ("gcc-fast-math", "GCC \\texttt{-ffast-math}"),
                 ("mutant-extra-bit", "mutant: one bit more"), ("mutant-force", "mutant: no proof")]
        lines = ["\\begin{tabular}{lrr}", "\\toprule",
                 f"Build & integer ({num(st['integer_cases'])}) & real ({num(st['real_cases'])})\\\\",
                 "\\midrule"]
        for c, label in names:
            x = st["configs"][c]
            lines.append(f"{label} & {x['integer']} & {x['real']}\\\\")
        lines += ["\\bottomrule", "\\end{tabular}"]
        write("tab-llvm-stress.tex", lines)
    sc = s["scan"]
    if sc:
        lines = ["\\begin{tabular}{lrrrrrrr}", "\\toprule",
                 "Code base & Files & \\multicolumn{3}{c}{Add reductions} & \\multicolumn{3}{c}{Declined: why}\\\\",
                 "\\cmidrule(lr){3-5}\\cmidrule(lr){6-8}",
                 " & & static & guarded & declined & no fact & inexact & shape\\\\", "\\midrule"]
        for cb, v in sc.items():
            compiled = v["files"] - v["skipped"]
            files = f"{compiled}" if not v["skipped"] else f"{compiled} of {v['files']}"
            r = v["reasons"]
            lines.append(f"{SCAN_LABEL[cb]} & {files} & {v['licensed']} & {v['versioned']} & "
                         f"{v['declined']} & {r.get('no fact', 0)} & {r.get('inexact', 0)} & {r.get('shape', 0)}\\\\")
        lines += ["\\bottomrule", "\\end{tabular}"]
        write("tab-llvm-scan.tex", lines)


def main():
    env_path = R / "llvm_env.json"
    data_path = R / "llvm_data.json"
    s = {"bench": bench(load("llvm_bench.jsonl"), load("llvm_decisions.jsonl")),
         "stress": stress(load("llvm_stress.jsonl")),
         "scan": scan(load("llvm_scan.jsonl")),
         "audioop": audioop(load("llvm_audioop.jsonl")),
         "compile": compile_cost(load("llvm_compile.jsonl")),
         "data": json.loads(data_path.read_text()) if data_path.exists() else {},
         "env": json.loads(env_path.read_text()) if env_path.exists() else {}}
    GEN.mkdir(parents=True, exist_ok=True)
    m = macros(s)
    tables(s)
    summary = {k: v for k, v in s.items() if k != "env"}
    common.write_json(R / "llvm_summary.json", summary)
    print(f"LLVM study: {len(m)} macros")


if __name__ == "__main__":
    main()
