"""Race one MatrixLang program against its baselines on this machine.

Every contestant computes the same program on the same inputs: one seeded
draw from the declared domains, checked by matrixc and written with
--dump-inputs. Contestants:

    numpy-matmul     the program translated to NumPy, products as written with @
    numpy-multidot   the same, every product chain through np.linalg.multi_dot
    gcc-o3           matrixc's C for the program as written, gcc -O3
    gcc-fastmath     the same C with -ffast-math
    ml-strict        matrixc's C under the strict contract, gcc -O3
    ml-bounded       ... under the bounded contract
    ml-algebraic     ... under the algebraic contract

Each contestant times its compute section only (no loading, checking or
printing): one warm-up run, then repeated runs, reported as the median and
quartiles. Every output is compared bit for bit with the program as written
(gcc-o3, whose output matrixc's test suite requires to equal its own virtual
machine's), and the most different entry of each contestant is returned as a
pair of binary64 bit patterns.

    python tools/race.py examples/kernels/walks.ml [--seed 1] [--budget 1.5]

NumPy runs in an interpreter that has it: this one if it does, otherwise
MATRIXLANG_NUMPY_PYTHON, otherwise the first python.exe under the user's
Python installations that imports numpy. Prints one JSON document.
"""

import argparse
import glob
import json
import math
import os
from pathlib import Path
import platform
import re
import shutil
import statistics
import struct
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
EXE = ".exe" if os.name == "nt" else ""
MATRIXC = ROOT / "bin" / f"matrixc{EXE}"
CFLAGS = ["-std=c11", "-O3", "-march=native", "-ffp-contract=off", "-w"]

CONTESTANTS = [
    # id, side, label, detail
    ("ml-strict", "matrixlang", "MatrixLang · strict", "proved bit-identical rewrites only"),
    ("ml-bounded", "matrixlang", "MatrixLang · bounded", "keeps the source order's error bound"),
    ("ml-algebraic", "matrixlang", "MatrixLang · algebraic", "any rewrite valid over the reals"),
    ("numpy-matmul", "baseline", "NumPy  A @ B @ C", "products as written, OpenBLAS"),
    ("numpy-multidot", "baseline", "NumPy  multi_dot", "reorders chains for speed, no guarantee"),
    ("gcc-o3", "baseline", "GCC -O3", "the program as written, compiled to C"),
    ("gcc-fastmath", "baseline", "GCC -O3 -ffast-math", "global permission to reassociate"),
]


class RaceError(Exception):
    pass


# --- MatrixLang to NumPy ------------------------------------------------------

TOKEN = re.compile(r"\s+|/\*.*?\*/|//[^\n]*|(?P<num>(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?)"
                   r"|(?P<id>[A-Za-z_]\w*)|(?P<sym>[-+*=;,()\[\]{}])", re.S)


def tokenize(src):
    out, pos = [], 0
    while pos < len(src):
        m = TOKEN.match(src, pos)
        if not m:
            raise RaceError(f"unexpected character {src[pos]!r}")
        pos = m.end()
        if m.lastgroup:
            out.append((m.lastgroup, m.group(m.lastgroup)))
    out.append(("end", ""))
    return out


