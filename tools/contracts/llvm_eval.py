"""RQ7 and RQ8: the per-reduction license in LLVM.

Builds llvm/ExactReduce.so and compiles llvm/kernels/kernels.c under these
configurations (the driver and the stress harness are compiled once, without
the plugin, and linked with each):

    clang-strict      clang -O3 -march=native                (IEEE order)
    clang-licensed    clang-strict + -fpass-plugin=ExactReduce.so
    clang-fast-math   clang -O3 -march=native -ffast-math
    clang-licensed-sse2   the licensed build for baseline x86-64 (SSE2)
    gcc-strict        gcc -O3 -march=native
    gcc-fast-math     gcc -O3 -march=native -ffast-math
    mutant-extra-bit  the licensed build with every significand one bit wider
    mutant-force      every add reduction licensed without a proof

RQ7 (llvm_bench.jsonl): every kernel of llvm/kernels/driver.c, on MNIST, Cora
and generated data, in several processes of repeated runs; median times and a
hash of every output bit. RQ8 (llvm_stress.jsonl): llvm/kernels/stress.c, one
row per kernel, input family and trip count, with each build's output hash.
The pass's own decisions are recorded in llvm_decisions.jsonl, compile time
in llvm_compile.jsonl.

    python tools/contracts/llvm_data.py      (once: the datasets)
    python tools/contracts/llvm_eval.py

Writes results/contracts/llvm_*.jsonl and llvm_env.json.
"""

from pathlib import Path
import os
import re
import shutil
import statistics
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

LLVM = common.ROOT / "llvm"
PLUGIN = LLVM / "ExactReduce.so"
KERNELS = LLVM / "kernels"
DATA = common.ROOT / "build" / "data"
CLANG = shutil.which("clang") or "clang"
GCC = shutil.which("gcc") or "gcc"
PROCESSES = 5
REPS = 11
COMPILES = 10

NATIVE = ["-O3", "-march=native"]
# name: (compiler, flags, environment for the plugin, or None without it)
CONFIGS = {
    "clang-strict": (CLANG, NATIVE, None),
    "clang-licensed": (CLANG, NATIVE, {}),
    "clang-fast-math": (CLANG, NATIVE + ["-ffast-math"], None),
    "clang-licensed-sse2": (CLANG, ["-O3", "-march=x86-64"], {}),
    "gcc-strict": (GCC, NATIVE, None),
    "gcc-fast-math": (GCC, NATIVE + ["-ffast-math"], None),
    "mutant-extra-bit": (CLANG, NATIVE, {"EXACT_REDUCE_EXTRA_BITS": "1"}),
    "mutant-force": (CLANG, NATIVE, {"EXACT_REDUCE_FORCE": "1"}),
}
TIMED = ["clang-strict", "clang-licensed", "clang-fast-math", "clang-licensed-sse2",
         "gcc-strict", "gcc-fast-math"]
DECISION = re.compile(r"^(\S+) (\S*) (\S+) (licensed|versioned|declined) (.*)$")


def sh(args, env=None, timeout=3600, cwd=None):
    full = dict(os.environ)
    full.update(env or {})
    p = subprocess.run([str(a) for a in args], capture_output=True, text=True, timeout=timeout,
                       env=full, cwd=cwd)
    if p.returncode:
        raise RuntimeError(f"{' '.join(map(str, args))}\n{p.stdout}{p.stderr}")
    return p.stdout


def plugin_args(env):
    return [] if env is None else [f"-fpass-plugin={PLUGIN}"]


def compile_kernels(name, workdir, report=None):
    cc, flags, env = CONFIGS[name]
    obj = Path(workdir) / f"kernels-{name}.o"
    e = dict(env or {})
    if report:
        e["EXACT_REDUCE_REPORT"] = str(report)
    sh([cc, "-std=c11", *flags, *plugin_args(env), "-g", "-c", KERNELS / "kernels.c", "-o", obj],
       env=e)
    return obj


def decisions(workdir):
    report = Path(workdir) / "report.txt"
    if report.exists():
        report.unlink()
    compile_kernels("clang-licensed", workdir, report)
    rows = []
    for line in report.read_text().splitlines():
        m = DECISION.match(line)
        if m:
            rows.append({"function": m.group(1), "location": m.group(3),
                         "decision": m.group(4), "reason": m.group(5)})
    return rows


