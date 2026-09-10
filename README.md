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

---

## Status

Compiler Design Laboratory project. All three phases complete.

| Phase | Scope | Demo |
| --- | --- | --- |
| **1** | Language design, grammar, architecture, lexer/parser prototype | `make demo1` |
| **2** | Lexer, parser, AST, symbol table, dimension checking, TAC | `make demo2` |
| **3** | CSE, dead code elimination, matrix algebra, target code, VM | `make demo3` |

Build is warning-free under `-Wall -Wextra`, the grammar has no LALR(1)
conflicts, and the test suite is 139 assertions, all passing.

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

`make tools` prints the three resolved tool paths — run it first when a build
misbehaves. See [docs/design.md](docs/design.md#build-environment) for the other
Windows trap (gcc's temporary directory).

---

## Using it

```bash
./bin/matrixc examples/valid/multiply.ml          # every stage
./bin/matrixc --phase1 examples/phase1/declare.ml # tokens + syntax verdict
./bin/matrixc --phase2 examples/valid/multiply.ml # through to TAC
./bin/matrixc --phase3 examples/optimize/algebra.ml
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
| `--target` | MatrixLang VM code |
| `--run` | execute |
| `--trace` | execute, one instruction at a time |
| `--stats` | counts across all phases |

Individual optimizer passes: `--opt-algebraic`, `--opt-cse`, `--opt-copyprop`,
`--opt-dce`.

**Exit status** is 0 when the program is valid, 1 when any error was reported,
2 for a usage problem.

---

## What makes it more than a toy

**Shapes are types.** `Matrix<2x3>` and `Matrix<3x2>` are different types.
Every operator has a shape rule, and they all live in one file
(`src/types.c`), consulted by both the semantic pass and the code generator.

**Errors explain the rule.** Not "type error" — the operands as written, their
shapes, the rule violated, and what was found instead.

**Matrix-specific optimization.** Alongside CSE and dead code elimination, the
compiler tracks which values are identity matrices, which are all zeros, and
which came from a transpose, then rewrites accordingly:

```
A * I  ->  A          A + Z              ->  A
I * A  ->  A          A - Z              ->  A
A * 1  ->  A          A * 0              ->  zeros(r,c)
                      transpose(transpose(A)) -> A
```

A general-purpose optimizer cannot do these, because it does not know what a
matrix is. A hand-written `{{1,0},{0,1}}` is recognised as an identity too, so
literals optimize exactly like `identity(2)`.

**Instruction selection uses the shapes.** One `*` in the source becomes
`MATMUL`, `MATSCALE` or `SCALMUL` depending on the inferred operand types.

**The optimizer is checked for meaning, not just size.** Every example runs both
with and without optimization and the outputs must match byte for byte.

---

## Layout

```
src/
  matrix.l        Flex lexical analyser
  matrix.y        Bison LALR(1) grammar; builds the AST
  types.{h,c}     the shape rules -- one place decides what combines with what
  ast.{h,c}       AST nodes, tree printer, expression rendering for diagnostics
  symtab.{h,c}    symbol table: hash table, shapes stored per name
  semantic.{h,c}  shape inference and dimension checking
  tac.{h,c}       three-address code
  optimize.{h,c}  four passes, run to a fixed point
  codegen.{h,c}   MatrixLang VM target code
  vm.{h,c}        the virtual machine
  value.{h,c}     matrix arithmetic and the compile-time literal pool
  tokens.{h,c}    token-stream recording, for the token table
  diag.{h,c}      every error and warning, in source order
  util.{h,c}      checked allocation
  main.c          driver and CLI

examples/phase1/   the Phase 1 prototype demo, valid and invalid
examples/valid/    programs that must be accepted and run correctly
examples/errors/   programs that must be rejected, each documenting why
examples/optimize/ programs that exercise specific optimizations
demos/             one script per project review
tests/run_tests.sh the acceptance suite (make test)
docs/              design, language reference, per-phase reports
```

---

## Documentation

| Document | Contents |
| --- | --- |
| [docs/phase1-design.md](docs/phase1-design.md) | Review 1: abstract, problem statement, motivation, objectives, scope, background study, architecture, technology stack, prototype |
| [docs/phase2-implementation.md](docs/phase2-implementation.md) | Review 2: each frontend module, what it does, and its output |
| [docs/phase3-optimization.md](docs/phase3-optimization.md) | Review 3: the passes, measured results, target code, VM, testing and limitations |
| [docs/language-reference.md](docs/language-reference.md) | tokens, grammar, shape rules, every diagnostic, the VM instruction set |
| [docs/design.md](docs/design.md) | why the code is shaped the way it is |
| [docs/REPORT.md](docs/REPORT.md) | the final project report, in the chapter structure the lab manual specifies |

---

## Acknowledgement of tools

Flex and Bison generate the scanner and parser from `src/matrix.l` and
`src/matrix.y`. Everything else — the type system, symbol table, semantic
analysis, IR, optimizer, code generator and virtual machine — is written for
this project. No third-party libraries are used.
