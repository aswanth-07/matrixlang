# MatrixLang — Final Project Report

**Connecting shape, cost, and numerical contracts in a teaching compiler**

Authors: A Aswanth Raj; Dr. RANJITHKUMAR S (mentor).
School of Computer Science and Engineering, VIT Vellore, India.
Chapter structure follows the laboratory report format. The research manuscript
and its complete evidence map are in [paper/README.md](../paper/README.md).

## Chapter 1 — Introduction

MatrixLang is a small, straight-line language with scalar values and statically
shaped matrices. Its compiler connects dimension checking to typed instructions
and a conventional scalar-arithmetic cost model. Each phase can print its output,
so a learner can inspect the path from source to execution.

## Chapter 2 — Problem statement

A teaching optimizer needs an objective and a behavior contract. Instruction
count can miss arithmetic savings from matrix-chain ordering. Real-number
identities can change binary64 output. MatrixLang supplies an artifact in which
these distinctions can be inspected and tested. Static shape analysis, chain
dynamic programming and numerical contracts are established techniques; the
project does not claim algorithmic priority or superiority over other course
languages.

## Chapter 3 — Objectives and scope

The compiler implements scanning, parsing, syntax trees, symbols, shape inference,
three-address code, local optimization, typed VM instructions and execution.
The language supports declarations, assignments, print, matrix literals,
constructors, arithmetic and transpose. It omits control flow, functions,
dynamic shapes, pointers and division. A program is one basic block.

## Chapter 4 — Background and related work

Compiler-course language choices, property-aware linear-algebra compilation,
floating-point rewrite semantics and validity-aware differential testing are
documented in [the literature review](../paper/literature.md). In particular,
Henry and Schwartzbach already discuss compiler-course design, Linnea has richer
linear-algebra optimization, and Icing provides verified fast-math semantics.
MatrixLang is an instructional implementation with empirical checks.

## Chapter 5 — Language and architecture

The types are `Scalar` and `Matrix(r,c)`. Product typing requires the left column
count to equal the right row count; addition requires identical types and shapes.
Transpose exchanges axes. Assignment preserves declared or inferred shape.
Explicit declaration and constructor dimensions must be finite whole numbers
from 1 to 4096 and are checked before integer conversion. Numeric tokens must be
finite, while arithmetic on finite values can overflow during evaluation.

`src/frontend` holds Flex/Bison specifications and the AST; `src/analysis` holds
types, symbols and semantic checks; `src/ir` holds TAC, cost and optimization;
`src/backend` holds code generation, values and the VM. Diagnostics and allocation
support are in `src/support`. See [design.md](design.md) and
[language-reference.md](language-reference.md).

## Chapter 6 — Implementation

The shared shape rules select scalar multiplication, matrix multiplication or
matrix scaling. Generated temporaries are explicitly registered and avoid user
names. Property analysis tracks identity, zero and transpose provenance separately
from shape, and invalidates dependent facts on writes. Chain reordering requires
contiguous product slots and single-use intermediates to avoid moving work across
definitions. The browser scanner/parser tables are regenerated from the real
specifications and checked against the executable.

## Chapter 7 — Numerical contracts and cost

Strict mode is the default. It retains product association and disables
real-algebra identity/zero rewrites. Finite scalar folding uses 17-digit round-trip
serialization; non-finite folds are declined. Double-transpose elimination, CSE,
copy propagation and DCE retain dependency checks. `--fp-algebraic` additionally
permits real-algebra rewrites and chain reassociation. Those permissions can change
rounding, signed zeros and NaN/Infinity propagation; they provide no error bound.

The dense-product objective is `m*p*(2*n-1)`. It excludes movement, allocation,
printing and the VM's first accumulation addition per output entry. It is modeled
arithmetic, not executed machine instructions or elapsed time. See
[phase3-optimization.md](phase3-optimization.md).

## Chapter 8 — Verification and evaluation

`make test` passes 157 acceptance checks and 15 adversarial numerical fixtures.
The browser/compiler agreement check compares 27 programs, 1,249 tokens and
10 front-end diagnostics (24 accepted, three rejected).

The paper's protocol evaluates 5,000 cost programs across five profiles and eight
arms (40,000 observations), 2,000 execution programs, and 1,250 independent oracle
chains with 48,750 enumerated trees. Seeds 1–2 are retained development data;
the paper uses seeds 101–110. All declared observations are retained, with no
classroom participants or third-party dataset.

## Chapter 9 — Results

On heterogeneous synthetic shapes, the full algebraic optimizer has a median
45.3% modeled arithmetic reduction (IQR 0.8–79.9%) and 5.9% instruction reduction
(IQR 0.0–9.5%). Chain-only arithmetic savings occur on 767/1,000 programs with
zero instruction savings. Square and elementwise controls have no chain savings.

Strict output matches all 2,000 generated execution cases. Algebraic output
differs on 813/1,000 broad-value cases, while all 1,000 dyadic cases match.
These are scoped results for the declared generator populations. The manuscript
reports uncertainty, per-seed variation, ablations and numerical counterexamples.

## Chapter 10 — Instructional uses and limitations

[Proposed exercises and rubric](teaching-exercises.md) cover shape-rule derivation,
independent chain costing, strict/algebraic legality, and test adequacy. They have
not been evaluated with students. Shared compiler paths can share bugs; the
independent oracle checks small-chain cost, and six independent scalar references
check selected numerical fixtures. Neither establishes universal correctness.
No runtime benchmark, usability comparison or learning benefit is claimed.

## Chapter 11 — Future work

A classroom pilot could examine whether learners explain optimization
preconditions and construct counterexamples. Such work needs an appropriate
study design and institutional review before recruitment. Further compiler work
could add branches and global dataflow analysis, shape-polymorphic functions,
alternative cost models, or a native target. Matrix-chain ordering and generated
tests are already implemented; they are not future features.

## Reproduction and research integrity

```bash
make
make test
make verify-research
make analyze
make paper
```

`make research` reruns the full evaluation and replaces local recorded results.
Windows users should select native Python explicitly through `PYTHON` when
MSYS2 resolves a different interpreter. The existing MIT license covers original
code and generated artifacts.

Generative AI assisted implementation, testing, literature discovery, analysis
and drafting. Technical checks are recorded; they do not substitute for final
human review. Funding, interests, corresponding email and author approval remain
unconfirmed in [the submission checklist](../paper/submission-checklist.md).
