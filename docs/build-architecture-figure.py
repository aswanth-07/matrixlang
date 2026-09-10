"""Draw the MatrixLang architecture figure for the Phase 1 document.

Produces a greyscale block diagram at 3x supersampling so it stays crisp when
Word places it at about six inches wide. Nothing is coloured: the document is
printed in black and the figure has to survive that.

Routing rules that keep it readable:
  * the compilation spine runs straight down the centre;
  * everything the compiler *produces* sits in the right lane;
  * everything that *observes or drives* the pipeline sits in the left lane,
    on a single vertical channel so the lines never cross the spine;
  * the shape rules enter the spine below the centre line of a box, so they
    never collide with a right-lane arrow leaving the same box.

    python docs/build-architecture-figure.py docs/architecture.png
"""

import math
import sys
from PIL import Image, ImageDraw, ImageFont

S = 3                       # supersampling factor
W, H = 615, 400             # final size in points

BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
FILL_STAGE = (243, 243, 243)

FONT_DIR = "C:/Windows/Fonts/"


def font(name, size):
    return ImageFont.truetype(FONT_DIR + name, size * S)


F_TITLE = font("timesbd.ttf", 9)
F_FILE = font("times.ttf", 8)
F_EDGE = font("times.ttf", 7)

img = Image.new("RGB", (W * S, H * S), WHITE)
d = ImageDraw.Draw(img)


def box(x1, y1, x2, y2, title, sub=None, fill=FILL_STAGE, width=1):
    d.rectangle([x1 * S, y1 * S, x2 * S, y2 * S], fill=fill, outline=BLACK, width=width * S)
    cx = (x1 + x2) / 2 * S
    cy = (y1 + y2) / 2 * S
    if sub:
        d.text((cx, cy - 7 * S), title, font=F_TITLE, fill=BLACK, anchor="mm")
        d.text((cx, cy + 7 * S), sub, font=F_FILE, fill=BLACK, anchor="mm")
    else:
        d.text((cx, cy), title, font=F_TITLE, fill=BLACK, anchor="mm")


def line(x1, y1, x2, y2):
    d.line([x1 * S, y1 * S, x2 * S, y2 * S], fill=BLACK, width=S)


def arrow(x1, y1, x2, y2, head=5):
    line(x1, y1, x2, y2)
    ang = math.atan2(y2 - y1, x2 - x1)
    for sgn in (-1, 1):
        a = ang + sgn * 0.42
        d.line([x2 * S, y2 * S,
                (x2 - head * math.cos(a)) * S, (y2 - head * math.sin(a)) * S],
               fill=BLACK, width=S)


def label(x, y, text, anchor="mm"):
    d.text((x * S, y * S), text, font=F_EDGE, fill=BLACK, anchor=anchor)


# ---------------------------------------------------------------- spine
SX1, SX2 = 178, 408
CX = (SX1 + SX2) / 2
BH = 34
ys = [40, 88, 136, 184, 232, 280, 328]

stages = [
    ("Lexical Analysis", "matrix.l  (Flex)"),
    ("Syntax Analysis", "matrix.y  (Bison, LALR(1))"),
    ("Semantic Analysis", "semantic.c"),
    ("Intermediate Code", "tac.c"),
    ("Optimization", "optimize.c"),
    ("Code Generation", "codegen.c"),
    ("Execution", "vm.c,  value.c"),
]

box(245, 6, 341, 30, "source.ml", fill=WHITE)
arrow(CX, 30, CX, ys[0] - 1)

for (t, s), y in zip(stages, ys):
    box(SX1, y, SX2, y + BH, t, s)

edge = ["tokens", "syntax tree", "typed tree", "three-address code",
        "optimized code", "instructions"]
for i in range(len(ys) - 1):
    y1, y2 = ys[i] + BH, ys[i + 1] - 1
    arrow(CX, y1, CX, y2)
    label(CX + 6, (y1 + y2) / 2, edge[i], anchor="lm")

box(239, 366, 347, 392, "printed result", fill=WHITE)
arrow(CX, ys[-1] + BH, CX, 365)

# ---------------------------------------------------------------- right lane
RX1, RX2 = 448, 608
for idx, t, s in [(0, "Token table", "tokens.c"),
                  (1, "Syntax tree", "ast.c"),
                  (2, "Symbol table", "symtab.c")]:
    y = ys[idx] + 2
    box(RX1, y, RX2, y + 30, t, s, fill=WHITE)
    arrow(SX2, y + 15, RX1 - 1, y + 15)
    if idx == 2:
        # Semantic analysis populates the symbol table and queries it back.
        arrow(RX1 - 1, y + 15, SX2 + 1, y + 15)

# The shape rules are consulted by three separate stages. That is the single
# most important structural fact in the design, so the box is drawn heavier.
SRY = 244
box(RX1, SRY, RX2, SRY + 34, "Shape rules", "types.c", fill=WHITE, width=2)
CHAN = RX1 - 22
for target, off in ((2, 27), (4, 17), (5, 17)):
    y = ys[target] + off
    line(RX1, SRY + 17, CHAN, SRY + 17)
    line(CHAN, SRY + 17, CHAN, y)
    arrow(CHAN, y, SX2 + 1, y, head=4)
label((CHAN + RX2) / 2, SRY + 44, "one place decides what combines", anchor="mm")

# ---------------------------------------------------------------- left lane
LX1, LX2 = 8, 150
LCHAN = 163

box(LX1, 6, LX2, 30, "Driver", "main.c", fill=WHITE)
arrow(LX2 + 1, 18, 244, 18)
label(197, 12, "opens", anchor="mm")
label((LX1 + LX2) / 2, 40, "flags, stage selection,", anchor="mm")
label((LX1 + LX2) / 2, 51, "exit status", anchor="mm")

DY = 152
box(LX1, DY, LX2, DY + 34, "Diagnostics", "diag.c", fill=WHITE)
for idx in (0, 1, 2, 6):
    y = ys[idx] + 17
    line(SX1 - 1, y, LCHAN, y)
    line(LCHAN, y, LCHAN, DY + 17)
arrow(LCHAN, DY + 17, LX2 + 1, DY + 17, head=4)
label((LX1 + LX2) / 2, DY + 44, "lexical, syntax, semantic", anchor="mm")
label((LX1 + LX2) / 2, DY + 55, "and runtime errors,", anchor="mm")
label((LX1 + LX2) / 2, DY + 66, "printed in source order", anchor="mm")

# Ship at the supersampled size rather than downsampling. Word places this at
# about 6.2 inches wide, so 615 points would have been roughly 99 DPI and the
# labels would soften in print. At 3x it is close to 300 DPI.
img.save(sys.argv[1], dpi=(300, 300))
print("wrote", sys.argv[1])
