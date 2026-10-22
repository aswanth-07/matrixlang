"""RQ9: how often existing C code has reductions the license applies to.

Compiles the C sources of four existing code bases with clang -O3 and the
ExactReduce plugin in report mode, and records the pass's decision for every
floating-point add reduction LLVM recognises:

    audioop      audioop-lts 0.2.2, CPython's audioop module (PyPI sdist)
    pillow       Pillow 11.1.0, src/libImaging (PyPI sdist)
    ndimage      SciPy 1.15.2, scipy/ndimage/src (PyPI sdist)
    polybench    PolyBench/C 4.2.1, all 30 kernels (GitHub mirror)

Sources are downloaded once into build/scan/ and their digests recorded. A
file that does not compile on this machine is recorded as skipped, with the
first error line.

    python tools/contracts/llvm_scan.py

Writes results/contracts/llvm_scan.jsonl and llvm_scan_env.json.
"""

from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import sysconfig
import tarfile
import time
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

PLUGIN = common.ROOT / "llvm" / "ExactReduce.so"
SCAN = common.ROOT / "build" / "scan"
CLANG = shutil.which("clang") or "clang"
DECISION = re.compile(r"^(\S+) (\S*) (\S+) (licensed|versioned|declined) (.*)$")

PYPI = {
    "audioop": ("audioop-lts", "0.2.2"),
    "pillow": ("pillow", "11.1.0"),
    "ndimage": ("scipy", "1.15.2"),
}
POLYBENCH_BASE = "https://raw.githubusercontent.com/MatthiasJReisinger/PolyBenchC-4.2.1/master/"
POLYBENCH = [
    "datamining/correlation", "datamining/covariance",
    "linear-algebra/blas/gemm", "linear-algebra/blas/gemver", "linear-algebra/blas/gesummv",
    "linear-algebra/blas/symm", "linear-algebra/blas/syr2k", "linear-algebra/blas/syrk",
    "linear-algebra/blas/trmm", "linear-algebra/kernels/2mm", "linear-algebra/kernels/3mm",
    "linear-algebra/kernels/atax", "linear-algebra/kernels/bicg",
    "linear-algebra/kernels/doitgen", "linear-algebra/kernels/mvt",
    "linear-algebra/solvers/cholesky", "linear-algebra/solvers/durbin",
    "linear-algebra/solvers/gramschmidt", "linear-algebra/solvers/lu",
    "linear-algebra/solvers/ludcmp", "linear-algebra/solvers/trisolv",
    "medley/deriche", "medley/floyd-warshall", "medley/nussinov",
    "stencils/adi", "stencils/fdtd-2d", "stencils/heat-3d", "stencils/jacobi-1d",
    "stencils/jacobi-2d", "stencils/seidel-2d",
]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def pypi(project, version):
    """Downloads an sdist through PyPI's JSON API, checks it against PyPI's
    SHA-256, and unpacks it; returns its directory and digest."""
    dest = SCAN / "sdist"
    dest.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(f"https://pypi.org/pypi/{project}/{version}/json",
                                timeout=120) as r:
        meta = json.load(r)
    sdist = next(u for u in meta["urls"] if u["packagetype"] == "sdist")
    archive = dest / sdist["filename"]
    if not archive.exists():
        with urllib.request.urlopen(sdist["url"], timeout=1800) as r:
            archive.write_bytes(r.read())
    digest = sha(archive)
    if digest != sdist["digests"]["sha256"]:
        raise SystemExit(f"{archive.name}: SHA-256 {digest} differs from PyPI's")
    root = SCAN / archive.name[: -len(".tar.gz")]
    if not root.exists():
        with tarfile.open(archive) as t:
            t.extractall(SCAN, filter="data")   # refuses links and paths outside SCAN
    return root, digest


def polybench():
    root = SCAN / "polybench"
    digests = {}
    files = ["utilities/polybench.h", "utilities/polybench.c"]
    for k in POLYBENCH:
        name = k.rsplit("/", 1)[1]
        files += [f"{k}/{name}.c", f"{k}/{name}.h"]
    for f in files:
        path = root / f
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            with urllib.request.urlopen(POLYBENCH_BASE + f, timeout=120) as r:
                path.write_bytes(r.read())
        digests[f] = sha(path)
    return root, digests


