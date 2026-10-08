"""Repeat every measurement of the numerical-contracts study, then analyze it.

    make contracts            (builds bin/matrixc and bin/matrixc-mutants first)

Runs, in order: corpus.py (RQ1, RQ2), tightness.py (RQ3), mutation.py (RQ5),
accuracy.py (RQ6), bench.py (RQ4, last, so that nothing else competes for the
CPU while it times), and analyze.py. The interpreter running this script runs
them all, so it needs numpy and matplotlib (requirements.txt). Raw output goes
to results/contracts/; the paper's tables, macros and figures and the
workspace's evaluation data are regenerated from it.
"""

from pathlib import Path
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
STEPS = ["corpus.py", "tightness.py", "mutation.py", "accuracy.py", "bench.py", "analyze.py"]


def main():
    for step in STEPS:
        started = time.perf_counter()
        print(f"== {step}", flush=True)
        code = subprocess.call([sys.executable, str(HERE / step)])
        if code:
            sys.exit(f"{step} failed with exit status {code}")
        print(f"== {step} finished in {time.perf_counter() - started:.0f} s", flush=True)


if __name__ == "__main__":
    main()
