"""Before-and-after evidence for the repair of the bound arithmetic in facts.c.

Magnitude bounds decide exactness, so the compiler computes them with upward
rounding. Two helpers could still understate: mul_up lost a positive fma
residual that fell below the subnormal range, and facts_chain_bound rounded
prod(1 + gamma) to nearest before subtracting one. This script builds the
compiler at the commit the paper's measurements ran on (--before) and the
working tree, and

1. checks both bound arithmetics against exact rationals: the mul_up cases of
   tests/test_bound_arithmetic.py on generic x86-64 (library fma) and Haswell
   (hardware FMA), fits() on an overflowed bound, and the chain coefficient on
   85 dimension lists;
2. compiles and runs every example under every contract with both compilers
   and compares certificates, explanations, outputs and emitted C byte for byte;
3. with --rerun DIR, compares the records of deterministic studies rerun into
   DIR (CONTRACTS_RESULTS=DIR) with results/contracts/, timing fields excluded.

Writes results/contracts/bound_repair.json and paper/generated/repair.tex.

    python tools/contracts/bound_repair.py [--before 25f3a20] [--rerun build/rerun]
"""

import argparse
import io
import json
import math
import os
import random
import shutil
import subprocess
import sys
import tarfile
from fractions import Fraction
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

ROOT = common.ROOT
GEN = ROOT / "paper" / "generated"
WORK = ROOT / "build" / "bound-repair"
AREAS = ["frontend", "analysis", "ir", "backend", "support"]
CONTRACTS = ["strict", "bounded", "algebraic"]
UNIT = Fraction(1, 1 << 53)
# Study records carry timings next to deterministic fields; only the latter
# are expected to repeat. Matched as whole keys or unit suffixes, never as
# substrings ("programs" contains "ms").
TIMING_KEYS = {"seconds", "elapsed", "time", "wall"}
TIMING_SUFFIXES = ("_ns", "_ms", "_s", "_seconds")


def tool_env():
    env = dict(os.environ)
    if os.name == "nt":
        env["PATH"] = os.pathsep.join(["C:/msys64/usr/bin", "C:/msys64/mingw64/bin", env.get("PATH", "")])
    return env


def build_before(rev):
    """Extract src/ and the Makefile at rev into WORK/before and build it."""
    tree = WORK / "before"
    if tree.exists():
        shutil.rmtree(tree)
    tree.mkdir(parents=True)
    data = subprocess.run(["git", "archive", rev, "src", "Makefile"], cwd=ROOT, capture_output=True,
                          check=True).stdout
    with tarfile.open(fileobj=io.BytesIO(data)) as tar:
        tar.extractall(tree)
    make = shutil.which("make", path=tool_env()["PATH"]) or "make"
    subprocess.run([make, "-s", "all"], cwd=tree, env=tool_env(), check=True, capture_output=True)
    return tree


def compile_driver(tree, source, output, flags=(), without_facts=False):
    gcc = shutil.which("gcc", path=tool_env()["PATH"]) or "gcc"
    objects = sorted(p for p in (tree / "build").glob("*/*.o") if p.parent.name in AREAS)
    objects += [tree / "build" / "matrix.tab.o", tree / "build" / "lex.yy.o"]
    if without_facts:
        objects = [p for p in objects if p != tree / "build" / "ir" / "facts.o"]
    command = [gcc, "-std=c11", "-ffp-contract=off", *flags, "-I" + str(tree / "src")]
    command += ["-I" + str(tree / "src" / a) for a in AREAS] + ["-I" + str(tree / "build")]
    command += [str(source), *map(str, objects), "-o", str(output), "-lm"]
    subprocess.run(command, env=tool_env(), check=True, capture_output=True, text=True)


def run(driver, *args):
    return subprocess.run([str(driver), *map(str, args)], capture_output=True, text=True,
                          timeout=10, check=True).stdout.strip()


def mul_cases():
    cases = [(0.0, 1.0), (0.5, 0.5), (3.0, 5.0)]
    for shift in [-511, -510, -500, -485, -484, 0]:
        cases.append((math.ldexp(1.0 + 2.0**-52, shift), math.ldexp(1.0 - 2.0**-53, shift)))
        cases.append((math.ldexp(1.0 + 2.0**-52, shift), math.ldexp(1.0 + 2.0**-52, shift)))
        cases.append((math.ldexp(1.0, shift), math.ldexp(1.0, shift)))
    return cases


def chain_cases():
    rng = random.Random(801)
    cases = [[1], [1, 1], [1] * 31, [3, 5, 7], [4096] * 31]
    return cases + [[rng.randint(1, 4096) for _ in range(rng.randint(1, 31))] for _ in range(80)]


def oracle(tree, label):
    """Understatements of the exact value by one tree's bound arithmetic."""
    out = WORK / f"drivers-{label}"
    out.mkdir(parents=True, exist_ok=True)
    (tree / "tests").mkdir(exist_ok=True)
    if tree != ROOT:
        shutil.copy(ROOT / "tests" / "bound_arithmetic_driver.c", tree / "tests")
    result = {"mul": {}, "fits_overflowed": {}, "chain": {}}
    for target in ["x86-64", "haswell"]:
        driver = out / f"arith-{target}.exe"
        compile_driver(tree, tree / "tests" / "bound_arithmetic_driver.c", driver,
                       flags=["-O3", f"-march={target}"], without_facts=True)
        under = [a.hex() + " * " + b.hex() for a, b in mul_cases()
                 if Fraction(float.fromhex(run(driver, "mul", a.hex(), b.hex()))) < Fraction(a) * Fraction(b)]
        result["mul"][target] = {"cases": len(mul_cases()), "understated": under}
        result["fits_overflowed"][target] = [g for g in [971, 1000, 1023] if run(driver, "fits", "inf", g) != "0"]
    chain = out / "chain.exe"
    compile_driver(tree, ROOT / "tests" / "chain_bound_driver.c", chain)
    under = []
    for dims in chain_cases():
        exact = Fraction(1)
        for d in dims:
            exact *= 1 / (1 - d * UNIT)
        if Fraction(float.fromhex(run(chain, *dims))) < exact - 1:
            under.append(dims)
    result["chain"] = {"cases": len(chain_cases()), "understated": under}
    return result


