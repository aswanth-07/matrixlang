# MatrixLang — Final Project Report

**A dimension-aware optimizing compiler for a matrix language**

Compiler Design Laboratory · Individual Project

Chapter structure follows §24 of the lab manual.

---

## Chapter 1 — Introduction

Matrix computation is the arithmetic underneath graphics, simulation, signal
processing and machine learning. The operations are few — add, subtract,
multiply, transpose — but each carries a shape rule, and violating one is the
characteristic bug of the domain.

The languages people write matrix code in do not check those rules at compile
time. In C or Java a matrix is an array and its dimensions are ordinary
integers; nothing checks them, and a wrong shape is an out-of-bounds access or a
silently wrong answer. In Python with NumPy the check exists but happens at
runtime, after the data is loaded and the earlier stages of the computation have
already run.

Yet the information needed to catch these errors is present in the source. If
`A` is declared 2x3 and `B` is declared 5x4, then `A * B` is impossible — and
that is a fact about the program text, not about its input. A compiler could
know it.

This project builds a language and a compiler that do.

---

## Chapter 2 — Problem statement

**Matrix dimension errors are detectable at compile time, and are not detected
at compile time.**

Three consequences follow:

1. **Errors are found late.** A shape mismatch surfaces during execution,
   possibly after an expensive setup, possibly not at all if the shapes happen
   to align badly enough to produce a plausible wrong answer.
2. **Diagnostics are poor.** A runtime exception can report the two shapes it
   found. It cannot point at the operator in the source, name both operands as
   they were written, or state which rule was violated.
3. **Optimization opportunities are lost.** `A * I = A` is a theorem of linear
   algebra, but a compiler that does not model matrices cannot use it. Neither
   can it use `A + zeros(r,c) = A` or `transpose(transpose(A)) = A`.

---

## Chapter 3 — Objectives

1. Design a language whose type system carries matrix dimensions.
2. Implement lexical analysis with Flex.
3. Implement parsing with Bison, with error recovery.
4. Implement a symbol table recording kind, shape, scope and use.
5. Implement semantic analysis that infers and checks shapes, with diagnostics
   naming both operands and the rule.
6. Generate three-address code.
7. Implement common subexpression elimination and dead code elimination.
8. Implement matrix-specific algebraic optimization.
9. Generate target code for a virtual machine and execute it.
10. Produce an optimization report quantifying the improvement.
11. Validate with a test suite, including evidence that optimization preserves
    program meaning.

