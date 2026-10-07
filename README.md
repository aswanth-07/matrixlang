# MatrixLang

A dimension-aware compiler for a small matrix language, with an inspectable optimizer and explicit numerical contracts.

```matrixlang
matrix A[2,3] = {{1,2,3},{4,5,6}};
matrix B[3,2] = {{1,0},{0,1},{1,1}};
matrix C = A * B;  // inferred Matrix<2x2>
print(C);
```

The compiler rejects incompatible dimensions before code generation. Shared shape rules drive semantic analysis, multiplication/scaling instruction selection, and a conventional scalar-arithmetic cost model. The complete pipeline includes tokens, a syntax tree, symbols, shape diagnostics, three-address code, optimization, typed stack-machine code, and execution.

## Build and test

Requirements: Flex, Bison, GCC or another C11 compiler, GNU Make, and Python 3.10 or newer for artifact scripts.

```bash
make
make test
make toolchain
```

Windows builds use MSYS2 Bash with MinGW first:

```bash
export PATH="/mingw64/bin:/usr/bin:$PATH"
make
```

If MSYS2 selects a Python installation without plotting dependencies, set `PYTHON` to the interpreter where `requirements.txt` is installed, for example `make analyze PYTHON="C:/path/to/python.exe"`. The compiler itself has no Python dependency. [docs/design.md](docs/design.md) describes the build environment.

## Numerical contracts

Strict mode is the default:

```bash
bin/matrixc --optimize --run --exact-output examples/valid/multiply.ml
bin/matrixc --fp-algebraic --optimize --tac --cost --explain examples/optimize/chain_order.ml
```

`--fp-strict` retains product association and disables real-algebra identity/zero rewrites. `--fp-algebraic` permits those rewrites and matrix-chain reassociation; rounding, signed zero, and NaN/Infinity output can change. `--exact-output` prints hexadecimal values for numerical comparisons. These contracts concern the tested fixed floating-point environment and printed output, not NaN payloads, exception flags, or allocation failures.

A chain with shapes `(100,2)`, `(2,100)`, `(100,2)` costs 69,800 modeled operations in source order and 1,396 under the cheaper algebraic association. It has the same number of product instructions in both orders. The cost model counts `m*p*(2*n-1)` per product and ignores movement, allocation, and the VM's initial accumulator additions. It does not predict runtime speedups.

## Inspect the phases

| Command/flag | Output |
| --- | --- |
| `make demo1`, `--phase1` | Lexical and syntax analysis |
| `make demo2`, `--phase2` | Syntax tree, symbols, shape checking, intermediate code |
| `make demo3`, `--phase3` | Optimization, target code, execution |
| `--tokens`, `--ast`, `--symbols`, `--check` | Individual front-end artifacts |
| `--tac`, `--explain`, `--report`, `--cost` | Intermediate code, rewrite log, both metrics |
| `--target`, `--run`, `--trace`, `--stats` | Typed VM code, execution and trace |

Pass switches: `--opt-algebraic`, `--opt-cse`, `--opt-copyprop`, `--opt-dce`, and `--opt-chain`. Real-algebra rewrites and chain ordering also require `--fp-algebraic`; selecting a pass alone does not grant relaxed numerical permissions. Exit codes are 0 for success, 1 for a reported compilation/execution error, and 2 for a usage error.

The language has static dimensions, scalar and matrix values, mutable variables, literals, constructors, arithmetic, and transpose. It omits control flow, functions, pointers, dynamic shapes, and division. It is an educational tool, not a production numerical library.

## Paper and reproducible study

**[MatrixLang: Connecting Shape, Cost, and Numerical Contracts in a Teaching Compiler](paper/matrixlang.pdf)**

Authors: **A Aswanth Raj**, **Dr. RANJITHKUMAR S**, School of Computer Science and Engineering, VIT Vellore, India.