def compile_one(source, includes, defines, report, plugin=True):
    """Compiles one file; returns (first error line or None, seconds)."""
    args = [CLANG, "-std=gnu11", "-O3", "-march=native", "-g", "-w", "-c", str(source),
            "-o", os.devnull]
    if plugin:
        args.append(f"-fpass-plugin={PLUGIN}")
    args += [f"-I{i}" for i in includes] + [f"-D{d}" for d in defines]
    env = dict(os.environ, EXACT_REDUCE_REPORT=str(report))
    t0 = time.perf_counter()
    p = subprocess.run(args, capture_output=True, text=True, env=env, timeout=600)
    seconds = time.perf_counter() - t0
    if p.returncode:
        first = next((l for l in p.stderr.splitlines() if "error" in l), p.stderr[:200])
        return first.strip(), seconds
    return None, seconds


def scan(code_base, sources, includes, defines, root):
    rows = []
    for src in sources:
        report = SCAN / "report.txt"
        if report.exists():
            report.unlink()
        error, with_pass = compile_one(src, includes, defines, report)
        rel = src.relative_to(root).as_posix()
        if error:
            rows.append({"code_base": code_base, "file": rel, "skipped": error})
            continue
        lines = report.read_text().splitlines() if report.exists() else []
        decisions = [DECISION.match(l) for l in lines]
        # Compile time with and without the pass, alternated, best of three.
        times = {"with": [with_pass], "without": []}
        for _ in range(3):
            times["without"].append(compile_one(src, includes, defines, report, plugin=False)[1])
            times["with"].append(compile_one(src, includes, defines, report)[1])
        rows.append({"code_base": code_base, "file": rel, "skipped": None,
                     "seconds_with": min(times["with"]), "seconds_without": min(times["without"]),
                     "reductions": [{"function": m.group(1), "location": m.group(3),
                                     "decision": m.group(4), "reason": m.group(5)}
                                    for m in decisions if m]})
    return rows


def main():
    subprocess.run(["make", "-s", "-C", str(common.ROOT / "llvm"), "CXX=clang++"], check=True)
    SCAN.mkdir(parents=True, exist_ok=True)
    py_inc = sysconfig.get_paths()["include"]
    rows, env = [], {"clang": subprocess.run([CLANG, "--version"], capture_output=True,
                                             text=True).stdout.splitlines()[0]}

    root, digest = pypi(*PYPI["audioop"])
    env["audioop"] = {"sdist": f"{root.name}.tar.gz", "sha256": digest}
    rows += scan("audioop", sorted(root.rglob("*.c")), [py_inc], [], root)

    root, digest = pypi(*PYPI["pillow"])
    env["pillow"] = {"sdist": f"{root.name}.tar.gz", "sha256": digest}
    lib = root / "src" / "libImaging"
    rows += scan("pillow", sorted(lib.glob("*.c")), [lib, py_inc], [], root)

    root, digest = pypi(*PYPI["ndimage"])
    env["ndimage"] = {"sdist": f"{root.name}.tar.gz", "sha256": digest}
    try:
        import numpy
        np_inc = numpy.get_include()
    except ImportError:
        np_inc = ""
    src = root / "scipy" / "ndimage" / "src"
    rows += scan("ndimage", sorted(src.glob("*.c")), [src, np_inc, py_inc],
                 ["NPY_NO_DEPRECATED_API=NPY_1_7_API_VERSION"], root)

    root, digests = polybench()
    env["polybench"] = {"base": POLYBENCH_BASE, "sha256": digests}
    sources = [root / k / f"{k.rsplit('/', 1)[1]}.c" for k in POLYBENCH]
    rows += scan("polybench", sources, [root / "utilities"], ["LARGE_DATASET"], root)

    common.RESULTS.mkdir(parents=True, exist_ok=True)
    common.write_jsonl(common.RESULTS / "llvm_scan.jsonl", rows)
    common.write_json(common.RESULTS / "llvm_scan_env.json", common.environment(env))
    for cb in ["audioop", "pillow", "ndimage", "polybench"]:
        mine = [r for r in rows if r["code_base"] == cb]
        reds = [d for r in mine if not r["skipped"] for d in r["reductions"]]
        count = {k: sum(d["decision"] == k for d in reds) for k in ["licensed", "versioned",
                                                                     "declined"]}
        print(f"{cb:10s} files {len(mine):3d} skipped {sum(bool(r['skipped']) for r in mine):3d} "
              f"reductions {len(reds):4d} {count}")


if __name__ == "__main__":
    main()
