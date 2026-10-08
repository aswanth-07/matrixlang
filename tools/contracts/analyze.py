"""Turn results/contracts/ into the paper's numbers, tables and figures.

Reads only the raw observations the experiment scripts wrote, and writes

    results/contracts/summary.json     every reported statistic
    paper/generated/contracts.tex      LaTeX macros (\\Rq...) used by the paper
    paper/generated/tab-*.tex          tables
    paper/figures/contracts-*.pdf      figures (matplotlib)
    demo/evaluation-data.js            the same statistics for the workspace

Statistics follow the registered plans: two-sided exact sign tests, Holm
correction across the confirmatory tests, medians with seed-cluster
bootstrap 95% intervals (2,000 resamples, fixed seed).

    python tools/contracts/analyze.py
"""

import collections
import json
import math
import re
from pathlib import Path
import random
import statistics
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

R = common.RESULTS
PAPER = common.ROOT / "paper"
INTEGER_DOMAINS = ["bool", "uint8", "int8", "int16", "int32"]
DOMAIN_LABEL = {"bool": "bool", "uint8": "uint8", "int8": "int8", "int16": "int16", "int32": "int32",
                "real": "real(1)", "realx": "real", "mixed": "mixed", "dyadic": "dyadic literals",
                "broad": "broad literals"}


def load(name):
    path = R / name
    return common.read_jsonl(path) if path.exists() else []


def sign_test(wins, losses):
    """Two-sided exact binomial test of P(win) = 1/2."""
    n = wins + losses
    if n == 0:
        return 1.0
    k = min(wins, losses)
    tail = sum(math.comb(n, i) for i in range(0, k + 1)) / 2 ** n
    return min(1.0, 2 * tail)


def holm(pvalues):
    order = sorted(range(len(pvalues)), key=lambda i: pvalues[i])
    adjusted, running = [0.0] * len(pvalues), 0.0
    for rank, i in enumerate(order):
        running = max(running, min(1.0, (len(pvalues) - rank) * pvalues[i]))
        adjusted[i] = running
    return adjusted


def cluster_bootstrap(rows, key, value, resamples=2000, seed=20261008):
    """Median of value over rows, with a 95% interval resampling clusters."""
    clusters = collections.defaultdict(list)
    for row in rows:
        clusters[row[key]].append(value(row))
    names = sorted(clusters)
    point = statistics.median(v for n in names for v in clusters[n])
    rng = random.Random(seed)
    medians = []
    for _ in range(resamples):
        sample = [v for _ in names for v in clusters[rng.choice(names)]]
        medians.append(statistics.median(sample))
    medians.sort()
    return point, medians[int(0.025 * resamples)], medians[int(0.975 * resamples) - 1]


def texp(p):
    """A p-value for LaTeX math mode: 0.058, or 4.6\\times10^{-11}."""
    if p >= 0.001:
        return f"{p:.2g}"
    mant, exp = f"{p:.1e}".split("e")
    return f"{mant}\\times10^{{{int(exp)}}}"


def pct(x, digits=1):
    return f"{100 * x:.{digits}f}"


def num(x):
    return f"{x:,}"


# -- RQ1 ----------------------------------------------------------------------

def rq1(rows):
    ok = [r for r in rows if r["status"] == 0]
    by = collections.defaultdict(list)
    for r in ok:
        by[(r["domain"], r["arm"])].append(r)
    out = {"programs": len({(r["seed"], r["index"], r["profile"], r["domain"]) for r in rows}),
           "failures": sum(r["status"] != 0 for r in rows), "domains": {}}
    for domain in sorted({r["domain"] for r in ok}, key=lambda d: list(DOMAIN_LABEL).index(d)):
        cell = {}
        for arm in ["noproof", "strict", "bounded", "algebraic"]:
            rs = by[(domain, arm)]
            before = sum(r["cost_before"] for r in rs)
            after = sum(r["cost_after"] for r in rs)
            cell[arm] = {"programs": len(rs), "saving": (before - after) / before if before else 0.0,
                         "chains": sum(r["chains"] for r in rs), "bitwise": sum(r["bitwise"] for r in rs),
                         "bounded": sum(r["bounded"] for r in rs), "relaxed": sum(r["relaxed"] for r in rs),
                         "declined_flops": sum(r["flops_declined"] for r in rs),
                         "outputs": collections.Counter(l for r in rs for l in r.get("levels", []))}
        gap = cell["algebraic"]["saving"] - cell["noproof"]["saving"]
        for arm in ["strict", "bounded"]:
            cell[arm]["recovery"] = (cell[arm]["saving"] - cell["noproof"]["saving"]) / gap if gap > 0 else None
        cell["exact_chain_share"] = cell["strict"]["chains"] / cell["algebraic"]["chains"] if cell["algebraic"]["chains"] else None
        out["domains"][domain] = cell
    # Compile time: medians per arm, measured while other compilations ran.
    times = collections.defaultdict(list)
    for r in ok:
        times[r["arm"]].append(r["seconds"])
    out["seconds_median"] = {arm: statistics.median(v) for arm, v in times.items()}
    out["e01_lead_with_exactness"] = any((out["domains"].get(d, {}).get("exact_chain_share") or 0) >= 0.5
                                         for d in INTEGER_DOMAINS)
    return out


