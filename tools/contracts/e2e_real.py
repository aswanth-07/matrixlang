"""RQ4c: the six configurations of e2e.py on real data.

Four MatrixLang programs in examples/kernels/real/ read real inputs:

    cora_walks      A^3 1 over the Cora citation graph (bool, 2,708 vertices)
    cora_diffusion  P^3 v with P = D^-1 A of the same graph (real(0,1))
    mnist_normal    X^T X and X^T y over 4,096 MNIST images, central 10x10
                    pixels (uint8) and digit labels (uint8)
    mnist_scores    W X 1: an int8 classifier trained on MNIST (92% accurate)
                    applied to 4,096 test images quantized to int8

The inputs come from tools/contracts/llvm_data.py (build/data/) and are
written as MatrixLang value files, real values in hexadecimal so that they
are exact. Each program is then measured exactly as e2e.py measures the
generated kernels, with every C compiler named in E2E_REAL_CCS (default gcc
and clang).

    python tools/contracts/llvm_data.py      (once)
    python tools/contracts/e2e_real.py

Writes results/contracts/e2e_real.jsonl and e2e_real_env.json.
"""

from pathlib import Path
import os
import shutil
import subprocess
import sys
import tempfile

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402
import e2e  # noqa: E402

DATA = common.ROOT / "build" / "data"
REAL = common.ROOT / "examples" / "kernels" / "real"
SAMPLES = 4096
# kernel: (processes, repetitions); each process drops its first run. The Cora
# programs take about half a minute per run as written, and their speedups
# are in the hundreds, so two timed runs each suffice.
EFFORT = {"cora_walks": (2, 2), "cora_diffusion": (2, 2), "mnist_normal": (5, 11),
          "mnist_scores": (5, 11)}


def write(path, values, real=False):
    flat = np.asarray(values).ravel()
    with open(path, "w", encoding="ascii", newline="\n") as f:
        if real:
            f.write("\n".join(float(v).hex() for v in flat))
        else:
            f.write("\n".join(str(int(v)) for v in flat))
        f.write("\n")


def inputs(workdir):
    """Value files per kernel, as --input arguments."""
    w = Path(workdir)
    n = 2708
    adj = np.fromfile(DATA / "cora_adj.u8", dtype=np.uint8).reshape(n, n)
    deg = adj.sum(axis=1).astype(np.float64)
    assert deg.min() > 0
    write(w / "cora_A.txt", adj)
    write(w / "cora_P.txt", adj / deg[:, None], real=True)
    write(w / "cora_v.txt", np.full(n, 1.0 / n), real=True)

    train = np.fromfile(DATA / "mnist_train.u8", dtype=np.uint8).reshape(60000, 28, 28)
    with np.load(DATA / "downloads" / "mnist.npz", allow_pickle=False) as z:
        labels = z["y_train"][:SAMPLES]
    crop = train[:SAMPLES, 9:19, 9:19].reshape(SAMPLES, 100)
    write(w / "mnist_X.txt", crop)
    write(w / "mnist_y.txt", labels)

    test = np.fromfile(DATA / "mnist_test.u8", dtype=np.uint8).reshape(10000, 784)
    weights = np.fromfile(DATA / "mnist_templates.i8", dtype=np.int8).reshape(10, 784)
    write(w / "mnist_W.txt", weights)
    write(w / "mnist_Xq.txt", (test[:SAMPLES] >> 1).astype(np.int8).T)
    return {
        "cora_walks": ["--input", f"A={w / 'cora_A.txt'}"],
        "cora_diffusion": ["--input", f"P={w / 'cora_P.txt'}", "--input", f"v={w / 'cora_v.txt'}"],
        "mnist_normal": ["--input", f"X={w / 'mnist_X.txt'}", "--input", f"y={w / 'mnist_y.txt'}"],
        "mnist_scores": ["--input", f"W={w / 'mnist_W.txt'}", "--input", f"X={w / 'mnist_Xq.txt'}"],
    }


def main():
    if not (DATA / "cora_adj.u8").exists():
        raise SystemExit("run tools/contracts/llvm_data.py first")
    ccs = os.environ.get("E2E_REAL_CCS", "gcc,clang").split(",")
    rows, versions, vm_cache = [], {}, {}
    with tempfile.TemporaryDirectory(prefix="e2e-real-") as workdir:
        supply = inputs(workdir)
        for cc in ccs:
            e2e.GCC = shutil.which(cc) or cc
            versions[cc] = subprocess.run([e2e.GCC, "--version"], capture_output=True,
                                          text=True).stdout.splitlines()[0]
            for kernel, args in supply.items():
                print(f"{cc} {kernel} ...", flush=True)
                processes, reps = EFFORT[kernel]
                got = e2e.measure(kernel, workdir, src=REAL / f"{kernel}.ml", supply=args,
                                  processes=processes, reps=reps, vm_cache=vm_cache)
                base = next(r for r in got if r["config"] == "source")["median_ns"]
                for r in got:
                    r["cc"] = cc
                    print(f"  {r['config']:24s} {r['median_ns'] / 1e6:10.2f} ms  "
                          f"x{base / r['median_ns']:8.2f}  same bits: {r['same_as_source']}",
                          flush=True)
                rows.extend(got)
    common.write_jsonl(common.RESULTS / "e2e_real.jsonl", rows)
    common.write_json(common.RESULTS / "e2e_real_env.json", common.environment(
        {"compilers": versions, "effort": EFFORT, "threads": e2e.THREADS, "samples": SAMPLES,
         "base_flags": e2e.BASE, "data": common.RESULTS.joinpath("llvm_data.json").name}))
    print(f"RQ4c: {len(rows)} measurements")


if __name__ == "__main__":
    main()
