# MatrixLang

A dimension-aware compiler for a small matrix language whose optimizer proves, for every floating-point rewrite, which guarantee it keeps, and certifies each output: bit-identical, bound-preserving, or relaxed.

```matrixlang
matrix A[40,2] = input(int8);    // values arrive at run time; the compiler sees the domain
matrix B[2,40] = input(int8);
matrix C[40,2] = input(int8);
matrix R = A * B * C;            // 11,120 modeled operations as written, 556 as A * (B * C)
print(R);
```

Under the default strict contract the compiler reorders this chain, because every intermediate of every bracketing fits in binary64's 53 significand bits, and certifies `print(R)` as bit-identical. Over `input(real(1))` the bits would change, and only the bounded contract reorders it, certifying that the source order's worst-case error bound still holds. The pipeline is inspectable end to end: tokens, syntax tree, symbols, shape diagnostics, three-address code, optimization, guarantees, typed stack-machine code, and execution.

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

The compiler has no Python dependency. The contracts study needs numpy and matplotlib (`requirements.txt`); if MSYS2 selects a Python without them, pass `PYTHON="C:/path/to/python.exe"` to `make`. [docs/design.md](docs/design.md) describes the build environment and the analysis.

## Numerical contracts

A contract names the weakest guarantee a value-changing rewrite may have and still be applied:

| Flag | Applies a rewrite when it is | Outputs may differ from the unoptimized program |
| --- | --- | --- |
| `--fp-strict` (default) | proved bit-identical from the declared input domains | never |
| `--fp-bounded` | bit-identical, or keeps the source order's standard-model worst-case error bound and its NaN/Inf behaviour | within that bound; signed zeros may differ |
| `--fp-algebraic` | valid over the real numbers | arbitrarily |

```bash
bin/matrixc --certificate examples/contracts/mixed.ml                       # per-output guarantees
bin/matrixc --fp-bounded --explain --report examples/contracts/real_chain.ml
bin/matrixc -q --optimize --run --exact-output --random-inputs 7 examples/contracts/exact_chain.ml
```

**Input domains.** `matrix A[r,c] = input(DOMAIN);` and `scalar s = input(DOMAIN);` declare run-time inputs. Domains: `bool`, `uint8`, `int8`, `uint16`, `int16`, `int32`, `int(lo,hi)`, `real` (any finite value), `real(B)` and `real(lo,hi)`. Values come from `--input NAME=FILE` or `--random-inputs SEED` and are checked against the domain before execution; integer and non-negative domains store `-0` as `+0`. That check is what makes the optimizer's facts sound.

**How rewrites are proved.** A grid–magnitude analysis tracks, for every value, a power of two that divides every entry, a magnitude bound, finiteness and the possibility of `-0`. A matrix chain is reordered under strict only when every contiguous sub-chain's magnitude bound fits in 53 bits above its grid, which makes every bracketing exact (the exactness theorem). Under bounded, any bracketing is admitted when no intermediate can overflow, because the standard componentwise error bound of a chain is the same for every bracketing (the invariance theorem). Identity and zero rewrites carry IEEE side conditions: `A * I = A` needs `A` finite and free of `-0`, `x + 0 = x` needs `x` free of `-0`, and so on. [docs/design.md](docs/design.md#numerical-contracts) has the details.

**Certificates.** `--certificate` prints, for every `print`, the weakest guarantee among the rewrites that reach it and the reasons. A rewrite inherits the weakest guarantee of the definitions its proof read, so a proof that relies on a weaker rewrite's facts cannot certify more than that rewrite. `--no-proofs` disables the analysis and reproduces the earlier strict optimizer for comparison. `--exact-output` prints hexadecimal values, which distinguish every binary64 value including `-0`.

The cost model counts `m*p*(2*n-1)` scalar operations per product and ignores movement, allocation and the VM's initial accumulator additions. It does not predict runtime; the runtime study uses C kernels compiled by GCC.

## Inspect the phases

| Command/flag | Output |
| --- | --- |
| `make demo1`, `--phase1` | Lexical and syntax analysis |
| `make demo2`, `--phase2` | Syntax tree, symbols, shape checking, intermediate code |
| `make demo3`, `--phase3` | Optimization, output guarantees, target code, execution |
| `--tokens`, `--ast`, `--symbols`, `--check` | Individual front-end artifacts; `--symbols` lists declared inputs |
| `--tac`, `--explain`, `--report`, `--cost`, `--certificate` | Intermediate code, rewrite log with each rewrite's guarantee, both metrics, per-output guarantees |
| `--target`, `--run`, `--trace`, `--stats` | Typed VM code, execution and trace |

Pass switches: `--opt-algebraic`, `--opt-cse`, `--opt-copyprop`, `--opt-dce`, and `--opt-chain`. Selecting a pass never widens the contract. Exit codes are 0 for success, 1 for a reported compilation/execution error, and 2 for a usage error.