# -- RQ2 ----------------------------------------------------------------------

def rq2(rows):
    out = {"programs": len({(r["seed"], r["index"], r["profile"], r["domain"]) for r in rows}),
           "runs": len(rows), "arms": {}}
    for arm in ["noproof", "strict", "bounded", "algebraic"]:
        rs = [r for r in rows if r["arm"] == arm]
        compared = [r for r in rs if "same" in r]
        outputs = sum(len(r["same"]) for r in compared)
        differ = sum(not s for r in compared for s in r["same"])
        levels = collections.Counter()
        level_differ = collections.Counter()
        for r in compared:
            if r["levels"] and len(r["levels"]) == len(r["same"]):
                for level, same in zip(r["levels"], r["same"]):
                    levels[level] += 1
                    level_differ[level] += not same
        # Pessimism: outputs certified below bit-identical whose bits matched on
        # every input draw. Keyed by program and output position.
        per_output = collections.defaultdict(list)
        for r in compared:
            if r["levels"] and len(r["levels"]) == len(r["same"]):
                for k, (level, same) in enumerate(zip(r["levels"], r["same"])):
                    per_output[(r["seed"], r["index"], r["profile"], r["domain"], k, level)].append(same)
        weaker = [v for key, v in per_output.items() if key[-1] != "bit-identical"]
        pessimistic = sum(all(v) for v in weaker)
        out.setdefault("pessimism", {})[arm] = {"weaker_outputs": len(weaker), "always_identical": pessimistic}
        out["arms"][arm] = {"runs": len(rs), "compared": len(compared), "outputs": outputs, "differ": differ,
                            "levels": dict(levels), "level_differ": dict(level_differ),
                            "errors": sum(r["status"] != 0 or r["base_status"] != 0 for r in rs)}
    return out


# -- RQ3 ----------------------------------------------------------------------

def rq3(rows, env):
    """Per family: the compiler's threshold, the closed forms, and the smallest
    m at which a confirmed witness separates the refused bracketing from the
    source order. Below the threshold no witness may exist."""
    out = {"families": {}, "runs": len([r for r in rows if r["alt_same"] is not None])}
    thresholds = env.get("thresholds", {})
    for family in sorted({r["family"] for r in rows}, key=lambda f: [r["family"] for r in rows].index(f)):
        rs = [r for r in rows if r["family"] == family and r["alt_same"] is not None]
        m_star = rs[0]["m_star"]
        witnessed = sorted({r["m"] for r in rs if not r["alt_same"]})
        above = sorted({r["m"] for r in rs if r["m"] > m_star})
        first = min((m for m in witnessed if m > m_star), default=None)
        by_kind = collections.Counter(r["witness"].split("-")[0] for r in rs if not r["alt_same"])
        generic = min((r["m"] for r in rs if not r["alt_same"] and r["m"] > m_star
                       and not r["witness"].startswith("search")), default=None)
        out["families"][family] = {
            "m_star": m_star, **thresholds.get(family, {}),
            "witnessed_at_or_below": sum(1 for m in witnessed if m <= m_star),
            "first_witness": first, "first_witness_offset": (first - m_star) if first else None,
            "above_values": len(above), "above_witnessed": sum(1 for m in above if m in witnessed),
            "witness_kinds": dict(by_kind), "values": len({r["m"] for r in rs}),
            "first_generic_ratio": generic / m_star if generic else None,
            "strict_differ": sum(not r["strict_same"] for r in rs),
            "strict_reorders_at_or_below": sum(r["strict_reorders"] for r in rs if r["m"] <= m_star),
        }
    out["strict_differ_total"] = sum(not r["strict_same"] for r in rows if r["strict_same"] is not None)
    out["witnessed_at_or_below_total"] = sum(c["witnessed_at_or_below"] for c in out["families"].values())
    return out


# -- RQ4 ----------------------------------------------------------------------

def rq4(rows, threads):
    out = {"kernels": {}, "threads": {}}
    for kernel in sorted({r["kernel"] for r in rows}, key=lambda k: [r["kernel"] for r in rows].index(k)):
        cell = {}
        for build in ["strict", "licensed"]:
            rs = [r for r in rows if r["kernel"] == kernel and r["build"] == build]
            cell[build] = {"median_ns": statistics.median(r["median_ns"] for r in rs),
                           "q1_ns": statistics.median(r["q1_ns"] for r in rs),
                           "q3_ns": statistics.median(r["q3_ns"] for r in rs),
                           "checksums": sorted({r["checksum"] for r in rs})}
        cell["speedup"] = cell["strict"]["median_ns"] / cell["licensed"]["median_ns"]
        cell["identical"] = cell["strict"]["checksums"] == cell["licensed"]["checksums"] and \
            len(cell["strict"]["checksums"]) == 1
        out["kernels"][kernel] = cell
    for kernel in sorted({r["kernel"] for r in threads}):
        rs = [r for r in threads if r["kernel"] == kernel]
        out["threads"][kernel] = {"results": len({r["checksum"] for r in rs}),
                                  "max_distinct_per_count": max(r["distinct"] for r in rs),
                                  "counts": sorted({r["threads"] for r in rs}),
                                  "median_ns": {f'{r["build"]}-{r["threads"]}': r["median_ns"] for r in rs}}
    if "dot_i16" in out["kernels"] and "guard_i16" in out["kernels"]:
        out["guard_fraction"] = out["kernels"]["guard_i16"]["licensed"]["median_ns"] / \
            out["kernels"]["dot_i16"]["strict"]["median_ns"]
    return out


