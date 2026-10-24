"""The integer rewrite's 32-bit tier at its limit, and a mutant that must fail there.

k_gemm_i8 is licensed statically with a 64-bit accumulator; the integer
rewrite versions it on the trip count and accumulates in 32 bits up to
131,071 terms of int8 products. llvm/tests/tier32.c prints the bits of every
result on both sides of that limit. This compiles kernels.c strict, with the
integer rewrite, and with a mutant of the rewrite whose limit is two trips too
generous (EXACT_REDUCE_TIER32_SLACK=2), runs the test against each, and
records which cases each build reproduces.

    CONTRACTS_RESULTS=results/contracts-wsl python tools/contracts/llvm_tier32.py

Writes llvm_tier32.json in CONTRACTS_RESULTS (needs the LLVM 18 toolchain).
"""

from pathlib import Path
import shutil
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402
from llvm_eval import CLANG, KERNELS, LLVM, NATIVE, PLUGIN, sh  # noqa: E402

BUILDS = {"strict": None, "integer": {"EXACT_REDUCE_INTEGER": "1"},
          "mutant": {"EXACT_REDUCE_INTEGER": "1", "EXACT_REDUCE_TIER32_SLACK": "2"}}


def main():
    sh(["make", "-s", "-C", LLVM, "CXX=clang++"])
    out = {}
    with tempfile.TemporaryDirectory(prefix="tier32-") as work:
        test = Path(work) / "tier32.o"
        sh([CLANG, "-std=c11", "-O2", "-c", LLVM / "tests" / "tier32.c", "-o", test])
        for name, env in BUILDS.items():
            obj = Path(work) / f"k-{name}.o"
            plugin = [] if env is None else [f"-fpass-plugin={PLUGIN}"]
            sh([CLANG, "-std=c11", *NATIVE, *plugin, "-c", KERNELS / "kernels.c", "-o", obj], env=env)
            exe = Path(work) / f"tier32-{name}"
            sh([CLANG, test, obj, "-o", exe, "-lm"])
            out[name] = sh([exe]).splitlines()
    strict = out["strict"]
    summary = {"cases": len(strict),
               "trip_counts": sorted({int(l.split()[2]) for l in strict}),
               "builds": {name: {"same_as_strict": sum(a == b for a, b in zip(lines, strict)),
                                 "changed": [l for l, s in zip(lines, strict) if l != s]}
                          for name, lines in out.items() if name != "strict"},
               "clang": sh([CLANG, "--version"]).splitlines()[0],
               "test_sha256": common.sha256_file(LLVM / "tests" / "tier32.c"),
               "pass_source_sha256": common.sha256_file(LLVM / "ExactReduce.cpp")}
    common.RESULTS.mkdir(parents=True, exist_ok=True)
    common.write_json(common.RESULTS / "llvm_tier32.json", summary)
    for name, b in summary["builds"].items():
        print(f"{name}: {b['same_as_strict']} of {summary['cases']} cases match strict")


if __name__ == "__main__":
    main()
