"""Shared helpers for the numerical-contracts study.

Every experiment script in this directory calls the compiler through these
functions, parses its reports with the same patterns, and records its
environment the same way. Nothing here interprets results.
"""

import hashlib
import json
import os
import platform
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXE = ".exe" if os.name == "nt" else ""
MATRIXC = ROOT / "bin" / f"matrixc{EXE}"
MUTANTS = ROOT / "bin" / f"matrixc-mutants{EXE}"
RESULTS = ROOT / "results" / "contracts"

CONTRACT_FLAGS = {
    "none": [],                                    # unoptimized reference
    "noproof": ["--optimize", "--no-proofs"],      # strict without facts
    "strict": ["--optimize"],
    "bounded": ["--optimize", "--fp-bounded"],
    "algebraic": ["--optimize", "--fp-algebraic"],
}


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def sha256_file(path):
    return sha256_bytes(Path(path).read_bytes())


def call(args, binary=MATRIXC, env=None, timeout=300):
    """Runs the compiler and returns (exit status, stdout)."""
    full_env = None
    if env:
        full_env = dict(os.environ)
        full_env.update(env)
    p = subprocess.run([str(binary)] + [str(a) for a in args], capture_output=True,
                       text=True, timeout=timeout, env=full_env)
    return p.returncode, p.stdout + p.stderr


_INT = r"(-?\d+)"
_RE = {
    "cost_before": re.compile(r"Arithmetic before optimization :\s+" + _INT),
    "cost_after": re.compile(r"Arithmetic after optimization  :\s+" + _INT),
    "instr_before": re.compile(r"Original TAC instructions   :\s+" + _INT),
    "instr_after": re.compile(r"Optimized TAC instructions  :\s+" + _INT),
    "chains": re.compile(r"Product chains reordered  :\s+" + _INT),
    "bitwise": re.compile(r"Proved bit-identical      :\s+" + _INT),
    "bounded": re.compile(r"Proved bound-preserving   :\s+" + _INT),
    "relaxed": re.compile(r"Relaxed \(reals only\)      :\s+" + _INT),
    "declined": re.compile(r"Declined by the contract  :\s+" + _INT),
    "flops_declined": re.compile(r"Chain arithmetic declined :\s+" + _INT),
    "identity": re.compile(r"Identity operations       :\s+" + _INT),
    "zero": re.compile(r"Zero-matrix operations    :\s+" + _INT),
}
_GUARANTEE = re.compile(r"^\s+(\d+)\. (bit-identical|bound-preserving|relaxed)\s+print\((.*)\)$",
                        re.M)


def parse_report(text):
    """Numbers from --report, keyed as in _RE. Missing fields raise."""
    out = {}
    for key, pattern in _RE.items():
        m = pattern.search(text)
        if not m:
            raise ValueError(f"report field missing: {key}")
        out[key] = int(m.group(1))
    return out


def parse_guarantees(text):
    """The --certificate section as a list of levels, in print order."""
    return [m.group(2) for m in _GUARANTEE.finditer(text)]


def split_outputs(text):
    """Splits --exact-output execution text into one block per print."""
    blocks, current = [], None
    for line in text.splitlines():
        if re.match(r"^\S.* = ", line):
            if current is not None:
                blocks.append("\n".join(current))
            current = [line]
        elif current is not None and line.strip():
            current.append(line)
    if current is not None:
        blocks.append("\n".join(current))
    return blocks


def write_jsonl(path, rows):
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        for row in rows:
            f.write(json.dumps(row, separators=(",", ":"), sort_keys=True) + "\n")


def read_jsonl(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def cpu_name():
    if os.name == "nt":
        try:
            p = subprocess.run(["powershell", "-NoProfile", "-Command",
                                "(Get-CimInstance Win32_Processor).Name"],
                               capture_output=True, text=True, timeout=30)
            if p.stdout.strip():
                return p.stdout.strip()
        except OSError:
            pass
    return platform.processor() or "unknown"


def environment(extra=None):
    sources = sorted(p for p in (ROOT / "src").rglob("*") if p.is_file())
    tools = sorted((ROOT / "tools" / "contracts").glob("*.py"))
    env = {
        "platform": platform.platform(),
        "python": sys.version.split()[0],
        "cpu": cpu_name(),
        "compiler_sha256": sha256_file(MATRIXC) if MATRIXC.exists() else None,
        "source_sha256": {p.relative_to(ROOT).as_posix(): sha256_file(p) for p in sources},
        "tool_sha256": {p.relative_to(ROOT).as_posix(): sha256_file(p) for p in tools},
    }
    if extra:
        env.update(extra)
    return env


def write_json(path, data):
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(data, indent=2, sort_keys=True) + "\n")