# -- RQ4b: generated code ---------------------------------------------------------

KERNEL_INPUTS = {"walks": "bool", "layers": "int8, uint8", "image": "uint8", "normal": "int8, int16",
                 "lowrank": "real(1)", "diffusion": "real(0,1)"}


def rq4b(rows):
    out = {"kernels": {}}
    for kernel in [k for k in KERNEL_INPUTS if any(r["kernel"] == k for r in rows)]:
        rs = {r["config"]: r for r in rows if r["kernel"] == kernel}
        base = rs["source"]["median_ns"]
        cell = {"inputs": KERNEL_INPUTS[kernel], "source_ms": base / 1e6,
                "source_matches_vm": rs["source"]["source_matches_vm"],
                "flops": {c: rs[c]["modeled_flops"] for c in ("source", "strict", "bounded-licensed")},
                "configs": {}}
        for c, r in rs.items():
            cell["configs"][c] = {"speedup": base / r["median_ns"], "same": r["same_as_source"],
                                  "median_us": r["median_ns"] / 1e3, "iqr_us": [r["p25_ns"] / 1e3, r["p75_ns"] / 1e3],
                                  "deterministic": r["deterministic"]}
        cell["distinct_results"] = len({r["output_sha"] for r in rs.values()})
        cell["strict_results"] = len({r["output_sha"] for c, r in rs.items() if c.startswith("strict")})
        cell["algebraic_results"] = len({r["output_sha"] for c, r in rs.items() if c.startswith("algebraic")})
        cell["license_gain"] = rs["strict"]["median_ns"] / rs["strict-licensed"]["median_ns"]
        cell["license_gain_8t"] = rs["strict-8t"]["median_ns"] / rs["strict-licensed-8t"]["median_ns"]
        out["kernels"][kernel] = cell
    ks = out["kernels"].values()
    out["license_gain_range"] = [min(c["license_gain"] for c in ks), max(c["license_gain"] for c in ks)]
    out["license_gain_8t_range"] = [min(c["license_gain_8t"] for c in ks), max(c["license_gain_8t"] for c in ks)]
    out["fast_math_range"] = [min(c["configs"]["source-fast-math"]["speedup"] for c in ks),
                              max(c["configs"]["source-fast-math"]["speedup"] for c in ks)]
    out["all_source_match_vm"] = all(c["source_matches_vm"] for c in ks)
    return out


# -- RQ5 ----------------------------------------------------------------------

MUTANT_IDS = list(range(1, 11))
MUTANT_NAMES = {1: "reorder without proof", 2: "whole chain only", 3: "54-bit threshold",
                4: "$A I$: ignore $-0$", 5: "$A I$: ignore non-finite", 6: "$A+0$: ignore $-0$",
                7: "$A 0$: ignore non-finite", 8: "$0 A$: ignore sign", 9: "negation yields no $-0$",
                10: "one rounding in every sub-chain"}


def rq5(rows):
    pops = ["dyadic", "broad", "domain", "extreme", "fixtures", "witness", "boundary"]
    out = {"populations": {}, "mutants": {}}
    valid = [r for r in rows if r["valid"]]
    for p in pops:
        tests = {r["test"] for r in valid if r["population"] == p}
        out["populations"][p] = len(tests)
    for m in MUTANT_IDS:
        cell = {}
        for p in pops:
            killed = collections.defaultdict(bool)
            for r in valid:
                if r["population"] == p:
                    killed[r["test"]] |= m in r["killed"]
            cell[p] = sum(killed.values())
        out["mutants"][m] = cell
    out["killed_by_any"] = [m for m in MUTANT_IDS if any(out["mutants"][m].values())]
    out["killed_without_boundary"] = [m for m in MUTANT_IDS
                                      if any(v for p, v in out["mutants"][m].items() if p != "boundary")]
    out["invalid"] = sum(not r["valid"] for r in rows)
    return out


# -- RQ6 ----------------------------------------------------------------------

