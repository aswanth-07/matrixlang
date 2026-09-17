"""Build the MatrixLang presentation.

    python tools/build-deck.py docs/submission/MatrixLang-Deck.pptx

Every figure on these slides is copied from real `matrixc` output, not retyped
from memory. When the compiler's output changes, re-run the commands named in
each panel's heading and update this file: a deck that disagrees with the
compiler is worse than no deck.

Structure follows the department's review-deck convention -- one question per
slide, a one-line subtitle saying what the slide answers, dense panels carrying
real tool output, and a key takeaway the reader can repeat back.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from deckkit import Para, Run, Slide, write  # noqa: E402

# ---------------------------------------------------------------- palette --
# Warm paper, deep green-black ink, teal as the structural accent, amber for
# "note this", rose for failure. Code sits on near-black panels: a compiler deck
# should look like a terminal where it is showing a terminal.

PAPER   = "FAF7F2"
CARD    = "FFFFFF"
INK     = "14261F"
BODY    = "3F4F49"
MUTED   = "7C8B85"
RULE    = "E3DDD2"

TEAL    = "0E7C6B"
TEALLT  = "E4F3F0"
AMBER   = "B4690E"
AMBERLT = "FBF0DC"
ROSE    = "9E2B3F"
ROSELT  = "FBE9EC"

CODEBG  = "16221E"
CODEFG  = "CFE3DC"
CODEDIM = "7E968D"
CODETEA = "5FD3BC"
CODEAMB = "E8B45F"
CODEROS = "F09AA8"

SERIF = "Georgia"
SANS  = "Segoe UI"
MONO  = "Consolas"

M = 44.0                 # page margin
W = 960.0 - 2 * M        # content width, 872
BOTTOM = 478.0           # content must end here; takeaway bar sits below

ARROW = "→"
CHECK = "✓"
DOT   = "·"
BULL  = "●"
NEQ   = "≠"


# ------------------------------------------------------------- components --

def header(s, num, eyebrow, title, subtitle):
    """Standard slide header: eyebrow, title, one-line subtitle, hairline."""
    s.text(M, 22, 640, 14,
           [Para(Run(f"{num:02d}   {DOT}   {eyebrow}", 8, TEAL, bold=True,
                     spacing=1.7, caps=True))], pad=(0, 0, 0, 0))
    s.text(960 - M - 80, 22, 80, 14,
           [Para(Run(f"{num} / 8", 8, MUTED, bold=True, spacing=1.0), align="r")],
           pad=(0, 0, 0, 0))
    s.text(M, 38, 860, 34, [Para(Run(title, 25, INK, bold=True, font=SERIF), line=29)],
           pad=(0, 0, 0, 0))
    s.text(M, 73, 860, 18, [Para(Run(subtitle, 11, MUTED), line=14)], pad=(0, 0, 0, 0))
    s.line_h(M, 99, W, RULE, 1.0)


def takeaway(s, text):
    """The band every slide ends on."""
    s.panel(M, 488, W, 32, fill=TEALLT, radius=2000)
    s.rect(M, 488, 3.5, 32, fill=TEAL)
    s.text(M + 17, 488, W - 32, 32,
           [Para([Run("Key takeaway     ", 8, TEAL, bold=True, caps=True, spacing=1.3),
                  Run(text, 10.5, INK)], line=13)],
           anchor="ctr", pad=(0, 0, 0, 0))


def card(s, x, y, w, h, title=None, accent=TEAL, fill=CARD, border=RULE):
    """A titled panel. Returns the y at which its content should start."""
    s.panel(x, y, w, h, fill=fill, line=border)
    if title:
        s.text(x + 13, y + 8, w - 26, 15,
               [Para(Run(title, 8.2, accent, bold=True, caps=True, spacing=1.1))],
               pad=(0, 0, 0, 0))
        return y + 26
    return y + 10


def code(s, x, y, w, h, lines, size=8.2, lead=10.6, bg=CODEBG, pad=(12, 9, 10, 8)):
    """A dark code panel. Each line is a str, or (str, colour)."""
    s.panel(x, y, w, h, fill=bg, radius=1600)
    paras = []
    for ln in lines:
        col = CODEFG
        if isinstance(ln, tuple):
            ln, col = ln
        paras.append(Para(Run(ln if ln else " ", size, col, font=MONO), line=lead))
    s.text(x, y, w, h, paras, pad=pad)


def rows(s, x, y, w, data, col1=150, size=8.6, lead=12.0, rowh=17.0,
         c1=INK, c2=BODY, bold1=True, zebra=None):
    """A two-column list. Simpler and better-behaved than a real table."""
    for i, (a, b) in enumerate(data):
        yy = y + i * rowh
        if zebra and i % 2 == 0:
            s.rect(x, yy, w, rowh, fill=zebra)
        s.text(x + 6, yy, col1, rowh,
               [Para(Run(a, size, c1, bold=bold1, font=MONO if bold1 else SANS), line=lead)],
               anchor="ctr", pad=(0, 0, 0, 0))
        s.text(x + col1 + 6, yy, w - col1 - 12, rowh,
               [Para(Run(b, size, c2), line=lead)], anchor="ctr", pad=(0, 0, 0, 0))
    return y + len(data) * rowh


def bullets(s, x, y, w, h, items, size=9.2, lead=13.2, gap=3.0,
            color=BODY, mark=None, mark_color=TEAL):
    paras = []
    for it in items:
        runs = []
        if mark:
            runs.append(Run(mark + "  ", size, mark_color, bold=True))
        if isinstance(it, tuple):
            head, tail = it
            runs.append(Run(head, size, INK, bold=True))
            runs.append(Run(tail, size, color))
        else:
            runs.append(Run(it, size, color))
        paras.append(Para(runs, line=lead, after=gap))
    s.text(x, y, w, h, paras, pad=(0, 0, 0, 0))


def chip(s, x, y, w, h, text, fg, bg, size=7.8):
    s.panel(x, y, w, h, fill=bg, radius=14000)
    s.text(x, y, w, h, [Para(Run(text, size, fg, bold=True, caps=True, spacing=0.9),
                             align="ctr")], anchor="ctr", pad=(0, 0, 0, 0))


def stat(s, x, y, w, value, label, accent=TEAL):
    """A headline number with a caption. The caption may carry newlines;
    DrawingML has no line break inside a run, so each becomes its own
    paragraph."""
    s.text(x, y, w, 38, [Para(Run(value, 30, accent, bold=True, font=SERIF), line=33)],
           pad=(0, 0, 0, 0))
    s.text(x, y + 36, w, 28,
           [Para(Run(ln, 8.2, MUTED), line=10.6) for ln in label.split(chr(10))],
           pad=(0, 0, 0, 0))


# ==========================================================================
# 1 -- title, and the problem
# ==========================================================================

def slide1():
    s = Slide()
    s.text(M, 30, 640, 14,
           [Para(Run(f"Compiler Design Laboratory   {DOT}   Individual Project",
                     8, TEAL, bold=True, spacing=1.7, caps=True))], pad=(0, 0, 0, 0))

    s.text(M, 48, 560, 60, [Para(Run("MatrixLang", 46, INK, bold=True, font=SERIF), line=52)],
           pad=(0, 0, 0, 0))
    s.rect(M, 112, 52, 3.5, fill=TEAL)
    s.text(M, 124, 560, 24,
           [Para(Run("A Dimension-Aware Optimizing Compiler for a Matrix Language",
                     14.5, INK, font=SERIF), line=19)], pad=(0, 0, 0, 0))
    s.text(M, 152, 540, 40,
           [Para(Run("Matrix dimensions are part of the type system, so shape errors "
                     "become compile-time errors and matrix algebra becomes an "
                     "optimization.", 10, MUTED), line=14)], pad=(0, 0, 0, 0))

    # author block
    s.panel(640, 46, 276, 92, fill=CARD, line=RULE)
    s.text(656, 58, 244, 16, [Para(Run("Presented by", 8, TEAL, bold=True,
                                       caps=True, spacing=1.1))], pad=(0, 0, 0, 0))
    s.text(656, 76, 244, 22, [Para(Run("A Aswanth Raj", 15, INK, bold=True, font=SERIF),
                                   line=18)], pad=(0, 0, 0, 0))
    s.text(656, 100, 244, 32,
           [Para(Run("Written in C with Flex and Bison. No third-party libraries.",
                     8.4, MUTED), line=11)], pad=(0, 0, 0, 0))

    # --- before / after -----------------------------------------------------
    top, hgt = 200.0, 244.0

    y = card(s, M, top, 396, hgt, "Today   " + DOT + "   the error arrives at runtime",
             accent=ROSE)
    bullets(s, M + 14, y + 2, 368, 74, [
        ("C / Java   ", "matrix compatibility is not a rule of the language, so "
                        "whatever check exists is one the program wrote."),
        ("NumPy   ", "the check exists, but it runs when the operation runs."),
    ], size=8.8, lead=12.2, gap=5)
    code(s, M + 14, y + 84, 368, 86, [
        (">>> A.shape, B.shape", CODEDIM),
        "((2, 3), (5, 4))",
        (">>> A @ B", CODEDIM),
        ("ValueError: matmul: Input operand 1 has a", CODEROS),
        ("mismatch in its core dimension 0 ...", CODEROS),
        ("(size 5 is different from 3)", CODEROS),
    ], size=8.0, lead=10.4)
    s.text(M + 14, y + 178, 368, 30,
           [Para([Run("Found only when that line executes.  ", 8.6, ROSE, bold=True),
                  Run("Possibly after an expensive setup; possibly never, if the "
                      "shapes happen to line up.", 8.6, BODY)], line=11.6)],
           pad=(0, 0, 0, 0))

    s.arrow(452, 300, 56, 40, TEAL)

    y = card(s, 520, top, 396, hgt, "MatrixLang   " + DOT + "   it arrives at compile time",
             accent=TEAL)
    bullets(s, 534, y + 2, 368, 74, [
        ("A type carries its shape.   ", "A is Matrix<2x3> and B is Matrix<5x4>. "
                                         "Those are different types."),
        ("The shape is a fact about the text.   ",
         "That A * B is impossible follows from the program, not from its input, "
         "so it can be settled before anything runs."),
    ], size=8.8, lead=12.2, gap=5)
    code(s, 534, y + 84, 368, 86, [
        ("9:7: error [semantic] cannot multiply", CODEROS),
        ("     Matrix<2x3> by Matrix<5x4>", CODEROS),
        "   left   : A -> Matrix<2x3>",
        "   right  : B -> Matrix<5x4>",
        ("   rule   : columns(left) must equal rows(right)", CODETEA),
        ("   found  : 3 != 5", CODETEA),
    ], size=8.0, lead=10.4)
    s.text(534, y + 178, 368, 30,
           [Para([Run("No target code is generated.  ", 8.6, TEAL, bold=True),
                  Run("Emitting it would mean emitting a multiplication the machine "
                      "cannot perform. Exit status 1.", 8.6, BODY)], line=11.6)],
           pad=(0, 0, 0, 0))

    s.text(M, 456, W, 16,
           [Para([Run("Build and demonstrate:   ", 8.4, MUTED),
                  Run("make   " + DOT + "   make test   " + DOT + "   make demo1  demo2  demo3",
                      8.4, INK, bold=True, font=MONO)], line=11)], pad=(0, 0, 0, 0))

    takeaway(s, "MatrixLang moves the matrix shape check from run time to compile time, "
                "and then reuses the same information to optimize.")
    return s


# ==========================================================================
# 2 -- the language
# ==========================================================================

def slide2():
    s = Slide()
    header(s, 2, "The Language",
           "What MatrixLang Understands",
           "Two kinds of value, and a type that carries the shape rather than just the name.")

    # --- left: the type lattice --------------------------------------------
    y = card(s, M, 116, 300, 152, "The type lattice")
    rows(s, M + 8, y + 2, 284, [
        ("Scalar", "one double-precision number"),
        ("Matrix<r,c>", "r rows, c columns, both fixed at compile time"),
    ], col1=94, size=8.4, lead=11.0, rowh=30)
    s.panel(M + 14, y + 70, 272, 42, fill=AMBERLT, radius=2000)
    s.text(M + 14, y + 70, 272, 42,
           [Para([Run("Matrix<2x3>", 9.4, AMBER, bold=True, font=MONO),
                  Run(f"  {NEQ}  ", 9.4, AMBER, bold=True),
                  Run("Matrix<3x2>", 9.4, AMBER, bold=True, font=MONO)], align="ctr", line=12),
            Para(Run("Different types, not one type with different contents.",
                     8.2, BODY, italic=True), align="ctr", line=11)],
           anchor="ctr", pad=(0, 0, 0, 0))

    # --- left lower: scope --------------------------------------------------
    y = card(s, M, 278, 300, 200, "Scope of the language")
    chip(s, M + 14, y + 2, 76, 15, "working now", "FFFFFF", TEAL)
    bullets(s, M + 14, y + 22, 272, 60, [
        "declaration, assignment, print",
        "+   -   *   unary -   transpose()",
        "matrix literals, identity(), zeros(), ones()",
        "scalar-matrix scaling",
    ], size=8.5, lead=11.4, gap=2.5, mark=BULL, mark_color=TEAL)
    chip(s, M + 14, y + 86, 56, 15, "planned", "FFFFFF", MUTED)
    bullets(s, M + 14, y + 106, 272, 32, [
        "if / while, then functions",
        "matrix chain ordering",
    ], size=8.5, lead=11.4, gap=2.5, mark=BULL, mark_color=MUTED)

    # --- middle: declaring values ------------------------------------------
    y = card(s, 360, 116, 286, 220, "Declaring values")
    code(s, 374, y + 4, 258, 180, [
        ("matrix A[2,3];", CODEFG),
        ("    " + ARROW + " A : Matrix<2x3>", CODETEA),
        "",
        ("matrix B = {{1,2},{3,4}};", CODEFG),
        ("    " + ARROW + " B : Matrix<2x2>", CODETEA),
        "",
        ("matrix C = A * B;", CODEFG),
        ("    " + ARROW + " C : Matrix<2x2>   inferred", CODETEA),
        "",
        ("matrix I = identity(3);", CODEFG),
        ("    " + ARROW + " I : Matrix<3x3>", CODETEA),
        "",
        ("scalar k = 2.5;", CODEFG),
        ("    " + ARROW + " k : Scalar", CODETEA),
    ], size=8.2, lead=11.6)

    y = card(s, 360, 346, 286, 132, "Dimensions are compile-time")
    bullets(s, 374, y + 2, 258, 100, [
        "A dimension must be a positive whole constant. "
        "zeros(2+1,4) folds; zeros(n,4) is an error.",
        "A matrix literal must be rectangular.",
        "Assignment has value semantics: no aliasing, no element mutation.",
    ], size=8.4, lead=11.2, gap=5, mark=BULL, mark_color=AMBER)

    # --- right: shape rules -------------------------------------------------
    y = card(s, 660, 116, 256, 220, "The shape rules")
    data = [
        ("A + B", "identical shapes"),
        ("A - B", "identical shapes"),
        ("A * B", "cols(A) = rows(B)"),
        ("k * A", "any scalar, shape kept"),
        ("transpose(A)", "rows and cols swap"),
    ]
    rows(s, 660 + 6, y + 4, 244, data, col1=96, size=8.0, lead=10.6, rowh=21,
         zebra=None)
    s.line_h(672, y + 112, 232, RULE, 1.0)
    s.text(674, y + 118, 230, 62,
           [Para([Run("Rejected:  ", 8.2, ROSE, bold=True),
                  Run("A + k", 8.2, ROSE, bold=True, font=MONO),
                  Run("  there is no broadcasting; it would read like matrix "
                      "addition and would not be.", 8.2, BODY)], line=11),
            Para([Run("Rejected:  ", 8.2, ROSE, bold=True),
                  Run("transpose(k)", 8.2, ROSE, bold=True, font=MONO),
                  Run("  a scalar has no axes to exchange.", 8.2, BODY)],
                 line=11, before=4)], pad=(0, 0, 0, 0))

    y = card(s, 660, 346, 256, 132, "Why it is scoped this way")
    s.text(674, y + 2, 228, 100,
           [Para(Run("With no control flow a whole program is a single basic block. "
                     "That is what makes the Phase 3 optimizations exact rather than "
                     "conservative: available expressions and liveness are each one "
                     "linear scan, with no control-flow graph and no dataflow "
                     "iteration.", 8.4, BODY), line=11.4)], pad=(0, 0, 0, 0))

    takeaway(s, "A type is not “matrix” but Matrix<2x3>, and every rule in the "
                "language is a statement about shapes.")
    return s


# ==========================================================================
# 3 -- system design
# ==========================================================================

def slide3():
    s = Slide()
    header(s, 3, "System Design",
           "Total System Design",
           "A conventional compiler pipeline with one addition: three separate stages "
           "consult the same shape rules.")

    # --- left: the pipeline -------------------------------------------------
    card(s, M, 116, 420, 362, "The compilation spine")

    stages = [
        ("Lexical analysis", "matrix.l", "tokens", False),
        ("Syntax analysis", "matrix.y", "syntax tree", False),
        ("Semantic analysis", "semantic.c", "typed tree + symbols", True),
        ("Intermediate code", "tac.c", "three-address code", False),
        ("Optimizer", "optimize.c", "optimized code", True),
        ("Code generation", "codegen.c", "MVM instructions", True),
        ("Virtual machine", "vm.c", "printed result", False),
    ]

    s.panel(M + 78, 144, 168, 22, fill=AMBERLT, radius=9000)
    s.text(M + 78, 144, 168, 22, [Para(Run("source.ml", 8.6, AMBER, bold=True, font=MONO),
                                       align="ctr")], anchor="ctr", pad=(0, 0, 0, 0))

    y0, bh, gap = 174.0, 30.0, 10.0
    for i, (name, file, out, uses_rules) in enumerate(stages):
        yy = y0 + i * (bh + gap)
        s.panel(M + 62, yy, 200, bh, fill=CARD, line=TEAL if uses_rules else RULE,
                line_w=1.4 if uses_rules else 1.0, radius=2000)
        s.text(M + 62, yy, 200, bh,
               [Para([Run((BULL + "  ") if uses_rules else "", 7.5, TEAL, bold=True),
                      Run(name, 8.8, INK, bold=True),
                      Run("   " + file, 7.6, MUTED, font=MONO)], line=11)],
               anchor="ctr", pad=(10, 0, 6, 0))
        s.text(M + 272, yy, 140, bh,
               [Para(Run(ARROW + "  " + out, 8.0, TEAL), line=10.5)],
               anchor="ctr", pad=(0, 0, 0, 0))
        if i < len(stages) - 1:
            s.rect(M + 160, yy + bh, 1.4, gap, fill=MUTED)
    s.rect(M + 160, 166, 1.4, 8, fill=MUTED)

    s.text(M + 14, 452, 392, 20,
           [Para([Run(BULL + "  ", 8, TEAL, bold=True),
                  Run("consults ", 8.2, BODY),
                  Run("types.c", 8.2, INK, bold=True, font=MONO),
                  Run(" — the shape rules, written once and read by three stages.",
                      8.2, BODY)], line=11)], pad=(0, 0, 0, 0))

    # --- right: modules -----------------------------------------------------
    y = card(s, 490, 116, 426, 362, "Module responsibilities")
    rows(s, 496, y + 2, 414, [
        ("matrix.l", "Flex scanner; also records each token for display"),
        ("matrix.y", "Bison LALR(1) grammar; builds the syntax tree"),
        ("types.c", "the type lattice and every shape rule"),
        ("ast.c", "tree nodes, printer, expression rendering"),
        ("symtab.c", "names, kinds and shapes; duplicate detection"),
        ("semantic.c", "shape inference and dimension checking"),
        ("tac.c", "three-address code with typed instructions"),
        ("optimize.c", "four passes, run to a fixed point"),
        ("codegen.c", "instruction selection for the stack machine"),
        ("vm.c", "executes the generated program"),
        ("value.c", "matrix arithmetic and the literal pool"),
        ("diag.c", "every message, ordered by source position"),
        ("main.c", "driver, stage selection, exit status"),
    ], col1=86, size=8.2, lead=10.6, rowh=24.8, zebra=PAPER)

    takeaway(s, "It is a full compiler, not a calculator: lexer, parser, tree, symbol "
                "table, semantics, IR, optimizer, code generation and execution.")
    return s


# ==========================================================================
# 4 -- the worked example
# ==========================================================================

def slide4():
    s = Slide()
    header(s, 4, "End to End",
           "Input " + ARROW + " Compiler Stages " + ARROW + " Output",
           "Every stage prints what it produced, so the project can be demonstrated "
           "one phase at a time.")

    # source
    s.panel(M, 112, W, 74, fill=CODEBG, radius=1600)
    s.text(M + 14, 118, 24, 62, [Para(Run("in", 7.6, CODEDIM, bold=True, caps=True,
                                          spacing=1.0), line=10)], pad=(0, 0, 0, 0))
    def column(x, w, lines):
        paras = []
        for t in lines:
            c = CODEFG
            if isinstance(t, tuple):
                t, c = t
            paras.append(Para(Run(t or " ", 8.2, c, font=MONO), line=11.2))
        s.text(x, 118, w, 62, paras, pad=(0, 0, 0, 0))

    column(M + 42, 420, [
        "matrix A[2,3] = {{1, 2, 3},",
        "                 {4, 5, 6}};",
        "matrix B[3,4] = {{1, 0, 0, 1},",
        "                 {0, 1, 0, 2},",
        "                 {0, 0, 1, 3}};",
    ])
    column(M + 480, 380, [
        ("matrix C = A * B;", CODETEA),
        "print(C);",
    ])
    s.text(M + 480, 146, 380, 30,
           [Para(Run("C is declared without a shape. The compiler works out",
                     7.6, CODETEA, italic=True), line=10.4),
            Para(Run("Matrix<2x4> from the shapes of A and B.",
                     7.6, CODETEA, italic=True), line=10.4)], pad=(0, 0, 0, 0))

    def stage(x, y, w, h, n, title, flag, lines, size=7.7, lead=10.0):
        s.panel(x, y, w, h, fill=CARD, line=RULE)
        s.panel(x + 12, y + 9, 15, 15, fill=TEAL, radius=12000)
        s.text(x + 12, y + 9, 15, 15, [Para(Run(str(n), 7.8, "FFFFFF", bold=True),
                                            align="ctr")], anchor="ctr", pad=(0, 0, 0, 0))
        s.text(x + 33, y + 9, w - 46, 15,
               [Para([Run(title, 8.2, INK, bold=True, caps=True, spacing=0.8),
                      Run("   " + flag, 7.6, TEAL, font=MONO)], line=11)],
               pad=(0, 0, 0, 0))
        code(s, x + 10, y + 30, w - 20, h - 40, lines, size=size, lead=lead,
             pad=(9, 7, 7, 6))

    # row 1
    ry, rh = 196.0, 138.0
    cw = 280.0
    stage(M, ry, cw, rh, 1, "Lexical analysis", "--tokens", [
        ("#   TOKEN         LEXEME     LINE:COL", CODEDIM),
        "1   MATRIX        matrix     5:1",
        "2   IDENTIFIER    A          5:8",
        "3   LBRACKET      [          5:9",
        "4   NUMBER        2          5:10",
        "5   COMMA         ,          5:11",
        "6   NUMBER        3          5:12",
        ("...                        78 token(s).", CODEDIM),
    ])
    stage(M + cw + 16, ry, cw, rh, 2, "Syntax analysis", "--ast", [
        "Program",
        "|-- Declare A : Matrix<2x3>",
        "|-- Declare B : Matrix<3x4>",
        ("|-- Declare C : Matrix<2x4>", CODETEA),
        ("|   `-- BinaryOp * : Matrix<2x4>", CODETEA),
        "|       |-- Identifier A : Matrix<2x3>",
        "|       `-- Identifier B : Matrix<3x4>",
        "`-- Print : Matrix<2x4>",
    ])
    stage(M + 2 * (cw + 16), ry, cw, rh, 3, "Symbol table", "--symbols", [
        ("Name   Kind    Rows  Cols  Decl@Ln", CODEDIM),
        "A      Matrix     2     3        5",
        "B      Matrix     3     4        8",
        ("C      Matrix     2     4       12", CODETEA),
        "",
        ("3 symbol(s).", CODEDIM),
        "",
        ("rows and cols are the whole point", CODETEA),
    ])

    # row 2
    ry2, rh2 = 346.0, 132.0
    stage(M, ry2, cw, rh2, 4, "Intermediate code", "--tac", [
        "1  A = #0              Matrix<2x3>",
        "2  B = #1              Matrix<3x4>",
        ("3  t1 = A * B          Matrix<2x4>", CODETEA),
        "4  C = t1              Matrix<2x4>",
        "5  print C             Matrix<2x4>",
        "",
        ("5 instruction(s).", CODEDIM),
    ])
    stage(M + cw + 16, ry2, cw, rh2, 5, "Target code", "--target", [
        " 0  PUSH_MATRIX   #0",
        " 1  STORE_MATRIX  A",
        " 4  LOAD_MATRIX   A",
        " 5  LOAD_MATRIX   B",
        (" 6  MATMUL", CODETEA),
        " 7  STORE_MATRIX  t1",
        "11  PRINT         C",
        ("12  HALT                13 instruction(s).", CODEDIM),
    ])
    stage(M + 2 * (cw + 16), ry2, cw, rh2, 6, "Execution", "--run", [
        ("C = Matrix<2x4>", CODETEA),
        "  [  1  2  3 14 ]",
        "  [  4  5  6 32 ]",
        "",
        ("check by hand:", CODEDIM),
        ("row 1 of A is [1 2 3]", CODEDIM),
        ("col 4 of B is [1 2 3]", CODEDIM),
        ("1*1 + 2*2 + 3*3 = 14", CODEAMB),
    ])

    takeaway(s, "Each phase has its own flag, so a reviewer can stop the compiler at "
                "any stage and read what it produced.")
    return s


# ==========================================================================
# 5 -- checking and optimization
# ==========================================================================

def slide5():
    s = Slide()
    header(s, 5, "Checking and Optimization",
           "What the Shapes Buy",
           "The same information rejects impossible programs and removes work a "
           "general-purpose optimizer cannot see.")

    # --- left: checking -----------------------------------------------------
    y = card(s, M, 112, 424, 318,
             "1   " + DOT + "   Dimension checking", accent=ROSE)
    code(s, M + 13, y + 2, 398, 80, [
        ("9:7: error [semantic] cannot multiply Matrix<2x3>", CODEROS),
        ("     by Matrix<5x4>", CODEROS),
        "   left   : A -> Matrix<2x3>        right : B -> Matrix<5x4>",
        ("   rule   : columns(left) must equal rows(right)", CODETEA),
        ("   found  : 3 != 5", CODETEA),
    ], size=7.9, lead=10.8)
    s.text(M + 13, y + 88, 398, 16,
           [Para(Run("The message names both operands as they were written, the rule, "
                     "and what it found.", 8.2, BODY, italic=True), line=11)],
           pad=(0, 0, 0, 0))
    s.text(M + 13, y + 108, 398, 14,
           [Para(Run("Every error class, one example file each", 8, ROSE, bold=True,
                     caps=True, spacing=0.9))], pad=(0, 0, 0, 0))
    rows(s, M + 8, y + 124, 408, [
        ("mul_mismatch", "cannot multiply Matrix<2x3> by Matrix<5x4>"),
        ("add_mismatch", "addition requires identical dimensions"),
        ("bad_shape", "transpose() expects a matrix, got Scalar"),
        ("bad_literal", "row 2 has 2 entries, expected 3"),
        ("undeclared", "assignment to undeclared variable 'B'"),
        ("duplicate", "duplicate declaration of 'A'"),
        ("syntax", "unexpected IDENT, expecting ';' or '='"),
        ("lexical", "illegal character '$'"),
    ], col1=104, size=7.9, lead=10.4, rowh=19.2, zebra=PAPER)

    # --- right: optimization ------------------------------------------------
    y = card(s, 492, 112, 424, 318, "2   " + DOT + "   Optimization", accent=TEAL)

    def beforeafter(yy, label, before, after, note):
        s.text(506, yy, 396, 13, [Para(Run(label, 7.9, TEAL, bold=True, caps=True,
                                           spacing=0.9))], pad=(0, 0, 0, 0))
        code(s, 506, yy + 15, 186, 58, before, size=7.5, lead=9.8, pad=(9, 6, 6, 5))
        s.arrow(698, yy + 34, 20, 16, TEAL)
        code(s, 724, yy + 15, 178, 58, after, size=7.5, lead=9.8, pad=(9, 6, 6, 5))
        s.text(506, yy + 75, 396, 12, [Para(Run(note, 7.7, BODY, italic=True), line=10)],
               pad=(0, 0, 0, 0))

    beforeafter(y + 2, "Common subexpression elimination",
                ["t1 = A * B", "X  = t1", ("t2 = A * B", CODEROS), "Y  = t2"],
                ["t1 = A * B", "X  = t1", ("Y  = t1", CODETEA), ""],
                "A matrix multiply is the costliest operation in the language.")

    beforeafter(y + 92, "Dead code elimination",
                [("t1 = A * B", CODEROS), ("X  = t1", CODEROS),
                 "t2 = C * D", "X  = t2", "print X"],
                ["t2 = C * D", "X  = t2", "print X", "", ("9 " + ARROW + " 5 instructions", CODETEA)],
                "Removing X = A*B makes A and B dead too, so the passes repeat.")

    s.text(506, y + 184, 396, 13, [Para(Run("Matrix-specific algebra   " + DOT +
                                            "   the original contribution", 7.9, AMBER,
                                            bold=True, caps=True, spacing=0.9))],
           pad=(0, 0, 0, 0))
    code(s, 506, y + 199, 396, 74, [
        ("A * identity(n)  " + ARROW + "  A        identity(n) * A  " + ARROW + "  A", CODEAMB),
        ("A + zeros(r,c)   " + ARROW + "  A        A - zeros(r,c)   " + ARROW + "  A", CODEAMB),
        ("A * 1            " + ARROW + "  A        A * 0            " + ARROW + "  zeros(r,c)", CODEAMB),
        ("transpose(transpose(A))           " + ARROW + "  A", CODEAMB),
        "",
        ("a general optimizer cannot: it does not know what a matrix is", CODEDIM),
    ], size=7.6, lead=10.4)

    # --- the safety bar -----------------------------------------------------
    s.panel(M, 440, W, 38, fill=AMBERLT, radius=2000)
    s.rect(M, 440, 3.5, 38, fill=AMBER)
    s.text(M + 17, 440, W - 34, 38,
           [Para([Run("Is it still the same program?   ", 8.8, AMBER, bold=True),
                  Run("Every example is executed twice, with the optimizer and without, "
                      "and the two outputs must be byte-identical. A smaller program "
                      "that computes something else is not an optimization, and an "
                      "instruction count cannot tell the difference.", 8.8, INK)],
                 line=12)], anchor="ctr", pad=(0, 0, 0, 0))

    takeaway(s, "Shapes are checked once and then reused: the same facts that reject a "
                "bad program are what let a good one be optimized.")
    return s


# ==========================================================================
# 6 -- what is built
# ==========================================================================

def slide6():
    s = Slide()
    header(s, 6, "Current State",
           "What Is Already Built",
           "The whole pipeline runs today. Nothing on the previous slides is a plan.")

    # --- repository ---------------------------------------------------------
    y = card(s, M, 116, 258, 362, "Repository")
    code(s, M + 12, y + 2, 234, 258, [
        ("MatrixLang/", CODETEA),
        " |-- Makefile",
        " |-- README.md",
        (" |-- src/            15 modules", CODEFG),
        " |    |-- matrix.l    matrix.y",
        " |    |-- types.c     semantic.c",
        " |    |-- symtab.c    ast.c",
        " |    |-- tac.c       optimize.c",
        " |    |-- codegen.c   vm.c",
        " |    `-- value.c     diag.c",
        (" |-- examples/", CODEFG),
        " |    |-- phase1/     valid/",
        " |    `-- errors/     optimize/",
        (" |-- tests/          139 assertions", CODEFG),
        (" |-- demos/          one per review", CODEFG),
        (" |-- tools/          figure, docx, deck", CODEFG),
        (" `-- docs/", CODEFG),
        "",
        ("one command per review:", CODEDIM),
        ("make demo1  demo2  demo3", CODETEA),
    ], size=7.7, lead=11.6)

    s.line_h(M + 14, 416, 230, RULE, 1.0)
    s.text(M + 14, 426, 230, 46,
           [Para(Run("tools/ holds three generators: the architecture figure, the "
                     "Phase 1 document, and this deck. Each rebuilds from the "
                     "repository.", 7.8, MUTED), line=10.6)], pad=(0, 0, 0, 0))

    # --- pipeline checklist -------------------------------------------------
    y = card(s, 318, 116, 300, 230, "Implemented, end to end")
    items = [
        "Flex lexical analyser", "Bison LALR(1) parser",
        "Abstract syntax tree", "Symbol table with shapes",
        "Shape inference", "Dimension checking",
        "Diagnostics with detail", "Error recovery at ';'",
        "Three-address code", "Constant folding",
        "Common subexpr. elim.", "Copy propagation",
        "Dead code elimination", "Matrix algebra passes",
        "Target code generation", "Virtual machine",
    ]
    for i, it in enumerate(items):
        col, row = i % 2, i // 2
        xx = 318 + 14 + col * 138
        yy = y + 2 + row * 25
        s.text(xx, yy, 134, 22,
               [Para([Run(CHECK + "  ", 8.4, TEAL, bold=True),
                      Run(it, 8.2, BODY)], line=11)], pad=(0, 0, 0, 0))

    y = card(s, 318, 356, 300, 122, "One flag per stage")
    code(s, 332, y + 2, 272, 86, [
        ("--tokens    --ast       --symbols", CODEFG),
        ("--check     --tac       --optimize", CODEFG),
        ("--explain   --report    --target", CODEFG),
        ("--run       --trace     --stats", CODEFG),
        "",
        ("--phase1  --phase2  --phase3", CODETEA),
    ], size=8.0, lead=11.4)

    # --- numbers ------------------------------------------------------------
    y = card(s, 634, 116, 282, 230, "Measured")
    stat(s, 650, y + 6, 120, "139", "acceptance assertions,\nall passing")
    stat(s, 782, y + 6, 120, "0", "compiler warnings under\n-Wall -Wextra", accent=TEAL)
    s.line_h(650, y + 82, 252, RULE, 1.0)
    stat(s, 650, y + 96, 120, "0", "LALR(1) grammar\nconflicts", accent=TEAL)
    stat(s, 782, y + 96, 120, "3781", "lines of C, plus 320\nof Flex and Bison", accent=INK)

    y = card(s, 634, 356, 282, 122, "Instruction reduction")
    bars = [("algebra", 40.7), ("dce", 44.4), ("lit. identity", 40.0),
            ("cse", 12.5), ("chain", 0.0)]
    for i, (name, pct) in enumerate(bars):
        yy = y + 2 + i * 16
        s.text(648, yy, 66, 14, [Para(Run(name, 7.6, BODY), line=10)],
               anchor="ctr", pad=(0, 0, 0, 0))
        s.rect(716, yy + 3.5, 148, 8, fill=RULE)
        wpx = max(1.5, 148 * pct / 50.0)
        s.rect(716, yy + 3.5, wpx, 8, fill=TEAL if pct else MUTED)
        s.text(868, yy, 44, 14,
               [Para(Run(f"{pct:.1f}%", 7.6, INK if pct else MUTED, bold=True), line=10)],
               anchor="ctr", pad=(0, 0, 0, 0))
    s.text(648, y + 84, 254, 12,
           [Para(Run("chain.ml has nothing redundant, and the optimizer correctly "
                     "leaves it alone.", 7.4, MUTED, italic=True), line=10)],
           pad=(0, 0, 0, 0))

    takeaway(s, "The compiler is finished and demonstrable today; what remains is "
                "extension, not completion.")
    return s


# ==========================================================================
# 7 -- roadmap
# ==========================================================================

def slide7():
    s = Slide()
    header(s, 7, "Next",
           "What Comes Next",
           "The same pipeline, extended. Each step names the compiler work it "
           "actually requires.")

    y = card(s, M, 116, 424, 362, "Roadmap")
    steps = [
        ("1", "Control flow", "if and while turn one basic block into a control-flow "
                              "graph, and these local passes into global dataflow "
                              "analyses. The largest single step.", TEAL),
        ("2", "Matrix chain ordering", "(A*B)*C and A*(B*C) give the same result at very "
                                       "different cost. The compiler already knows every "
                                       "shape needed to choose.", AMBER),
        ("3", "Functions", "shape-polymorphic signatures, so a routine can accept "
                           "Matrix<m,n> rather than one fixed shape.", TEAL),
        ("4", "Real target code", "x86-64 or LLVM IR instead of a virtual machine, "
                                  "which introduces register allocation.", TEAL),
        ("5", "Generated test programs", "the optimized-equals-unoptimized check is far "
                                         "stronger against randomly generated programs "
                                         "than against a fixed corpus.", TEAL),
    ]
    yy = y + 4
    for num, title, desc, accent in steps:
        s.panel(M + 14, yy, 19, 19, fill=accent, radius=12000)
        s.text(M + 14, yy, 19, 19, [Para(Run(num, 8.6, "FFFFFF", bold=True), align="ctr")],
               anchor="ctr", pad=(0, 0, 0, 0))
        s.text(M + 42, yy - 1, 378, 16,
               [Para(Run(title, 9.6, INK, bold=True), line=12)], pad=(0, 0, 0, 0))
        s.text(M + 42, yy + 15, 378, 42,
               [Para(Run(desc, 8.3, BODY), line=11)], pad=(0, 0, 0, 0))
        yy += 66

    # --- right: the two that matter ----------------------------------------
    y = card(s, 492, 116, 424, 176, "1   " + DOT + "   Control flow, sketched")
    code(s, 506, y + 2, 396, 142, [
        ("scalar i = 0;", CODEFG),
        ("matrix Acc = zeros(3,3);", CODEFG),
        "",
        ("while (i < 10) {", CODETEA),
        ("    Acc = Acc + A * B;", CODEFG),
        ("    i   = i + 1;", CODEFG),
        ("}", CODETEA),
        "",
        ("A * B is loop-invariant. Hoisting it needs a loop,", CODEDIM),
        ("a CFG, and iterative liveness -- none of which", CODEDIM),
        ("the current single-block optimizer has.", CODEDIM),
    ], size=8.0, lead=11.0)

    y = card(s, 492, 302, 424, 176,
             "2   " + DOT + "   Matrix chain ordering", accent=AMBER)
    code(s, 506, y + 2, 396, 136, [
        ("matrix A[10,100];  matrix B[100,5];  matrix C[5,50];", CODEFG),
        ("matrix R = A * B * C;", CODEFG),
        "",
        ("(A*B)*C   10*100*5 + 10*5*50    =   7,500 mults", CODETEA),
        ("A*(B*C)   100*5*50 + 10*100*50  =  75,000 mults", CODEROS),
        "",
        ("A tenfold difference, decided entirely by shapes", CODEAMB),
        ("the compiler has already inferred. This is the", CODEAMB),
        ("clearest thing a scalar compiler could not do.", CODEAMB),
    ], size=8.0, lead=11.6)

    takeaway(s, "Every next step is bounded and stated as compiler work, not as a wish: "
                "the dependency each one has is named.")
    return s


# ==========================================================================
# 8 -- usefulness and originality
# ==========================================================================

def slide8():
    s = Slide()
    header(s, 8, "Contribution",
           "Usefulness, Originality and the Final System",
           "Static shape checking is not new. The contribution is carrying it through a "
           "complete compiler and then optimizing with it.")

    # --- useful -------------------------------------------------------------
    y = card(s, M, 116, 280, 244, "Why it is useful")
    for i, it in enumerate([
        "shape errors caught before anything runs",
        "the message names the rule, not just the types",
        "no runtime shape checks in generated code",
        "matrix identities removed automatically",
        "every phase inspectable from the command line",
        "one command per project review",
        "optimization proved to preserve meaning",
    ]):
        s.text(M + 14, y + 2 + i * 30, 252, 28,
               [Para([Run(CHECK + "  ", 8.6, TEAL, bold=True),
                      Run(it, 8.5, BODY)], line=11.4)], pad=(0, 0, 0, 0))

    # --- originality --------------------------------------------------------
    y = card(s, 340, 116, 280, 244, "What makes it original", accent=AMBER)
    parts = ["Shapes in the type system", "Inference through expressions",
             "Rules defined in one place", "Matrix-specific algebra",
             "Shape-driven instruction selection", "Verified-equivalent optimization"]
    yy = y + 2
    for i, p in enumerate(parts):
        s.panel(354, yy, 252, 22, fill=AMBERLT, radius=2000)
        s.text(354, yy, 252, 22, [Para(Run(p, 8.4, AMBER, bold=True), align="ctr")],
               anchor="ctr", pad=(0, 0, 0, 0))
        yy += 22
        if i < len(parts) - 1:
            s.text(354, yy, 252, 10, [Para(Run("+", 8.0, MUTED, bold=True), align="ctr")],
                   anchor="ctr", pad=(0, 0, 0, 0))
            yy += 10
    s.text(354, yy + 2, 252, 14,
           [Para(Run("none of these is novel alone", 7.6, MUTED, italic=True),
                 align="ctr")], pad=(0, 0, 0, 0))

    # --- final system -------------------------------------------------------
    y = card(s, 636, 116, 280, 244, "The final system")
    code(s, 650, y + 2, 252, 152, [
        ("source.ml", CODEAMB),
        ("   |", CODEDIM),
        ("   +-- lexer, parser, tree", CODEFG),
        ("   +-- symbol table, shapes", CODEFG),
        ("   +-- dimension checking", CODETEA),
        ("   +-- three-address code", CODEFG),
        ("   +-- optimizer x4", CODETEA),
        ("   +-- MVM target code", CODEFG),
        ("   +-- execution", CODEFG),
        ("   |", CODEDIM),
        ("printed result", CODEAMB),
    ], size=8.0, lead=12.4)
    s.text(650, y + 158, 252, 56,
           [Para(Run("All of it exists. The remaining work widens the language, it does "
                     "not finish the compiler.", 8.4, BODY), line=11.4)],
           pad=(0, 0, 0, 0))

    # --- closing ------------------------------------------------------------
    s.panel(M, 374, W, 100, fill=CARD, line=RULE)
    s.text(M + 24, 388, 560, 74,
           [Para(Run("The one idea, and what it paid for", 10.5, INK, bold=True,
                     font=SERIF), line=14),
            Para(Run("Putting a matrix's dimensions into its type is a single decision, "
                     "and it pays in three separate places: the semantic analyser gains "
                     "real work to do, the optimizer gains transformations a "
                     "general-purpose compiler cannot perform, and the code generator "
                     "gains instruction selection. That is the whole argument.",
                     8.8, BODY), line=12, before=5)], pad=(0, 0, 0, 0))
    s.rect(636, 392, 1.2, 66, fill=RULE)
    s.text(660, 390, 256, 72,
           [Para([Run("Built with   ", 8.4, MUTED),
                  Run("C, Flex, Bison", 8.4, INK, bold=True)], line=12),
            Para([Run("Verified by   ", 8.4, MUTED),
                  Run("139 assertions", 8.4, INK, bold=True)], line=12, before=3),
            Para([Run("Demonstrated by   ", 8.4, MUTED),
                  Run("make demo1/2/3", 8.4, INK, bold=True, font=MONO)],
                 line=12, before=3)], pad=(0, 0, 0, 0))

    takeaway(s, "The originality is not the idea of checking shapes; it is a complete, "
                "working compiler that checks them and then optimizes with them.")
    return s


# ==========================================================================

def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "docs/submission/MatrixLang-Deck.pptx"
    slides = [slide1(), slide2(), slide3(), slide4(),
              slide5(), slide6(), slide7(), slide8()]
    problems = 0
    for i, sl in enumerate(slides, 1):
        for msg in sl.check():
            print(f"  slide {i}: {msg}")
            problems += 1
    if problems:
        print(f"{problems} layout problem(s); fix before shipping.")
        return 1

    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    write(out, slides, "MatrixLang", "A Aswanth Raj", bg=PAPER)
    print(f"wrote {out}  ({len(slides)} slides, layout clean)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
