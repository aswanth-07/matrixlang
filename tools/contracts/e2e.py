"""RQ4b: certificates in generated code, end to end.

Six application kernels (examples/kernels/) are compiled by matrixc to C
(--emit-c) and by GCC to machine code, under these configurations:

    source               the program as written, every sum in the machine's order
    source-fast-math     the same C compiled with -ffast-math
    strict               strict contract (proved reorderings), machine order
    strict-licensed      strict contract, and every product whose sums the facts
                         prove order-independent carries an OpenMP reduction
                         clause (-fopenmp-simd)
    bounded-licensed     bounded contract, reductions licensed when range-safe
    algebraic-licensed   algebraic contract, every reduction licensed
    *-8t                 the licensed builds with -fopenmp on eight threads
    *-sse2               the licensed builds for the baseline x86-64 vector ISA
                         (-march=x86-64) instead of -march=native

Every configuration runs on the same inputs (one seeded draw from the declared
domains, checked at load). Times are the compute section only, from several
processes of repeated runs with each process's first run dropped. Outputs are
compared bit for bit with the source configuration, which is itself compared
with the virtual machine's unoptimized execution.

    python tools/contracts/e2e.py

Writes results/contracts/e2e.jsonl and e2e_env.json.
"""

from pathlib import Path
import hashlib
import os
import shutil
import statistics
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

KERNELS = ["walks", "layers", "image", "normal", "lowrank", "diffusion"]
SEED = 1
PROCESSES = 5
REPS = 11
THREADS = 8
GCC = shutil.which("gcc") or "C:/msys64/mingw64/bin/gcc.exe"
BASE = ["-std=c11", "-O3", "-ffp-contract=off", "-w"]
NATIVE = ["-march=native"]
SSE2 = ["-march=x86-64"]

# name: (matrixc flags, licensed C?, gcc flags, OpenMP threads or None)
CONFIGS = {
    "source": ([], False, NATIVE, None),
    "source-fast-math": ([], False, NATIVE + ["-ffast-math"], None),
    "strict": (["--optimize"], False, NATIVE, None),
    "strict-licensed": (["--optimize"], True, NATIVE + ["-fopenmp-simd"], None),
    "bounded-licensed": (["--optimize", "--fp-bounded"], True, NATIVE + ["-fopenmp-simd"], None),
    "algebraic-licensed": (["--optimize", "--fp-algebraic"], True, NATIVE + ["-fopenmp-simd"], None),
    "strict-8t": (["--optimize"], False, NATIVE + ["-fopenmp"], THREADS),
    "strict-licensed-8t": (["--optimize"], True, NATIVE + ["-fopenmp"], THREADS),
    "algebraic-licensed-8t": (["--optimize", "--fp-algebraic"], True, NATIVE + ["-fopenmp"], THREADS),
    "strict-licensed-sse2": (["--optimize"], True, SSE2 + ["-fopenmp-simd"], None),
    "algebraic-licensed-sse2": (["--optimize", "--fp-algebraic"], True, SSE2 + ["-fopenmp-simd"], None),
}


def sh(args, env=None, timeout=1800):
    full = dict(os.environ)
    if env:
        full.update(env)
    p = subprocess.run([str(a) for a in args], capture_output=True, text=True,
                       timeout=timeout, env=full)
    return p.returncode, p.stdout, p.stderr


def digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def times_of(stderr):
    for line in stderr.splitlines():
        if line.startswith("ml-times-ns"):
            return [float(x) for x in line.split()[1:]]
    raise RuntimeError(f"no timing line in:\n{stderr}")


def check_ns(stderr):
    for line in stderr.splitlines():
        if line.startswith("ml-check-ns"):
            return float(line.split()[1])
    return None


def quantile(xs, q):
    xs = sorted(xs)
    pos = q * (len(xs) - 1)
    lo = int(pos)
    hi = min(lo + 1, len(xs) - 1)
    return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo)