def rq6(rows, validation):
    out = {"chains": len(rows), "validation": {"bracketings": len(validation),
                                               "identical": sum(r["bit_identical"] for r in validation)},
           "profiles": {}, "ablation": {}}
    primary = [r for r in rows if r["optimal_cost"] < r["source_cost"]]
    tests = []
    for profile in ["heterogeneous", "narrow", "pooled"]:
        rs = [r for r in primary if profile == "pooled" or r["profile"] == profile]
        uneq = [r for r in rs if r["source_err"] != r["optimal_err"]]
        wins = sum(r["optimal_err"] < r["source_err"] for r in uneq)
        losses = len(uneq) - wins
        ratio_rows = [r for r in rs if r["source_err"] > 0 and r["optimal_err"] > 0]
        med, lo, hi = cluster_bootstrap(ratio_rows, "seed", lambda r: r["optimal_err"] / r["source_err"])
        cell = {"chains": len(rs), "unequal": len(uneq), "optimal_better": wins, "source_better": losses,
                "p": sign_test(wins, losses), "median_ratio": med, "ratio_ci": [lo, hi]}
        out["profiles"][profile] = cell
        tests.append((profile, cell["p"]))
    for (profile, _), adj in zip(tests, holm([p for _, p in tests])):
        out["profiles"][profile]["p_holm"] = adj
    for profile in ["heterogeneous", "narrow", "square", "pooled"]:
        rs = [r for r in rows if "ablation_first_err" in r and (profile == "pooled" or r["profile"] == profile)]
        uneq = [r for r in rs if r["ablation_first_err"] != r["ablation_second_err"]]
        wins = sum(r["ablation_first_err"] < r["ablation_second_err"] for r in uneq)
        out["ablation"][profile] = {"pairs": len(rs), "unequal": len(uneq), "first_better": wins,
                                    "second_better": len(uneq) - wins, "p": sign_test(wins, len(uneq) - wins),
                                    "by_intermediates": sum(r["ablation_orientation"] == "intermediates" for r in rs)}
    out["bound_exceeded"] = sum(max(r["source_err"], r["optimal_err"]) > r["bound_over_u"] for r in rows)
    out["max_err_over_bound"] = max(max(r["source_err"], r["optimal_err"]) / r["bound_over_u"] for r in rows)
    pooled = out["profiles"]["pooled"]
    out["prediction_holds"] = (pooled["p_holm"] < 0.01 and pooled["optimal_better"] > pooled["source_better"] and
                               all(out["profiles"][p]["optimal_better"] > out["profiles"][p]["source_better"]
                                   for p in ["heterogeneous", "narrow"]))
    out["ablation_removes_effect"] = out["ablation"]["pooled"]["p"] >= 0.01
    return out


# -- outputs ------------------------------------------------------------------

def macro_name(key):
    return "\\Rq" + "".join(part.capitalize() for part in key.replace("-", " ").replace("_", " ").split())


def lines_of(*paths):
    return sum(len((common.ROOT / p).read_text(encoding="utf-8").splitlines()) for p in paths)


