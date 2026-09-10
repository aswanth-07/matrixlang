# Phase 1 — Problem Definition and Design

The Review 1 deliverable. Section numbering follows §8.3 of the lab manual.

Demonstration: `make demo1`

---

## 1. Project title

**MatrixLang — a dimension-aware optimizing compiler for a matrix language**

---

## 2. Abstract

MatrixLang is a small programming language for matrix computation, together
with a complete compiler for it. Its distinguishing feature is that matrix
dimensions are part of the type system: a value's type is not `matrix` but
`Matrix<2x3>`, and every operation is checked against the shape rules of linear
algebra during compilation. A program that would multiply a 2x3 matrix by a 5x4
matrix is rejected with an explanation, before a single element has been
computed.

The compiler implements the full pipeline — lexical analysis with Flex, parsing
with Bison, an abstract syntax tree, a symbol table carrying shapes, semantic
analysis, three-address code, four optimization passes, target code generation
for a matrix virtual machine, and execution. Alongside the standard
optimizations it implements a set of **matrix-specific algebraic
simplifications** that a general-purpose optimizer cannot perform, because they
depend on knowing that a value is an identity matrix, a zero matrix, or the
transpose of a transpose.

---

## 3. Problem statement

Shape errors are the characteristic bug of matrix code, and in the languages
people actually use for it they are found late:

- In **C or Java**, a matrix is an array and its dimensions are ordinary
  integers. Nothing checks them. A wrong shape is an out-of-bounds access, a
  silently wrong answer, or a crash somewhere far from the mistake.
- In **Python with NumPy**, the check happens, but at runtime — after the data
  is loaded, after the earlier stages of the computation have run, possibly
  minutes into a job.

In both cases the information needed to catch the error is present in the
source. `A` was declared 2x3 and `B` was declared 5x4; that `A * B` is
impossible is a fact about the program text, not about its input. No mainstream
language uses it.

**The problem this project addresses: matrix dimension errors are detectable at
compile time, and are not detected at compile time.**

---

## 4. Motivation

Three reasons this is worth building as a compiler project.

**It puts real work in the semantic analyser.** In a typical toy language,
semantic analysis checks that `int` is not assigned to `bool` — a comparison of
two enum values. Here, type checking means propagating shapes through
expressions, inferring the result of a product from its operands, and producing
a diagnostic that explains a rule of linear algebra. The phase carries genuine
weight rather than being a formality between parsing and code generation.

**It gives the optimizer something a general optimizer cannot do.** Constant
folding and dead code elimination are the same in every compiler. But `A * I = A`
is a fact about matrices, and exploiting it requires the compiler to track which
values are identity matrices — an analysis that has no counterpart in a scalar
language. That is where this project's originality lies.

**Errors can be genuinely helpful.** When shapes are known at compile time, the
compiler can say exactly which rule was violated and what it found instead. That
is a large usability difference over a runtime exception, and it is only possible
because of the design.

---

## 5. Objectives

1. Design a language whose type system carries matrix dimensions.
2. Implement lexical analysis with Flex, recognising every token class and
   reporting lexical errors with position.
3. Implement parsing with Bison, building an AST, with error recovery that
   reports several syntax errors per run.
4. Implement a symbol table recording each name's kind, shape, scope and use.
5. Implement semantic analysis that infers the shape of every expression and
   rejects every operation whose shapes do not combine, with a diagnostic naming
   both operands and the rule.
6. Generate three-address code.
7. Implement common subexpression elimination and dead code elimination.
8. Implement matrix-specific algebraic simplification: `A*I`, `I*A`, `A+0`,
   `A-0`, `A*1`, `A*0`, `transpose(transpose(A))`.
9. Generate target code for a matrix virtual machine and execute it.
10. Produce an optimization report quantifying the improvement.
11. Validate with a test suite covering valid programs, every error class, and
    the equivalence of optimized and unoptimized execution.

---

## 6. Scope

### In scope