class Translator:
    """Translates the straight-line subset to NumPy, tracking shapes so that
    `*` becomes @ between matrices and * otherwise, as the semantic pass does."""

    def __init__(self, src, multidot):
        self.toks = tokenize(src)
        self.i = 0
        self.multidot = multidot
        self.shapes = {}          # name -> None (scalar) or (r, c)
        self.inputs = []          # (name, rows, cols) in declaration order; rows None for scalars
        self.lines = []
        self.prints = []

    def peek(self, k=0):
        return self.toks[self.i + k]

    def take(self, value=None):
        tok = self.toks[self.i]
        if value is not None and tok[1] != value:
            raise RaceError(f"expected {value!r}, found {tok[1]!r}")
        self.i += 1
        return tok

    def const(self):
        neg = False
        if self.peek()[1] == "-":
            self.take()
            neg = True
        tok = self.take()
        if tok[0] != "num":
            raise RaceError("the race needs literal dimensions and domain bounds")
        value = float(tok[1])
        return -value if neg else value

    # Expressions return (tree, shape); a tree is a tuple the emitter prints.
    def primary(self):
        kind, text = self.peek()
        if text == "(":
            self.take()
            node = self.expr()
            self.take(")")
            return node
        if text == "-":
            self.take()
            tree, shape = self.primary()
            return ("neg", tree), shape
        if kind == "num":
            self.take()
            return ("num", float(text)), None
        if text == "{":
            return self.literal()
        if kind == "id" and self.peek(1)[1] == "(":
            return self.call(text)
        if kind == "id":
            self.take()
            if text not in self.shapes:
                raise RaceError(f"undeclared name {text}")
            return ("var", text), self.shapes[text]
        raise RaceError(f"unexpected {text!r}")

    def literal(self):
        rows = []
        self.take("{")
        while True:
            self.take("{")
            row = [self.const()]
            while self.peek()[1] == ",":
                self.take()
                row.append(self.const())
            self.take("}")
            rows.append(row)
            if self.peek()[1] != ",":
                break
            self.take()
        self.take("}")
        return ("lit", rows), (len(rows), len(rows[0]))

    def call(self, name):
        self.take()
        self.take("(")
        if name == "transpose":
            tree, shape = self.expr()
            self.take(")")
            return ("T", tree), (shape[1], shape[0])
        args = [int(self.const())]
        while self.peek()[1] == ",":
            self.take()
            args.append(int(self.const()))
        self.take(")")
        if name == "identity":
            return ("eye", args[0]), (args[0], args[0])
        if name in ("zeros", "ones"):
            return (name, args[0], args[1]), (args[0], args[1])
        raise RaceError(f"{name}() is not supported by the race")

    def term(self):
        tree, shape = self.primary()
        while self.peek()[1] == "*":
            self.take()
            rtree, rshape = self.primary()
            if shape is not None and rshape is not None:
                tree, shape = ("matmul", tree, rtree), (shape[0], rshape[1])
            else:
                tree, shape = ("mul", tree, rtree), shape if shape is not None else rshape
        return tree, shape

    def expr(self):
        tree, shape = self.term()
        while self.peek()[1] in ("+", "-"):
            op = self.take()[1]
            rtree, _ = self.term()
            tree = ("add" if op == "+" else "sub", tree, rtree)
        return tree, shape

    def domain(self):
        self.take("input")
        self.take("(")
        self.take()
        if self.peek()[1] == "(":
            depth = 0
            while True:
                t = self.take()[1]
                depth += t == "("
                depth -= t == ")"
                if depth == 0:
                    break
        self.take(")")

    def statement(self):
        kind, text = self.peek()
        if text == ";":
            self.take()
            return
        if text in ("matrix", "scalar"):
            self.take()
            name = self.take()[1]
            shape = None
            if text == "matrix" and self.peek()[1] == "[":
                self.take("[")
                r = int(self.const())
                self.take(",")
                c = int(self.const())
                self.take("]")
                shape = (r, c)
            if self.peek()[1] == "=" and self.peek(1)[1] == "input":
                self.take("=")
                self.domain()
                self.take(";")
                self.inputs.append((name, shape[0] if shape else None, shape[1] if shape else None))
                self.shapes[name] = shape
                k = len(self.inputs) - 1
                self.lines.append(f"v_{name} = inp[{k}]")
                return
            if self.peek()[1] == "=":
                self.take("=")
                tree, eshape = self.expr()
                self.take(";")
                self.shapes[name] = shape or eshape
                self.lines.append(f"v_{name} = {self.emit(tree)}")
                return
            self.take(";")
            self.shapes[name] = shape
            self.lines.append(f"v_{name} = np.zeros({shape})" if shape else f"v_{name} = 0.0")
            return
        if text == "print":
            self.take()
            self.take("(")
            tree, shape = self.expr()
            self.take(")")
            self.take(";")
            label = tree[1] if tree[0] == "var" else f"print{len(self.prints) + 1}"
            k = len(self.prints)
            self.lines.append(f"out_{k} = {self.emit(tree)}")
            self.prints.append((label, shape))
            return
        if kind == "id" and self.peek(1)[1] == "=":
            self.take()
            self.take("=")
            tree, _ = self.expr()
            self.take(";")
            self.lines.append(f"v_{text} = {self.emit(tree)}")
            return
        raise RaceError(f"unexpected {text!r}")

    def chain(self, tree):
        if tree[0] == "matmul":
            return self.chain(tree[1]) + self.chain(tree[2])
        return [tree]

    def emit(self, t):
        op = t[0]
        if op == "num":
            return repr(t[1])
        if op == "var":
            return f"v_{t[1]}"
        if op == "lit":
            return f"np.array({t[1]!r}, dtype=np.float64)"
        if op == "neg":
            return f"(-{self.emit(t[1])})"
        if op == "T":
            return f"{self.emit(t[1])}.T"
        if op == "eye":
            return f"np.eye({t[1]})"
        if op in ("zeros", "ones"):
            return f"np.{op}(({t[1]}, {t[2]}))"
        if op == "matmul":
            parts = self.chain(t)
            if self.multidot and len(parts) >= 3:
                return "np.linalg.multi_dot([" + ", ".join(self.emit(p) for p in parts) + "])"
            return f"({self.emit(t[1])} @ {self.emit(t[2])})"
        sym = {"mul": "*", "add": "+", "sub": "-"}[op]
        return f"({self.emit(t[1])} {sym} {self.emit(t[2])})"

    def program(self):
        while self.peek()[0] != "end":
            self.statement()
        return self


