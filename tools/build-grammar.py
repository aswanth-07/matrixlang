"""Extract the grammar, the LALR automaton and the scanner's rule list.

    python tools/build-grammar.py

Writes demo/grammar.js. Nothing here is transcribed by hand:

  * the grammar and the automaton come from `bison --report=all`, which is the
    same run that produces the parser the compiler is built from, so the states
    the demo walks are the states matrixc walks;
  * the scanner's rule list is parsed out of src/frontend/matrix.l in file
    order, because flex resolves a tie by rule order and a demo that showed the
    rules in a different order would be showing a different scanner.

The page drives a parser off these tables. That is the point: the browser is
not imitating bison's algorithm over a grammar somebody retyped, it is running
bison's own table.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
GRAMMAR = os.path.join(ROOT, "src", "frontend", "matrix.y")
SCANNER = os.path.join(ROOT, "src", "frontend", "matrix.l")
OUT = os.path.join(ROOT, "demo", "grammar.js")


# ---------------------------------------------------------------- bison ----

def run_bison():
    """Run bison over the real grammar and return its report, verbatim."""
    bison = shutil.which("bison")
    if not bison:
        sys.exit("bison is not on PATH. On MSYS2: pacman -S --needed bison, "
                 "and see the README for the PATH ordering this project needs.")

    version = subprocess.run([bison, "--version"], capture_output=True,
                             text=True).stdout.split("\n")[0].strip()

    tmp = tempfile.mkdtemp(prefix="matrixlang-grammar-")
    try:
        report = os.path.join(tmp, "matrix.output")
        p = subprocess.run(
            [bison, "-d", "--report=all", "--report-file=" + report,
             "-o", os.path.join(tmp, "matrix.tab.c"), GRAMMAR],
            capture_output=True, text=True)
        if p.returncode != 0:
            sys.exit("bison refused the grammar:\n" + p.stdout + p.stderr)
        with open(report, encoding="utf-8") as fh:
            text = fh.read()
        return version, text, (p.stdout + p.stderr)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# A rule line is "   12 lhs: a b c" or a continuation "   13     | a b c".
RULE = re.compile(r"^\s{2,6}(\d+) (?:([A-Za-z_$][\w$]*): |\s*\| )(.*)$")

# "    IDENT  shift, and go to state 5"
SHIFT = re.compile(r"^\s{4}(\S+)\s+shift, and go to state (\d+)$")
# "    $end  reduce using rule 1 (program)"
REDUCE = re.compile(r"^\s{4}(\S+)\s+reduce using rule (\d+) \(([^)]*)\)$")
# "    $default  accept"
ACCEPT = re.compile(r"^\s{4}(\S+)\s+accept$")
# "    stmt_list  go to state 2"   (a goto, never a shift: shifts match above)
GOTO = re.compile(r"^\s{4}(\S+)\s+go to state (\d+)$")
# "    ']'  error (nonassociative)"
NONASSOC = re.compile(r"^\s{4}(\S+)\s+error \(nonassociative\)$")
# "    Conflict between rule 18 and token '*' resolved as reduce (%left '*')."
CONFLICT = re.compile(
    r"^\s{4}Conflict between rule (\d+) and token (\S+) "
    r"resolved as (shift|reduce|an error) \((.*)\)\.$")


def parse_rules(text):
    """The numbered grammar bison printed, with continuations resolved."""
    body = text.split("Grammar", 1)[1].split("\n\n\nTerminals", 1)[0]
    rules, lhs = [], None
    for line in body.split("\n"):
        m = RULE.match(line)
        if not m:
            continue
        number, head, rhs = m.groups()
        if head:
            lhs = head
        rhs = rhs.strip()
        symbols = [] if rhs == "%empty" else rhs.split()
        rules.append({
            "n": int(number),
            "lhs": lhs,
            "rhs": symbols,
            "empty": rhs == "%empty",
        })
    if not rules:
        sys.exit("could not read the grammar out of bison's report")
    return rules


def parse_symbols(text):
    """Terminals with their character codes, and nonterminals."""
    terminals, nonterminals = [], []

    block = text.split("Terminals, with rules where they appear", 1)[1]
    block = block.split("Nonterminals, with rules where they appear", 1)
    for line in block[0].split("\n"):
        m = re.match(r"^\s{4}(\S+) (?:<[^>]*> )?\((-?\d+)\)\s*(.*)$", line)
        if m:
            name, code, where = m.groups()
            terminals.append({
                "name": name,
                "code": int(code),
                "rules": [int(x) for x in where.split()] if where.strip() else [],
            })

    current = None
    for line in block[1].split("\n"):
        m = re.match(r"^\s{4}(\S+) (?:<[^>]*> )?\((-?\d+)\)$", line)
        if m:
            current = {"name": m.group(1), "left": [], "right": []}
            nonterminals.append(current)
            continue
        if current is None:
            continue
        m = re.match(r"^\s{8}on (left|right): (.*)$", line)
        if m:
            current[m.group(1)] = [int(x) for x in m.group(2).split()]

    return terminals, nonterminals


def parse_states(text, rules):
    """Every state: its item set, its actions, its gotos, and any conflict the
    precedence declarations resolved there."""
    by_number = {r["n"]: r for r in rules}
    chunks = re.split(r"\n\nState (\d+)\n", "\n" + text)
    states = []

    for i in range(1, len(chunks), 2):
        number, body = int(chunks[i]), chunks[i + 1]
        st = {"id": number, "items": [], "actions": {}, "default": None,
              "gotos": {}, "resolved": []}


        for line in body.split("\n"):
            if not line.strip():
                continue

            m = CONFLICT.match(line)
            if m:
                st["resolved"].append({
                    "rule": int(m.group(1)),
                    "token": m.group(2),
                    "as": "error" if m.group(3) == "an error" else m.group(3),
                    "why": m.group(4),
                })
                continue

            m = SHIFT.match(line)
            if m:
                st["actions"][m.group(1)] = {"kind": "shift",
                                             "to": int(m.group(2))}
                continue

            m = REDUCE.match(line)
            if m:
                act = {"kind": "reduce", "rule": int(m.group(2))}
                if m.group(1) == "$default":
                    st["default"] = act
                else:
                    st["actions"][m.group(1)] = act
                continue

            m = ACCEPT.match(line)
            if m:
                act = {"kind": "accept"}
                if m.group(1) == "$default":
                    st["default"] = act
                else:
                    st["actions"][m.group(1)] = act
                continue

            m = NONASSOC.match(line)
            if m:
                st["actions"][m.group(1)] = {"kind": "error",
                                             "why": "nonassociative"}
                continue

            m = GOTO.match(line)
            if m:
                st["gotos"][m.group(1)] = int(m.group(2))
                continue

            # Anything left at this indent is an item. The dot is a bare '.',
            # which is unambiguous because this grammar has no '.' token.
            m = RULE.match(line)
            if not m:
                continue
            number_, _head, rhs = m.groups()
            rule = by_number.get(int(number_))
            if rule is None:
                continue

            parts = rhs.split()
            lookahead = []
            if "[" in rhs:
                body_, look = rhs.split("[", 1)
                parts = body_.split()
                # A lookahead set is printed as [a, b, c], and one of this
                # grammar's terminals is ','. Splitting on the comma turns
                # that one token into two empty ones, so the members are
                # matched rather than split.
                lookahead = re.findall(r"'(?:[^']|'')*'|[A-Za-z_$][\w$]*",
                                       look.rstrip("]"))
            dot = parts.index(".") if "." in parts else len(parts)
            if rule["empty"]:
                dot = 0
            st["items"].append({"rule": rule["n"], "dot": dot,
                                "lookahead": lookahead})

        states.append(st)

    states.sort(key=lambda s: s["id"])
    return states


def parse_precedence(path):
    """The %left / %right / %nonassoc declarations, in the order that gives
    them their precedence levels."""
    levels, level = [], 0
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            m = re.match(r"^%(left|right|nonassoc)\s+(.*?)\s*$", line)
            if m:
                level += 1
                levels.append({
                    "level": level,
                    "assoc": m.group(1),
                    "tokens": m.group(2).split(),
                })
    return levels


# ----------------------------------------------------------------- flex ----

def parse_scanner(path):
    """The scanner's rules, in file order, with the definitions they expand.

    flex takes the longest match and breaks a tie by rule order, so the order
    here is the scanner's semantics and not a presentation choice.
    """
    with open(path, encoding="utf-8") as fh:
        text = fh.read()

    head, _, rest = text.partition("\n%%\n")
    body, _, _ = rest.partition("\n%%\n")

    defs = {}
    for line in head.split("\n"):
        m = re.match(r"^([A-Z][A-Z0-9_]*)\s+(\S.*?)\s*$", line)
        if m:
            defs[m.group(1)] = m.group(2)

    rules, n = [], 0
    lines = body.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        i += 1
        if not line.strip() or line[0].isspace():
            continue

        pattern, rest = split_pattern(line)
        if not pattern or not rest.lstrip().startswith("{"):
            continue

        # An action runs until its braces balance, which is often several
        # lines: {IDENT} and the two diagnostics all wrap.
        action = rest
        depth = brace_depth(rest)
        while depth > 0 and i < len(lines):
            action += "\n" + lines[i]
            depth += brace_depth(lines[i])
            i += 1

        n += 1
        t = re.search(r"""tok\(\s*('(?:\\.|[^'])'|[A-Za-z_]\w*)\s*,"""
                      r"""\s*"([A-Z_]+)\"""", action)
        if t:
            symbol, kind, category = t.group(1), "token", t.group(2)
        elif "diag_report" in action:
            symbol, kind, category = None, "error", None
        else:
            symbol, kind, category = None, "skip", None

        rules.append({
            "n": n,
            "pattern": pattern,
            "symbol": symbol,
            "kind": kind,
            "category": category,
        })

    return {"definitions": defs, "rules": rules}


