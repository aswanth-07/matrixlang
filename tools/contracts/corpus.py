"""RQ1 (recovery) and RQ2 (soundness) over generated, domain-typed corpora.

RQ1 compiles cost-mode programs under every arm and records the modeled
arithmetic, the rewrites each guarantee level admitted, and the certificate
levels. RQ2 executes small exec-mode programs on drawn inputs and compares
every printed output, bit for bit, with the unoptimized program.

    python tools/contracts/corpus.py [--quick] [--workers N]

Writes results/contracts/rq1_recovery.jsonl, rq2_soundness.jsonl and
corpus_env.json. Nothing here summarises; tools/contracts/analyze.py does.
"""

import argparse
from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402
import genprog  # noqa: E402

ARMS = ["noproof", "strict", "bounded", "algebraic"]
RQ1_PROFILES = ["heterogeneous", "square", "narrow", "balanced", "elementwise", "algebraic"]
RQ2_PROFILES = ["heterogeneous", "narrow", "balanced", "algebraic"]
DOMAINS = genprog.DOMAINS + ["dyadic", "broad"]   # last two: literal values, no inputs


def source_for(seed, index, mode, profile, domain):
    if domain in ("dyadic", "broad"):
        return genprog.program(seed, index, mode, profile, "int8", literals=domain)
    return genprog.program(seed, index, mode, profile, domain)


def rq1_cell(job, workdir):
    seed, index, profile, domain = job
    path = Path(workdir) / f"rq1_{seed}_{index}_{profile}_{domain}.ml"
    path.write_text(source_for(seed, index, "cost", profile, domain), encoding="utf-8")
    rows = []
    for arm in ARMS:
        start = time.perf_counter()
        code, out = common.call(common.CONTRACT_FLAGS[arm] + ["--report", "--cost", "--certificate", path])
        elapsed = time.perf_counter() - start
        row = {"seed": seed, "index": index, "profile": profile, "domain": domain, "arm": arm,
               "status": code, "seconds": round(elapsed, 5)}
        if code == 0:
            row.update(common.parse_report(out))
            row["levels"] = common.parse_guarantees(out)
        rows.append(row)
    path.unlink()
    return rows


def rq2_cell(job, workdir):
    seed, index, profile, domain, input_seeds = job
    path = Path(workdir) / f"rq2_{seed}_{index}_{profile}_{domain}.ml"
    path.write_text(source_for(seed, index, "exec", profile, domain), encoding="utf-8")
    levels = {}
    for arm in ARMS[1:]:
        code, out = common.call(common.CONTRACT_FLAGS[arm] + ["--report", "--certificate", path])
        levels[arm] = common.parse_guarantees(out) if code == 0 else None
    rows = []
    for input_seed in input_seeds:
        flags = ["-q", "--run", "--exact-output", "--random-inputs", str(input_seed), path]
        base_code, base = common.call(flags)
        reference = common.split_outputs(base)
        for arm in ["noproof"] + ARMS[1:]:
            code, out = common.call(common.CONTRACT_FLAGS[arm] + flags)
            blocks = common.split_outputs(out)
            row = {"seed": seed, "index": index, "profile": profile, "domain": domain,
                   "input_seed": input_seed, "arm": arm, "status": code, "base_status": base_code,
                   "outputs": len(reference), "levels": levels.get(arm)}
            if code == 0 and base_code == 0 and len(blocks) == len(reference):
                row["same"] = [a == b for a, b in zip(reference, blocks)]
            rows.append(row)
    path.unlink()
    return rows


def run(jobs, cell, workers, label):
    rows = []
    started = time.perf_counter()
    with tempfile.TemporaryDirectory(prefix="contracts-") as workdir, \
            ThreadPoolExecutor(max_workers=workers) as pool:
        for n, result in enumerate(pool.map(lambda job: cell(job, workdir), jobs), 1):
            rows.extend(result)
            if n % 500 == 0:
                print(f"  {label}: {n}/{len(jobs)} programs, {time.perf_counter() - started:.0f} s", flush=True)
    print(f"{label}: {len(jobs)} programs in {time.perf_counter() - started:.0f} s", flush=True)
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--quick", action="store_true", help="small corpora for a smoke run")
    parser.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 4))
    parser.add_argument("--only", choices=["rq1", "rq2"])
    args = parser.parse_args()
    seeds = range(1, 3 if args.quick else 11)
    per_cell_rq1 = 3 if args.quick else 25
    per_cell_rq2 = 2 if args.quick else 12
    common.RESULTS.mkdir(parents=True, exist_ok=True)

    if args.only in (None, "rq1"):
        jobs = [(s, i, p, d) for s in seeds for p in RQ1_PROFILES for d in DOMAINS for i in range(per_cell_rq1)]
        common.write_jsonl(common.RESULTS / "rq1_recovery.jsonl", run(jobs, rq1_cell, args.workers, "RQ1"))
    if args.only in (None, "rq2"):
        jobs = [(s, i, p, d, (101, 202, 303)) for s in seeds for p in RQ2_PROFILES for d in DOMAINS
                for i in range(per_cell_rq2)]
        common.write_jsonl(common.RESULTS / "rq2_soundness.jsonl", run(jobs, rq2_cell, args.workers, "RQ2"))
    common.write_json(common.RESULTS / "corpus_env.json", common.environment(
        {"seeds": list(seeds), "rq1_programs_per_cell": per_cell_rq1, "rq2_programs_per_cell": per_cell_rq2,
         "rq2_input_seeds": [101, 202, 303], "domains": DOMAINS, "workers": args.workers,
         "rq1_profiles": RQ1_PROFILES, "rq2_profiles": RQ2_PROFILES}))


if __name__ == "__main__":
    main()
