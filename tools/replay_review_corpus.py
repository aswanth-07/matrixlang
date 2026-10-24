"""Replay existing corpus plans with a specified compiler and separate outputs.

python tools/replay_review_corpus.py --binary /path/to/matrixc --out results/review-revision/native-corpus --only rq1 --workers 8
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser()
p.add_argument("--binary", required=True)
p.add_argument("--out", required=True)
args, rest = p.parse_known_args()
binary = Path(args.binary).resolve()
destination = Path(args.out).resolve()
destination.mkdir(parents=True, exist_ok=True)
os.environ["CONTRACTS_RESULTS"] = str(destination)
sys.path.insert(0, str(ROOT / "tools/contracts"))
import common
import corpus
common.MATRIXC = binary
common.call.__defaults__ = (binary, None, 300)
sources = sorted([q for q in (ROOT / "src").rglob("*") if q.suffix in {".c", ".h", ".l", ".y"}])
manifest = {"binary": str(binary), "binary_sha256": hashlib.sha256(binary.read_bytes()).hexdigest(),
            "sources": {str(q.relative_to(ROOT)): hashlib.sha256(q.read_bytes()).hexdigest() for q in sources},
            "command": sys.argv, "compiler": subprocess.check_output(["gcc", "--version"], text=True).splitlines()[0],
            "purpose": "Post-repair descriptive replay of exposed corpus; no new performance estimand"}
(destination / "revision-manifest.json").write_text(json.dumps(manifest, indent=2)+"\n")
sys.argv = [str(ROOT / "tools/contracts/corpus.py"), *rest]
corpus.main()
assert manifest["binary_sha256"] == hashlib.sha256(binary.read_bytes()).hexdigest()
assert all(manifest["sources"][str(q.relative_to(ROOT))] == hashlib.sha256(q.read_bytes()).hexdigest() for q in sources)