def brace_depth(text):
    """How far one line of a C action opens or closes its braces.

    The braces that matter are the action's own. `tok('{', "LBRACE")` carries
    one in a character literal and `tok('}', "RBRACE")` carries the matching
    one a line later, so counting them naively runs two rules together and
    loses the second.
    """
    depth = 0
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if ch == "\\":
            i += 2
            continue
        if ch in "'\"":
            quote, i = ch, i + 1
            while i < n and text[i] != quote:
                i += 2 if text[i] == "\\" else 1
        elif text.startswith("/*", i):
            end = text.find("*/", i + 2)
            i = n if end < 0 else end + 1
        elif text.startswith("//", i):
            break
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
        i += 1
    return depth


def split_pattern(line):
    """Split a flex rule into its pattern and its action.

    A flex pattern ends at the first whitespace that is not inside a quoted
    literal, a bracket expression or an escape -- which is why "[ \\t\\r\\n]+"
    is one pattern and not two.
    """
    quoted = klass = escape = False
    for i, ch in enumerate(line):
        if escape:
            escape = False
        elif ch == "\\":
            escape = True
        elif quoted:
            if ch == '"':
                quoted = False
        elif klass:
            if ch == "]":
                klass = False
        elif ch == '"':
            quoted = True
        elif ch == "[":
            klass = True
        elif ch.isspace():
            return line[:i], line[i:]
    return line, ""