def write_macros(s):
    src = [p.relative_to(common.ROOT) for p in (common.ROOT / "src").rglob("*") if p.suffix in (".c", ".h", ".l", ".y")]
    m = {"ImplLoc": num(lines_of(*src)),
         "ImplFactsLoc": num(lines_of("src/ir/facts.c", "src/ir/facts.h", "src/ir/chain.c", "src/ir/chain.h")),
         "ImplInputsLoc": num(lines_of("src/analysis/domain.c", "src/analysis/domain.h",
                                       "src/backend/inputs.c", "src/backend/inputs.h"))}
    one = s.get("rq1")
    if one:
        m["OnePrograms"] = num(one["programs"])
        m["OneCompiles"] = num(one["programs"] * 4)
        for d, cell in one["domains"].items():
            key = d.capitalize()
            for arm in ["noproof", "strict", "bounded", "algebraic"]:
                m[f"OneSave{key}{arm.capitalize()}"] = pct(cell[arm]["saving"])
            for arm in ["strict", "bounded"]:
                if cell[arm].get("recovery") is not None:
                    m[f"OneRecovery{key}{arm.capitalize()}"] = pct(cell[arm]["recovery"])
    two = s.get("rq2")
    if two:
        m["TwoPrograms"] = num(two["programs"])
        m["TwoRuns"] = num(two["runs"])
        for arm, cell in two.get("pessimism", {}).items():
            if cell["weaker_outputs"]:
                m[f"TwoWeaker{arm.capitalize()}"] = num(cell["weaker_outputs"])
                m[f"TwoPessimistic{arm.capitalize()}"] = num(cell["always_identical"])
                m[f"TwoPessimisticPct{arm.capitalize()}"] = pct(cell["always_identical"] / cell["weaker_outputs"])
        for arm, cell in two["arms"].items():
            m[f"TwoOutputs{arm.capitalize()}"] = num(cell["outputs"])
            m[f"TwoDiffer{arm.capitalize()}"] = num(cell["differ"])
            m[f"TwoBitwiseDiffer{arm.capitalize()}"] = num(cell["level_differ"].get("bit-identical", 0))
            m[f"TwoBitwise{arm.capitalize()}"] = num(cell["levels"].get("bit-identical", 0))
            m[f"TwoBounded{arm.capitalize()}"] = num(cell["levels"].get("bound-preserving", 0))
            m[f"TwoBoundedDiffer{arm.capitalize()}"] = num(cell["level_differ"].get("bound-preserving", 0))
            m[f"TwoRelaxed{arm.capitalize()}"] = num(cell["levels"].get("relaxed", 0))
            m[f"TwoRelaxedDiffer{arm.capitalize()}"] = num(cell["level_differ"].get("relaxed", 0))
    three = s.get("rq3")
    if three:
        m["ThreeRuns"] = num(three["runs"])
        m["ThreeStrictDiffer"] = num(three["strict_differ_total"])
        m["ThreeWitnessedBelow"] = num(three["witnessed_at_or_below_total"])
        raises = [c["m_star_closed_form"] / c["m_star_exact_only"] - 1 for c in three["families"].values()]
        m["ThreeRaiseLo"] = pct(min(raises))
        m["ThreeRaiseHi"] = pct(max(raises))
        generic = [c["first_generic_ratio"] for c in three["families"].values() if c["first_generic_ratio"]]
        if generic:
            m["ThreeGenericFirstLo"] = f"{min(generic):.3f}"
        m["ThreeValuesPerFamily"] = num(min(c["values"] for c in three["families"].values()))
    emit = s.get("emit")
    if emit:
        m["EmitPrograms"] = num(emit["programs"])
        m["EmitMismatches"] = num(emit["required_mismatches"])
        m["EmitChangedBounded"] = num(emit["changed"]["bounded"])
        m["EmitChangedAlgebraic"] = num(emit["changed"]["algebraic"])
        m["EmitProductsStrict"] = num(emit["products"]["strict"])
        m["EmitFreeStrict"] = num(emit["free"]["strict"])
        m["EmitFreeBounded"] = num(emit["free"]["bounded"])
    four = s.get("rq4")
    if four and four.get("kernels"):
        for k, cell in four["kernels"].items():
            m["Four" + k.replace("_", " ").title().replace(" ", "") + "Speedup"] = f"{cell['speedup']:.2f}"
        if "guard_fraction" in four:
            m["FourGuardPct"] = pct(four["guard_fraction"])
    e2e = s.get("rq4b")
    if e2e:
        for k, cell in e2e["kernels"].items():
            key = k.capitalize()
            for c in ("source-fast-math", "strict", "strict-licensed", "bounded-licensed", "algebraic-licensed",
                      "strict-licensed-8t"):
                name = "".join(part.capitalize() for part in c.split("-"))
                sp = cell["configs"][c]["speedup"]
                m[f"Etoe{key}{name}"] = f"{sp:.0f}" if sp >= 100 else f"{sp:.1f}" if sp >= 10 else f"{sp:.2f}"
            m[f"Etoe{key}SourceMs"] = f"{cell['source_ms']:.1f}"
            m[f"Etoe{key}Results"] = str(cell["distinct_results"])
        m["EtoeLicenseGainLo"] = f"{e2e['license_gain_range'][0]:.2f}"
        m["EtoeLicenseGainHi"] = f"{e2e['license_gain_range'][1]:.2f}"
        m["EtoeLicenseGainEightLo"] = f"{e2e['license_gain_8t_range'][0]:.2f}"
        m["EtoeLicenseGainEightHi"] = f"{e2e['license_gain_8t_range'][1]:.2f}"
        m["EtoeFastMathHi"] = f"{e2e['fast_math_range'][1]:.2f}"
        m["EtoeFastMathLo"] = f"{e2e['fast_math_range'][0]:.2f}"
    five = s.get("rq5")
    if five:
        m["FiveKilledAny"] = str(len(five["killed_by_any"]))
        for mut, cell in five["mutants"].items():
            for p, kills in cell.items():
                m[f"FiveKill{mut}{p.capitalize()}"] = num(kills)
        for p, n in five["populations"].items():
            m["FiveTests" + p.capitalize()] = num(n)
    width = s.get("width")
    if width:
        m["WidthPrograms"] = num(width["programs_per_width"])
        for b, cell in width["bits"].items():
            if cell["exact_share"] is not None:
                m[f"WidthShare{b}"] = pct(cell["exact_share"], 0)
        m["WidthZeroFrom"] = str(min((int(b) for b, c in width["bits"].items() if c["strict_chains"] == 0), default=0))
    over = s.get("overhead")
    if over:
        m["OverheadPrograms"] = num(over["programs"])
        m["OverheadNoproofMs"] = f"{1e3 * over['median_s']['noproof']:.1f}"
        m["OverheadStrictMs"] = f"{1e3 * over['median_s']['strict']:.1f}"
        m["OverheadRatio"] = f"{over['median_ratio_strict']:.2f}"
        m["OverheadMaxRatio"] = f"{over['max_ratio_strict']:.2f}"
    six = s.get("rq6")
    if six:
        m["SixChains"] = num(six["chains"])
        m["SixValidated"] = num(six["validation"]["identical"])
        m["SixValidations"] = num(six["validation"]["bracketings"])
        for p, cell in six["profiles"].items():
            key = p.capitalize()
            m[f"Six{key}Better"] = num(cell["optimal_better"])
            m[f"Six{key}Unequal"] = num(cell["unequal"])
            m[f"Six{key}Ratio"] = f"{cell['median_ratio']:.3f}"
            m[f"Six{key}RatioLo"] = f"{cell['ratio_ci'][0]:.3f}"
            m[f"Six{key}RatioHi"] = f"{cell['ratio_ci'][1]:.3f}"
            m[f"Six{key}P"] = texp(cell['p_holm'])
        for p, cell in six["ablation"].items():
            key = p.capitalize()
            m[f"SixAbl{key}First"] = num(cell["first_better"])
            m[f"SixAbl{key}Unequal"] = num(cell["unequal"])
            m[f"SixAbl{key}P"] = texp(cell['p'])
        m["SixMaxOverBound"] = f"{six['max_err_over_bound']:.3f}"
    # TeX control words are letters only: int16 becomes IntOneSix.
    words = dict(zip("0123456789", ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"]))
    m = {"".join(words.get(ch, ch) for ch in key): value for key, value in m.items()}
    lines = ["% Generated by tools/contracts/analyze.py from results/contracts/. Do not edit.",
             "% Digits in names are spelled out: \\RqOneSaveIntOneSixStrict is int16 under strict."]
    for key in sorted(m):
        lines.append(f"\\newcommand{{\\Rq{key}}}{{{m[key]}}}")
    (PAPER / "generated").mkdir(parents=True, exist_ok=True)
    (PAPER / "generated" / "contracts.tex").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    return m


def write_tables(s):
    gen = PAPER / "generated"
    one = s.get("rq1")
    if one:
        lines = ["\\begin{tabular}{lrrrrrr}", "\\toprule",
                 "Domain & \\multicolumn{4}{c}{Modeled arithmetic removed (\\%)} & \\multicolumn{2}{c}{Recovery (\\%)}\\\\",
                 "\\cmidrule(lr){2-5}\\cmidrule(lr){6-7}",
                 " & no proofs & strict & bounded & algebraic & strict & bounded\\\\", "\\midrule"]
        for d, cell in one["domains"].items():
            rec = [pct(cell[a]["recovery"]) if cell[a].get("recovery") is not None else "--" for a in ["strict", "bounded"]]
            lines.append(f"\\texttt{{{DOMAIN_LABEL[d]}}} & " + " & ".join(pct(cell[a]["saving"]) for a in
                         ["noproof", "strict", "bounded", "algebraic"]) + " & " + " & ".join(rec) + "\\\\")
        lines += ["\\bottomrule", "\\end{tabular}"]
        (gen / "tab-recovery.tex").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    two = s.get("rq2")
    if two:
        lines = ["\\begin{tabular}{lrrrrrr}", "\\toprule",
                 "Contract & Outputs & Differ & \\multicolumn{2}{c}{Bit-identical} & \\multicolumn{2}{c}{Bound-preserving}\\\\",
                 "\\cmidrule(lr){4-5}\\cmidrule(lr){6-7}", " & & & certified & differ & certified & differ\\\\", "\\midrule"]
        for arm in ["strict", "bounded", "algebraic"]:
            c = two["arms"][arm]
            lines.append(f"{arm} & {num(c['outputs'])} & {num(c['differ'])} & {num(c['levels'].get('bit-identical', 0))} & "
                         f"{num(c['level_differ'].get('bit-identical', 0))} & {num(c['levels'].get('bound-preserving', 0))} & "
                         f"{num(c['level_differ'].get('bound-preserving', 0))}\\\\")
        lines += ["\\bottomrule", "\\end{tabular}"]
        (gen / "tab-soundness.tex").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    three = s.get("rq3")
    if three:
        lines = ["\\begin{tabular}{lrrrrr}", "\\toprule",
                 "Chain & exact only & Thm.~1 & compiler & witness & differ\\\\",
                 "\\midrule"]
        for f, c in three["families"].items():
            off = c["first_witness_offset"]
            first = f"$m^\\star{{+}}{off}$" if off else "--"
            name = f.replace("x", "$\\times$")
            lines.append(f"{name} & {num(c['m_star_exact_only'])} & {num(c['m_star_closed_form'])} & "
                         f"{num(c['m_star'])} & {first} & {c['strict_differ']}\\\\")
        lines += ["\\bottomrule", "\\end{tabular}"]
        (gen / "tab-tightness.tex").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    four = s.get("rq4")
    if four and four.get("kernels"):
        lines = ["\\begin{tabular}{lrrrc}", "\\toprule",
                 "Kernel & strict ($\\mu$s) & licensed ($\\mu$s) & speedup & same bits\\\\", "\\midrule"]
        for k, c in four["kernels"].items():
            if k == "guard_i16":
                continue
            name = k.replace("_", "\\_")
            lines.append(f"\\texttt{{{name}}} & {c['strict']['median_ns'] / 1e3:,.1f} & "
                         f"{c['licensed']['median_ns'] / 1e3:,.1f} & {c['speedup']:.2f}$\\times$ & "
                         f"{'yes' if c['identical'] else 'no'}\\\\")
        lines += ["\\bottomrule", "\\end{tabular}"]
        (gen / "tab-bench.tex").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    e2e = s.get("rq4b")
    if e2e:
        cols = [("source-fast-math", "fast-math"), ("strict", "strict"), ("strict-licensed", "+ clauses"),
                ("bounded-licensed", "bounded"), ("strict-licensed-8t", "8 threads")]
        lines = ["\\begin{tabular}{llr" + "r" * len(cols) + "r}", "\\toprule",
                 "Kernel & Inputs & Source & \\multicolumn{" + str(len(cols)) + "}{c}{Speedup over source} & Results\\\\",
                 "\\cmidrule(lr){4-" + str(3 + len(cols)) + "}",
                 " & & (ms) & " + " & ".join(label for _, label in cols) + " & \\\\", "\\midrule"]

        def fmt(c):
            sp = c["speedup"]
            text = f"{sp:,.0f}" if sp >= 100 else f"{sp:.1f}" if sp >= 10 else f"{sp:.2f}"
            return text if c["same"] else text + "$^\\dagger$"
        for k, cell in e2e["kernels"].items():
            lines.append(f"\\texttt{{{k}}} & \\texttt{{{cell['inputs']}}} & {cell['source_ms']:.3g} & " +
                         " & ".join(fmt(cell["configs"][c]) for c, _ in cols) + f" & {cell['distinct_results']}\\\\")
        lines += ["\\bottomrule", "\\end{tabular}"]
        (gen / "tab-e2e.tex").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    five = s.get("rq5")
    if five:
        pops = ["dyadic", "broad", "domain", "extreme", "fixtures", "witness", "boundary"]
        lines = ["\\begin{tabular}{rl" + "r" * len(pops) + "}", "\\toprule",
                 " & Mutant & " + " & ".join(f"{p} ({five['populations'][p]})" for p in pops) + "\\\\", "\\midrule"]
        for m in MUTANT_IDS:
            lines.append(f"{m} & {MUTANT_NAMES[m]} & " + " & ".join(str(five["mutants"][m][p]) for p in pops) + "\\\\")
        lines += ["\\bottomrule", "\\end{tabular}"]
        (gen / "tab-mutation.tex").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    six = s.get("rq6")
    if six:
        lines = ["\\begin{tabular}{lrrrrl}", "\\toprule",
                 "Population & chains & unequal & cheaper better & $p$ (Holm) & median ratio [95\\% CI]\\\\", "\\midrule"]
        for p, c in six["profiles"].items():
            lines.append(f"{p} & {num(c['chains'])} & {num(c['unequal'])} & {num(c['optimal_better'])} & "
                         f"${texp(c['p_holm'])}$ & {c['median_ratio']:.3f} [{c['ratio_ci'][0]:.3f}, {c['ratio_ci'][1]:.3f}]\\\\")
        lines.append("\\midrule")
        lines.append("\\multicolumn{6}{l}{\\emph{Equal-cost ablation: first = fewer intermediate entries, or enumeration order}}\\\\")
        for p, c in six["ablation"].items():
            lines.append(f"{p} & {num(c['pairs'])} & {num(c['unequal'])} & {num(c['first_better'])} & ${texp(c['p'])}$ & \\\\")
        lines += ["\\bottomrule", "\\end{tabular}"]
        (gen / "tab-accuracy.tex").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


INTRO = [("int8", "examples/demo/exact_chain.ml"), ("real(1)", "examples/demo/real_chain.ml"),
         ("real", "examples/demo/unbounded_chain.ml")]


def write_intro_table():
    """One chain over three domains under three contracts, compiled now."""
    lines = ["\\begin{tabular}{lrrr}", "\\toprule",
             "Inputs & strict & bounded & algebraic\\\\", "\\midrule"]
    short = {"bit-identical": "bit-identical", "bound-preserving": "bound-pres.", "relaxed": "relaxed"}
    for domain, path in INTRO:
        cells = []
        for arm in ["strict", "bounded", "algebraic"]:
            code, out = common.call(common.CONTRACT_FLAGS[arm] + ["--report", "--cost", "--certificate",
                                                                  common.ROOT / path])
            if code:
                raise RuntimeError(out)
            report, levels = common.parse_report(out), common.parse_guarantees(out)
            cells.append(f"{num(report['cost_after'])}, {short[levels[0]]}")
        lines.append(f"\\texttt{{{domain}}} & " + " & ".join(cells) + "\\\\")
    lines += ["\\bottomrule", "\\end{tabular}"]
    (PAPER / "generated" / "tab-intro.tex").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


def write_figures(s):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib unavailable: figures skipped")
        return
    fig_dir = PAPER / "figures"
    fig_dir.mkdir(exist_ok=True)
    plt.rcParams.update({"font.size": 8, "font.family": "serif", "axes.spines.top": False,
                         "axes.spines.right": False})
    one = s.get("rq1")
    if one:
        domains = list(one["domains"])
        arms = [("noproof", "no proofs", "#9aa5ad"), ("strict", "strict", "#0b6e5a"),
                ("bounded", "bounded", "#2c5a86"), ("algebraic", "algebraic", "#b07d1a")]
        fig, ax = plt.subplots(figsize=(3.4, 2.4))
        width = 0.2
        for i, (arm, label, color) in enumerate(arms):
            ax.bar([x + (i - 1.5) * width for x in range(len(domains))],
                   [100 * one["domains"][d][arm]["saving"] for d in domains], width, label=label, color=color)
        ax.set_xticks(range(len(domains)))
        ax.set_xticklabels([DOMAIN_LABEL[d].replace(" literals", " lit.") for d in domains], rotation=50,
                           ha="right", rotation_mode="anchor", fontsize=7)
        ax.set_ylabel("arithmetic removed (%)")
        ax.set_ylim(0, 32)
        ax.legend(frameon=False, ncol=4, fontsize=6.5, loc="upper left", bbox_to_anchor=(0, 1.14),
                  handlelength=1.0, columnspacing=0.8)
        fig.tight_layout()
        fig.savefig(fig_dir / "contracts-recovery.pdf")
        plt.close(fig)
    six = s.get("rq6")
    rows = load("rq6_accuracy.jsonl")
    if six and rows:
        fig, ax = plt.subplots(figsize=(3.4, 2.2))
        for profile, color in (("heterogeneous", "#0b6e5a"), ("narrow", "#2c5a86")):
            ratios = sorted(r["optimal_err"] / r["source_err"] for r in rows
                            if r["profile"] == profile and r["optimal_cost"] < r["source_cost"]
                            and r["source_err"] > 0 and r["optimal_err"] > 0)
            ax.plot(ratios, [i / len(ratios) for i in range(len(ratios))], color=color, label=profile)
        ax.axvline(1.0, color="#777", lw=0.6, ls="--")
        ax.set_xscale("log")
        ax.set_xlabel("error ratio, cost-optimal / source order")
        ax.set_ylabel("cumulative share of chains")
        ax.legend(frameon=False, fontsize=7)
        fig.tight_layout()
        fig.savefig(fig_dir / "contracts-accuracy.pdf")
        plt.close(fig)


def main():
    summary = {}
    if (R / "rq1_recovery.jsonl").exists():
        summary["rq1"] = rq1(load("rq1_recovery.jsonl"))
    if (R / "rq2_soundness.jsonl").exists():
        summary["rq2"] = rq2(load("rq2_soundness.jsonl"))
    if (R / "rq3_tightness.jsonl").exists():
        env = json.loads((R / "rq3_env.json").read_text(encoding="utf-8"))
        summary["rq3"] = rq3(load("rq3_tightness.jsonl"), env)
    if (R / "rq4_bench.jsonl").exists():
        summary["rq4"] = rq4(load("rq4_bench.jsonl"), load("rq4_threads.jsonl"))
    if (R / "e2e.jsonl").exists():
        summary["rq4b"] = rq4b(load("e2e.jsonl"))
    if (R / "emit_check.json").exists():
        data = json.loads((R / "emit_check.json").read_text(encoding="utf-8"))
        products, free = collections.Counter(), collections.Counter()
        for row in data["rows"]:
            for contract, res in row.get("contracts", {}).items():
                found = re.search(r"free: (\d+) of (\d+)", res["free_products"])
                if found:
                    free[contract] += int(found.group(1))
                    products[contract] += int(found.group(2))
        summary["emit"] = {"programs": data["programs"], "required_mismatches": data["required_mismatches"],
                           "changed": data["simd_differs_from_unoptimized"],
                           "products": dict(products), "free": dict(free)}
    if (R / "rq5_mutation.jsonl").exists():
        summary["rq5"] = rq5(load("rq5_mutation.jsonl"))
    if (R / "rq6_accuracy.jsonl").exists():
        summary["rq6"] = rq6(load("rq6_accuracy.jsonl"), load("rq6_validation.jsonl"))
    if (R / "width.jsonl").exists():
        rows = load("width.jsonl")
        widths = {}
        for b in sorted({r["bits"] for r in rows}):
            rs = [r for r in rows if r["bits"] == b]
            applied = sum(r["algebraic_chains"] for r in rs)
            widths[b] = {"programs": len(rs), "algebraic_chains": applied,
                         "strict_chains": sum(r["strict_chains"] for r in rs),
                         "exact_share": sum(r["strict_chains"] for r in rs) / applied if applied else None}
        summary["width"] = {"programs_per_width": len(rows) // len(widths), "bits": widths}
    if (R / "overhead.jsonl").exists():
        rows = load("overhead.jsonl")
        summary["overhead"] = {
            "programs": len(rows),
            "median_s": {arm: statistics.median(r[f"{arm}_s"] for r in rows)
                         for arm in ["noproof", "strict", "bounded", "algebraic"]},
            "median_ratio_strict": statistics.median(r["strict_s"] / r["noproof_s"] for r in rows),
            "max_ratio_strict": max(r["strict_s"] / r["noproof_s"] for r in rows)}
    common.write_json(R / "summary.json", summary)
    macros = write_macros(summary)
    write_tables(summary)
    if common.MATRIXC.exists():
        write_intro_table()
    write_figures(summary)
    (common.ROOT / "demo" / "evaluation-data.js").write_text(
        "/* Generated by tools/contracts/analyze.py from results/contracts/. */\nwindow.MATRIXLANG_EVALUATION = "
        + json.dumps(summary, indent=1, sort_keys=True) + ";\n", encoding="utf-8", newline="\n")
    print(f"summary: {', '.join(summary)}; {len(macros)} macros")


if __name__ == "__main__":
    main()
