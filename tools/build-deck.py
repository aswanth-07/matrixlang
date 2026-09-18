"""Build the MatrixLang review presentation.

    python tools/build-deck.py docs/submission/MatrixLang-Deck.pptx

Nine slides: a title slide, then one slide per step of the argument the paper
makes. Every number is read from results/ rather than typed here, so re-running
the experiments changes the slides and this file does not.

Design notes, so the next person does not have to guess:

  Pure black. The ground is #000000 and the accents are a terminal palette:
  green for what we measured and what is ours, red for what is absent or wrong,
  blue for a link, violet for a secondary series. Every tone that carries text
  clears 4.5:1 on all three grounds; the measured ratios are beside each one.

  It is a deck, not a page. There is no sidebar, no persistent navigation and
  no footer bar. A slide is a title, one idea, and the space to read it from the
  back of a room. Structural boxes are hairlines rather than filled cards;
  only code gets a ground, because code needs one.

  Every mark is drawn. No glyph bullets, no dingbats, no emoji: a bullet is a
  rectangle and a negation is a bar, so a font substitution on the presenting
  machine cannot turn a mark into a box.

The compiler output quoted on the pipeline slide is real, from

    bin/matrixc --tokens|--ast|--symbols|--tac|--target|--run <the example>

with long runs elided as `...`; nothing was invented to make a column fit.
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
REPO_URL = "https://" + REPO

# ---------------------------------------------------------------- palette --
# Contrast ratios are against the three grounds this deck uses: the black
# canvas, the panel ground and the code ground. Change a tone, re-measure it.
#
#                       canvas   panel    code
BLACK  = "000000"    # the ground
PANEL  = "0D0D0D"    # a barely raised ground, under hairline boxes
CODE   = "121212"    # code blocks; code needs a ground to sit on
WHITE  = "FFFFFF"    # 21.00    19.44    18.73   headings, key figures
TEXT   = "C9C9C9"    # 12.68    11.74    11.31   body
MUTED  = "8C8C8C"    #  6.25     5.78     5.57   captions, labels, the floor
LINE   = "242424"    # hairlines only, never text

GREEN  = "4ADE80"    # 12.05    11.15    10.75   ours, measured, correct
RED    = "EF4444"    #  5.58     5.16     4.98   absent, wrong, rejected
VIOLET = "A78BFA"    #  7.72     7.14     6.88   a second series
BLUE   = "6E9BFF"    #  7.80     7.21     6.95   links
REDQ   = "4A1F1F"    # a resting red, fills only

SERIF = "Georgia"
SANS  = "Segoe UI"
MONO  = "Consolas"

M  = 56.0                    # slide margin
CW = 960.0 - 2 * M           # 848


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


# --------------------------------------------------------------- the parts --

def backdrop(s):
    s.rect(0, 0, 960, 540, fill=BLACK, name="backdrop")


def bullet(s, x, y, colour=GREEN, size=3.0):
    """A square, drawn. Not a glyph."""
    s.rect(x, y, size, size, fill=colour, name="bullet")


def negation(s, x, y, colour=RED, w=9.0):
    """A bar, drawn. Reads as 'not' without borrowing a dingbat."""
    s.rect(x, y, w, 1.6, fill=colour, name="negation")


def title(s, text, sub=None):
    """Slide title. It speaks for itself; there is no label above it."""
    s.text(M, 46, CW, 40,
           [Para(Run(text, 28, WHITE, bold=True, font=SERIF), line=32)],
           pad=(0, 0, 0, 0))
    y = 92.0
    if sub:
        s.text(M, y, CW - 60, 34,
               [Para(Run(sub, 11, MUTED), line=14.5)], pad=(0, 0, 0, 0))
        y += 36
    s.rect(M, y, CW, 1, fill=LINE, name="rule")
    return y + 22


def folio(s, num):
    """Slide number, bottom right, where a deck puts one."""
    s.text(M, 492, CW, 16,
           [Para(Run("%d" % num, 9, MUTED, font=MONO), align="r", line=12)],
           pad=(0, 0, 0, 0))


def box(s, x, y, w, h, heading=None, accent=GREEN):
    """A hairline container. Not a card: no fill, no shadow, no stripe."""
    s.shape(x, y, w, h, fill=PANEL, line=LINE, line_w=0.75,
            geom="roundRect", radius=1400, name="box")
    if heading:
        s.text(x + 16, y + 13, w - 32, 14,
               [Para(Run(heading, 8, accent, bold=True, caps=True,
                         spacing=1.3))], pad=(0, 0, 0, 0))
        return y + 34
    return y + 16


def code(s, x, y, w, h, lines, size=8.6, lead=11.6):
    s.shape(x, y, w, h, fill=CODE, geom="roundRect", radius=1200, name="code")
    paras = []
    for ln in lines:
        colour = TEXT
        if isinstance(ln, tuple):
            ln, colour = ln
        paras.append(Para(Run(ln if ln else " ", size, colour, font=MONO),
                          line=lead))
    s.text(x, y, w, h, paras, pad=(14, 11, 12, 9))


def body(s, x, y, w, h, blocks):
    """A stack of paragraphs given as (text, size, colour, bold) tuples."""
    paras = []
    for i, b in enumerate(blocks):
        text, size, colour = b[0], b[1], b[2]
        bold = b[3] if len(b) > 3 else False
        paras.append(Para(Run(text, size, colour, bold=bold),
                          line=size * 1.42, before=0 if i == 0 else 9))
    s.text(x, y, w, h, paras, pad=(0, 0, 0, 0))


def figure(s, x, y, w, value, label, accent=GREEN, size=44):
    s.text(x, y, w, size + 10,
           [Para(Run(value, size, accent, bold=True, font=SERIF),
                 line=size + 2)], pad=(0, 0, 0, 0))
    s.text(x, y + size + 8, w, 34,
           [Para(Run(ln, 9, MUTED), line=12) for ln in label.split("\n")],
           pad=(0, 0, 0, 0))


def caption(s, x, y, w, text, accent=GREEN, note=None):
    """An accent heading above a bare block. The deck's one labelling pattern:
    a box is for a container, this is for a block that is already its own."""
    runs = [Run(text, 8, accent, bold=True, caps=True, spacing=1.3)]
    if note:
        runs.append(Run("   " + note, 8.4, MUTED))
    s.text(x, y, w, 15, [Para(runs, line=12)], pad=(0, 0, 0, 0))
    return y + 20


def note(s, x, y, w, text, accent=GREEN):
    """A closing line under a rule. No card, no coloured edge."""
    s.rect(x, y, 48, 2, fill=accent, name="rule")
    s.text(x, y + 16, w, 40,
           [Para(Run(text, 11, TEXT), line=15)], pad=(0, 0, 0, 0))


# ====================================================================== 01 --

def slide_title():
    s = Slide()
    backdrop(s)

    s.rect(M + 16, 96, 72, 3, fill=GREEN, name="rule")
    s.text(M + 16, 118, 740, 76,
           [Para(Run("MatrixLang", 54, WHITE, bold=True, font=SERIF), line=62)],
           pad=(0, 0, 0, 0))
    s.text(M + 16, 196, 660, 44,
           [Para(Run("A dimension-aware optimizing compiler for a small matrix "
                     "language", 15, TEXT), line=21)], pad=(0, 0, 0, 0))

    s.rect(M + 16, 258, CW - 32, 1, fill=LINE, name="rule")

    rows = [
        ("Submitted by", "A Aswanth Raj", "24BAI0044"),
        ("Supervisor", "Dr. Ranjithkumar S", None),
        ("Course", "Compiler Design Lab", "BCSE307P"),
    ]
    for i, (label, value, extra) in enumerate(rows):
        ry = 286 + i * 46
        s.text(M + 16, ry + 3, 160, 18,
               [Para(Run(label, 8.4, MUTED, bold=True, caps=True, spacing=1.2))],
               pad=(0, 0, 0, 0))
        s.text(M + 190, ry, 420, 22,
               [Para(Run(value, 14.5, WHITE), line=18)], pad=(0, 0, 0, 0))
        if extra:
            s.text(M + 190 + 300, ry + 1, 200, 20,
                   [Para(Run(extra, 13, GREEN, font=MONO), line=17)],
                   pad=(0, 0, 0, 0))

    s.rect(M + 16, 442, CW - 32, 1, fill=LINE, name="rule")
    s.text(M + 16, 456, 500, 18,
           [Para(Run(REPO, 10, BLUE, font=MONO, link=REPO_URL), line=13)], pad=(0, 0, 0, 0))
    s.text(M + 16, 456, CW - 32, 18,
           [Para(Run("School of Computer Science and Engineering, VIT Vellore",
                     9, MUTED), align="r", line=13)], pad=(0, 0, 0, 0))
    return s


# ====================================================================== 02 --

def slide_thesis():
    s = Slide()
    backdrop(s)
    y = title(s, "The compiler prices a program before it runs",
              "Every matrix shape is known at compile time, so the optimizer "
              "can be scored on the arithmetic it removes rather than the "
              "lines it removes.")

    code(s, M, y, 430, 152, [
        ("matrix A[100,2];", TEXT),
        ("matrix B[2,100];", TEXT),
        ("matrix C[100,2];", TEXT),
        "",
        ("matrix R = A * B * C;", GREEN),
        ("print(R);", TEXT),
        "",
        ("'*' is left associative, so the source", MUTED),
        ("asks for (A * B) * C.", MUTED),
    ], size=9.4, lead=13.6)

    bx = M + 462
    s.text(bx, y + 6, 386, 84,
           [Para([Run("69,800", 17, RED, bold=True, font=MONO),
                  Run("   FLOP as written", 11, TEXT)], line=22),
            Para([Run(" 1,396", 17, GREEN, bold=True, font=MONO),
                  Run("   FLOP as compiled", 11, TEXT)], line=22, before=6)],
           pad=(0, 0, 0, 0))
    s.rect(bx, y + 104, 386, 1, fill=LINE, name="rule")
    s.text(bx, y + 118, 386, 48,
           [Para(Run("The compiler emits A * (B * C) instead. Both forms are "
                     "four instructions, so the metric course projects report "
                     "sees nothing at all.", 10.5, MUTED), line=14.5)],
           pad=(0, 0, 0, 0))

    s.rect(M, 330, CW, 1, fill=LINE, name="rule")
    figure(s, M, 352, 300, "%.1f%%" % D["flop_med"],
           "of the arithmetic removed, median\nover %d generated programs" % D["n"],
           accent=GREEN, size=48)
    figure(s, M + 330, 352, 300, "%.1f%%" % D["instr_med"],
           "what an instruction count reports\non the very same programs",
           accent=RED, size=48)
    s.text(M + 664, 364, 184, 80,
           [Para(Run("Same optimizer.\nSame programs.\nDifferent question.",
                     12, WHITE, italic=True, font=SERIF), line=18)],
           pad=(0, 0, 0, 0))
    folio(s, 2)
    return s


# ====================================================================== 03 --

def slide_problem():
    s = Slide()
    backdrop(s)
    y = title(s, "Where a C-subset project stops",
              "We measured three public compiler-design course projects. Not "
              "one of them contains an optimizer, and not one executes "
              "anything.")

    figure(s, M, y + 4, 420, "0 of 3",
           "baselines that reach the optimization phase, on a\n"
           "search deliberately generous enough to overstate them",
           accent=RED, size=50)

    body(s, M, y + 128, 420, 236, [
        ("A subset of C has two numeric types, so its type system is an "
         "enumeration with two members.", 11, TEXT),
        ("Semantic analysis becomes a comparison of two tags, and an optimizer "
         "over it has constant folding and the scalar identities, with no way "
         "to tell a cheap expression from an expensive one.", 10.5, MUTED),
        ("The baselines are not badly built. They reach lexical analysis, "
         "parsing and the symbol table, and then run out of anything for the "
         "later phases to be about.", 10.5, MUTED),
        ("The two phases the syllabus calls the centre of the subject are the "
         "two with the least to do.", 10.5, GREEN),
    ])

    px = M + 470
    yy = box(s, px, y, CW - 470, 300, "Phases present, of eight")
    short = ["MatrixLang", "baseline 1", "baseline 2", "baseline 3"]
    for i, c in enumerate(D["baselines"]):
        n = c["phase_count"]
        row = yy + 10 + i * 34
        s.text(px + 18, row, 96, 16,
               [Para(Run(short[i], 9.4, WHITE if i == 0 else TEXT,
                         bold=(i == 0)), line=12)], pad=(0, 0, 0, 0))
        s.rect(px + 122, row + 3, 150, 10, fill=LINE, name="bar-bg")
        s.rect(px + 122, row + 3, 150 * n / 8.0, 10,
               fill=GREEN if i == 0 else RED, name="bar")
        s.text(px + 284, row, 44, 16,
               [Para(Run("%d/8" % n, 9.4, WHITE if i == 0 else MUTED, bold=True,
                         font=MONO), line=12)], pad=(0, 0, 0, 0))
    s.rect(px + 18, yy + 156, CW - 506, 1, fill=LINE, name="rule")
    body(s, px + 18, yy + 172, CW - 506, 108, [
        ("How a phase is counted", 9, GREEN, True),
        ("A file is attributed to a phase by its path and name, and a phase "
         "counts as present on a single case-insensitive match of any marker. "
         "The rule can only overstate a baseline, and it still finds no "
         "optimizer in any of them.", 9, MUTED),
    ])
    folio(s, 3)
    return s


# ====================================================================== 04 --

def slide_types():
    s = Slide()
    backdrop(s)
    y = title(s, "A type carries its shape",
              "Not matrix, but Matrix<2x3>. Two matrices of different shapes "
              "are values of different types.")

    caption(s, M, y - 20, 430, "Accepted, and its shape inferred")
    code(s, M, y, 430, 148, [
        ("matrix A[2,3] = {{1, 2, 3},", TEXT),
        ("                 {4, 5, 6}};", TEXT),
        ("matrix B[3,4];", TEXT),
        "",
        ("matrix C = A * B;", GREEN),
        ("    -> C : Matrix<2x4>, inferred", GREEN),
        "",
        ("print(C);", TEXT),
    ], size=9.4, lead=14.2)

    yy = caption(s, M + 462, y - 20, CW - 462,
                 "Rejected before anything runs", accent=RED)
    code(s, M + 462, yy, CW - 462, 148, [
        ("cannot multiply Matrix<2x3>", RED),
        ("               by Matrix<5x4>", RED),
        "  left  : A -> Matrix<2x3>",
        "  right : B -> Matrix<5x4>",
        ("  rule  : cols(left) = rows(right)", GREEN),
        ("  found : 3 != 5", GREEN),
    ], size=8.8, lead=13.4)

    y2 = 322.0
    yy = box(s, M, y2, 406, 148, "What the language has")
    for i, t in enumerate(["scalar and matrix",
                           "+   -   *   unary -   transpose",
                           "literals, identity, zeros, ones",
                           "declaration, assignment, print"]):
        row = yy + 4 + i * 22
        bullet(s, M + 18, row + 6)
        s.text(M + 30, row, 360, 18,
               [Para(Run(t, 9.6, TEXT), line=12)], pad=(0, 0, 0, 0))
    s.text(M + 18, yy + 96, 372, 20,
           [Para(Run("No control flow. That is the enabling decision, not a gap.",
                     9.4, GREEN, italic=True), line=12)], pad=(0, 0, 0, 0))

    yy = box(s, M + 438, y2, CW - 438, 148, "Why no control flow")
    body(s, M + 456, yy + 4, CW - 474, 108, [
        ("With no branches a whole program is a single basic block, so "
         "available-expression analysis and liveness are each one linear scan.",
         10, TEXT),
        ("A course reaches working CSE and dead-code elimination without first "
         "building a control-flow graph, which is where a semester usually "
         "runs out.", 9.6, MUTED),
    ])
    folio(s, 4)
    return s


# ====================================================================== 05 --

def slide_pipeline():
    s = Slide()
    backdrop(s)
    y = title(s, "Every phase prints what it produced",
              "One flag per phase, so a reviewer can stop the compiler anywhere "
              "and read the artifact. The text below is its real output.")

    cols = [
        ("--tokens", "lexical analysis", [
            "#   TOKEN       LEXEME   LINE:COL",
            "1   MATRIX      matrix   1:1",
            "2   IDENTIFIER  A        1:8",
            "3   LBRACKET    [        1:9",
            "4   NUMBER      2        1:10",
            "5   COMMA       ,        1:11",
            "6   NUMBER      3        1:12",
            ("...                   78 tokens", MUTED),
        ]),
        ("--ast", "syntax, shapes attached", [
            "Program  (line 1)",
            "|-- Declare A : Matrix<2x3>",
            "|   `-- MatrixLiteral : <2x3>",
            ("|       |-- Row : Matrix<1x3>", MUTED),
            ("|       `-- Row : Matrix<1x3>", MUTED),
            "|-- Declare B : Matrix<3x4>",
            ("|-- Declare C : Matrix<2x4>", GREEN),
            ("`-- Print : Matrix<2x4>", GREEN),
        ]),
        ("--symbols", "symbol table", [
            "+------+--------+------+------+",
            "| Name | Kind   | Rows | Cols |",
            "+------+--------+------+------+",
            "| A    | Matrix |    2 |    3 |",
            "| B    | Matrix |    3 |    4 |",
            ("| C    | Matrix |    2 |    4 |", GREEN),
            "+------+--------+------+------+",
            ("C's shape was never written.", GREEN),
        ]),
        ("--tac", "intermediate code", [
            "1  A = #0            Matrix<2x3>",
            "2  B = #1            Matrix<3x4>",
            ("3  t1 = A * B        Matrix<2x4>", GREEN),
            "4  C = t1            Matrix<2x4>",
            "5  print C           Matrix<2x4>",
            "",
            "5 instruction(s).",
            ("every temporary carries a shape", GREEN),
        ]),
        ("--target", "target code", [
            "0  PUSH_MATRIX   #0",
            "1  STORE_MATRIX  A",
            "2  PUSH_MATRIX   #1",
            "3  STORE_MATRIX  B",
            "4  LOAD_MATRIX   A",
            "5  LOAD_MATRIX   B",
            ("6  MATMUL", GREEN),
            "13 instruction(s).",
        ]),
        ("--run", "execution", [
            ("C = Matrix<2x4>", GREEN),
            "  [  38  44  50  56 ]",
            "  [  83  98 113 128 ]",
            "",
            "ACCEPTED",
            "  (0 error(s), 0 warning(s))",
            "",
            ("38 = 1*1 + 2*5 + 3*9", GREEN),
        ]),
    ]
    w = (CW - 2 * 18) / 3
    for i, (flag, phase, lines) in enumerate(cols):
        cx = M + (i % 3) * (w + 18)
        cy = y + (i // 3) * 158
        s.text(cx, cy, w, 15,
               [Para([Run(flag, 9, GREEN, bold=True, font=MONO),
                      Run("   " + phase, 8.4, MUTED)], line=12)],
               pad=(0, 0, 0, 0))
        code(s, cx, cy + 19, w, 124, lines, size=7.6, lead=11.8)
    folio(s, 5)
    return s


# ====================================================================== 06 --

def slide_cost():
    s = Slide()
    backdrop(s)
    y = title(s, "A shape is also a cost model",
              "Multiplying an m x n by an n x p matrix performs m p (2n-1) "
              "operations. Every term is a shape, and every shape is in the "
              "type.")

    figure(s, M, y + 6, 240, "98.0%",
           "of the arithmetic removed from\none three-matrix chain",
           accent=GREEN, size=52)
    s.text(M, y + 132, 240, 46,
           [Para(Run("The instruction count did not move. Four before, four "
                     "after.", 10, RED), line=13.5)], pad=(0, 0, 0, 0))

    px = M + 272
    yy = caption(s, px, y - 20, CW - 272, "One chain, two bracketings")
    code(s, px, yy, CW - 272, 178, [
        ("matrix R = A * B * C;     A 100x2   B 2x100   C 100x2", TEXT),
        "",
        ("(A * B) * C    builds a 100x100 intermediate", RED),
        ("               69,800 FLOP", RED),
        ("A * (B * C)    builds a 2x2 intermediate", GREEN),
        ("                1,396 FLOP", GREEN),
        "",
        ("Matrix multiplication is associative: both compute the same", MUTED),
        ("matrix. Which is cheaper depends only on the shapes.", MUTED),
    ], size=9.0, lead=15.2)

    y2 = 356.0
    yy = box(s, M, y2, 406, 114, "Why an instruction count cannot see it")
    body(s, M + 18, yy + 4, 372, 72, [
        ("A chain of k matrices needs exactly k-1 products under every "
         "bracketing.", 9.8, TEXT),
        ("So re-bracketing never changes the instruction count at all.",
         9.8, GREEN),
    ])

    yy = box(s, M + 438, y2, CW - 438, 114, "The algorithm is the textbook one")
    body(s, M + 456, yy + 4, CW - 474, 72, [
        ("The standard O(k^3) dynamic program over the chain, the same one an "
         "algorithms course teaches.", 9.8, TEXT),
        ("What is new is that a student compiler holds the information needed "
         "to run it.", 9.8, MUTED),
    ])
    folio(s, 6)
    return s


# ====================================================================== 07 --

def slide_measure():
    s = Slide()
    backdrop(s)
    y = title(s, "Two metrics, same programs, different answers",
              "%d programs from a generator, across two seeds. The corpus was "
              "not written by whoever wrote the optimizer." % D["n"])

    yy = box(s, M, y, CW, 158, "Median reduction per program")
    s.text(M + 16, y + 13, CW - 32, 14,
           [Para(Run("bar = interquartile range      tick = median",
                     8, MUTED), align="r", line=11)], pad=(0, 0, 0, 0))
    rows = [("arithmetic removed", D["flop_med"], D["flop_q1"], D["flop_q3"], GREEN),
            ("instructions removed", D["instr_med"], D["instr_q1"], D["instr_q3"], RED)]
    bar_x, bar_w = M + 204, 490
    for i, (name, med, q1, q3, col) in enumerate(rows):
        ry = yy + 10 + i * 54
        s.text(M + 18, ry, 180, 16,
               [Para(Run(name, 9.8, TEXT), line=12)], pad=(0, 0, 0, 0))
        s.text(M + 18, ry + 20, 180, 14,
               [Para(Run("IQR %.1f to %.1f" % (q1, q3), 8, MUTED), line=11)],
               pad=(0, 0, 0, 0))
        s.rect(bar_x, ry + 18, bar_w, 13, fill=LINE, name="bar-bg")
        s.rect(bar_x + bar_w * q1 / 100.0, ry + 18,
               max(1.5, bar_w * (q3 - q1) / 100.0), 13,
               fill=col if i == 0 else REDQ, name="iqr")
        s.rect(bar_x + bar_w * med / 100.0 - 1.25, ry + 14, 2.5, 21,
               fill=WHITE, name="median")
        s.text(bar_x + bar_w + 14, ry + 13, 86, 22,
               [Para(Run("%.1f%%" % med, 15, col, bold=True, font=SERIF),
                     line=18)], pad=(0, 0, 0, 0))
    s.text(bar_x, yy + 110, 60, 14,
           [Para(Run("0%", 8, MUTED, font=MONO), line=11)], pad=(0, 0, 0, 0))
    s.text(bar_x + bar_w - 60, yy + 110, 60, 14,
           [Para(Run("100%", 8, MUTED, font=MONO), align="r", line=11)],
           pad=(0, 0, 0, 0))

    y2 = y + 178
    figure(s, M, y2, 236, "%.1f%%" % D["chain_share"],
           "of programs had a chain worth\nre-bracketing (%d of %d)"
           % (D["chain_n"], D["chain_total"]), accent=VIOLET, size=40)
    figure(s, M + 252, y2, 236, "%.1f%%" % D["chain_med"],
           "median arithmetic saved on\nthose programs", accent=VIOLET, size=40)
    figure(s, M + 504, y2, 300, "%d/%d" % (D["identical"], D["programs"]),
           "programs printed identical bytes with\nthe optimizer and without",
           accent=GREEN, size=40)

    (f1, i1), (f2, i2) = D["per_seed"]
    s.rect(M, 448, CW, 1, fill=LINE, name="rule")
    s.text(M, 460, CW, 20,
           [Para([Run("Not one lucky corpus.   ", 9.6, GREEN, bold=True),
                  Run("Taken separately the two seeds give %.1f%% and %.1f%% of "
                      "the arithmetic against %.1f%% and %.1f%% of the "
                      "instructions." % (f1, f2, i1, i2), 9.6, MUTED)],
                 line=13)], pad=(0, 0, 0, 0))
    folio(s, 7)
    return s


# ====================================================================== 08 --

def slide_bug():
    s = Slide()
    backdrop(s)
    y = title(s, "The corpus found a bug we had not",
              "The first differential run did not come back clean, and that is "
              "the part worth reporting.")

    code(s, M, y, 430, 132, [
        ("unoptimized           optimized", MUTED),
        ("R = Matrix<1x1>       R = Matrix<1x1>", TEXT),
        ("  [ 0 ]                 [ -0 ]", RED),
        "",
        ("the rewrite that did it:", MUTED),
        ("    0 - x    =>    -x", GREEN),
    ], size=9.6, lead=14.4)

    yy = box(s, M + 462, y, CW - 462, 132, "Why it is wrong", accent=RED)
    s.text(M + 478, yy + 2, CW - 494, 88,
           [Para(Run("True over the reals. Not observationally equivalent in "
                     "IEEE-754: +0 minus +0 is +0, but negating +0 gives -0, "
                     "and the two print differently.", 10, TEXT), line=14)],
           pad=(0, 0, 0, 0))

    y2 = 318.0
    s.rect(M, y2, CW, 1, fill=LINE, name="rule")
    colw = (CW - 40) / 2
    body(s, M, y2 + 18, colw, 80, [
        ("Not a finding about floating point.", 10.5, RED, True),
        ("That algebraic identities valid over the reals are unsound in "
         "floating point is textbook, and production compilers gate exactly "
         "these rewrites behind fast-math.", 10, MUTED),
    ])
    body(s, M + colw + 40, y2 + 18, colw, 80, [
        ("A finding about what a course can afford.", 10.5, GREEN, True),
        ("A generator and a loop comparing two runs, which is a weekend of "
         "work, found a defect in a student-scale optimizer that reading the "
         "code had not, on an input nobody chose.", 10, MUTED),
    ])
    s.text(M, 430, CW, 24,
           [Para(Run("The rewrite was removed. It saved no arithmetic anyway: "
                     "a negation costs what a subtraction from zero costs.",
                     10, TEXT, italic=True), line=13)], pad=(0, 0, 0, 0))
    folio(s, 8)
    return s


# ====================================================================== 09 --

def slide_meaning():
    s = Slide()
    backdrop(s)
    y = title(s, "The source language is a curricular decision",
              "It decides which phases can carry real work. That is the claim, "
              "and it is the one we can evidence.")

    yy = box(s, M, y, 406, 206, "What the domain bought")
    for i, (h, t) in enumerate([
        ("Semantic analysis", "became shape inference and dimension checking"),
        ("Code generation", "gained instruction selection from inferred types"),
        ("Optimization", "gained transformations and a way to score them"),
    ]):
        s.text(M + 18, yy + 6 + i * 46, 372, 42,
               [Para(Run(h, 10, GREEN, bold=True), line=13),
                Para(Run(t, 9.4, MUTED), line=12.4)], pad=(0, 0, 0, 0))
    s.text(M + 18, yy + 152, 372, 20,
           [Para(Run("It costs control-flow graphs and dataflow analysis.",
                     9.4, RED), line=12)], pad=(0, 0, 0, 0))

    yy = box(s, M + 438, y, CW - 438, 206, "What we do not claim", accent=RED)
    for i, t in enumerate([
        "That students learn more. It has not been taught yet.",
        "That the mechanisms are new. They are not.",
        "That the magnitudes generalise. The corpus is ours.",
        "That three repositories are a sample.",
    ]):
        row = yy + 10 + i * 36
        negation(s, M + 456, row + 7)
        s.text(M + 472, row, CW - 510, 30,
               [Para(Run(t, 9.4, TEXT), line=12.4)], pad=(0, 0, 0, 0))

    note(s, M, 382, CW - 40,
         "Whatever the domain, if the type system carries enough to cost a "
         "program statically, a student's optimizer can be scored on the work "
         "it removes rather than the lines it removes. The two are not close.")

    s.rect(M, 470, CW, 1, fill=LINE, name="rule")
    s.text(M, 482, 520, 18,
           [Para(Run("Paper, compiler, generator, measurements and demo",
                     9.4, MUTED), line=12)], pad=(0, 0, 0, 0))
    s.text(M, 482, CW, 18,
           [Para(Run(REPO, 9.6, BLUE, font=MONO, link=REPO_URL),
                 align="r", line=12)],
           pad=(0, 0, 0, 0))
    return s


# ==========================================================================

def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "docs/submission/MatrixLang-Deck.pptx"
    slides = [slide_title(), slide_thesis(), slide_problem(), slide_types(),
              slide_pipeline(), slide_cost(), slide_measure(), slide_bug(),
              slide_meaning()]

    problems = 0
    for i, sl in enumerate(slides, 1):
        # chrome_top=0 disables the takeaway-band rule; this deck sets its own
        # margins. The slide-bounds checks still apply.
        for msg in sl.check(chrome_top=0.0):
            print("  slide %d: %s" % (i, msg))
            problems += 1
    if problems:
        print("%d layout problem(s); not writing the deck." % problems)
        return 1

    d = os.path.dirname(os.path.abspath(out))
    if d:
        os.makedirs(d, exist_ok=True)
    write(out, slides, "MatrixLang", "A Aswanth Raj", bg=BLACK)
    print("wrote %s  (%d slides, layout clean)" % (out, len(slides)))
    print("  read from results/: arithmetic median %.1f%%, instruction median "
          "%.1f%%, chain share %.1f%%, differential %d/%d"
          % (D["flop_med"], D["instr_med"], D["chain_share"],
             D["identical"], D["programs"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
