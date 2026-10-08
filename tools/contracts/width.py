"""How far exactness proofs reach as the integer domain widens.

Compiles the RQ1 heterogeneous and narrow cost-mode programs with every
matrix over int(-(2^b - 1), 2^b - 1) for b = 1..31, under the strict and
algebraic contracts, and records how many chain reorderings the strict
contract proves exact out of those the algebraic contract applies.

    python tools/contracts/width.py

Writes results/contracts/width.jsonl and width_env.json.
"""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402
import genprog  # noqa: E402

BITS = list(range(1, 32, 2)) + [16, 26, 27]
PROFILES = ["heterogeneous", "narrow"]
SEEDS = range(1, 6)
PER_CELL = 20


def cell(job, workdir):
    bits, profile, seed, index = job
    spelling = f"int({-(2 ** bits - 1)},{2 ** bits - 1})"
    source = genprog.program(seed, index, "cost", profile, "int8").replace("input(int8)", f"input({spelling})")
    path = Path(workdir) / f"w_{bits}_{profile}_{seed}_{index}.ml"
    path.write_text(source, encoding="utf-8")
    row = {"bits": bits, "profile": profile, "seed": seed, "index": index}
    for arm in ["strict", "algebraic"]:
        code, out = common.call(common.CONTRACT_FLAGS[arm] + ["--report", "--cost", path])
        if code:
            raise RuntimeError(out)
        report = common.parse_report(out)
        row[f"{arm}_chains"] = report["chains"]
        row[f"{arm}_saved"] = report["cost_before"] - report["cost_after"]
        row["cost_before"] = report["cost_before"]
    path.unlink()
    return row


def main():
    jobs = [(b, p, s, i) for b in sorted(set(BITS)) for p in PROFILES for s in SEEDS for i in range(PER_CELL)]
    with tempfile.TemporaryDirectory(prefix="width-") as workdir, ThreadPoolExecutor(max_workers=20) as pool:
        rows = list(pool.map(lambda job: cell(job, workdir), jobs))
    common.write_jsonl(common.RESULTS / "width.jsonl", rows)
    common.write_json(common.RESULTS / "width_env.json", common.environment(
        {"bits": sorted(set(BITS)), "profiles": PROFILES, "seeds": list(SEEDS), "per_cell": PER_CELL}))
    for b in sorted(set(BITS)):
        rs = [r for r in rows if r["bits"] == b]
        a = sum(r["algebraic_chains"] for r in rs)
        print(f"{b:2d} bits: {sum(r['strict_chains'] for r in rs)}/{a} chains proved exact")


if __name__ == "__main__":
    main()