NUMPY_RUNNER = r'''
import json, statistics, sys, time
import numpy as np
spec = json.loads(sys.argv[1])
raw = np.fromfile(spec["inputs"], dtype="<f8")
inp, at = [], 0
for rows, cols in spec["shapes"]:
    n = 1 if rows is None else rows * cols
    block = raw[at:at + n]
    at += n
    inp.append(float(block[0]) if rows is None else np.ascontiguousarray(block.reshape(rows, cols)))
SOURCE
def run():
    return compute(inp)
outs = run()
deadline_reps = spec["reps"]
times = []
for _ in range(deadline_reps):
    t0 = time.perf_counter()
    run()
    times.append(time.perf_counter() - t0)
with open(spec["out"], "w") as f:
    for label, value in zip(spec["labels"], outs):
        a = np.atleast_2d(np.asarray(value, dtype=np.float64))
        f.write(f"{label} = Matrix<{a.shape[0]}x{a.shape[1]}>\n")
        for row in a:
            f.write("  [ " + " ".join(float(x).hex() for x in row) + " ]\n")
print(json.dumps({"times_ns": [t * 1e9 for t in times], "numpy": np.__version__}))
'''


def numpy_source(src, multidot):
    tr = Translator(src, multidot).program()
    body = ["def compute(inp):"] + ["    " + line for line in tr.lines]
    body.append("    return [" + ", ".join(f"out_{k}" for k in range(len(tr.prints))) + "]")
    return "\n".join(body), tr


# --- running ------------------------------------------------------------------

def tool_env(threads=1):
    """One thread count for every contestant: OpenMP for the C, OpenBLAS for NumPy."""
    env = dict(os.environ)
    gcc = gcc_path()
    env["PATH"] = str(Path(gcc).parent) + os.pathsep + env.get("PATH", "")
    for var in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
        env[var] = str(threads)
    return env


def gcc_path():
    found = shutil.which("gcc")
    if found:
        return found
    for candidate in ("C:/msys64/mingw64/bin/gcc.exe", "/usr/bin/gcc"):
        if Path(candidate).exists():
            return candidate
    raise RaceError("gcc was not found; install it or put it on PATH")


_NUMPY_PYTHON = []