# ----------------------------------------------------------------- main ----

def main():
    version, report, warnings = run_bison()

    rules = parse_rules(report)
    terminals, nonterminals = parse_symbols(report)
    states = parse_states(report, rules)

    conflicts = {"shiftReduce": 0, "reduceReduce": 0}
    m = re.search(r"conflicts: (\d+) shift/reduce", warnings)
    if m:
        conflicts["shiftReduce"] = int(m.group(1))
    m = re.search(r"conflicts: .*?(\d+) reduce/reduce", warnings)
    if m:
        conflicts["reduceReduce"] = int(m.group(1))
    conflicts["resolvedByPrecedence"] = sum(len(s["resolved"]) for s in states)

    data = {
        "bison": version,
        "grammarFile": "src/frontend/matrix.y",
        "scannerFile": "src/frontend/matrix.l",
        "start": rules[1]["lhs"] if len(rules) > 1 else "program",
        "rules": rules,
        "terminals": terminals,
        "nonterminals": nonterminals,
        "states": states,
        "precedence": parse_precedence(GRAMMAR),
        "conflicts": conflicts,
        "scanner": parse_scanner(SCANNER),
    }

    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("/* Generated by tools/build-grammar.py from "
                 "src/frontend/matrix.y and src/frontend/matrix.l.\n"
                 "   Do not edit by hand: these are bison's own tables, read\n"
                 "   out of `bison --report=all`, and the page parses with\n"
                 "   them. Editing this file would make the demo parse a\n"
                 "   grammar the compiler does not have. */\n")
        fh.write("window.MATRIXLANG_GRAMMAR = ")
        json.dump(data, fh, indent=1, sort_keys=False)
        fh.write(";\n")

    print("demo/grammar.js: %d rules, %d states, %d terminals, "
          "%d conflict(s), %d resolved by precedence"
          % (len(rules), len(states), len(terminals),
             conflicts["shiftReduce"] + conflicts["reduceReduce"],
             conflicts["resolvedByPrecedence"]))
    print("                 %d scanner rule(s) from matrix.l"
          % len(data["scanner"]["rules"]))


if __name__ == "__main__":
    main()
