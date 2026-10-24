"""Build and verify the self-contained source archive for the review revision."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import subprocess
import zipfile

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
PAPER = ROOT / "paper"
OUT = PAPER / "delivery-review"
STAGE = ROOT / "results/review-revision/package-build"
OUT.mkdir(exist_ok=True)
STAGE.mkdir(exist_ok=True)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


files = set()


def include(rel):
    path = (PAPER / rel).resolve()
    assert path.is_relative_to(PAPER.resolve()), path
    assert path.is_file(), path
    if rel in files:
        return
    files.add(rel)
    if path.suffix == ".tex":
        text = path.read_text(encoding="utf-8")
        for cmd, name in re.findall(r"\\(input|include|includegraphics)(?:\[[^\]]*\])?\{([^}]+)\}", text):
            dep = Path(name)
            if not dep.suffix:
                dep = dep.with_suffix(".pdf" if cmd == "includegraphics" else ".tex")
            include(dep.as_posix())


include("matrixlang.tex")
include("anonymous.tex")
for rel in sorted(files):
    target = STAGE / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(PAPER / rel, target)

readme = """# Revised compiler manuscript — 24 October 2026

Title: Proof-Guided Floating-Point Optimization: Exact Reassociation,
Error Bounds, and Compiler Certificates

The named and anonymous PDFs each have 22 pages, including references.
They share the scientific content in matrixlang.tex; anonymous.tex selects
the anonymous build. This archive contains every locally referenced TeX
input and figure. References are embedded in the main TeX source.

Build with a current TeX Live or MiKTeX installation providing acmart,
booktabs, graphicx, listings, xurl, and amsmath:

    pdflatex -interaction=nonstopmode -halt-on-error matrixlang.tex
    pdflatex -interaction=nonstopmode -halt-on-error matrixlang.tex
    pdflatex -interaction=nonstopmode -halt-on-error anonymous.tex
    pdflatex -interaction=nonstopmode -halt-on-error anonymous.tex

The review, nonacm settings retain line numbers and omit placeholder
publication metadata. Confirm the venue's current submission settings
before submitting. The anonymous wrapper does not anonymize the named
source archive; send only the anonymous PDF where anonymity is required.

The generated-review inputs replace historical RQ1/RQ2 results after the
underflow repair. Other performance measurements retain their original
scope. Former bounded real-domain timings are labelled as historical in
the paper, not asserted as results of the repaired admission policy.

The adjacent review-response.md explains the corrections and their limits.
The full compiler and raw experiments remain in the matrixlang repository.
From that repository, validation entry points are:

    make test
    make -C llvm test LLVM_CONFIG=llvm-config-18 CXX=clang++-18 CLANG=clang-18
    python tools/replay_review_corpus.py --help
    python tools/replay_review_certificates.py --binary /absolute/path/to/matrixc
    python tools/review_displays.py

To replay the exported numerical obligations without the compiler, run
from the delivery directory (Python 3.10+; do not enable Python -O):

    python check_chain_certificate.py numerical-certificates.jsonl

That check validates numerical obligations conditional on the recorded
operand facts. It does not verify fact extraction, identity rewrites,
LLVM transformations, or emitted machine code.

Author approval, declarations, reviewer artifact access and an independent
scientific review remain author responsibilities. No submission was made.
"""
(STAGE / "README.md").write_text(readme, encoding="utf-8", newline="\n")
files.add("README.md")

builds = {}
for stem in ("matrixlang", "anonymous"):
    for run in (1, 2):
        proc = subprocess.run(
            ["pdflatex", "-interaction=nonstopmode", "-halt-on-error", stem + ".tex"],
            cwd=STAGE, capture_output=True, text=True, errors="replace", timeout=90)
        (STAGE / f"{stem}-build-{run}.txt").write_text(proc.stdout + proc.stderr, encoding="utf-8")
        assert proc.returncode == 0, (stem, run, proc.stdout[-2000:])
    built = pymupdf.open(STAGE / (stem + ".pdf"))
    original = pymupdf.open(PAPER / (stem + ".pdf"))
    assert len(built) == len(original) == 22
    assert [p.get_text() for p in built] == [p.get_text() for p in original], stem
    if stem == "anonymous":
        exposed = json.dumps(built.metadata) + "".join(p.get_text() for p in built)
        assert "aswanth" not in exposed.lower() and "ranjith" not in exposed.lower()
    builds[stem] = {"pages": len(built), "isolated_build": "passed", "page_text_matches_delivered_pdf": True}

copies = {
    "proof-guided-floating-point-optimization.pdf": PAPER / "matrixlang.pdf",
    "proof-guided-floating-point-optimization-anonymous.pdf": PAPER / "anonymous.pdf",
    "review-response.md": PAPER / "review-response.md",
    "check_chain_certificate.py": ROOT / "tools/check_chain_certificate.py",
    "certificate-provenance.jsonl": ROOT / "results/review-revision/certificates/records.jsonl",
}
for name, path in copies.items():
    shutil.copy2(path, OUT / name)
records = [json.loads(line) for line in (OUT / "certificate-provenance.jsonl").read_text(encoding="utf-8").splitlines()]
(OUT / "numerical-certificates.jsonl").write_text(
    "".join(json.dumps(row["certificate"]) + "\n" for row in records), encoding="utf-8", newline="\n")
(OUT / "README.md").write_text(readme, encoding="utf-8", newline="\n")
archive = OUT / "manuscript-source.zip"
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
    for rel in sorted(files):
        z.write(STAGE / rel, arcname=rel)
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert set(z.namelist()) == files

replay = subprocess.run(
    [__import__("sys").executable, str(OUT / "check_chain_certificate.py"), str(OUT / "numerical-certificates.jsonl")],
    capture_output=True, text=True, timeout=60)
assert replay.returncode == 0, replay.stderr
manifest = {
    "title": "Proof-Guided Floating-Point Optimization: Exact Reassociation, Error Bounds, and Compiler Certificates",
    "date": "2026-10-24",
    "builds": builds,
    "source_archive_members": sorted(files),
    "certificate_replay": json.loads(replay.stdout),
    "validation": {
        "full_make_test": "passed; results/review-revision/full-tests-final.log",
        "acceptance_checks": 233,
        "c_backend": "48 programs x 3 contracts x 4 builds; zero required mismatches",
        "frontend_comparison": "54 programs; demo lexer/parser agree with the compiler",
        "rq1": "15000 programs, 60000 compilations; no errors",
        "rq2": "4800 programs x 3 seeds x 4 arms; no execution errors or bit-identical-certificate mismatches",
        "llvm": "9 IR functions; 75 smoke outputs and 784 stress cases each for licensed/integer builds; 20 integer-width cases; mutant caught on 10 cases",
        "layout": "all pages visually inspected; automated geometry, header and reference checks passed",
    },
    "files": {name: {"bytes": (OUT / name).stat().st_size, "sha256": digest(OUT / name)}
              for name in sorted([*copies, "numerical-certificates.jsonl", "README.md", archive.name])},
    "status": "revised author-review manuscript; no external submission or author approval asserted",
}
(OUT / "verification.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8", newline="\n")
print(json.dumps({"delivery": str(OUT), "source_files": len(files), "builds": builds,
                  "certificate_replay": manifest["certificate_replay"]}, indent=2))
