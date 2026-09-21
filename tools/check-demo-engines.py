"""Check the demo's scanner and parser against the compiler they describe.

    python tools/check-demo-engines.py

demo/lexer.js and demo/parser.js exist so the page can scan and parse text you
type, which a captured transcript cannot do. That makes them the only part of
the demonstration that could disagree with the compiler, so they are measured
rather than trusted:

  * every program in examples/ is scanned by both, and the token streams are
    compared one token at a time -- category, lexeme, line and column;
  * every program is parsed by both, and the accept/reject verdict and every
    lexical and syntax diagnostic are compared, message for message.

Writes demo/agreement.js so the page can report the result, and exits 1 on any
disagreement, which is what makes `make web` fail rather than publish a page
that quietly parses a different language.
"""

import glob
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "demo", "agreement.js")

MATRIXC = os.path.join(ROOT, "bin", "matrixc")
if not os.path.exists(MATRIXC) and os.path.exists(MATRIXC + ".exe"):
    MATRIXC += ".exe"

TOKEN_ROW = re.compile(r"^(\d+)\s+([A-Z_]+)\s+(\S+)\s+(\d+):(\d+)\s*$")
DIAGNOSTIC = re.compile(
    r"^(\d+):(\d+): (?:error|warning) \[(lexical|syntax|semantic)\] (.*)$")


def compiler(path):
    """What bin/matrixc makes of this file, through syntax validation."""
    p = subprocess.run([MATRIXC, "--phase1", path],
                       capture_output=True, text=True, timeout=60)
    text = (p.stdout or "") + (p.stderr or "")

    tokens, diagnostics, in_table = [], [], False
    for line in text.replace("\r\n", "\n").split("\n"):
        if line.startswith("----"):
            in_table = True
            continue
        if in_table:
            m = TOKEN_ROW.match(line)
            if m:
                tokens.append({"category": m.group(2), "lexeme": m.group(3),
                               "line": int(m.group(4)), "col": int(m.group(5))})
                continue
            if line.strip().endswith("token(s)."):
                in_table = False
        m = DIAGNOSTIC.match(line)
        if m and m.group(3) != "semantic":
            diagnostics.append({"line": int(m.group(1)), "col": int(m.group(2)),
                                "kind": m.group(3), "message": m.group(4)})

    return {"tokens": tokens, "diagnostics": diagnostics,
            "accepted": "Syntax: VALID" in text}


def engines(path):
    """What demo/lexer.js and demo/parser.js make of the same file."""
    node = shutil.which("node")
    p = subprocess.run([node, os.path.join(HERE, "demo-engines.js"), path],
                       capture_output=True, text=True, timeout=60)
    if p.returncode != 0:
        sys.exit("the demo engines failed on %s:\n%s" % (path, p.stderr))
    out = json.loads(p.stdout)
    return {
        "tokens": [{"category": t["category"], "lexeme": t["lexeme"],
                    "line": t["line"], "col": t["col"]} for t in out["tokens"]],
        "diagnostics": out["diagnostics"],
        "accepted": out["accepted"],
        "scannerCheck": out["scannerCheck"],
    }


def compare(name, mine, theirs):
    """Every way two runs over one file can disagree, named."""
    problems = []

    if len(mine) != len(theirs):
        problems.append("%s: compiler produced %d, demo produced %d"
                        % (name, len(mine), len(theirs)))
    for i in range(min(len(mine), len(theirs))):
        if mine[i] != theirs[i]:
            problems.append("%s %d: compiler %s, demo %s"
                            % (name, i + 1, json.dumps(mine[i], sort_keys=True),
                               json.dumps(theirs[i], sort_keys=True)))
    return problems


def main():
    optional = "--optional" in sys.argv[1:]

    if not os.path.exists(MATRIXC):
        sys.exit("bin/matrixc is not built. Run `make` first.")

    if not shutil.which("node"):
        # node runs the page's own engines outside the page, and nothing else
        # in this project needs it. `make web` treats it as required, because
        # publishing a page whose engines were never checked is the one thing
        # this script exists to prevent; `make test` passes --optional and
        # says the check did not run rather than implying it passed.
        message = ("node is not on PATH, so demo/lexer.js and demo/parser.js "
                   "were NOT checked against the compiler.")
        if optional:
            print(message + " Install node, or run `make web`, to check them.")
            return 0
        sys.exit(message + "\nIt is needed to build the demo, not to view it.")

    files = sorted(glob.glob(os.path.join(ROOT, "examples", "*", "*.ml")))
    if not files:
        sys.exit("no example programs found under examples/")

    problems, tokens_compared, diagnostics_compared = [], 0, 0
    accepted, rejected = 0, 0

    for path in files:
        rel = os.path.relpath(path, ROOT).replace("\\", "/")
        want, got = compiler(path), engines(path)

        for note in got["scannerCheck"]:
            problems.append("%s: %s" % (rel, note))

        problems += ["%s: %s" % (rel, p)
                     for p in compare("token", want["tokens"], got["tokens"])]
        problems += ["%s: %s" % (rel, p)
                     for p in compare("diagnostic", want["diagnostics"],
                                      got["diagnostics"])]
        if want["accepted"] != got["accepted"]:
            problems.append("%s: compiler says %s, demo says %s"
                            % (rel, "ACCEPTED" if want["accepted"] else "REJECTED",
                               "ACCEPTED" if got["accepted"] else "REJECTED"))

        tokens_compared += len(want["tokens"])
        diagnostics_compared += len(want["diagnostics"])
        if want["accepted"]:
            accepted += 1
        else:
            rejected += 1

    result = {
        "programs": len(files),
        "accepted": accepted,
        "rejected": rejected,
        "tokens": tokens_compared,
        "diagnostics": diagnostics_compared,
        "disagreements": len(problems),
        "compiler": os.path.basename(MATRIXC),
    }

    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("/* Generated by tools/check-demo-engines.py. The page reports\n"
                 "   these numbers; they are the result of comparing\n"
                 "   demo/lexer.js and demo/parser.js against bin/matrixc over\n"
                 "   every program in examples/. */\n")
        fh.write("window.MATRIXLANG_AGREEMENT = ")
        json.dump(result, fh, indent=1)
        fh.write(";\n")

    print("%d program(s): %d token(s) and %d frontend diagnostic(s) compared, "
          "%d accepted, %d rejected"
          % (result["programs"], result["tokens"], result["diagnostics"],
             accepted, rejected))

    if problems:
        print("\n%d disagreement(s) between the demo engines and the compiler:"
              % len(problems))
        for p in problems[:40]:
            print("  " + p)
        if len(problems) > 40:
            print("  ... and %d more" % (len(problems) - 40))
        return 1

    print("demo/lexer.js and demo/parser.js agree with the compiler "
          "everywhere they were compared.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
