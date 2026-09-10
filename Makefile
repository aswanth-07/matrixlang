# MatrixLang -- build.
#
# Requires flex, bison, gcc and make.
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

CFLAGS  ?= -std=c11 -Wall -Wextra -O2 -Isrc -Ibuild
LDFLAGS ?=
LDLIBS  ?= -lm

SRCDIR   := src
BUILDDIR := build
BINDIR   := bin

CORE_SRC := $(SRCDIR)/util.c $(SRCDIR)/diag.c $(SRCDIR)/types.c \
            $(SRCDIR)/value.c $(SRCDIR)/ast.c $(SRCDIR)/symtab.c \
            $(SRCDIR)/tokens.c $(SRCDIR)/semantic.c $(SRCDIR)/tac.c \
            $(SRCDIR)/optimize.c $(SRCDIR)/codegen.c $(SRCDIR)/vm.c \
            $(SRCDIR)/main.c

CORE_OBJ := $(patsubst $(SRCDIR)/%.c,$(BUILDDIR)/%.o,$(CORE_SRC))
GEN_OBJ  := $(BUILDDIR)/matrix.tab.o $(BUILDDIR)/lex.yy.o

MATRIXC  := $(BINDIR)/matrixc

.PHONY: all clean test dirs tools demo1 demo2 demo3

all: dirs $(MATRIXC)

dirs:
	@mkdir -p $(BUILDDIR) $(BINDIR)

tools:
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
$(BUILDDIR)/matrix.tab.c $(BUILDDIR)/matrix.tab.h: $(SRCDIR)/matrix.y | dirs
	$(BISON) -d -Wcounterexamples -o $(BUILDDIR)/matrix.tab.c $(SRCDIR)/matrix.y

$(BUILDDIR)/lex.yy.c: $(SRCDIR)/matrix.l $(BUILDDIR)/matrix.tab.h | dirs
	$(FLEX) -o $(BUILDDIR)/lex.yy.c $(SRCDIR)/matrix.l

# Generated C compiles without -Wextra: flex and bison emit code that trips
# warnings we cannot fix and do not want drowning out our own.
$(BUILDDIR)/matrix.tab.o: $(BUILDDIR)/matrix.tab.c
	$(CC) -std=c11 -O2 -I$(SRCDIR) -I$(BUILDDIR) -c $< -o $@

$(BUILDDIR)/lex.yy.o: $(BUILDDIR)/lex.yy.c $(BUILDDIR)/matrix.tab.h
	$(CC) -std=c11 -O2 -I$(SRCDIR) -I$(BUILDDIR) -c $< -o $@

# ---- hand-written sources ---------------------------------------------------

$(BUILDDIR)/%.o: $(SRCDIR)/%.c | dirs
	$(CC) $(CFLAGS) -c $< -o $@

$(CORE_OBJ): $(BUILDDIR)/matrix.tab.h

# ---- link -------------------------------------------------------------------

$(MATRIXC): $(CORE_OBJ) $(GEN_OBJ)
	$(CC) $(CFLAGS) -o $@ $^ $(LDFLAGS) $(LDLIBS)

# ---- review demos -----------------------------------------------------------
# One command per project review, so a demonstration never depends on
# remembering a flag combination.

demo1: all
	@bash demos/phase1.sh

demo2: all
	@bash demos/phase2.sh

demo3: all
	@bash demos/phase3.sh

# ---- housekeeping -----------------------------------------------------------

test: all
	@bash tests/run_tests.sh

clean:
	rm -rf $(BUILDDIR) $(BINDIR)