def compile_times(workdir):
    rows = []
    for name in ["clang-strict", "clang-licensed"]:
        cc, flags, env = CONFIGS[name]
        samples = []
        for _ in range(COMPILES):
            t0 = time.perf_counter()
            sh([cc, "-std=c11", *flags, *plugin_args(env), "-c", KERNELS / "kernels.c", "-o",
                Path(workdir) / "timing.o"], env=env or {})
            samples.append(time.perf_counter() - t0)
        size = os.path.getsize(compile_kernels(name, workdir))
        text = sh(["size", "-A", Path(workdir) / f"kernels-{name}.o"])
        text_bytes = next(int(l.split()[1]) for l in text.splitlines() if l.startswith(".text"))
        rows.append({"config": name, "median_s": statistics.median(samples),
                     "samples": samples, "object_bytes": size, "text_bytes": text_bytes})
    return rows


def link(name, harness_obj, workdir, tag):
    obj = compile_kernels(name, workdir)
    exe = Path(workdir) / f"{tag}-{name}"
    sh([CLANG, harness_obj, obj, "-o", exe, "-lm"])
    return exe


def bench(workdir):
    driver = Path(workdir) / "driver.o"
    sh([CLANG, "-std=c11", "-O2", "-c", KERNELS / "driver.c", "-o", driver])
    exes = {name: link(name, driver, workdir, "driver") for name in TIMED}
    names = sh([exes["clang-strict"], DATA, "list"]).split()
    rows = []
    for kernel in names:
        print(f"{kernel} ...", flush=True)
        for name in TIMED:
            medians, hashes = [], set()
            for _ in range(PROCESSES):
                out = sh([exes[name], DATA, kernel, REPS]).split()
                terms, median, hashes = int(out[1]), float(out[2]), hashes | {out[5]}
                medians.append(median)
            rows.append({"kernel": kernel, "config": name, "terms": terms,
                         "median_ns": statistics.median(medians), "process_medians_ns": medians,
                         "output_hash": sorted(hashes)[0], "deterministic": len(hashes) == 1})
        base = next(r for r in rows if r["kernel"] == kernel and r["config"] == "clang-strict")
        for r in rows:
            if r["kernel"] == kernel:
                r["same_as_strict"] = r["output_hash"] == base["output_hash"]
                print(f"  {r['config']:22s} {r['median_ns'] / 1e6:10.3f} ms  "
                      f"x{base['median_ns'] / r['median_ns']:6.2f}  same bits: {r['same_as_strict']}",
                      flush=True)
    return rows


def stress(workdir):
    harness = Path(workdir) / "stress.o"
    sh([CLANG, "-std=c11", "-O2", "-c", KERNELS / "stress.c", "-o", harness])
    outputs = {}
    for name in CONFIGS:
        exe = link(name, harness, workdir, "stress")
        lines = sh([exe], timeout=7200).splitlines()
        outputs[name] = {tuple(l.split()[:3]): l.split()[3] for l in lines}
        print(f"stress {name}: {len(lines)} cases", flush=True)
    rows = []
    for key, strict in outputs["clang-strict"].items():
        kernel, family, n = key
        row = {"kernel": kernel, "family": family, "n": int(n), "strict": strict}
        for name in CONFIGS:
            if name != "clang-strict":
                row[name] = outputs[name][key] == strict
        rows.append(row)
    return rows


def main():
    sh(["make", "-s", "-C", LLVM, "CXX=clang++"])
    if not (DATA / "mnist_train.u8").exists():
        raise SystemExit("run tools/contracts/llvm_data.py first")
    common.RESULTS.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="llvm-eval-") as workdir:
        common.write_jsonl(common.RESULTS / "llvm_decisions.jsonl", decisions(workdir))
        common.write_jsonl(common.RESULTS / "llvm_compile.jsonl", compile_times(workdir))
        common.write_jsonl(common.RESULTS / "llvm_stress.jsonl", stress(workdir))
        common.write_jsonl(common.RESULTS / "llvm_bench.jsonl", bench(workdir))
    versions = {"clang": sh([CLANG, "--version"]).splitlines()[0],
                "gcc": sh([GCC, "--version"]).splitlines()[0]}
    common.write_json(common.RESULTS / "llvm_env.json", common.environment(
        {"compilers": versions, "processes": PROCESSES, "reps": REPS, "compiles": COMPILES,
         "configs": {k: {"compiler": Path(v[0]).name, "flags": v[1], "plugin_env": v[2]}
                     for k, v in CONFIGS.items()},
         "plugin_sha256": common.sha256_file(PLUGIN),
         "pass_source_sha256": common.sha256_file(LLVM / "ExactReduce.cpp"),
         "kernel_sources_sha256": {p.name: common.sha256_file(p)
                                   for p in sorted(KERNELS.glob("*.[ch]"))},
         "cores": os.cpu_count()}))
    print("RQ7/RQ8: done")


if __name__ == "__main__":
    main()