The language has static dimensions, scalar and matrix values, mutable variables, literals, run-time inputs, constructors, arithmetic, and transpose. It omits control flow, functions, pointers, dynamic shapes, and division.

## Paper and reproducible study

**[Exact, Bounded, or Relaxed: Proving Which Floating-Point Guarantee a Compiler Rewrite Keeps](paper/matrixlang.pdf)** ([anonymous build](paper/anonymous.pdf))

Authors: **A Aswanth Raj**, **Dr. RANJITHKUMAR S**, School of Computer Science and Engineering, VIT Vellore, India.

The manuscript proves the two theorems above and measures six questions on generated, domain-typed workloads:

- **Recovery** (15,000 programs): strict with proofs recovers 84.5% of the algebraic saving on `int8` data with bit-identical output; bounded recovers all of it wherever values are bounded.
- **Soundness** (57,600 executions per contract): no output certified bit-identical differed from the unoptimized program. This check found one unsound certificate in an earlier version, now fixed.
- **Tightness**: the compiler's exactness threshold equals the closed form on every chain family tested, with zero strict differences around it.
- **Production compiler**: GCC builds licensed to reassociate print identical bits on certified data and run 1.23–6.54× faster; a certified OpenMP reduction gives one result for 1–24 threads.
- **Test adequacy**: small-integer tests cannot notice a compiler that reorders without proof; targeted witnesses kill 7 of 9 side-condition mutants.
- **Accuracy** (preregistered, 2,700 real-valued chains): the cheaper bracketing is more accurate than source order (median error ratio 0.941, Holm p = 4.6×10⁻¹¹).

```bash
make contracts           # repeat every measurement into results/contracts/
make contracts-analyze   # regenerate every number, table and figure, and the workspace's evaluation data
make paper               # named and anonymous PDFs, with an existing LaTeX installation
```

[paper/README.md](paper/README.md) maps every result to its raw data and script. The earlier teaching-compiler paper is kept as [paper/archive/matrixlang-teaching-compiler.pdf](paper/archive/matrixlang-teaching-compiler.pdf), and its study remains reproducible with `make research` and `make verify-research`. The paper is a draft for author review; no submission or acceptance is claimed.

## Workspace

The browser workspace puts editable source beside every compiler stage. Nine examples cover shape inference, an exact integer chain strict reorders, a real-valued chain only bounded reorders, unbounded reals only algebraic reorders, two outputs at different levels, an inherited guarantee, signed zero, a shape error and common subexpressions. Choose a contract and an input seed; the **Guarantees** stage shows each output's certificate and whether an unoptimized run on the same inputs printed the same bits, and **Compare contracts** compiles all three. The **Evaluation** page shows every measured result with an exactness-threshold explorer.

```bash
make web          # regenerate compiler captures and parser tables; check agreement
make serve        # local C compiler + workspace at http://127.0.0.1:8731/
make serve-static # recorded examples and browser front end, without a compiler API
make test-demo    # local service, compiler integration and recorded-example replay
```

`make serve` runs the C compiler for edited source through a bounded localhost service. Static hosting or opening `demo/index.html` uses labeled compiler captures for unchanged examples; edited source on a static host gets browser scanning and parsing only. Read the [demonstration guide](docs/demo.md), or use **Demo guide** in the workspace. The front-end walkthrough steps through scanner rules, parser states, reductions and syntax recovery, checked against `matrixc`. [Teaching exercises](docs/teaching-exercises.md) and [docs/README.md](docs/README.md) cover the laboratory materials.

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/frontend`, `src/analysis` | Scanner/parser, syntax tree, types, symbols, input domains, semantic analysis |
| `src/ir` | Three-address code, facts (`facts.c`), contracts and certificates (`optimize.c`), segmented chain ordering (`chain.c`), mutants for the adequacy study |
| `src/backend`, `src/support` | Cost model, code generation, VM, input loading and checks, diagnostics |
| `examples`, `tests`, `demos` | Accepted/rejected programs, contract examples, acceptance checks, review demonstrations |
| `tools/contracts`, `results/contracts`, `bench/licensed` | Contracts study scripts, raw observations, C kernels |
| `paper` | Manuscript, generated macros and tables, figures, evidence map |
| `demo`, `docs` | Browser workspace and evaluation page, laboratory and teaching materials |

## Limitations

The language is straight-line and statically shaped. Exactness proofs apply to integer and dyadic data, not general reals. The bounded contract promises the standard-model bound and does not cover gradual underflow. Workloads are generated, not drawn from applications; runtime results come from hand-written kernels on one machine with one compiler. Shared front end and VM paths can share defects. Numerical checks do not cover exception flags, NaN payloads or alternate rounding modes.

The [MIT license](LICENSE) covers code and original artifacts. Use [CITATION.cff](CITATION.cff) for citation metadata. [CONTRIBUTING.md](CONTRIBUTING.md) describes verification, and [CHANGELOG.md](CHANGELOG.md) records changes.
