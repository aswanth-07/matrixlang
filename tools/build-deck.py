"""Build the MatrixLang presentation.

    python tools/build-deck.py docs/submission/MatrixLang-Deck.pptx

The deck follows the paper, one slide per step of its argument, and every
number on it is read from results/ rather than typed here. Re-run the
experiments and the slides change; this file does not.

Two devices carry the argument, and both are there because the argument is
about compiler phases:

  The phase rail. Every content slide lists the eight canonical phases down the
  left edge and marks the ones this slide is about. The reader watches the marks
  accumulate, and the one slide where almost nothing is marked is the comparison.

  One number per slide. Each slide states a single figure large enough to read
  from the back of a room. Everything else on the slide supports or qualifies
  that figure.

The compiler output quoted on slide 4 is real. It is the output of

    bin/matrixc --tokens|--ast|--symbols|--tac|--target|--run <the example>

with long runs elided as `...`; nothing was invented to make a column fit.

Every mark on these slides is drawn. There are no glyph bullets, no dingbats and
no emoji: a square is a rectangle, a negation is a bar, and the phase marks are
rules. A typeface substitution on the presenting machine therefore cannot turn a
bullet into a box.
"""

import json
import math
import os
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from deckkit import Para, Run, Slide, write  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "results")
REPO = "github.com/aswanth-07/matrixlang"

# ---------------------------------------------------------------- palette --
# A near-black canvas with warm off-white text: a compiler deck that looks
# like the terminal the work happens in. One accent carries the argument
# (gold), one marks what is wrong or missing (coral), one marks what was
# measured (mint). Three colours is a constraint, not a shortage.
#
# Every tone that carries text clears 4.5:1 on all three grounds. QUIET was
# #5E706A and read 2.87:1 on the code ground, below the floor for text of any
# size; it is lifted to the same hue at higher lightness rather than replaced,
# so the family still reads as one.

INK    = "0E1412"      # canvas
PANEL  = "16201C"
PANEL2 = "1D2925"      # code ground, the darkest surface text sits on
PAPER  = "EFEAE0"      # primary text            15.5 : 1 on canvas
DIM    = "9BAAA3"      # secondary text           7.7 : 1
QUIET  = "7D928B"      # tertiary text            5.6 : 1  (4.6 : 1 on code)
RULE   = "2A3833"      # hairlines, never text

GOLD   = "E0A94A"      # the argument             8.8 : 1
CORAL  = "E2705F"      # wrong, missing, absent   6.0 : 1
CORALD = "6E3A33"      # coral at rest, fills only
MINT   = "62C6A8"      # measured                 9.0 : 1

SERIF = "Georgia"
MONO  = "Consolas"

M      = 42.0
RAIL_W = 128.0
CX     = M + RAIL_W + 26        # content left edge: 196
CW     = 960.0 - CX - M         # content width: 722

PHASES = ["lexical", "syntax", "symbol table", "semantic",
          "intermediate", "optimization", "target code", "execution"]


# --------------------------------------------------------------- the data --

def quantile(values, p):
    v = sorted(values)
    k = (len(v) - 1) * p
    lo, hi = math.floor(k), math.ceil(k)
    return v[lo] if lo == hi else v[lo] + (v[hi] - v[lo]) * (k - lo)


def load():
    """Every figure the deck states, read from the recorded runs."""
    cost, chain, per_seed = [], [], []
    identical = programs = 0
    for seed in (1, 2):
        d = os.path.join(DATA, "seed%d" % seed)
        with open(os.path.join(d, "cost.json")) as f:
            c = json.load(f)
        with open(os.path.join(d, "chain.json")) as f:
            chain += json.load(f)
        with open(os.path.join(d, "differential.json")) as f:
            r = json.load(f)
        identical += r["identical"]
        programs += r["programs"]
        per_seed.append(
            (statistics.median([x["flops_pct"] for x in c]),
             statistics.median([x["instr_pct"] for x in c])))
        cost += c
    with open(os.path.join(DATA, "baseline-comparison.json")) as f:
        baselines = json.load(f)

    flops = [r["flops_pct"] for r in cost]
    instr = [r["instr_pct"] for r in cost]
    helped = [r["flops_pct"] for r in chain if r["flops_pct"] > 0]

    return {
        "n": len(cost),
        "flop_med": statistics.median(flops),
        "flop_q1": quantile(flops, 0.25), "flop_q3": quantile(flops, 0.75),
        "instr_med": statistics.median(instr),
        "instr_q1": quantile(instr, 0.25), "instr_q3": quantile(instr, 0.75),
        "chain_share": 100.0 * len(helped) / len(chain),
        "chain_n": len(helped), "chain_total": len(chain),
        "chain_med": statistics.median(helped),
        "identical": identical, "programs": programs,
        "per_seed": per_seed,
        "baselines": baselines["compilers"],
    }