The technical manuscript characterizes 5,000 generated cost programs across eight configurations and five workload profiles, 2,000 execution programs, 1,250 independently checked chains, and 15 numerical fixtures. Heterogeneous algebraic optimization has a median 45.3% modeled arithmetic reduction (IQR 0.8–79.9%) and 5.9% instruction reduction (IQR 0.0–9.5%). Square and elementwise controls have zero chain savings. Strict mode matches all generated execution outputs; algebraic mode differs on 813/1,000 broad-value cases despite matching every dyadic case.

These results describe the declared synthetic populations. No classroom benefit, runtime performance improvement, new optimizer algorithm, or universal correctness claim is made.

```bash
make verify-research  # coverage, source hashes, independent oracle, sampled replay
make analyze          # regenerate statistics, tables, and figure
make research         # repeat every measurement; replaces local research output
make paper            # named and anonymous PDFs, with an existing LaTeX installation
```

See [paper/README.md](paper/README.md) for the evidence map, [venue.md](paper/venue.md) for the next-call SPLASH-E recommendation, [literature.md](paper/literature.md) for positioning, and [submission-checklist.md](paper/submission-checklist.md) for required author confirmations. The paper is a technical draft for author review; no submission or acceptance is claimed.

## Demonstration and teaching materials

The browser workspace puts editable source beside all eight compiler stages. Five examples cover shape inference, dimension errors, chain ordering, common subexpressions, and signed zero. Compare strict and algebraic optimization using modeled arithmetic, TAC counts, and exact execution output.

```bash
make web       # regenerate compiler captures and parser tables; check agreement
make serve     # local C compiler + workspace at http://127.0.0.1:8731/
make serve-static # recorded examples and browser front end, without a compiler API
make test-demo # local service, compiler integration and recorded-example replay
make deck      # laboratory presentation
make measure   # repeat the retained two-seed development experiments
```

`make serve` invokes the existing C compiler for edited source through a bounded localhost service. Compilation results identify their source and numerical contract; editing hides earlier results until recompilation. Static hosting or opening `demo/index.html` uses labeled compiler captures for unchanged examples. Edited source on a static host supports browser scanning/parsing only. The service has no third-party Python dependencies.

Read the [seven-minute demonstration guide](docs/demo.md), or use **Demo guide** in the workspace. The linked front-end walkthrough retains step-by-step scanner rules, parser states, reductions and syntax recovery, checked against `matrixc`. Its two-seed figures are development results, separate from the paper's expanded evaluation. Historical repository-marker counts remain exploratory metadata and are excluded from research evidence.

[Teaching exercises and rubric](docs/teaching-exercises.md) connect shape rules, independent cost checks, numerical counterexamples, and test adequacy. They are proposed materials without a classroom evaluation. [docs/README.md](docs/README.md) indexes laboratory reports and submission documents.

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/frontend`, `src/analysis` | Scanner/parser, syntax tree, types, symbols, semantic analysis |
| `src/ir`, `src/backend`, `src/support` | Intermediate code, passes, cost model, VM, diagnostics |
| `examples`, `tests`, `demos` | Accepted/rejected cases, acceptance checks, review demonstrations |
| `tools`, `results/research`, `paper` | Reproduction scripts, raw observations, manuscript and figures |
| `demo`, `docs` | Browser demonstration and laboratory/teaching materials |

## Limitations

The compiler has no control flow, functions, dynamic shapes, or production numerical-library target. The study uses designed synthetic populations on one evaluated platform. Shared execution paths can share defects; the oracle and scalar references check selected independent properties. Numerical checks do not cover exception flags, NaN payloads, alternate rounding environments, or allocation failures. The proposed exercises have no classroom evaluation.

The repository's existing [MIT license](LICENSE) covers code and original artifacts. Use [CITATION.cff](CITATION.cff) for citation metadata. [CONTRIBUTING.md](CONTRIBUTING.md) describes verification, and [CHANGELOG.md](CHANGELOG.md) records the research release changes.
