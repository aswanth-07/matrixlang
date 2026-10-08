"""The C backend against the virtual machine.

For every accepted example and a set of generated programs, under each
numerical contract, the program written by `matrixc --emit-c` is compiled by
GCC and run on the inputs `--dump-inputs` wrote:

  ordered   the emitted program with every product in the machine's order
            (--no-license), compiled with OpenMP SIMD, must print exactly the
            virtual machine's output for the same optimized program.
  plain     the licensed program compiled without OpenMP (every pragma
            ignored) must print the machine's output as well.
  simd      the licensed program with -fopenmp-simd: GCC may reorder every
            licensed reduction.
  threads   the licensed program with -fopenmp on four threads.

Under the strict contract `simd` and `threads` must also print the
unoptimized program's output: a reduction is licensed there only when every
order of summation gives the same bits. Under the bounded and algebraic
contracts licensed reductions may change bits; those are counted, not failed.

    python tools/check_emit_c.py [--generated N] [--out FILE]

Exits 1 on any required mismatch.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools" / "contracts"))
import genprog  # noqa: E402

EXE = ".exe" if os.name == "nt" else ""
MATRIXC = ROOT / "bin" / f"matrixc{EXE}"
GCC = shutil.which("gcc") or "C:/msys64/mingw64/bin/gcc.exe"
CFLAGS = ["-std=c11", "-O3", "-march=native", "-ffp-contract=off", "-w"]
CONTRACTS = {"strict": [], "bounded": ["--fp-bounded"], "algebraic": ["--fp-algebraic"]}


def run(args, env=None, timeout=300):
    full = dict(os.environ)
    if env:
        full.update(env)
    p = subprocess.run([str(a) for a in args], capture_output=True, text=True,
                       timeout=timeout, env=full)
    return p.returncode, p.stdout, p.stderr


def build(c_file, exe, extra):
    code, out, err = run([GCC, *CFLAGS, *extra, c_file, "-o", exe, "-lm"])
    if code:
        raise RuntimeError(f"gcc failed on {c_file}:\n{out}{err}")


def check(job, workdir):
    name, source = job
    tag = name.replace("/", "_").replace(".", "_")
    src = Path(workdir) / f"{tag}.ml"
    src.write_text(source, encoding="utf-8")
    inputs = Path(workdir) / f"{tag}.bin"
    seed = ["--random-inputs", "1"]

    code, base, _ = run([MATRIXC, "-q", "--run", "--exact-output", *seed, src])
    if code:
        return {"program": name, "skipped": "rejected or failed in the machine"}
    row = {"program": name, "contracts": {}}
    for contract, flags in CONTRACTS.items():
        _, optimized, _ = run([MATRIXC, "-q", "--optimize", *flags, "--run", "--exact-output", *seed, src])
        licensed_c = Path(workdir) / f"{tag}_{contract}.c"
        ordered_c = Path(workdir) / f"{tag}_{contract}_ordered.c"
        run([MATRIXC, "-q", "--optimize", *flags, *seed, "--emit-c", licensed_c, "--dump-inputs", inputs, src])
        run([MATRIXC, "-q", "--optimize", *flags, "--no-license", "--emit-c", ordered_c, src])
        header = licensed_c.read_text(encoding="utf-8").split("\n", 3)[1]
        result = {"free_products": header.strip()}
        for variant, c_file, extra, env in [
            ("ordered", ordered_c, ["-fopenmp-simd"], None),
            ("plain", licensed_c, [], None),
            ("simd", licensed_c, ["-fopenmp-simd"], None),
            ("threads", licensed_c, ["-fopenmp"], {"OMP_NUM_THREADS": "4"}),
        ]:
            exe = Path(workdir) / f"{tag}_{contract}_{variant}{EXE}"
            build(c_file, exe, extra)
            _, out, err = run([exe, inputs, "1"], env=env)
            result[variant] = {"same_as_optimized": out == optimized, "same_as_unoptimized": out == base}
            if not out:
                result[variant]["stderr"] = err[-400:]
        row["contracts"][contract] = result
    return row


def failures(row):
    bad = []
    for contract, res in row.get("contracts", {}).items():
        for variant in ("ordered", "plain"):
            if not res[variant]["same_as_optimized"]:
                bad.append(f"{contract}/{variant} differs from the machine")
        if contract == "strict":
            for variant in ("simd", "threads"):
                if not res[variant]["same_as_unoptimized"]:
                    bad.append(f"strict/{variant} differs from the unoptimized program")
    return bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--generated", type=int, default=48,
                    help="generated programs in addition to the examples")
    ap.add_argument("--out", default=str(ROOT / "build" / "emit-c-check.json"))
    args = ap.parse_args()

    jobs = []
    for path in sorted((ROOT / "examples").rglob("*.ml")):
        if "errors" in path.parts:
            continue
        jobs.append((path.relative_to(ROOT).as_posix(), path.read_text(encoding="utf-8")))
    domains = ["bool", "int8", "int16", "real", "realx", "mixed"]
    profiles = ["heterogeneous", "narrow", "balanced", "algebraic"]
    for i in range(args.generated):
        mode = "cost" if i % 2 else "exec"
        domain = domains[i % len(domains)]
        profile = profiles[(i // len(domains)) % len(profiles)]
        jobs.append((f"generated/{mode}-{profile}-{domain}-{i}",
                     genprog.program(2026, i, mode, profile, domain)))

    with tempfile.TemporaryDirectory(prefix="emit-c-") as workdir:
        with ThreadPoolExecutor(max_workers=min(16, os.cpu_count() or 4)) as pool:
            rows = list(pool.map(lambda job: check(job, workdir), jobs))

    checked = [r for r in rows if "contracts" in r]
    bad = [(r["program"], f) for r in checked for f in failures(r)]
    changed = {c: sum(1 for r in checked if not r["contracts"][c]["simd"]["same_as_unoptimized"])
               for c in CONTRACTS}
    summary = {"programs": len(checked), "skipped": len(rows) - len(checked),
               "required_mismatches": len(bad),
               "simd_differs_from_unoptimized": changed, "rows": rows}
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(summary, indent=1, sort_keys=True) + "\n", encoding="utf-8")

    print(f"C backend: {len(checked)} programs x {len(CONTRACTS)} contracts x 4 builds; "
          f"{len(bad)} required mismatches")
    print("  outputs changed by licensed reductions (simd vs unoptimized): " +
          ", ".join(f"{c} {n}" for c, n in changed.items()))
    for program, why in bad[:20]:
        print(f"  MISMATCH {program}: {why}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
