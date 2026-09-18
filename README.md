# MatrixLang

A **dimension-aware optimizing compiler** for a small matrix language.

In MatrixLang a value's type is not `matrix` — it is `Matrix<2x3>`. Shapes are
part of the type system, so the compiler rejects a multiplication whose
dimensions do not agree, infers the shape of every expression, and uses that
information again in the optimizer and the code generator.

```matrixlang
matrix A[2,3] = {{1, 2, 3},
                 {4, 5, 6}};

matrix B[3,4] = {{1, 0, 0, 1},
                 {0, 1, 0, 2},
                 {0, 0, 1, 3}};

matrix C = A * B;      // the compiler works out Matrix<2x4>

print(C);
```

```
C = Matrix<2x4>
  [  1  2  3 14 ]
  [  4  5  6 32 ]
```

Change `B` to `[5,4]` and nothing runs:

```
9:7: error [semantic] cannot multiply Matrix<2x3> by Matrix<5x4>
        left   : A -> Matrix<2x3>
        right  : B -> Matrix<5x4>
        rule   : columns(left) must equal rows(right)
        found  : 3 != 5
```

Shapes are not only a correctness device. Because every shape is known before
the program runs, the compiler can price an expression it has not executed:

```matrixlang
matrix A[100,2];  matrix B[2,100];  matrix C[100,2];
matrix R = A * B * C;
```

`*` is left associative, so the source asks for `(A * B) * C`, which builds a
100x100 intermediate and performs **69,800** scalar operations. The compiler
emits `A * (B * C)` instead, which performs **1,396**. Both forms are four
instructions, which is why this compiler reports arithmetic rather than
instruction counts.

---

## Status

Compiler Design Laboratory project. All three phases complete, plus a written
paper, a measured evaluation and a web demonstration.

| Phase | Scope | Demo |
| --- | --- | --- |
| **1** | Language design, grammar, architecture, lexer/parser prototype | `make demo1` |
| **2** | Lexer, parser, AST, symbol table, dimension checking, TAC | `make demo2` |
| **3** | Algebra, CSE, copy propagation, DCE, chain ordering, target code, VM | `make demo3` |

Build is warning-free under `-Wall -Wextra`, the grammar has no LALR(1)
conflicts, and the test suite is 141 assertions, all passing.

---

## Building

Needs **flex**, **bison**, **gcc** and **make**.

```bash
make
make test
```

### Windows / MSYS2

flex, bison and make come from MSYS2; gcc from mingw64. Put mingw64 **first**:

```bash
export PATH="/c/msys64/mingw64/bin:/c/msys64/usr/bin:$PATH"
make
```

The ordering is not cosmetic. If a conflicting runtime DLL is found earlier on
`PATH`, gcc's `cc1.exe` fails to start and gcc exits 1 with **no error message
at all**.

Missing tools: `pacman -S --needed flex bison make`.