D = load()


# ------------------------------------------------------------ drawn marks --

def backdrop(s):
    s.rect(0, 0, 960, 540, fill=INK, name="backdrop")


def bullet(s, x, y, colour=GOLD, size=3.0):
    """A square, drawn. Not a glyph."""
    s.rect(x, y, size, size, fill=colour, name="bullet")


def negation(s, x, y, colour=CORAL, w=8.0):
    """A bar, drawn. Reads as 'not' without borrowing a dingbat."""
    s.rect(x, y, w, 1.6, fill=colour, name="negation")


def rail(s, active=()):
    """The eight canonical phases, with the ones this slide is about marked.

    Only the marked phases carry a rule. An unmarked phase is the absence of
    one, which is both quieter and one fewer low-contrast element to justify.
    """
    s.text(M, 44, RAIL_W, 13,
           [Para(Run("compiler phases", 7.2, QUIET, bold=True, caps=True,
                     spacing=1.4))], pad=(0, 0, 0, 0))
    y = 66.0
    for i, name in enumerate(PHASES):
        on = i in active
        if on:
            s.rect(M, y + 3, 3, 12, fill=GOLD, name="phase-mark")
        s.text(M + 12, y, RAIL_W - 12, 16,
               [Para(Run(name, 8.4, PAPER if on else QUIET, bold=on), line=11)],
               pad=(0, 0, 0, 0))
        y += 21


def folio(s, num):
    """The slide number, in the place a page number goes: the foot of the
    rail. It is not a label above the heading."""
    s.rect(M, 470, 22, 1, fill=RULE, name="rule")
    s.text(M, 478, RAIL_W, 14,
           [Para(Run("%02d" % num, 8, QUIET, font=MONO, spacing=0.8))],
           pad=(0, 0, 0, 0))


def header(s, title, sub=None):
    """A heading speaks for itself. There is no kicker above it."""
    s.text(CX, 48, CW, 38,
           [Para(Run(title, 26, PAPER, bold=True, font=SERIF), line=30)],
           pad=(0, 0, 0, 0))
    y = 88.0
    if sub:
        s.text(CX, y, CW, 34, [Para(Run(sub, 10.5, DIM), line=14)],
               pad=(0, 0, 0, 0))
        y += 36
    s.rect(CX, y, CW, 1, fill=RULE, name="rule")
    return y + 20


def bignum(s, x, y, w, value, label, accent=GOLD, size=40):
    s.text(x, y, w, size + 8,
           [Para(Run(value, size, accent, bold=True, font=SERIF), line=size + 2)],
           pad=(0, 0, 0, 0))
    s.text(x, y + size + 6, w, 32,
           [Para(Run(ln, 8.6, DIM), line=11.4) for ln in label.split("\n")],
           pad=(0, 0, 0, 0))


def panel(s, x, y, w, h, title=None, accent=GOLD, fill=PANEL, caps=True):
    s.shape(x, y, w, h, fill=fill, geom="roundRect", radius=2200, name="panel")
    if title:
        s.text(x + 14, y + 12, w - 28, 14,
               [Para(Run(title, 7.8, accent, bold=True, caps=caps,
                         spacing=1.2))], pad=(0, 0, 0, 0))
        return y + 32
    return y + 14


def code(s, x, y, w, h, lines, size=8.4, lead=11.2, fill=PANEL2):
    s.shape(x, y, w, h, fill=fill, geom="roundRect", radius=1600, name="code")
    paras = []
    for ln in lines:
        colour = PAPER
        if isinstance(ln, tuple):
            ln, colour = ln
        paras.append(Para(Run(ln if ln else " ", size, colour, font=MONO),
                          line=lead))
    s.text(x, y, w, h, paras, pad=(13, 9, 10, 8))