def snapshot(matrixc):
    """Every example under every contract: compiler output and emitted C."""
    shot = {}
    for source in sorted((ROOT / "examples").rglob("*.ml")):
        rel = source.relative_to(ROOT).as_posix()
        for contract in CONTRACTS:
            flag = f"--fp-{contract}"
            p = subprocess.run([str(matrixc), flag, "--optimize", "--explain", "--certificate",
                                "--random-inputs", "7", "--run", rel], cwd=ROOT, capture_output=True,
                               timeout=120)
            c_file = WORK / "emit.c"
            if c_file.exists():
                c_file.unlink()
            subprocess.run([str(matrixc), flag, "--random-inputs", "7", "--emit-c", str(c_file), rel],
                           cwd=ROOT, capture_output=True, timeout=120)
            emitted = c_file.read_bytes() if c_file.exists() else b""
            shot[f"{rel} {contract}"] = (p.returncode, common.sha256_bytes(p.stdout + p.stderr),
                                         common.sha256_bytes(emitted))
    return shot


def deterministic(record):
    return {k: v for k, v in record.items()
            if k.lower() not in TIMING_KEYS and not k.lower().endswith(TIMING_SUFFIXES)}


def compare_rerun(rerun):
    files = {}
    for path in sorted(Path(rerun).glob("*.jsonl")):
        ref = ROOT / "results" / "contracts" / path.name
        if not ref.exists():
            continue
        load = lambda p: [json.dumps(deterministic(json.loads(l)), sort_keys=True)
                          for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]
        new, old = load(path), load(ref)
        same = sum(1 for a, b in zip(new, old) if a == b)
        files[path.name] = {"records": len(old), "rerun_records": len(new), "identical": same}
    return files


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--before", default="25f3a20", help="commit the paper's measurements ran on")
    ap.add_argument("--rerun", help="directory of deterministic study records rerun on the repaired compiler")
    ap.add_argument("--reuse", action="store_true",
                    help="keep the oracle and example results of an earlier run; only (re)compare --rerun")
    args = ap.parse_args()

    receipt = ROOT / "results" / "contracts" / "bound_repair.json"
    WORK.mkdir(parents=True, exist_ok=True)
    if args.reuse:
        summary = json.loads(receipt.read_text(encoding="utf-8"))
        rev = summary["before"]
    else:
        rev = subprocess.run(["git", "rev-parse", "--short", args.before], cwd=ROOT, capture_output=True,
                             text=True, check=True).stdout.strip()
        before = build_before(rev)
        summary = {"before": rev, "oracle": {"before": oracle(before, "before"), "after": oracle(ROOT, "after")}}
        old = snapshot(before / "bin" / f"matrixc{common.EXE}")
        new = snapshot(common.MATRIXC)
        summary["examples"] = {"programs": len({k.rsplit(" ", 1)[0] for k in old}), "contracts": len(CONTRACTS),
                               "cases": len(old), "differ": sorted(k for k in old if old[k] != new.get(k))}
    if args.rerun:
        summary["rerun"] = compare_rerun(args.rerun)
    common.write_json(receipt, summary)

    b, a = summary["oracle"]["before"], summary["oracle"]["after"]
    ex = summary["examples"]
    m = {
        "RepairBefore": rev,
        "RepairMulCases": str(b["mul"]["haswell"]["cases"]),
        "RepairMulUnderHaswell": str(len(b["mul"]["haswell"]["understated"])),
        "RepairMulUnderGeneric": str(len(b["mul"]["x86-64"]["understated"])),
        "RepairChainCases": str(b["chain"]["cases"]),
        "RepairChainUnder": str(len(b["chain"]["understated"])),
        "RepairExamplePrograms": str(ex["programs"]),
        "RepairExampleCases": str(ex["cases"]),
        "RepairExampleDiffer": str(len(ex["differ"])),
    }
    after_under = (sum(len(v["understated"]) for v in a["mul"].values()) + len(a["chain"]["understated"]) +
                   sum(len(v) for v in a["fits_overflowed"].values()))
    m["RepairAfterUnder"] = str(after_under)
    if "rerun" in summary:
        rr = summary["rerun"]
        m["RepairRerunFiles"] = str(len(rr))
        m["RepairRerunRecords"] = f"{sum(v['records'] for v in rr.values()):,}"
        m["RepairRerunIdentical"] = f"{sum(v['identical'] for v in rr.values()):,}"
    GEN.mkdir(parents=True, exist_ok=True)
    lines = ["% Generated by tools/contracts/bound_repair.py. Do not edit."]
    lines += [f"\\newcommand{{\\{k}}}{{{v}}}" for k, v in sorted(m.items())]
    (GEN / "repair.tex").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    for k, v in sorted(m.items()):
        print(f"  {k} = {v}")


if __name__ == "__main__":
    main()