def numpy_python():
    """An interpreter that imports numpy: this one, MATRIXLANG_NUMPY_PYTHON,
    the py launcher's Python 3, a per-user Windows install, or one on PATH."""
    if _NUMPY_PYTHON:
        return _NUMPY_PYTHON[0]
    candidates = [os.environ.get("MATRIXLANG_NUMPY_PYTHON"), sys.executable]
    launcher = shutil.which("py")
    if launcher:
        try:
            p = subprocess.run([launcher, "-3", "-c", "import sys, numpy; print(sys.executable)"],
                               capture_output=True, text=True, timeout=30)
            if p.returncode == 0:
                candidates.append(p.stdout.strip())
        except (OSError, subprocess.TimeoutExpired):
            pass
    profile = os.environ.get("USERPROFILE") or os.environ.get("HOME")
    for base in (os.environ.get("LOCALAPPDATA"), os.path.join(profile, "AppData", "Local") if profile else None):
        if base:
            candidates += sorted(glob.glob(os.path.join(base, "Programs", "Python", "Python3*", "python.exe")), reverse=True)
    candidates += [shutil.which(name) for name in ("python3", "python")]
    for exe in candidates:
        if not exe or not Path(exe).exists():
            continue
        try:
            probe = subprocess.run([exe, "-c", "import numpy"], capture_output=True, timeout=60)
        except (OSError, subprocess.TimeoutExpired):
            continue
        if probe.returncode == 0:
            _NUMPY_PYTHON.append(exe)
            return exe
    return None

def run(args, env=None, timeout=120):
    p = subprocess.run([str(a) for a in args], capture_output=True, text=True, env=env, timeout=timeout,
                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    return p.returncode, p.stdout, p.stderr


def parse_outputs(text):
    """matrixc's exact-output text (C %a or Python float.hex) to lists of floats."""
    blocks, current = [], None
    for line in text.splitlines():
        m = re.match(r"^(\S.*?) = Matrix<(\d+)x(\d+)>$", line)
        s = re.match(r"^(\S.*?) = (\S+)$", line)
        if m:
            current = (m.group(1), [])
            blocks.append(current)
        elif s and not line.startswith(" "):
            blocks.append((s.group(1), [float.fromhex(s.group(2))]))
            current = None
        elif current is not None and line.strip().startswith("["):
            current[1].extend(float.fromhex(tok) for tok in line.strip()[1:-1].split())
    return blocks


def bits(x):
    return struct.unpack("<Q", struct.pack("<d", x))[0]


def compare(reference, candidate):
    """Per output: entries, entries with different bits, and the worst entry."""
    if len(reference) != len(candidate):
        return {"comparable": False}
    outs, worst = [], None
    for (label, ref), (_, got) in zip(reference, candidate):
        if len(ref) != len(got):
            return {"comparable": False}
        differ, rel = 0, 0.0
        for k, (a, b) in enumerate(zip(ref, got)):
            ba, bb = bits(a), bits(b)
            if ba != bb:
                differ += 1
                flipped = bin(ba ^ bb).count("1")
                r = abs(a - b) / abs(a) if a else (math.inf if b else 0.0)
                if worst is None or flipped > worst["flipped"] or (flipped == worst["flipped"] and r > worst["rel"]):
                    worst = {"output": label, "index": k, "reference": f"{ba:016x}", "value": f"{bb:016x}",
                             "flipped": flipped, "rel": r}
                rel = max(rel, r)
        outs.append({"label": label, "entries": len(ref), "differ": differ, "max_rel": rel})
    if worst is None and reference and reference[0][1]:
        a = reference[0][1][0]
        worst = {"output": reference[0][0], "index": 0, "reference": f"{bits(a):016x}",
                 "value": f"{bits(a):016x}", "flipped": 0, "rel": 0.0}
    if worst is not None and not math.isfinite(worst["rel"]):
        worst["rel"] = None
    return {"comparable": True, "outputs": outs, "identical": all(o["differ"] == 0 for o in outs), "worst": worst}


def timing(times_ns):
    xs = sorted(times_ns)

    def q(p):
        pos = p * (len(xs) - 1)
        lo = int(pos)
        hi = min(lo + 1, len(xs) - 1)
        return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo)
    return {"median_ns": statistics.median(xs), "p25_ns": q(0.25), "p75_ns": q(0.75), "samples": len(xs)}