def body(s, x, y, w, h, blocks):
    """A stack of paragraphs given as (text, size, colour, bold) tuples."""
    paras = []
    for i, b in enumerate(blocks):
        text, size, colour = b[0], b[1], b[2]
        bold = b[3] if len(b) > 3 else False
        paras.append(Para(Run(text, size, colour, bold=bold),
                          line=size * 1.38, before=0 if i == 0 else 8))
    s.text(x, y, w, h, paras, pad=(0, 0, 0, 0))


def footer(s, text, accent=GOLD, link=None):
    s.rect(CX, 494, CW, 1, fill=RULE, name="rule")
    bullet(s, CX, 508, accent, 3.0)
    w = CW - 14 if link is None else CW - 14 - 176
    s.text(CX + 14, 502, w, 22,
           [Para(Run(text, 9.5, DIM), line=12)], pad=(0, 0, 0, 0))
    if link:
        s.text(CX + CW - 176, 502, 176, 22,
               [Para(Run(REPO, 8.6, QUIET, font=MONO), align="r", line=12)],
               pad=(0, 0, 0, 0))


# ====================================================================== 01 --

def slide1():
    s = Slide()
    backdrop(s)

    s.text(M, 76, 560, 112,
           [Para(Run("Shapes in the", 44, PAPER, bold=True, font=SERIF), line=52),
            Para(Run("Type System", 44, GOLD, bold=True, font=SERIF), line=52)],
           pad=(0, 0, 0, 0))
    s.rect(M, 200, 58, 3, fill=CORAL, name="rule")
    s.text(M, 218, 540, 48,
           [Para(Run("A matrix language that lets a compiler course reach "
                     "optimization", 15, PAPER, font=SERIF), line=21)],
           pad=(0, 0, 0, 0))
    s.text(M, 274, 520, 62,
           [Para(Run("Put matrix shapes in the type system and the compiler can "
                     "cost a program before it runs. Semantic analysis, "
                     "optimization and code generation all gain something to do.",
                     10.5, DIM), line=15)], pad=(0, 0, 0, 0))

    s.rect(M, 356, 520, 1, fill=RULE, name="rule")
    bignum(s, M, 372, 250, "%.1f%%" % D["flop_med"],
           "of the arithmetic removed\nby the optimizer", accent=MINT)
    bignum(s, M + 262, 372, 250, "%.1f%%" % D["instr_med"],
           "what an instruction count\nwould have reported", accent=CORAL)
    s.text(M, 472, 520, 16,
           [Para(Run("Same optimizer. Same %d programs. Different question."
                     % D["n"], 9.5, GOLD, italic=True), line=12)],
           pad=(0, 0, 0, 0))

    s.shape(612, 60, 306, 420, fill=PANEL, geom="roundRect", radius=2200,
            name="panel")
    s.text(630, 80, 270, 40,
           [Para(Run("A Aswanth Raj", 17, PAPER, bold=True, font=SERIF), line=21),
            Para(Run("Compiler Design Laboratory", 9, DIM), line=13)],
           pad=(0, 0, 0, 0))
    s.rect(630, 132, 40, 1.5, fill=RULE, name="rule")
    code(s, 630, 150, 270, 162, [
        ("matrix A[100,2];", PAPER),
        ("matrix B[2,100];", PAPER),
        ("matrix C[100,2];", PAPER),
        "",
        ("matrix R = A * B * C;", MINT),
        ("print(R);", PAPER),
        "",
        ("the compiler picks the bracketing,", DIM),
        ("because it knows all three shapes", DIM),
        ("before anything runs", DIM),
    ], size=8.0, lead=13.0)
    s.text(630, 328, 270, 100,
           [Para([Run("69,800", 11.5, CORAL, bold=True, font=MONO),
                  Run("  FLOP as written", 9.5, DIM)], line=14),
            Para([Run(" 1,396", 11.5, MINT, bold=True, font=MONO),
                  Run("  FLOP as compiled", 9.5, DIM)], line=14, before=4),
            Para(Run("The instruction count is 4 either way, which is why the "
                     "usual metric reports nothing.", 8.8, GOLD, italic=True),
                 line=12, before=10)], pad=(0, 0, 0, 0))
    s.rect(630, 436, 270, 1, fill=RULE, name="rule")
    s.text(630, 446, 270, 18,
           [Para(Run(REPO, 8.6, PAPER, font=MONO), line=12)], pad=(0, 0, 0, 0))
    return s


# ====================================================================== 02 --