All eleven were met. Detail: [phase1-design.md](phase1-design.md#5-objectives).

---

## Chapter 4 — Background study

### Existing approaches

| System | Shape checking | Limitation for this purpose |
| --- | --- | --- |
| C / Java | none built in | matrix compatibility is not a rule of the language, so the check must be written by the program or library |
| NumPy | runtime | fails only when the operation executes |
| Idris, Agda | compile time, dependent types | expressive, but requires dependent or type-level programming |
| TVM and similar ML compilers | compile time, on computation graphs | operates on graphs, not on source text |

MatrixLang takes the idea shared by the last two — dimensions belong in the type
— and applies it in a small imperative language, where it can be implemented
completely and demonstrated end to end.

### Compiler concepts studied and applied

| Concept | Where it is used |
| --- | --- |
| Regular expressions, finite automata | `src/matrix.l` |
| Context-free grammars, LALR(1) parsing | `src/matrix.y` |
| Syntax-directed translation | AST built in semantic actions |
| Symbol table organisation | `src/symtab.c` |
| Type systems, type inference | `src/types.c`, `src/semantic.c` |
| Intermediate representations | `src/tac.c` |
| Local optimization: available expressions, liveness | `src/optimize.c` |
| Code generation, instruction selection | `src/codegen.c` |
| Interpretation | `src/vm.c` |
| Error detection and recovery | `src/diag.c`, `stmt: error ';'` |

---

## Chapter 5 — System design

```
    MatrixLang source
            |
     Lexical analysis      Flex          -> tokens, lexical errors
            |
     Syntax analysis       Bison         -> AST, syntax errors
            |
     Semantic analysis     symbol table  -> shapes inferred and checked
            |
     Intermediate code                   -> three-address code
            |
     Optimizer                           -> algebraic, CSE, copy prop, dead code
            |
     Target code                         -> MatrixLang VM instructions
            |
     Virtual machine                     -> execution and output
```

Module map and data flow:
[phase1-design.md](phase1-design.md#10-system-architecture).

The one structural decision worth stating here: **the shape rules live in a
single file**, `src/types.c`. Both the semantic analyser and the code generator
consult it. Written inline in the analyser instead, the code generator would
have had to re-derive "matrix product or scaling?" separately, and the two
derivations would eventually disagree.

---

## Chapter 6 — Methodology

Three phases, matching the manual, each ending at something that runs.

| Phase | Built | Ends at |
| --- | --- | --- |
| 1 | language specification, grammar, architecture, lexer + parser | source -> tokens -> valid/invalid |
| 2 | AST, symbol table, semantic analysis, TAC | source -> checked -> intermediate code |
| 3 | optimizer, code generator, VM, tests | source -> optimized -> executed |

Each review is demonstrated by one command (`make demo1`, `demo2`, `demo3`)
rather than a remembered combination of flags.

---

## Chapter 7 — Compiler Design concepts used

**Lexical analysis.** Flex scanner; keywords, identifiers, numbers with
exponents, operators, brackets, both comment forms; exact line and column on
every token; illegal characters and digit-leading identifiers reported.

**Syntax analysis.** Bison LALR(1) grammar, no conflicts (verified with
`-Wcounterexamples`). Precedence declarations disambiguate the expression rules.
Statement-level error recovery reports several syntax errors per run.

**Syntax tree.** Typed AST nodes annotated with inferred shapes; printed as a
tree by `--ast`.

**Symbol table.** A single hash table (djb2, 211 buckets); insert, lookup,
duplicate detection; stores each name's kind and shape. There is one scope,
because the language has no blocks or functions, and symbols are additionally
kept on an insertion-ordered list so the table prints in declaration order.

**Semantic analysis.** Shape inference through every expression; dimension
checking for `+`, `-`, `*` and `transpose`; store-compatibility checking;
compile-time constant folding for dimensions; poison typing to contain
cascading errors.

**Intermediate code.** Three-address code with temporaries, each instruction
carrying the shape it produces.

**Code optimization.** Constant folding, common subexpression elimination, copy
propagation, dead code elimination, and matrix-specific algebraic
simplification — run to a fixed point.

**Target code generation.** Instruction selection for a stack machine, choosing
between `MATMUL`, `MATSCALE` and `SCALMUL` from inferred operand types.

**Interpretation.** A virtual machine executes the generated code.

**Error handling.** Lexical, syntax, semantic and runtime errors all reported
through one collector, emitted in source order with counts.

---

## Chapter 8 — Implementation

**Language:** C (C11). **Tools:** Flex 2.6.4, Bison 3.8.2, GNU Make, gcc 15.2
with `-Wall -Wextra`. **No third-party libraries.**

Approximately 4,101 lines across 27 files.

| Module | File | Lines | Role |
| --- | --- | ---: | --- |
| Lexer | `matrix.l` | 119 | tokens, positions, lexical errors |
| Parser | `matrix.y` | 201 | grammar, AST construction, recovery |
| Shape rules | `types.c` | 108 | what combines with what, and into what |
| AST | `ast.c` | 206 | nodes, printer, expression rendering |
| Symbol table | `symtab.c` | 124 | hash table, shapes stored per name |
| Semantic analysis | `semantic.c` | 465 | inference, checking, diagnostics |
| Three-address code | `tac.c` | 359 | IR, interned operands, generation |
| Optimizer | `optimize.c` | 643 | four passes, property analysis, report |
| Code generator | `codegen.c` | 231 | instruction selection |
| Virtual machine | `vm.c` | 257 | stack machine, execution |
| Values | `value.c` | 249 | matrix arithmetic, literal pool |
| Diagnostics | `diag.c` | 133 | one collection point, source ordering |
| Driver | `main.c` | 291 | flags, stage selection, exit status |

### Algorithms

**Shape inference** — bottom-up over the expression tree. Each operator applies
its rule from `types.c` to the shapes of its operands.

**Available expressions (CSE)** — one forward scan holding a table of computed
expressions, each killed when any name it mentions is redefined. Exact here
because the program is a single basic block.

**Liveness (dead code elimination)** — one backward sweep. Nothing is live at
program exit, so only `print` keeps a computation alive.

**Matrix property analysis** — a forward scan recording, for each name, whether
it holds an identity matrix, a zero matrix, the constant 1 or 0, or the
transpose of some other value. Properties propagate through copies and are
invalidated on redefinition. This is what makes the matrix-specific rewrites
possible.

**Fixed-point driver** — the four passes repeat until a round changes nothing,
because deleting one instruction can expose another.

Per-module detail and rationale:
[phase2-implementation.md](phase2-implementation.md),
[phase3-optimization.md](phase3-optimization.md),
[design.md](design.md).

---

## Chapter 9 — Testing and results

`make test` runs 139 assertions; all pass. Each asserts **both** the exit status
and specific output text.

### Test coverage

| Area | Cases |
| --- | --- |
| Token classes and positions | `examples/phase1/`, `examples/valid/` |
| Syntax errors and recovery | `examples/errors/syntax.ml` |
| Lexical errors | `examples/errors/lexical.ml` |
| Shape inference in the AST | `multiply.ml`, `transpose.ml` |
| Symbol table contents | `multiply.ml`, `scalars.ml` |
| Multiplication mismatch | `mul_mismatch.ml` |
| Addition mismatch | `add_mismatch.ml` |
| Transpose of scalar, scalar+matrix, bad dimensions | `bad_shape.ml` |
| Ragged and wrong-shaped literals | `bad_literal.ml` |
| Undeclared, duplicate | `undeclared.ml`, `duplicate.ml` |
| TAC generation | `multiply.ml`, `chain.ml` |
| Each optimizer pass | `cse.ml`, `dce.ml`, `algebra.ml`, `literal_identity.ml` |
| Target code and all three multiply instructions | `multiply.ml`, `scalars.ml` |
| Execution results | checked against hand-computed matrices |
| Driver exit codes | 0 / 1 / 2 |

### Sample results

Valid program, executed:

```
$ ./bin/matrixc -q --optimize --run examples/valid/multiply.ml
C = Matrix<2x4>
  [  1  2  3 14 ]
  [  4  5  6 32 ]
```

Verified by hand: row 1 of `A` is `[1 2 3]`, column 4 of `B` is `[1 2 3]`, and
`1·1 + 2·2 + 3·3 = 14`.

Rejected program:

```
$ ./bin/matrixc --check examples/errors/mul_mismatch.ml
9:7: error [semantic] cannot multiply Matrix<2x3> by Matrix<5x4>
        left   : A -> Matrix<2x3>
        right  : B -> Matrix<5x4>
        rule   : columns(left) must equal rows(right)
        found  : 3 != 5
1 error(s), 0 warning(s).
```

Exit status 1; no target code generated.

### Optimization results

| Program | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| `algebra.ml` | 27 | 16 | **40.7%** |
| `dce.ml` | 9 | 5 | **44.4%** |
| `literal_identity.ml` | 5 | 3 | **40.0%** |
| `cse.ml` | 8 | 7 | 12.5% |
| `chain.ml` | 8 | 8 | 0.0% |

`chain.ml` contains nothing redundant and the optimizer correctly leaves it
alone. It is in the table deliberately: an optimizer that always reports an
improvement is not measuring anything.

### Correctness of optimization

For every example program, the suite runs it with and without the optimizer and
requires byte-identical output. All pass. This is the result that matters most:
a smaller program that computes something else would not be an optimization, and
instruction counts alone cannot tell the difference.

### Build quality

Zero warnings under `-Wall -Wextra`. Zero LALR(1) grammar conflicts under
`bison -Wcounterexamples`.

### Limitations

Stated in full in
[phase3-optimization.md](phase3-optimization.md#what-the-tests-do-not-cover):
no memory checking under a sanitizer; no large or pathological inputs; a fixed
rather than generated test corpus; one platform (Windows, mingw64 gcc 15.2);
floating-point results compared as printed text.

---

## Chapter 10 — Conclusion

MatrixLang is a complete compiler: source text to tokens, to a syntax tree, to a
checked and shape-annotated program, to intermediate code, through four
optimization passes, to target code, to execution. Every phase named in the
Compiler Design syllabus appears in it and does real work.

The design rests on a single decision — that a matrix's dimensions belong in its
type — and that decision pays in three separate places. The **semantic analyser**
gains genuine content: it infers shapes through expressions and rejects
impossible operations with diagnostics naming both operands and the rule
violated. The **optimizer** gains transformations no general-purpose optimizer
can perform, because folding `A * I` away requires knowing that a value is an
identity matrix. The **code generator** gains instruction selection: one `*` in
the source becomes one of three machine instructions, chosen from the inferred
types.

The measured result is a 40–44% instruction reduction on programs containing
redundancy, 0% on a program containing none, and byte-identical execution output
with and without optimization on every test program.

---

## Chapter 11 — Future enhancements

1. **Control flow.** `if` and `while` would turn a program from one basic block
   into a control-flow graph and turn these local passes into global dataflow
   analyses. The natural next step, and a substantial one.
2. **Matrix chain ordering.** `(A*B)*C` and `A*(B*C)` compute the same result at
   very different cost, and the compiler already knows every shape needed to
   choose between them. This is the most valuable matrix-specific optimization
   not implemented, and the one most clearly beyond what a scalar compiler could
   do.
3. **Loop-invariant code motion**, once loops exist.
4. **Functions**, with shape-polymorphic signatures.
5. **Real target code** — x86-64 or LLVM IR instead of a virtual machine, which
   would introduce register allocation.
6. **Generated test programs** for the optimized-equals-unoptimized check, which
   would strengthen it considerably.

---

## References

1. Aho, Lam, Sethi, Ullman. *Compilers: Principles, Techniques, and Tools*,
   2nd ed. — lexical analysis, LALR parsing, syntax-directed translation,
   symbol tables, intermediate code, and the local optimization algorithms
   (available expressions, liveness) used in `src/optimize.c`.
2. Levine. *flex & bison*, O'Reilly — scanner and parser specification,
   `%destructor`, error recovery.
3. Flex manual, `https://westes.github.io/flex/manual/`
4. Bison manual, `https://www.gnu.org/software/bison/manual/`
5. Golub and Van Loan. *Matrix Computations*, 4th ed. — the algebraic identities
   the matrix-specific optimizations implement.
6. NumPy documentation, broadcasting and shape rules — the runtime-checking
   behaviour this project contrasts with.

---

## Appendix A — Building and running

```bash
make          # build
make test     # 139 assertions
make demo1    # Review 1 demonstration
make demo2    # Review 2 demonstration
make demo3    # Review 3 demonstration
```

Full flag list: `./bin/matrixc --help`, or the table in
[../README.md](../README.md#using-it).

## Appendix B — Language summary

Tokens, grammar, shape rules, every diagnostic, and the virtual machine
instruction set: [language-reference.md](language-reference.md).

## Appendix C — Use of AI assistance

AI assistance was used during development for exploring approaches, drafting
and reviewing code, and preparing documentation, as permitted under §19 of the
lab manual. All design decisions recorded in [design.md](design.md) — the
no-control-flow scope choice, declaration-as-initialisation, the rejection of
broadcasting, compile-time-only dimensions, the stack-machine target, and the
structure of the property analysis that enables the matrix-specific rewrites —
are choices made for this project and are explained there with their reasoning.
The implementation has been read, built, tested and validated as a whole, and
every module, algorithm and test result reported here can be explained and
modified on request.
