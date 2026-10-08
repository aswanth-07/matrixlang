"""Compile-time cost of the proofs, measured one compilation at a time.

RQ1 records wall time too, but under twenty concurrent compilations. Here a
stratified sample of RQ1's cost-mode programs is compiled sequentially under
--no-proofs, strict, bounded and algebraic, five times each in rotating
order, and the median per program and arm is kept. Times are end to end and
include process start-up, which dominates for small programs.

    python tools/contracts/overhead.py

Writes results/contracts/overhead.jsonl and overhead_env.json.
"""

from pathlib import Path
import statistics
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402
from corpus import RQ1_PROFILES, DOMAINS, source_for  # noqa: E402

ARMS = ["noproof", "strict", "bounded", "algebraic"]
REPS = 5
PER_CELL = 5


def main():
    rows = []
    with tempfile.TemporaryDirectory(prefix="overhead-") as workdir:
        for profile in RQ1_PROFILES:
            for domain in DOMAINS:
                for index in range(PER_CELL):
                    path = Path(workdir) / "p.ml"
                    path.write_text(source_for(1, index, "cost", profile, domain), encoding="utf-8")
                    times = {arm: [] for arm in ARMS}
                    for rep in range(REPS):
                        for arm in ARMS[rep % len(ARMS):] + ARMS[:rep % len(ARMS)]:
                            start = time.perf_counter()
                            code, _ = common.call(common.CONTRACT_FLAGS[arm] + ["--report", path])
                            times[arm].append(time.perf_counter() - start)
                            if code:
                                sys.exit(f"compilation failed: {profile} {domain} {index} {arm}")
                    rows.append({"profile": profile, "domain": domain, "index": index,
                                 **{f"{arm}_s": statistics.median(v) for arm, v in times.items()}})
    common.write_jsonl(common.RESULTS / "overhead.jsonl", rows)
    common.write_json(common.RESULTS / "overhead_env.json", common.environment({"reps": REPS, "per_cell": PER_CELL}))
    ratio = statistics.median(r["strict_s"] / r["noproof_s"] for r in rows)
    print(f"overhead: {len(rows)} programs, median strict / no-proofs time {ratio:.3f}")


if __name__ == "__main__":
    main()
