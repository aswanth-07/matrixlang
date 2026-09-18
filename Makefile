# MatrixLang -- build.
#
# Requires flex, bison, gcc and make.
#
# src/ is organised by compiler phase and the build reflects that: every source
# file lives under the phase it belongs to, and the include path lists those
# directories rather than threading relative paths through the sources.
#
#   frontend/  lexical and syntax analysis, and the tree they build
#   analysis/  the type lattice, the symbol table, shape inference and checking
#   ir/        three-address code and the optimizer
#   backend/   the cost model, code generation, the virtual machine, values
#   support/   diagnostics and allocation, used by every phase
#
# On this machine flex/bison/make come from MSYS2 and gcc is mingw64, so the
# tool paths fall back to the MSYS2 location when the tools are not on PATH.
# Override any of them on the command line:
#
#     make FLEX=/usr/bin/flex BISON=/usr/bin/bison CC=clang

FLEX  ?= $(shell command -v flex  2>/dev/null || echo /c/msys64/usr/bin/flex)
BISON ?= $(shell command -v bison 2>/dev/null || echo /c/msys64/usr/bin/bison)

# make defines CC=cc as a built-in, so "CC ?= gcc" would never fire. Only
# override it when nothing outside the Makefile has chosen a compiler.
ifeq ($(origin CC),default)
CC := gcc
endif

# GCC writes intermediate .s files to a temporary directory. On Windows TMP and
# TEMP do not survive into make's child processes, and gcc then falls back to
# C:\Windows, which is not writable -- the build dies with "Cannot create
# temporary file". Pointing it inside build/ removes the dependency on the
# ambient environment. cygpath -m gives the C:/... form a native gcc accepts.
TMPDIR := $(shell mkdir -p build/tmp && { cygpath -m "$(CURDIR)/build/tmp" 2>/dev/null || echo "$(CURDIR)/build/tmp"; })
export TMPDIR
export TMP  := $(TMPDIR)
export TEMP := $(TMPDIR)

SRCDIR   := src
BUILDDIR := build
BINDIR   := bin

PHASES   := frontend analysis ir backend support
INCLUDES := -I$(SRCDIR) $(addprefix -I$(SRCDIR)/,$(PHASES)) -I$(BUILDDIR)

CFLAGS  ?= -std=c11 -Wall -Wextra -O2 $(INCLUDES)
LDFLAGS ?=
LDLIBS  ?= -lm

# Every hand-written .c under src/, whichever phase it lives in.
CORE_SRC := $(wildcard $(SRCDIR)/*.c) $(foreach p,$(PHASES),$(wildcard $(SRCDIR)/$(p)/*.c))
CORE_OBJ := $(patsubst $(SRCDIR)/%.c,$(BUILDDIR)/%.o,$(CORE_SRC))
GEN_OBJ  := $(BUILDDIR)/matrix.tab.o $(BUILDDIR)/lex.yy.o

MATRIXC  := $(BINDIR)/matrixc

.PHONY: all clean test dirs toolchain demo1 demo2 demo3 deck web serve measure paper

all: dirs $(MATRIXC)

dirs:
	@mkdir -p $(BUILDDIR) $(BINDIR) $(addprefix $(BUILDDIR)/,$(PHASES))

toolchain:
	@echo "FLEX  = $(FLEX)"
	@echo "BISON = $(BISON)"
	@echo "CC    = $(CC)"
	@$(FLEX)  --version
	@$(BISON) --version | head -1
	@$(CC)    --version | head -1

# ---- generated frontend -----------------------------------------------------

# -d writes matrix.tab.h (the token codes the scanner includes).
# -Wcounterexamples makes any grammar conflict explain itself rather than being
# reported as a bare number.
$(BUILDDIR)/matrix.tab.c $(BUILDDIR)/matrix.tab.h: $(SRCDIR)/frontend/matrix.y | dirs
	$(BISON) -d -Wcounterexamples -o $(BUILDDIR)/matrix.tab.c $(SRCDIR)/frontend/matrix.y

$(BUILDDIR)/lex.yy.c: $(SRCDIR)/frontend/matrix.l $(BUILDDIR)/matrix.tab.h | dirs
	$(FLEX) -o $(BUILDDIR)/lex.yy.c $(SRCDIR)/frontend/matrix.l

# Generated C compiles without -Wextra: flex and bison emit code that trips
# warnings we cannot fix and do not want drowning out our own.
$(BUILDDIR)/matrix.tab.o: $(BUILDDIR)/matrix.tab.c
	$(CC) -std=c11 -O2 $(INCLUDES) -c $< -o $@

$(BUILDDIR)/lex.yy.o: $(BUILDDIR)/lex.yy.c $(BUILDDIR)/matrix.tab.h
	$(CC) -std=c11 -O2 $(INCLUDES) -c $< -o $@

# ---- hand-written sources ---------------------------------------------------

$(BUILDDIR)/%.o: $(SRCDIR)/%.c | dirs
	$(CC) $(CFLAGS) -c $< -o $@

$(CORE_OBJ): $(BUILDDIR)/matrix.tab.h

# ---- link -------------------------------------------------------------------

$(MATRIXC): $(CORE_OBJ) $(GEN_OBJ)
	$(CC) $(CFLAGS) -o $@ $^ $(LDFLAGS) $(LDLIBS)

# ---- review demonstrations --------------------------------------------------

demo1: all
	@bash demos/phase1.sh

demo2: all
	@bash demos/phase2.sh

demo3: all
	@bash demos/phase3.sh

# ---- deliverables -----------------------------------------------------------

# Every figure in the deck, the paper's figure and the web demo is read
# from results/ rather than typed in, so `make measure` is the only thing
# that can change any of them.

measure: all
	python tools/run_experiments.py --out results/seed1 --seed 1
	python tools/run_experiments.py --out results/seed2 --seed 2
	python tools/plot_reduction.py --data results --out paper/figures/reduction.pdf

deck:
	python tools/build-deck.py docs/submission/MatrixLang-Deck.pptx

# paper/matrixlang.tex is the paper; the PDF is built from it. The author
# keeps a local working draft with one annotation per stated figure, tying
# it to the measurement it reports; when that draft is present its
# annotations are stripped into matrixlang.tex first. A clone has only the
# paper, and this target rebuilds its PDF.
paper:
	@if [ -f tools/strip_anchors.py ]; then python tools/strip_anchors.py paper/main.tex paper/matrixlang.tex; fi
	cd paper && pdflatex -interaction=nonstopmode -halt-on-error matrixlang.tex
	cd paper && pdflatex -interaction=nonstopmode -halt-on-error matrixlang.tex
	cd paper && rm -f *.aux *.log *.out

web: all
	python tools/build-demo.py

serve: web
	@echo "http://127.0.0.1:8731/"
	python -m http.server 8731 --directory demo --bind 127.0.0.1

# ---- housekeeping -----------------------------------------------------------

test: all
	@bash tests/run_tests.sh

clean:
	rm -rf $(BUILDDIR) $(BINDIR)