def reps_for(seconds, budget, low=3, high=31):
    if seconds <= 0:
        return high
    return max(low, min(high, int(budget / seconds)))


def race(src_text, seed=1, budget=1.5, only=None, progress=None, threads=1):
    want = [c for c in CONTESTANTS if only is None or c[0] in only]
    if not MATRIXC.exists():
        raise RaceError("bin/matrixc is missing; run make first")
    env = tool_env(threads)
    gcc = gcc_path()
    # Every C contestant is built the same way; only the contract differs.
    omp = ["-fopenmp"] if threads > 1 else ["-fopenmp-simd"]
    result = {"seed": seed, "threads": threads, "machine": machine(), "contestants": []}
    with tempfile.TemporaryDirectory(prefix="matrixlang-race-") as d:
        d = Path(d)
        prog = d / "program.ml"
        prog.write_text(src_text, encoding="utf-8", newline="\n")
        inputs = d / "inputs.bin"
        code, out, err = run([MATRIXC, "-q", "--random-inputs", seed, "--dump-inputs", inputs, prog], env)
        if code:
            raise RaceError((out + err).strip() or "matrixc rejected the program")

        def c_contestant(cid, flags, cflags):
            c_file = d / f"{cid}.c"
            lic = [] if flags else ["--no-license"]
            code, out, err = run([MATRIXC, "-q", *flags, *lic, "--emit-c", c_file, prog], env)
            if code:
                raise RaceError((out + err).strip())
            exe = d / f"{cid}{EXE}"
            code, out, err = run([gcc, *CFLAGS, *cflags, c_file, "-o", exe, "-lm"], env, timeout=300)
            if code:
                raise RaceError("gcc failed: " + (out + err).strip()[:400])
            code, out, err = run([exe, inputs, 1], env)
            if code:
                raise RaceError(err.strip())
            first = float(re.search(r"ml-times-ns (\S+)", err).group(1)) / 1e9
            reps = reps_for(first, budget)
            code, out, err = run([exe, inputs, reps + 1], env, timeout=600)
            times = [float(x) for x in re.search(r"ml-times-ns ([^\n]*)", err).group(1).split()][1:]
            header = c_file.read_text(encoding="utf-8").split("\n", 3)
            return out, times, header[1].strip().lstrip("* ") + " " + header[2].strip().lstrip("* ")

        def numpy_contestant(cid):
            py = numpy_python()
            if not py:
                raise RaceError("no Python with NumPy was found (set MATRIXLANG_NUMPY_PYTHON)")
            source, tr = numpy_source(src_text, cid == "numpy-multidot")
            script = d / f"{cid}.py"
            script.write_text(NUMPY_RUNNER.replace("SOURCE", source), encoding="utf-8")
            outfile = d / f"{cid}.txt"
            spec = {"inputs": str(inputs), "shapes": [[r, c] for _, r, c in tr.inputs],
                    "labels": [label for label, _ in tr.prints], "out": str(outfile), "reps": 1}
            code, out, err = run([py, script, json.dumps(spec)], env, timeout=300)
            if code:
                raise RaceError("NumPy failed: " + err.strip()[-400:])
            first = json.loads(out)["times_ns"][0] / 1e9
            spec["reps"] = reps_for(first, budget)
            code, out, err = run([py, script, json.dumps(spec)], env, timeout=600)
            info = json.loads(out)
            return outfile.read_text(encoding="utf-8"), info["times_ns"], f"NumPy {info['numpy']}"

        builders = {
            "gcc-o3": lambda: c_contestant("gcc-o3", [], omp),
            "gcc-fastmath": lambda: c_contestant("gcc-fastmath", [], omp + ["-ffast-math"]),
            "ml-strict": lambda: c_contestant("ml-strict", ["--optimize", "--fp-strict"], omp),
            "ml-bounded": lambda: c_contestant("ml-bounded", ["--optimize", "--fp-bounded"], omp),
            "ml-algebraic": lambda: c_contestant("ml-algebraic", ["--optimize", "--fp-algebraic"], omp),
            "numpy-matmul": lambda: numpy_contestant("numpy-matmul"),
            "numpy-multidot": lambda: numpy_contestant("numpy-multidot"),
        }
        # The reference runs first: everything is compared with it.
        order = ["gcc-o3"] + [c[0] for c in want if c[0] != "gcc-o3"]
        texts = {}
        for cid in order:
            meta = next(c for c in CONTESTANTS if c[0] == cid)
            if progress:
                progress(cid)
            entry = {"id": cid, "side": meta[1], "label": meta[2], "detail": meta[3]}
            try:
                text, times, note = builders[cid]()
                texts[cid] = text
                entry.update(timing(times))
                entry["note"] = note
            except (RaceError, subprocess.TimeoutExpired, AttributeError) as error:
                entry["error"] = str(error) or "timed out"
            if cid.startswith("ml-"):
                entry["guarantees"] = certificate(prog, cid.split("-")[1], env)
            result["contestants"].append(entry)
        reference = parse_outputs(texts.get("gcc-o3", ""))
        for entry in result["contestants"]:
            if entry["id"] in texts:
                entry["bits"] = compare(reference, parse_outputs(texts[entry["id"]]))
        base = next((e for e in result["contestants"] if e["id"] == "gcc-o3" and "median_ns" in e), None)
        for entry in result["contestants"]:
            # A compute section below the timer's resolution reads as 0 ns: no ratio.
            if base and base["median_ns"] > 0 and entry.get("median_ns", 0) > 0:
                entry["speedup_vs_source"] = base["median_ns"] / entry["median_ns"]
        if only is not None:
            result["contestants"] = [e for e in result["contestants"] if e["id"] in only]
        result["contestants"].sort(key=lambda e: [c[0] for c in CONTESTANTS].index(e["id"]))
    return result


