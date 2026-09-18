"""Compare MatrixLang against public C-subset teaching compilers, phase by phase.

The curricular claim this project makes -- that the choice of source language
decides which compiler phases can carry real content -- is a comparative claim,
and a comparative claim needs a comparison. This measures one.

Method, stated so a reader can disagree with it:

  * Baselines are public repositories that present themselves as compiler-design
    course projects for a subset of C, built with Lex and Yacc. They were chosen
    by searching for that description, not by inspecting their contents first.
  * Each repository is reduced to its most complete version. Several are
    organised as incremental parts; only the last part is measured, because the
    earlier ones are the same compiler with less of it.
  * A file is attributed to a phase by its path and name, using the rules in
    PHASE_RULES below. Where a repository mixes phases inside one Yacc file --
    which every baseline does -- the whole file is attributed to `syntax`, and
    the phase-presence table rather than the line counts carries the argument.
  * A phase counts as present when a marker for it is found. The markers are
    listed in MARKERS and are searched case-insensitively across every source
    file. This is generous to the baselines: a single mention counts.

Line counts across differently-organised repositories are weak evidence and are
reported as context. Phase presence is the measurement.

    python tools/compare_baselines.py --baselines <dir> --out <file.json>
"""

import argparse
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SOURCE_EXT = (".l", ".y", ".c", ".h", ".cpp", ".hpp", ".py")

# Generated scanners and parsers are excluded: they are output, not authorship,
# and one lex.yy.c would swamp every other number in the table.
EXCLUDE = re.compile(r"(^|/)(lex\.yy\.c|y\.tab\.[ch]|.*\.tab\.[ch])$", re.I)

PHASE_RULES = [
    ("lexical",   re.compile(r"\.l$|lex|scanner|token", re.I)),
    ("syntax",    re.compile(r"\.y$|pars|grammar|ast|tree", re.I)),
    ("semantic",  re.compile(r"semantic|symbol|symtab|type|scope", re.I)),
    ("ir",        re.compile(r"\bir\b|icg|intermediate|quad|tac|three", re.I)),
    ("optimize",  re.compile(r"optimi|cost|chain", re.I)),
    ("backend",   re.compile(r"codegen|target|assembl|vm|emit|runtime|value", re.I)),
    ("support",   re.compile(r"diag|error|util|common", re.I)),
]

MARKERS = {
    "lexical analysis":      [r"\byylex\b", r"%%", r"\btoken\b"],
    "syntax analysis":       [r"\byyparse\b", r"%token\b", r"\bgrammar\b"],
    "symbol table":          [r"symbol\s*table", r"\bsymtab\b", r"\binsert\s*\(", r"\blookup\s*\("],
    "semantic analysis":     [r"semantic", r"type\s*check", r"undeclared", r"redeclar"],
    "intermediate code":     [r"three\s*address", r"\bquadrupl", r"\bicg\b",
                              r"intermediate\s*code", r"\bt%d\b"],
    "code optimization":     [r"optimi[sz]", r"dead\s*code", r"constant\s*fold",
                              r"common\s*sub", r"copy\s*propagat", r"strength\s*reduc"],
    "target code generation": [r"code\s*gener", r"\bassembl", r"\bcodegen\b",
                               r"target\s*code", r"instruction\s*select"],
    "execution":             [r"virtual\s*machine", r"\binterpret", r"\bexecute\b",
                              r"\bvm\b"],
}


def newest_part(paths):
    """Several baselines are incremental: Part 1..4, Project-1..4, archive/.
    Keep only the most complete version, and never the archive."""
    parts = {}
    for p in paths:
        m = re.search(r"(part|project)[ _-]*(\d+)", p, re.I)
        if m:
            parts.setdefault(m.group(1).lower(), set()).add(int(m.group(2)))
    keep = []
    for p in paths:
        if re.search(r"(^|/)archive(/|$)", p, re.I):
            continue
        m = re.search(r"(part|project)[ _-]*(\d+)", p, re.I)
        if m and int(m.group(2)) != max(parts[m.group(1).lower()]):
            continue
        keep.append(p)
    return keep


def collect(root):
    out = []
    for dirpath, dirnames, files in os.walk(root):
        dirnames[:] = [d for d in dirnames if d != ".git"]
        for f in files:
            if not f.endswith(SOURCE_EXT):
                continue
            rel = os.path.relpath(os.path.join(dirpath, f), root).replace("\\", "/")
            if EXCLUDE.search(rel):
                continue
            out.append(rel)
    return newest_part(sorted(out))


def phase_of(rel):
    for phase, rx in PHASE_RULES:
        if rx.search(rel):
            return phase
    return "other"


def measure(name, root, source_files):
    lines, per_phase, text = 0, {}, []
    for rel in source_files:
        p = os.path.join(root, rel)
        try:
            body = open(p, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        n = body.count("\n") + 1
        lines += n
        ph = phase_of(rel)
        per_phase[ph] = per_phase.get(ph, 0) + n
        text.append(body)

    blob = "\n".join(text).lower()
    present = {}
    for marker, pats in MARKERS.items():
        hit = next((p for p in pats if re.search(p, blob, re.I)), None)
        present[marker] = {"present": hit is not None, "matched": hit}

    return {
        "name": name,
        "files": len(source_files),
        "lines": lines,
        "lines_per_phase": per_phase,
        "phases_present": present,
        "phase_count": sum(1 for v in present.values() if v["present"]),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--baselines", required=True, help="directory of cloned repositories")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    report = {"method": __doc__.strip(), "compilers": []}

    ml_files = collect(os.path.join(ROOT, "src"))
    report["compilers"].append(measure("MatrixLang", os.path.join(ROOT, "src"), ml_files))

    for d in sorted(os.listdir(a.baselines)):
        full = os.path.join(a.baselines, d)
        if not os.path.isdir(full):
            continue
        report["compilers"].append(measure(d, full, collect(full)))

    with open(a.out, "w", newline="\n") as f:
        json.dump(report, f, indent=1)

    # -- readable summary ---------------------------------------------------
    markers = list(MARKERS)
    width = max(len(c["name"]) for c in report["compilers"])
    print(f"{'compiler'.ljust(width)}  files  lines  phases")
    for c in report["compilers"]:
        print(f"{c['name'].ljust(width)}  {c['files']:5d}  {c['lines']:5d}  "
              f"{c['phase_count']}/{len(markers)}")
    print()
    print("phase presence")
    for m in markers:
        row = "".join(" yes " if c["phases_present"][m]["present"] else "  .  "
                      for c in report["compilers"])
        print(f"  {m.ljust(24)}{row}")
    print()
    print("  columns: " + ", ".join(c["name"] for c in report["compilers"]))


if __name__ == "__main__":
    main()
