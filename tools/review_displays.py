"""Regenerate only the repaired RQ1/RQ2 displays from separate replay records."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools/contracts"))
import analyze

OUT = ROOT / "paper/generated-review"
OUT.mkdir(exist_ok=True)
temporary = ROOT / "results/review-revision/display-build"
(temporary / "generated").mkdir(parents=True, exist_ok=True)
paths = {"rq1": ROOT / "results/review-revision/native-corpus/rq1_recovery.jsonl",
         "rq2": ROOT / "results/review-revision/native-corpus-rq2/rq2_soundness.jsonl"}
summary = {}
for key, path in paths.items():
    rows = [json.loads(line) for line in path.read_text().splitlines()]
    summary[key] = getattr(analyze, key)(rows)
assert summary["rq1"]["programs"] == 15000 and summary["rq1"]["failures"] == 0
assert summary["rq2"]["programs"] == 4800 and summary["rq2"]["runs"] == 57600
assert all(c["errors"] == 0 for c in summary["rq2"]["arms"].values())
assert all(c["level_differ"].get("bit-identical", 0) == 0 for c in summary["rq2"]["arms"].values())
analyze.PAPER = temporary
macros = analyze.write_macros(summary)
analyze.write_tables(summary)
lines = ["% Generated from the separate post-repair RQ1/RQ2 replays."]
for key, value in sorted(macros.items()):
    if key.startswith(("One", "Two")):
        lines.append(f"\\renewcommand{{\\Rq{key}}}{{{value}}}")
(OUT / "contracts.tex").write_text("\n".join(lines)+"\n", newline="\n")
for name in ["tab-recovery.tex", "tab-soundness.tex"]:
    (OUT / name).write_bytes((temporary / "generated" / name).read_bytes())
manifest = {"summary": summary, "raw_sha256": {
    str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths.values()}}
(ROOT / "results/review-revision/display-verification.json").write_text(json.dumps(manifest, indent=2)+"\n", newline="\n")
print(json.dumps({"rq1_programs": summary["rq1"]["programs"], "rq2_runs": summary["rq2"]["runs"],
                  "bounded_recovery": {d:c["bounded"]["recovery"] for d,c in summary["rq1"]["domains"].items()}}, indent=2))
