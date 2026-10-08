"""RQ4: speed and bit identity of reductions that a certificate licenses.

Builds bench/licensed/kernels.c twice with the same GCC: strict IEEE
semantics, and "licensed" with -fassociative-math -fno-signed-zeros
-fno-trapping-math, which lets GCC reassociate and vectorize reductions. Each
kernel runs in several fresh processes; the script records the median time
per repetition, its interquartile range, and the result bits of both builds.
OpenMP reductions are then run for 1 to 24 threads to test reproducibility.

    python tools/contracts/bench.py [--processes N] [--reps N]

Writes results/contracts/rq4_bench.jsonl, rq4_threads.jsonl, rq4_env.json
and rq4_vectorizer.txt (GCC's own report of which loops it vectorized).
"""

import argparse
import os
from pathlib import Path
import statistics
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

SOURCE = common.ROOT / "bench" / "licensed" / "kernels.c"
OUT = common.ROOT / "build" / "bench"
BASE = ["-std=c11", "-O3", "-march=native", "-ffp-contract=off", "-fopenmp"]
BUILDS = {"strict": BASE, "licensed": BASE + ["-fassociative-math", "-fno-signed-zeros", "-fno-trapping-math"]}
THREADS = [1, 2, 4, 8, 12, 16, 24]
CC = os.environ.get("CC", "gcc")


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    report = []
    for name, flags in BUILDS.items():
        exe = OUT / f"kernels-{name}{common.EXE}"
        p = subprocess.run([CC, *flags, "-fopt-info-vec-optimized", str(SOURCE), "-o", str(exe)],
                           capture_output=True, text=True)
        if p.returncode:
            sys.exit(p.stderr)
        report.append(f"== {name}: {' '.join(flags)}\n{p.stderr}")
    (common.RESULTS / "rq4_vectorizer.txt").write_text("\n".join(report), encoding="utf-8", newline="\n")


def run(build_name, kernel, reps, threads=None):
    env = dict(os.environ)
    if threads:
        env["OMP_NUM_THREADS"] = str(threads)
    exe = OUT / f"kernels-{build_name}{common.EXE}"
    p = subprocess.run([str(exe), kernel, str(reps)], capture_output=True, text=True, env=env, timeout=600)
    if p.returncode:
        raise RuntimeError(p.stderr)
    name, median, q1, q3, checksum, distinct = p.stdout.split()
    return float(median), float(q1), float(q3), checksum, int(distinct)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--processes", type=int, default=7)
    parser.add_argument("--reps", type=int, default=21)
    args = parser.parse_args()
    common.RESULTS.mkdir(parents=True, exist_ok=True)
    build()
    exe = OUT / f"kernels-strict{common.EXE}"
    kernels = subprocess.run([str(exe), "list"], capture_output=True, text=True).stdout.split()
    rows = []
    for kernel in kernels:
        if kernel.startswith("omp_"):
            continue
        for name in BUILDS:
            medians, checksums = [], set()
            for process in range(args.processes):
                median, q1, q3, checksum, distinct = run(name, kernel, args.reps, threads=1)
                medians.append(median)
                checksums.add(checksum)
                rows.append({"kernel": kernel, "build": name, "process": process, "median_ns": median,
                             "q1_ns": q1, "q3_ns": q3, "checksum": checksum, "distinct": distinct})
            print(f"{kernel:14s} {name:9s} median {statistics.median(medians) / 1e3:10.1f} us  {sorted(checksums)}", flush=True)
    common.write_jsonl(common.RESULTS / "rq4_bench.jsonl", rows)
    threads = []
    for kernel in [k for k in kernels if k.startswith("omp_")]:
        for name in BUILDS:
            for t in THREADS:
                median, q1, q3, checksum, distinct = run(name, kernel, args.reps, threads=t)
                threads.append({"kernel": kernel, "build": name, "threads": t, "median_ns": median,
                                "q1_ns": q1, "q3_ns": q3, "checksum": checksum, "distinct": distinct})
                print(f"{kernel:14s} {name:9s} {t:2d} threads {median / 1e3:10.1f} us  {checksum} x{distinct}", flush=True)
    common.write_jsonl(common.RESULTS / "rq4_threads.jsonl", threads)
    version = subprocess.run([CC, "--version"], capture_output=True, text=True).stdout.splitlines()[0]
    common.write_json(common.RESULTS / "rq4_env.json", common.environment(
        {"cc": version, "builds": BUILDS, "processes": args.processes, "reps": args.reps, "threads": THREADS,
         "kernels_sha256": common.sha256_file(SOURCE), "logical_cpus": os.cpu_count()}))


if __name__ == "__main__":
    main()