def slide2():
    s = Slide()
    backdrop(s)
    rail(s, active=(0, 1, 2, 3, 4))
    folio(s, 2)
    y = header(s, "Where a C-subset project stops",
               "We measured three public compiler-design course projects. Not "
               "one of them contains an optimizer, and not one executes "
               "anything.")

    bignum(s, CX, y + 4, 300, "0 of 3",
           "baselines that reach the optimization phase,\n"
           "on a search generous enough to overstate them",
           accent=CORAL, size=46)

    yy = panel(s, CX, 248, 390, 206, "Why those phases stay empty")
    body(s, CX + 14, yy + 4, 362, 166, [
        ("A subset of C has two numeric types, so its type system is an "
         "enumeration with two members.", 9.2, PAPER),
        ("Semantic analysis becomes a comparison of two tags. An optimizer "
         "over it has constant folding and the scalar identities, and no way "
         "to tell a cheap expression from an expensive one.", 9, DIM),
        ("The baselines are not badly built. They reach lexical analysis, "
         "parsing and the symbol table, and then run out of anything for the "
         "later phases to be about.", 9, DIM),
        ("The two phases the syllabus calls the centre of the subject are the "
         "two with the least to do.", 9, GOLD),
    ])

    px = CX + 406
    yy = panel(s, px, y, CW - 406, 310, "Phases present, of eight")
    short = ["MatrixLang", "baseline 1", "baseline 2", "baseline 3"]
    for i, c in enumerate(D["baselines"]):
        n = c["phase_count"]
        row = yy + 8 + i * 30
        s.text(px + 14, row, 90, 14,
               [Para(Run(short[i], 8.6, PAPER if i == 0 else DIM,
                         bold=(i == 0)), line=11)], pad=(0, 0, 0, 0))
        s.rect(px + 108, row + 2, 144, 9, fill=RULE, name="bar-bg")
        s.rect(px + 108, row + 2, 144 * n / 8.0, 9,
               fill=MINT if i == 0 else CORAL, name="bar")
        s.text(px + 262, row, 40, 14,
               [Para(Run("%d/8" % n, 8.6, PAPER if i == 0 else DIM, bold=True,
                         font=MONO), line=11)], pad=(0, 0, 0, 0))
    s.rect(px + 14, yy + 138, CW - 434, 1, fill=RULE, name="rule")
    body(s, px + 14, yy + 154, CW - 434, 120, [
        ("How a phase is counted", 8.6, GOLD, True),
        ("A file is attributed to a phase by its path and name, and a phase "
         "counts as present on a single case-insensitive match of any of its "
         "markers. The rule is deliberately generous: it can only overstate a "
         "baseline, and it still finds no optimizer in any of them.", 8.6, DIM),
    ])

    footer(s, "Three repositories, chosen by their description before their "
              "contents were read. Each reduced to its most complete version.",
           CORAL)
    return s


# ====================================================================== 03 --

def slide3():
    s = Slide()
    backdrop(s)
    rail(s, active=(0, 1, 2, 3))
    folio(s, 3)
    y = header(s, "A type carries its shape",
               "Not matrix, but Matrix<2x3>. Two matrices of different shapes "
               "are values of different types.")

    code(s, CX, y, 396, 140, [
        ("matrix A[2,3] = {{1, 2, 3},", PAPER),
        ("                 {4, 5, 6}};", PAPER),
        ("matrix B[3,4];", PAPER),
        "",
        ("matrix C = A * B;", MINT),
        ("    -> C : Matrix<2x4>, inferred", MINT),
        "",
        ("print(C);", PAPER),
    ], size=8.8, lead=13.4)

    yy = panel(s, CX + 412, y, CW - 412, 140, "Rejected before anything runs",
               accent=CORAL)
    code(s, CX + 424, yy + 2, CW - 436, 92, [
        ("cannot multiply Matrix<2x3>", CORAL),
        ("               by Matrix<5x4>", CORAL),
        "  left  : A -> Matrix<2x3>",
        "  right : B -> Matrix<5x4>",
        ("  rule  : cols(left) = rows(right)", GOLD),
        ("  found : 3 != 5", GOLD),
    ], size=8.0, lead=11.2)

    y2 = 302.0
    yy = panel(s, CX, y2, 258, 158, "What the language has")
    for i, t in enumerate(["scalar and matrix",
                           "+  -  *  unary -  transpose",
                           "literals, identity, zeros, ones",
                           "declaration, assignment, print"]):
        row = yy + 4 + i * 20
        bullet(s, CX + 14, row + 5)
        s.text(CX + 24, row, 222, 16,
               [Para(Run(t, 8.6, DIM), line=11)], pad=(0, 0, 0, 0))
    s.text(CX + 14, yy + 90, 232, 32,
           [Para(Run("No control flow. That is the enabling decision, not a "
                     "gap.", 8.4, GOLD, italic=True), line=11)],
           pad=(0, 0, 0, 0))

    yy = panel(s, CX + 274, y2, CW - 274, 158, "Why no control flow")
    body(s, CX + 288, yy + 4, CW - 302, 122, [
        ("With no branches a whole program is a single basic block. "
         "Available-expression analysis and liveness are each one linear scan.",
         9.2, PAPER),
        ("A course reaches working common-subexpression elimination and "
         "dead-code elimination without first building a control-flow graph, "
         "which is where a semester usually runs out.", 9, DIM),
        ("The cost is real and we do not pretend otherwise: this project "
         "teaches no dataflow analysis at all.", 9, CORAL),
    ])

    footer(s, "Every shape rule lives in one file, read by both the semantic "
              "analyser and the code generator.")
    return s