def certificate(prog, contract, env):
    code, out, _ = run([MATRIXC, f"--fp-{contract}", "--optimize", "--report", "--cost", "--certificate", prog], env)
    levels = re.findall(r"^\s+\d+\.\s+(bit-identical|bound-preserving|relaxed)\s+print\((.*)\)\s*$", out, re.M)
    cost = re.search(r"Arithmetic after optimization\s*:\s*(\d+)", out)
    before = re.search(r"Arithmetic before optimization\s*:\s*(\d+)", out)
    return {"levels": [{"level": lv, "label": lb} for lv, lb in levels],
            "modeled_after": int(cost.group(1)) if cost else None,
            "modeled_before": int(before.group(1)) if before else None}


def machine():
    cpu = platform.processor()
    if os.name == "nt":
        try:
            p = subprocess.run(["powershell", "-NoProfile", "-Command", "(Get-CimInstance Win32_Processor).Name"],
                               capture_output=True, text=True, timeout=20)
            cpu = p.stdout.strip() or cpu
        except (OSError, subprocess.TimeoutExpired):
            pass
    try:
        version = subprocess.run([gcc_path(), "--version"], capture_output=True, text=True).stdout.splitlines()[0]
    except (OSError, RaceError, IndexError):
        version = "gcc"
    return {"cpu": cpu, "gcc": version, "logical_cpus": os.cpu_count(), "platform": platform.platform(),
            "measured": time.strftime("%Y-%m-%d %H:%M")}


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("program")
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--budget", type=float, default=1.5, help="seconds of timed runs per contestant")
    parser.add_argument("--threads", type=int, default=1, help="threads for every contestant")
    args = parser.parse_args()
    src = Path(args.program).read_text(encoding="utf-8")
    print(json.dumps(race(src, args.seed, args.budget, threads=args.threads,
                          progress=lambda c: print(f"running {c}", file=sys.stderr, flush=True)), indent=1))


if __name__ == "__main__":
    main()
