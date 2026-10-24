"""Replay all emitted chain obligations on examples and a bounded corpus sample."""
import argparse
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools/contracts"))
import corpus
from check_chain_certificate import check

p = argparse.ArgumentParser()
p.add_argument("--binary", required=True)
a = p.parse_args()
out = ROOT / "results/review-revision/certificates"
out.mkdir(exist_ok=True)
sources = [(str(x.relative_to(ROOT)), x.read_text()) for x in sorted((ROOT / "examples").rglob("*.ml")) if "errors" not in x.parts]
sources += [(f"generated-{domain}-{profile}-{seed}", corpus.source_for(seed, 0, "cost", profile, domain))
            for seed in range(1, 4) for domain in corpus.DOMAINS for profile in corpus.RQ1_PROFILES]
records, rejected_programs, checked_compilations = [], [], 0
with tempfile.TemporaryDirectory() as td:
    td = Path(td)
    path, cert = td / "case.ml", td / "certificate.jsonl"
    for name, source in sources:
        path.write_text(source)
        for mode in ["strict", "bounded", "algebraic"]:
            cert.write_text("")
            env = dict(os.environ, MATRIXC_CERTIFICATE_JSONL=str(cert))
            r = subprocess.run([a.binary, "--optimize", "--fp-"+mode, "--certificate", str(path)],
                               env=env, capture_output=True, text=True)
            if r.returncode:
                rejected_programs.append({"name": name, "mode": mode, "status": r.returncode})
                continue
            checked_compilations += 1
            for line in cert.read_text().splitlines():
                record = json.loads(line)
                check(record)
                records.append({"source": name, "source_sha256": hashlib.sha256(source.encode()).hexdigest(),
                                "contract": mode, "certificate": record})
(out / "records.jsonl").write_text("".join(json.dumps(x)+"\n" for x in records))
report = {"programs": len(sources), "accepted_compilations": checked_compilations,
          "checked_certificates": len(records), "levels": dict(Counter(x["certificate"]["guarantee"] for x in records)),
          "rejected_programs": rejected_programs, "failures": 0,
          "scope": "conditional numerical obligations; source/fact binding and emitted code are not verified"}
(out / "verification.json").write_text(json.dumps(report, indent=2)+"\n")
print(json.dumps(report, indent=2))