`make toolchain` prints the three resolved tool paths — run it first when a build
misbehaves. See [docs/design.md](docs/design.md#build-environment) for the other
Windows trap (gcc's temporary directory).

---

## Using it

```bash
./bin/matrixc examples/valid/multiply.ml          # every stage
./bin/matrixc --phase1 examples/phase1/declare.ml # tokens + syntax verdict
./bin/matrixc --phase2 examples/valid/multiply.ml # through to TAC
./bin/matrixc --phase3 examples/optimize/chain_order.ml
```

Individual stages:

| Flag | Shows |
| --- | --- |
| `--tokens` | the token stream, classified and located |
| `--ast` | the syntax tree, annotated with inferred shapes |
| `--symbols` | the symbol table, with rows and columns |
| `--check` | diagnostics and the accept/reject verdict |
| `--tac` | three-address code |
| `--optimize` | run the optimizer and show the result |
| `--explain` | every transformation the optimizer applied, and why |
| `--report` | optimization statistics |
| `--cost` | arithmetic, in scalar operations, before and after |
| `--target` | MatrixLang VM code |
| `--run` | execute |
| `--trace` | execute, one instruction at a time |
| `--stats` | counts across all phases |

Individual optimizer passes: `--opt-algebraic`, `--opt-cse`, `--opt-copyprop`,
`--opt-dce`, `--opt-chain`.

**Exit status** is 0 when the program is valid, 1 when any error was reported,
2 for a usage problem.

---

## What makes it more than a toy

**Shapes are types.** `Matrix<2x3>` and `Matrix<3x2>` are different types.
Every operator has a shape rule, and they all live in one file
(`src/analysis/types.c`), consulted by both the semantic pass and the code
generator.

**Errors explain the rule.** Not "type error" — the operands as written, their
shapes, the rule violated, and what was found instead.

**Matrix-specific optimization.** Alongside CSE, copy propagation and dead code
elimination, the compiler tracks which values are identity matrices, which are
all zeros, and which came from a transpose, then rewrites accordingly:

```
A * I  ->  A          A + Z              ->  A
I * A  ->  A          A - Z              ->  A
A * 1  ->  A          A * 0              ->  zeros(r,c)
                      transpose(transpose(A)) -> A
```

A general-purpose optimizer cannot do these, because it does not know what a
matrix is. A hand-written `{{1,0},{0,1}}` is recognised as an identity too, so
literals optimize exactly like `identity(2)`.

**Shapes are a cost model.** `src/ir/cost.c` gives every instruction a price in
scalar operations — an `m x n` by `n x p` product costs `m p (2n-1)` — computed
from the shapes alone, before anything runs. `src/ir/chain.c` uses it to pick
the cheapest bracketing of a matrix chain by dynamic programming.

**Instruction selection uses the shapes.** One `*` in the source becomes
`MATMUL`, `MATSCALE` or `SCALMUL` depending on the inferred operand types.

**The optimizer is checked for meaning, not just size.** Every example, and
every generated program, runs both with and without optimization, and the
outputs must match byte for byte. This is how the one real optimizer bug this
project found was found: `0 - x => -x` is valid over the reals and unsound
under IEEE-754 signed zero. The rewrite was removed.

---

## Layout

The tree follows the phases of the compiler, so a file's directory says which
phase of the course it belongs to.

```
src/
  main.c              driver, CLI, stage selection, exit status
  frontend/           matrix.l, matrix.y, ast, tokens
  analysis/           types (the shape rules), symtab, semantic
  ir/                 tac, optimize, cost, chain
  backend/            codegen, vm, value
  support/            diag, util

examples/phase1/      the Phase 1 prototype demo, valid and invalid
examples/valid/       programs that must be accepted and run correctly
examples/errors/      programs that must be rejected, each documenting why
examples/optimize/    programs that exercise specific optimizations
demos/                one script per project review
tests/run_tests.sh    the acceptance suite (make test)

tools/                generators, each rebuilding one deliverable
  gen_programs.py             random, shape-correct MatrixLang programs
  run_experiments.py          differential, cost and chain measurements
  compare_baselines.py        phase presence against public teaching compilers
  plot_reduction.py           the paper's figure
  strip_anchors.py            the paper's submission source
  build-demo.py               demo/data.js
  deckkit.py                  a minimal PowerPoint writer
  build-deck.py               the review presentation
  build-architecture-figure.py, build-phase1-docx.js

results/              the recorded measurements, per program, both seeds
paper/                matrixlang.tex, matrixlang.pdf, figures
demo/                 the web demonstration (index.html + generated data.js)
docs/                 design, language reference, per-phase reports
  submission/         deliverables in the department's formats
```

---

## Measuring it

Every figure in the paper, the deck and the web demo is read from `results/` at
build time rather than typed in, so none of them can drift from the
measurement.

```bash
make measure    # regenerate results/ and the paper's figure
make paper      # paper/matrixlang.tex and paper/matrixlang.pdf
make deck       # docs/submission/MatrixLang-Deck.pptx
make web        # demo/data.js
make serve      # build the demo and serve it at 127.0.0.1:8731
```

`make measure` is deterministic: the generator is seeded, so re-running it
reproduces `results/` byte for byte.

What the measurements say, over 400 generated programs:

| | |
| --- | --- |
| arithmetic removed, median per program | **48.5%** (IQR 2.5–81.7) |
| instructions removed, same programs | **5.6%** (IQR 0.0–9.1) |
| programs with a chain worth re-bracketing | **79.8%** (319 of 400) |
| optimized and unoptimized output identical | **400 of 400** |

---

## Documentation

| Document | Contents |
| --- | --- |
| [paper/matrixlang.pdf](paper/matrixlang.pdf) | the paper: the argument, the evaluation and its limits |
| [docs/phase1-design.md](docs/phase1-design.md) | Review 1: abstract, problem statement, motivation, objectives, scope, background study, architecture, technology stack, prototype |
| [docs/phase2-implementation.md](docs/phase2-implementation.md) | Review 2: each frontend module, what it does, and its output |
| [docs/phase3-optimization.md](docs/phase3-optimization.md) | Review 3: the passes, measured results, target code, VM, testing and limitations |
| [docs/language-reference.md](docs/language-reference.md) | tokens, grammar, shape rules, every diagnostic, the VM instruction set |
| [docs/design.md](docs/design.md) | why the code is shaped the way it is |
| [docs/REPORT.md](docs/REPORT.md) | the final project report, in the chapter structure the lab manual specifies |
| [docs/README.md](docs/README.md) | an index of the above, and how to regenerate the figures and deliverables |

---

## Acknowledgement of tools

Flex and Bison generate the scanner and parser from `src/frontend/matrix.l` and
`src/frontend/matrix.y`. Everything else — the type system, symbol table,
semantic analysis, IR, optimizer, cost model, code generator and virtual
machine — is written for this project. No third-party libraries are used.

The measurement scripts and the deck and demo generators are Python, using only
the standard library, except `plot_reduction.py`, which uses matplotlib to draw
the paper's one figure.