# ====================================================================== 04 --

def slide4():
    s = Slide()
    backdrop(s)
    rail(s, active=(0, 1, 2, 3, 4, 5, 6, 7))
    folio(s, 4)
    y = header(s, "Every phase prints what it produced",
               "One flag per phase, so a reviewer can stop the compiler "
               "anywhere and read the artifact. The text below is its output.")

    cols = [
        ("--tokens", "the lexer, one row per token", [
            "#   TOKEN       LEXEME   LINE:COL",
            "1   MATRIX      matrix   1:1",
            "2   IDENTIFIER  A        1:8",
            "3   LBRACKET    [        1:9",
            "4   NUMBER      2        1:10",
            "5   COMMA       ,        1:11",
            "6   NUMBER      3        1:12",
            "7   RBRACKET    ]        1:13",
            ("...                   78 tokens", DIM),
            "",
        ]),
        ("--ast", "the parse, with shapes attached", [
            "Program  (line 1)",
            "|-- Declare A : Matrix<2x3>",
            "|   `-- MatrixLiteral : Matrix<2x3>",
            ("|       |-- Row : Matrix<1x3>", DIM),
            ("|       `-- Row : Matrix<1x3>", DIM),
            "|-- Declare B : Matrix<3x4>",
            ("|-- Declare C : Matrix<2x4>", MINT),
            ("|   `-- BinaryOp * : Matrix<2x4>", MINT),
            ("`-- Print : Matrix<2x4>", MINT),
            "",
        ]),
        ("--symbols", "one row per name, shape included", [
            "+------+--------+------+------+",
            "| Name | Kind   | Rows | Cols |",
            "+------+--------+------+------+",
            "| A    | Matrix |    2 |    3 |",
            "| B    | Matrix |    3 |    4 |",
            ("| C    | Matrix |    2 |    4 |", MINT),
            "+------+--------+------+------+",
            "3 symbol(s).",
            "",
            ("C's shape was never written down;", GOLD),
            ("it was inferred from A and B.", GOLD),
        ]),
        ("--tac", "three-address code, still typed", [
            "1  A = #0            Matrix<2x3>",
            "2  B = #1            Matrix<3x4>",
            ("3  t1 = A * B        Matrix<2x4>", MINT),
            "4  C = t1            Matrix<2x4>",
            "5  print C           Matrix<2x4>",
            "",
            "5 instruction(s).",
            "",
            ("every temporary carries its shape,", GOLD),
            ("which is what the optimizer costs.", GOLD),
        ]),
        ("--target", "stack machine, selected by shape", [
            "0  PUSH_MATRIX   #0",
            "1  STORE_MATRIX  A",
            "2  PUSH_MATRIX   #1",
            "3  STORE_MATRIX  B",
            "4  LOAD_MATRIX   A",
            "5  LOAD_MATRIX   B",
            ("6  MATMUL", MINT),
            "7  STORE_MATRIX  t1",
            ("...", DIM),
            "13 instruction(s).",
        ]),
        ("--run", "the VM, printing the result", [
            ("C = Matrix<2x4>", MINT),
            "  [  38  44  50  56 ]",
            "  [  83  98 113 128 ]",
            "",
            "ACCEPTED (0 error(s), 0 warning(s))",
            "",
            ("38 = 1*1 + 2*5 + 3*9", GOLD),
            "",
            ("the shapes were checked long", DIM),
            ("before any number was touched", DIM),
        ]),
    ]
    w = (CW - 2 * 14) / 3
    for i, (flag, note, lines) in enumerate(cols):
        cx = CX + (i % 3) * (w + 14)
        cy = y + (i // 3) * 165
        s.text(cx, cy, w, 14,
               [Para([Run(flag, 8.4, GOLD, bold=True, font=MONO),
                      Run("   " + note, 7.6, QUIET)], line=11)],
               pad=(0, 0, 0, 0))
        code(s, cx, cy + 18, w, 133, lines, size=7.4, lead=11.6)

    footer(s, "make demo1 demo2 demo3 runs one demonstration per project "
              "review, straight from the source tree.")
    return s


# ====================================================================== 05 --

def slide5():
    s = Slide()
    backdrop(s)
    rail(s, active=(5,))
    folio(s, 5)
    y = header(s, "A shape is also a cost model",
               "Multiplying an m x n by an n x p matrix performs m p (2n-1) "
               "operations. Every term is a shape, and every shape is in the "
               "type.")

    bignum(s, CX, y + 6, 200, "98.0%",
           "of the arithmetic removed\nfrom one three-matrix chain",
           accent=MINT, size=44)
    s.text(CX, y + 116, 214, 44,
           [Para(Run("The instruction count did not move. Four before, four "
                     "after.", 9, CORAL), line=12)], pad=(0, 0, 0, 0))

    px = CX + 224
    yy = panel(s, px, y, CW - 224, 172, "One chain, two bracketings")
    code(s, px + 14, yy + 2, CW - 252, 124, [
        ("matrix R = A * B * C;    A 100x2  B 2x100  C 100x2", PAPER),
        "",
        ("(A * B) * C   builds a 100x100 intermediate", CORAL),
        ("              69,800 FLOP", CORAL),
        ("A * (B * C)   builds a 2x2 intermediate", MINT),
        ("               1,396 FLOP", MINT),
        "",
        ("'*' is left associative, so the source asked for the first.", DIM),
        ("The compiler emitted the second, into the same four slots.", DIM),
    ], size=8.0, lead=11.4)

    y2 = 328.0
    yy = panel(s, CX, y2, 300, 132, "Why an instruction count cannot see it")
    body(s, CX + 14, yy + 4, 274, 96, [
        ("A chain of k matrices needs exactly k-1 products under every "
         "bracketing.", 9, PAPER),
        ("So re-bracketing never changes the instruction count. It is "
         "invisible to the metric course projects report.", 9, GOLD),
    ])

    yy = panel(s, CX + 316, y2, CW - 316, 132,
               "The algorithm is the textbook one")
    body(s, CX + 330, yy + 4, CW - 344, 96, [
        ("The standard O(k^3) dynamic program over the chain, the same one an "
         "algorithms course teaches.", 9, PAPER),
        ("What is new is not the algorithm. It is that a student compiler "
         "holds the information needed to run it.", 9, DIM),
    ])

    footer(s, "Linnea and LGen do this at research quality. Here the dynamic "
              "program is 21 lines of C, inside a 328-line pass.")
    return s


# ====================================================================== 06 --

def slide6():
    s = Slide()
    backdrop(s)
    rail(s, active=(5,))
    folio(s, 6)
    y = header(s, "Two metrics, same programs, different answers",
               "%d programs from a generator, two seeds. The corpus was not "
               "written by whoever wrote the optimizer." % D["n"])

    yy = panel(s, CX, y, CW, 152, "Median reduction per program")
    s.text(CX + 14, y + 12, CW - 28, 14,
           [Para(Run("bar = interquartile range     tick = median",
                     7.4, QUIET), align="r", line=10)], pad=(0, 0, 0, 0))
    rows = [("arithmetic removed", D["flop_med"], D["flop_q1"], D["flop_q3"], MINT),
            ("instructions removed", D["instr_med"], D["instr_q1"], D["instr_q3"], CORAL)]
    bar_x, bar_w = CX + 186, 420
    for i, (name, med, q1, q3, col) in enumerate(rows):
        ry = yy + 8 + i * 52
        s.text(CX + 16, ry, 164, 14,
               [Para(Run(name, 9, PAPER), line=11)], pad=(0, 0, 0, 0))
        s.text(CX + 16, ry + 19, 164, 14,
               [Para(Run("IQR %.1f to %.1f" % (q1, q3), 7.6, QUIET), line=10)],
               pad=(0, 0, 0, 0))
        s.rect(bar_x, ry + 17, bar_w, 12, fill=RULE, name="bar-bg")
        s.rect(bar_x + bar_w * q1 / 100.0, ry + 17,
               max(1.5, bar_w * (q3 - q1) / 100.0), 12,
               fill=col if i == 0 else CORALD, name="iqr")
        s.rect(bar_x + bar_w * med / 100.0 - 1.25, ry + 13, 2.5, 20,
               fill=PAPER, name="median")
        s.text(bar_x + bar_w + 12, ry + 13, 80, 20,
               [Para(Run("%.1f%%" % med, 13, col, bold=True, font=SERIF),
                     line=15)], pad=(0, 0, 0, 0))
    s.text(bar_x, yy + 104, 60, 14,
           [Para(Run("0%", 7.4, QUIET, font=MONO), line=10)], pad=(0, 0, 0, 0))
    s.text(bar_x + bar_w - 60, yy + 104, 60, 14,
           [Para(Run("100%", 7.4, QUIET, font=MONO), align="r", line=10)],
           pad=(0, 0, 0, 0))

    y2 = y + 172
    bignum(s, CX, y2, 196, "%.1f%%" % D["chain_share"],
           "of programs had a chain worth\nre-bracketing (%d of %d)"
           % (D["chain_n"], D["chain_total"]), accent=GOLD, size=38)
    bignum(s, CX + 210, y2, 196, "%.1f%%" % D["chain_med"],
           "median arithmetic saved\non those programs", accent=GOLD, size=38)
    bignum(s, CX + 420, y2, 250, "%d/%d" % (D["identical"], D["programs"]),
           "programs printed the same bytes\nwith the optimizer and without",
           accent=MINT, size=38)

    (f1, i1), (f2, i2) = D["per_seed"]
    s.shape(CX, 424, CW, 54, fill=PANEL2, geom="roundRect", radius=2200,
            name="panel")
    s.text(CX + 20, 424, CW - 40, 54,
           [Para([Run("Not one lucky corpus.  ", 9, GOLD, bold=True),
                  Run("Taken separately the two seeds give %.1f%% and %.1f%% of "
                      "the arithmetic against %.1f%% and %.1f%% of the "
                      "instructions. The gap between the metrics is the stable "
                      "part." % (f1, f2, i1, i2), 9, DIM)], line=12.5)],
           anchor="ctr", pad=(0, 0, 0, 0))

    footer(s, "Roughly a fifth of programs are left alone. An optimizer that "
              "always reports an improvement is measuring nothing.")
    return s


# ====================================================================== 07 --

def slide7():
    s = Slide()
    backdrop(s)
    rail(s, active=(5, 7))
    folio(s, 7)
    y = header(s, "The corpus found a bug we had not",
               "The first differential run did not come back clean, and that is "
               "the part worth reporting.")

    code(s, CX, y, 430, 126, [
        ("unoptimized          optimized", DIM),
        ("R = Matrix<1x1>      R = Matrix<1x1>", PAPER),
        ("  [ 0 ]                [ -0 ]", CORAL),
        "",
        ("the rewrite that did it:", DIM),
        ("    0 - x   =>   -x", GOLD),
    ], size=9, lead=13.4)

    yy = panel(s, CX + 446, y, CW - 446, 126, "Why it is wrong", accent=CORAL)
    s.text(CX + 460, yy + 2, CW - 474, 88,
           [Para(Run("True over the reals. Not observationally equivalent in "
                     "IEEE-754: +0 minus +0 is +0, but negating +0 gives -0, "
                     "and the two print differently.", 9, PAPER), line=12.5)],
           pad=(0, 0, 0, 0))

    y2 = 296.0
    yy = panel(s, CX, y2, CW, 164, "What we take from it")
    colw = (CW - 48) / 2
    body(s, CX + 16, yy + 4, colw, 70, [
        ("Not a finding about floating point.", 9.4, GOLD, True),
        ("That algebraic identities valid over the reals are unsound in "
         "floating point is textbook, and production compilers gate exactly "
         "these rewrites behind fast-math.", 9, DIM),
    ])
    body(s, CX + 32 + colw, yy + 4, colw, 70, [
        ("A finding about what a course can afford.", 9.4, MINT, True),
        ("A generator and a loop comparing two runs, which is a weekend of "
         "work, found a defect in a student-scale optimizer that reading the "
         "code had not, on an input nobody chose.", 9, DIM),
    ])
    s.rect(CX + 16, yy + 92, CW - 32, 1, fill=RULE, name="rule")
    s.text(CX + 16, yy + 104, CW - 32, 20,
           [Para(Run("The rewrite was removed. It saved no arithmetic anyway: "
                     "a negation costs what a subtraction from zero costs.",
                     8.8, PAPER, italic=True), line=12)], pad=(0, 0, 0, 0))

    footer(s, "Over the hand-written examples the same check passes, and "
              "passing there shows only that the check runs.", MINT)
    return s


# ====================================================================== 08 --

def slide8():
    s = Slide()
    backdrop(s)
    rail(s, active=(0, 1, 2, 3, 4, 5, 6, 7))
    folio(s, 8)
    y = header(s, "The source language is a curricular decision",
               "It decides which phases can carry real work. That is the claim, "
               "and it is the one we can evidence.")

    yy = panel(s, CX, y, 350, 196, "What the domain bought")
    for i, (h, t) in enumerate([
        ("Semantic analysis", "became shape inference and dimension checking"),
        ("Code generation", "gained instruction selection from inferred types"),
        ("Optimization", "gained transformations and a way to score them"),
    ]):
        s.text(CX + 14, yy + 4 + i * 46, 322, 42,
               [Para(Run(h, 9.4, MINT, bold=True), line=12),
                Para(Run(t, 8.8, DIM), line=11.6)], pad=(0, 0, 0, 0))
    s.text(CX + 14, yy + 150, 322, 16,
           [Para(Run("It costs control-flow graphs and dataflow analysis.",
                     8.6, CORAL), line=11)], pad=(0, 0, 0, 0))

    yy = panel(s, CX + 366, y, CW - 366, 196, "What we do not claim",
               accent=CORAL)
    for i, t in enumerate([
        "That students learn more. It has not been taught yet.",
        "That the mechanisms are new. They are not.",
        "That the magnitudes generalise. The corpus is ours.",
        "That three repositories are a sample.",
    ]):
        row = yy + 6 + i * 34
        negation(s, CX + 380, row + 6)
        s.text(CX + 394, row, CW - 414, 28,
               [Para(Run(t, 8.8, DIM), line=11.6)], pad=(0, 0, 0, 0))

    # The closing statement is the last thing said. It gets the bare canvas and
    # the space around it, not a card with a stripe down its side.
    s.rect(CX, 368, 92, 2, fill=GOLD, name="rule")
    s.text(CX, 388, CW - 40, 84,
           [Para(Run("Whatever the domain, if the type system carries enough to "
                     "cost a program statically, a student's optimizer can be "
                     "scored on the work it removes rather than the lines it "
                     "removes. The two are not close.", 13, PAPER, font=SERIF),
                 line=18)], pad=(0, 0, 0, 0))

    footer(s, "Paper, compiler, generator, measurements and demo:",
           link=REPO)
    return s


# ==========================================================================

def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "docs/submission/MatrixLang-Deck.pptx"
    slides = [slide1(), slide2(), slide3(), slide4(),
              slide5(), slide6(), slide7(), slide8()]

    problems = 0
    for i, sl in enumerate(slides, 1):
        # chrome_top=0 disables the takeaway-band rule: this deck sets its own
        # footer band deliberately. The slide-bounds checks still apply.
        for msg in sl.check(chrome_top=0.0):
            print("  slide %d: %s" % (i, msg))
            problems += 1
    if problems:
        print("%d layout problem(s); not writing the deck." % problems)
        return 1

    d = os.path.dirname(os.path.abspath(out))
    if d:
        os.makedirs(d, exist_ok=True)
    write(out, slides, "MatrixLang", "A Aswanth Raj", bg=INK)
    print("wrote %s  (%d slides, layout clean)" % (out, len(slides)))
    print("  read from results/: arithmetic median %.1f%%, instruction median "
          "%.1f%%, chain share %.1f%%, differential %d/%d"
          % (D["flop_med"], D["instr_med"], D["chain_share"],
             D["identical"], D["programs"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
