"""RQ9b: the license in an existing module, end to end.

CPython's audioop module (audioop-lts 0.2.2, the package that carries it for
Python 3.13) sums integer audio samples in double precision: avg, rms and
avgpp over 8- to 32-bit samples, and findfit, findmax and findfactor through
a 16-bit dot product. This script compiles the module twice with clang -O3
-march=native, without and with the ExactReduce plugin, loads each build in
its own interpreter, and

  1. calls every function with a reduction on fragments of every sample width,
     several lengths (including each guard's limit) and value families,
     and compares every result between the builds;
  2. times rms and avg (8- and 16-bit samples) and findfit on long fragments.

    python tools/contracts/llvm_scan.py      (once: downloads the sources)
    python tools/contracts/llvm_audioop.py

Writes results/contracts/llvm_audioop.jsonl and llvm_audioop_env.json.
"""

from pathlib import Path
import json
import os
import shutil
import statistics
import subprocess
import sys
import sysconfig
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

PLUGIN = common.ROOT / "llvm" / "ExactReduce.so"
PACKAGE = common.ROOT / "build" / "scan" / "audioop_lts-0.2.2" / "audioop"
OUT = common.ROOT / "build" / "audioop"
CLANG = shutil.which("clang") or "clang"
BUILDS = {"strict": [], "licensed": [f"-fpass-plugin={PLUGIN}"]}
REPS = 15


def build(name):
    dest = OUT / name / "audioop"
    dest.mkdir(parents=True, exist_ok=True)
    for f in ["__init__.py"]:
        shutil.copy(PACKAGE / f, dest / f)
    target = dest / f"_audioop{sysconfig.get_config_var('EXT_SUFFIX')}"
    env = dict(os.environ, EXACT_REDUCE_REPORT=str(OUT / f"{name}-report.txt"))
    subprocess.run([CLANG, "-O3", "-march=native", "-shared", "-fPIC", "-w",
                    f"-I{sysconfig.get_paths()['include']}", *BUILDS[name],
                    str(PACKAGE / "_audioop.c"), "-o", str(target)], check=True, env=env)
    return OUT / name


# ---- worker: runs inside one build's interpreter ------------------------------

def fragments(width):
    """(label, bytes) pairs: value families at several lengths."""
    import random
    rng = random.Random(width)
    top = (1 << (8 * width - 1)) - 1
    lo = -top - 1
    def pack(values):
        return b"".join(v.to_bytes(width, "little", signed=True) for v in values)
    lengths = [0, 1, 2, 3, 7, 100, 4099]
    for n in lengths:
        yield f"random-{n}", bytes(rng.getrandbits(8) for _ in range(n * width))
        yield f"max-{n}", pack([top] * n)
        yield f"min-{n}", pack([lo] * n)
        yield f"alternate-{n}", pack([top if i % 2 else lo for i in range(n)])
    for n in [1 << 16, 1 << 20]:
        yield f"random-{n}", rng.randbytes(n * width)
        yield f"odd-max-{n}", pack([top if top % 2 else top - 1]) * n
    if width == 2:
        # rms of 16-bit samples: the guard admits 2^23 bytes (bounding the
        # trip count by the byte length); one sample more runs the strict loop.
        for n in [1 << 22, (1 << 22) + 1]:
            yield f"guard-max-{n}", pack([top]) * n


def worker(path):
    sys.path.insert(0, str(path))
    import audioop  # noqa: E402  (this build's copy)
    out = []
    for width in [1, 2, 3, 4]:
        for label, frag in fragments(width):
            for fn in ["avg", "rms", "avgpp"]:
                out.append((fn, width, label, repr(getattr(audioop, fn)(frag, width))))
    import random
    rng = random.Random(7)
    for n_ref in [1, 5, 64, 1000]:
        ref = rng.randbytes(2 * n_ref)
        frag = rng.randbytes(2 * (n_ref + 3000))
        out.append(("findfit", 2, f"ref-{n_ref}", repr(audioop.findfit(frag, ref))))
        out.append(("findmax", 2, f"len-{n_ref}", repr(audioop.findmax(frag, n_ref))))
        out.append(("findfactor", 2, f"ref-{n_ref}",
                    repr(audioop.findfactor(frag[:2 * n_ref], ref).hex())))
    loud = (32767).to_bytes(2, "little", signed=True) * 4000
    out.append(("findfit", 2, "max", repr(audioop.findfit(loud, loud[:2000]))))
    out.append(("findfactor", 2, "max", repr(audioop.findfactor(loud, loud).hex())))
    # Timing: long 16-bit fragments, inside each guard's limit.
    frag = random.Random(1).randbytes(2 * (1 << 22))
    ref = random.Random(2).randbytes(2 * 2000)
    probe = random.Random(3).randbytes(2 * 52000)
    times = {}
    for name, call in [("rms-16", lambda: audioop.rms(frag, 2)),
                       ("avg-16", lambda: audioop.avg(frag, 2)),
                       ("rms-8", lambda: audioop.rms(frag, 1)),
                       ("avg-8", lambda: audioop.avg(frag, 1)),
                       ("findfit-16", lambda: audioop.findfit(probe, ref))]:
        call()
        samples = []
        for _ in range(REPS):
            t0 = time.perf_counter_ns()
            call()
            samples.append(time.perf_counter_ns() - t0)
        times[name] = statistics.median(samples)
    print(json.dumps({"results": out, "times_ns": times}))


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--worker":
        worker(sys.argv[2])
        return
    if not PACKAGE.exists():
        raise SystemExit("run tools/contracts/llvm_scan.py first (it downloads audioop-lts)")
    subprocess.run(["make", "-s", "-C", str(common.ROOT / "llvm"), "CXX=clang++"], check=True)
    runs = {}
    for name in BUILDS:
        path = build(name)
        p = subprocess.run([sys.executable, "-I", __file__, "--worker", str(path)],
                           capture_output=True, text=True, timeout=7200)
        if p.returncode:
            raise SystemExit(p.stderr)
        runs[name] = json.loads(p.stdout)
    rows = []
    strict, licensed = runs["strict"]["results"], runs["licensed"]["results"]
    assert len(strict) == len(licensed)
    for (fn, width, label, a), (_, _, _, b) in zip(strict, licensed):
        rows.append({"kind": "result", "function": fn, "width": width, "case": label,
                     "strict": a, "same": a == b})
    for fn, t in runs["strict"]["times_ns"].items():
        rows.append({"kind": "time", "function": fn, "strict_ns": t,
                     "licensed_ns": runs["licensed"]["times_ns"][fn]})
    common.write_jsonl(common.RESULTS / "llvm_audioop.jsonl", rows)
    report = (OUT / "licensed-report.txt").read_text().splitlines()
    common.write_json(common.RESULTS / "llvm_audioop_env.json", common.environment(
        {"clang": subprocess.run([CLANG, "--version"], capture_output=True,
                                 text=True).stdout.splitlines()[0],
         "python": sys.version.split()[0], "reps": REPS, "pass_report": report}))
    same = sum(r["same"] for r in rows if r["kind"] == "result")
    total = sum(r["kind"] == "result" for r in rows)
    print(f"audioop: {same} of {total} results identical")
    for r in rows:
        if r["kind"] == "time":
            print(f"  {r['function']:8s} strict {r['strict_ns'] / 1e6:8.3f} ms  licensed "
                  f"{r['licensed_ns'] / 1e6:8.3f} ms  x{r['strict_ns'] / r['licensed_ns']:.2f}")


if __name__ == "__main__":
    main()