def measure(kernel, workdir):
    src = common.ROOT / "examples" / "kernels" / f"{kernel}.ml"
    inputs = Path(workdir) / f"{kernel}.bin"
    code, out = common.call(["-q", "--random-inputs", SEED, "--dump-inputs", inputs, src])
    if code:
        raise RuntimeError(out)

    _, vm_out = common.call(["-q", "--run", "--exact-output", "--random-inputs", SEED, src], timeout=3600)
    rows, outputs, sources = [], {}, {}
    for name, (flags, licensed, cflags, threads) in CONFIGS.items():
        key = (tuple(flags), licensed)
        if key not in sources:
            c_file = Path(workdir) / f"{kernel}_{len(sources)}.c"
            lic = [] if licensed else ["--no-license"]
            code, out = common.call(["-q", *flags, *lic, "--emit-c", c_file, src])
            if code:
                raise RuntimeError(out)
            if flags:
                _, report = common.call([*flags, "--report", "--cost", src])
                cost = common.parse_report(report)["cost_after"]
            else:
                _, report = common.call(["--tac", "--cost", src])
                cost = int(report.split("This program performs")[1].split()[0])
            sources[key] = (c_file, cost)
        c_file, cost = sources[key]
        header = c_file.read_text(encoding="utf-8").split("\n", 3)
        exe = Path(workdir) / f"{kernel}_{name}{common.EXE}"
        code, o, e = sh([GCC, *BASE, *cflags, c_file, "-o", exe, "-lm"])
        if code:
            raise RuntimeError(o + e)
        env = {"OMP_NUM_THREADS": str(threads)} if threads else {"OMP_NUM_THREADS": "1"}
        samples, checks, text = [], [], None
        for _ in range(PROCESSES):
            code, o, e = sh([exe, inputs, REPS], env=env)
            if code:
                raise RuntimeError(e)
            samples += times_of(e)[1:]
            checks.append(check_ns(e))
            if text is None:
                text = o
            elif o != text:
                text = "NONDETERMINISTIC\n" + o
        outputs[name] = text
        rows.append({
            "kernel": kernel, "config": name, "threads": threads or 1,
            "march": "x86-64" if "-march=x86-64" in cflags else "native",
            "licensed": licensed, "free_products": header[1].strip() + " " + header[2].strip(),
            "median_ns": statistics.median(samples), "p25_ns": quantile(samples, 0.25),
            "p75_ns": quantile(samples, 0.75), "samples": len(samples),
            "check_ns": statistics.median([c for c in checks if c is not None]),
            "modeled_flops": cost, "output_sha": digest(text),
            "deterministic": not text.startswith("NONDETERMINISTIC"),
        })
    for row in rows:
        row["same_as_source"] = outputs[row["config"]] == outputs["source"]
        row["source_matches_vm"] = outputs["source"] == vm_out
    return rows


def main():
    common.RESULTS.mkdir(parents=True, exist_ok=True)
    rows = []
    with tempfile.TemporaryDirectory(prefix="e2e-") as workdir:
        for kernel in KERNELS:
            print(f"{kernel} ...", flush=True)
            got = measure(kernel, workdir)
            base = next(r for r in got if r["config"] == "source")["median_ns"]
            for r in got:
                print(f"  {r['config']:24s} {r['median_ns'] / 1e3:12.1f} us  "
                      f"x{base / r['median_ns']:8.2f}  same bits: {r['same_as_source']}", flush=True)
            rows.extend(got)
    _, gcc_version, _ = sh([GCC, "--version"])
    common.write_jsonl(common.RESULTS / "e2e.jsonl", rows)
    common.write_json(common.RESULTS / "e2e_env.json", common.environment(
        {"kernels": KERNELS, "seed": SEED, "processes": PROCESSES, "reps": REPS,
         "threads": THREADS, "gcc": gcc_version.splitlines()[0], "base_flags": BASE,
         "configs": {k: {"matrixc": v[0], "licensed": v[1], "gcc": v[2], "threads": v[3]}
                     for k, v in CONFIGS.items()}}))
    print(f"RQ4b: {len(rows)} configurations over {len(KERNELS)} kernels")


if __name__ == "__main__":
    main()