| | |
| --- | --- |
| Types | `scalar`, `matrix` with compile-time dimensions |
| Operations | `+`, `-`, `*`, unary `-`, `transpose()` |
| Constructors | matrix literals, `identity()`, `zeros()`, `ones()` |
| Statements | declaration, assignment, `print` |
| Compiler phases | all of them, through to execution |

### Deliberately out of scope

- **Control flow** — no `if`, no loops. With straight-line code the whole
  program is one basic block, which makes the optimizations exact without any
  control-flow graph or dataflow iteration. The marks here come from
  dimension-aware semantics and matrix optimization, and control flow would add
  bulk without adding either.
- **Functions.** Same reasoning.
- **Runtime-sized matrices.** Compile-time shapes are the premise; a dimension
  read from input would defeat the entire design.
- **Strings, booleans, integer/float distinction.** Each would ripple through
  the type rules, the IR, the instruction set and the VM in exchange for no
  compiler-design content.
- **Numerical performance.** Matrix multiplication is the textbook triple loop.
  This is a compiler project, not a BLAS.

---

## 7. Background study

| Area | What was studied | Where it is used |
| --- | --- | --- |
| Regular expressions, finite automata | token specification | `src/matrix.l` |
| Context-free grammars, LALR(1) parsing | grammar design, conflict resolution | `src/matrix.y` |
| Syntax-directed translation | AST construction in semantic actions | `src/matrix.y` |
| Symbol table organisation | hash tables, insertion-ordered storage | `src/symtab.c` |
| Type systems and type inference | shapes as types, inference through expressions | `src/semantic.c` |
| Intermediate representations | three-address code, temporaries | `src/tac.c` |
| Local optimization | available expressions, liveness, algebraic identities | `src/optimize.c` |
| Code generation for stack machines | instruction selection from types | `src/codegen.c` |

Existing systems considered: NumPy (runtime shape checking, the behaviour this
project improves on); the dependent-type systems of Idris and Agda, where
dimensions in types are standard but the languages are inaccessible to most
programmers; and the shape inference in ML compilers such as TVM, which operates
on computation graphs rather than on source text. MatrixLang takes the idea
those systems share — dimensions belong in the type — and applies it in a small
imperative language where it can be implemented completely.

---

## 8. Compiler Design concepts involved

| Concept | How it appears |
| --- | --- |
| Lexical analysis | Flex scanner, token classes, position tracking, lexical errors |
| Syntax analysis | Bison LALR(1) grammar, precedence, error recovery at `;` |
| Abstract syntax tree | typed nodes, uniform child vectors, tree printing |
| Symbol table | hash table, insert/lookup, duplicate detection, shape storage |
| Semantic analysis | shape inference, dimension checking, constant folding for dimensions |
| Intermediate code | three-address code with temporaries, typed instructions |
| Code optimization | CSE, dead code elimination, copy propagation, algebraic simplification |
| Target code generation | instruction selection for a stack machine |
| Interpretation | the virtual machine executes the generated code |
| Error handling | lexical, syntax, semantic and runtime errors through one reporter |

---

## 9. Proposed methodology

```
    MatrixLang source
            |
            v
    +---------------------+
    |  Lexical analysis   |   Flex        -> token stream, lexical errors
    +---------------------+
            |
            v
    +---------------------+
    |  Syntax analysis    |   Bison       -> AST, syntax errors
    +---------------------+
            |
            v
    +---------------------+
    |  Semantic analysis  |   symbol table, shape inference,
    |                     |   dimension checking
    +---------------------+
            |
            v
    +---------------------+
    |  Intermediate code  |   three-address code
    +---------------------+
            |
            v
    +---------------------+
    |     Optimizer       |   algebraic -> CSE -> copy propagation
    |                     |   -> dead code, repeated to a fixed point
    +---------------------+
            |
            v
    +---------------------+
    |  Target code gen    |   MatrixLang VM instructions
    +---------------------+
            |
            v
    +---------------------+
    |   Virtual machine   |   execution and output
    +---------------------+
```

Development followed the three phases: design and prototype, then the core
frontend and IR, then optimization and the backend. Each phase ends at something
that runs.

---

## 10. System architecture

```
 src/matrix.l ---- tokens ----> src/matrix.y ---- AST ----> src/semantic.c
      |                              |                            |
      v                              v                            v
 src/tokens.c                   src/ast.c                   src/symtab.c
 (token table                   (tree, printer,             (hash table per
  for display)                   shape annotation)           scope, shapes)
                                                                  |
                                                                  v
                                                             src/types.c
                                                       (the shape rules live
                                                        here, in one place)
                                                                  |
                                    +-----------------------------+
                                    v
                               src/tac.c  ---- three-address code
                                    |
                                    v
                             src/optimize.c ---- four passes to a fixed point
                                    |
                                    v
                              src/codegen.c ---- MVM instructions
                                    |
                                    v
                                src/vm.c  ---- execution
                                    |
                                    v
                               src/value.c
                        (matrix arithmetic and the
                         compile-time literal pool)

 src/diag.c    every phase reports here, so messages come out in source order
 src/main.c    the driver: flags, stage selection, exit status
```

The shape rules are deliberately isolated in `src/types.c` rather than spread
through the analyser. There is exactly one place that decides whether `A * B` is
legal and what shape it produces, and both the semantic pass and the code
generator consult it.

---

## 11. Technology stack

| Component | Choice | Why |
| --- | --- | --- |
| Implementation language | C (C11) | the manual's first recommendation; direct fit with Flex and Bison |
| Lexical analyser generator | Flex 2.6.4 | the standard tool, named in the manual |
| Parser generator | Bison 3.8.2 | LALR(1) handles this grammar as written |
| Build | GNU Make | one command from clean tree to binary |
| Compiler | gcc 15.2 (mingw64), `-Wall -Wextra` | warning-free build as a standing requirement |
| Testing | bash script, 139 assertions | asserts exit status *and* output text |
| Version control | Git | one commit per phase |

No third-party libraries. Everything outside Flex, Bison and the C standard
library is written for this project.

---

## 12. Initial prototype

The Phase 1 prototype is the front of the pipeline: source text in, classified
token stream out, syntax verdict out.

```
$ ./bin/matrixc --phase1 examples/phase1/declare.ml
```

```
#     TOKEN         LEXEME            LINE:COL
----  ------------  ----------------  --------
1     MATRIX        matrix            4:1
2     IDENTIFIER    A                 4:8
3     LBRACKET      [                 4:9
4     NUMBER        2                 4:10
5     COMMA         ,                 4:11
6     NUMBER        3                 4:12
7     RBRACKET      ]                 4:13
8     SEMICOLON     ;                 4:14
...
16 token(s).

Syntax: VALID
```

and on malformed input — `bad.ml` is two lines, `matrix A[2,3;` and
`matrix 4B[2,2];`:

```
$ ./bin/matrixc --phase1 examples/phase1/bad.ml

... token table elided ...

(skipping semantic analysis: the source did not parse)

1:13: error [syntax] syntax error, unexpected ';', expecting ']'
2:8: error [lexical] malformed number or identifier '4B' (an identifier may not begin with a digit)
2:10: error [syntax] syntax error, unexpected '[', expecting IDENT
3 error(s), 0 warning(s).

Syntax: INVALID

examples/phase1/bad.ml: REJECTED (3 error(s), 0 warning(s))
```

All three diagnostics come from one run, in source order, though the lexical one
was found by the scanner and the other two by the parser. The third is a
consequence of the second: once `4B` is rejected as a name, the declaration it
belonged to cannot be parsed either. Semantic analysis is skipped deliberately
and the compiler says so, because analysing a tree that failed to parse reports
errors caused by error recovery rather than by the source.

Exit status is 0 for accepted and 1 for rejected, so the prototype composes with
scripts.

`make demo1` runs both.

---

## 13. Expected outcomes

- A working compiler for MatrixLang, from source text to executed output.
- Compile-time rejection of every dimension error, with diagnostics that name
  the operands, the rule and the mismatch.
- A measurable optimization result: an instruction count reduction, itemised by
  which transformation produced it.
- Evidence that the optimizer preserves meaning, not just size.
- A test suite that can be run in one command.
