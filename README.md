# MatrixLang

A dimension-aware compiler for a small matrix language whose optimizer proves, for every floating-point rewrite, which guarantee it keeps, and certifies each output: bit-identical, bound-preserving, or relaxed.

```matrixlang
matrix A[40,2] = input(int8);    // values arrive at run time; the compiler sees the domain
matrix B[2,40] = input(int8);
matrix C[40,2] = input(int8);
matrix R = A * B * C;            // 11,120 modeled operations as written, 556 as A * (B * C)
print(R);
```

Under the default strict contract the compiler reorders this chain, because every intermediate of every bracketing fits in binary64's 53 significand bits, and certifies `print(R)` as bit-identical. `--emit-c` hands the same program to a C compiler, with an OpenMP reduction clause on exactly the sums the facts prove may be reordered. Over `input(real(1))` the bits would change, and only the bounded contract reorders it, certifying that the source order's worst-case error bound still holds. The pipeline is inspectable end to end: tokens, syntax tree, symbols, shape diagnostics, three-address code, optimization, guarantees, typed stack-machine code, and execution.

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

**How rewrites are proved.** A grid–magnitude analysis tracks, for every value, a power of two that divides every entry, a magnitude bound, finiteness and the possibility of `-0`. A matrix chain is reordered under strict only when every proper sub-chain's magnitude bound fits in 53 bits above its grid and the whole chain's final sums round at most once; every bracketing, with any order of summation, then returns the correctly rounded product (the correctly-rounded-chain theorem). For `int(0,m)` chains `100x2 * 2x100 * 100x2` that admits m up to 35,697, and at 35,698 there are inputs on which the bracketings differ. Under bounded, any bracketing is admitted when no intermediate can overflow, because the standard componentwise error bound of a chain is the same for every bracketing (the invariance theorem). Identity and zero rewrites carry IEEE side conditions: `A * I = A` needs `A` finite and free of `-0`, `x + 0 = x` needs `x` free of `-0`, and so on. [docs/design.md](docs/design.md#numerical-contracts) has the details.

**Certificates.** `--certificate` prints, for every `print`, the weakest guarantee among the rewrites that reach it and the reasons. A rewrite inherits the weakest guarantee of the definitions its proof read, so a proof that relies on a weaker rewrite's facts cannot certify more than that rewrite. `--no-proofs` disables the analysis and reproduces the earlier strict optimizer for comparison. `--exact-output` prints hexadecimal values, which distinguish every binary64 value including `-0`.

The cost model counts `m*p*(2*n-1)` scalar operations per product and ignores movement, allocation and the VM's initial accumulator additions. It does not predict runtime; the runtime study compiles the emitted C with GCC.

**C output.** `--emit-c FILE` writes the (optimized) program as C11 and `--dump-inputs FILE` writes its checked inputs. Every sum keeps the VM's order except products whose order of summation the contract leaves free (proved order-independent under strict, overflow-free under bounded), which carry `#pragma omp simd reduction(+:acc)`; `--no-license` keeps the VM's order everywhere. `tools/check_emit_c.py` (part of `make test`) requires GCC's build of the emitted C to print the VM's bits.

```bash
bin/matrixc -q --optimize --random-inputs 1 --emit-c walks.c --dump-inputs walks.bin examples/kernels/walks.ml
gcc -std=c11 -O3 -march=native -ffp-contract=off -fopenmp-simd walks.c -o walks -lm
./walks walks.bin 10
```

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

The manuscript proves the two theorems above and measures six questions on generated, domain-typed workloads and six application kernels:

- **Recovery** (15,000 programs): strict with proofs recovers 83.6% of the algebraic saving on `int8` data with bit-identical output; bounded recovers all of it wherever values are bounded.
- **Soundness** (57,600 executions per contract): no output certified bit-identical differed from the unoptimized program. This check found one unsound certificate in an earlier version, now fixed.
- **Tightness**: on four chain families the compiler's threshold equals the theorem's closed form; one step above it (two for the four-operand chain, where a parity argument rules out one) there are inputs on which the refused bracketing prints different bits, and no input at or below it differs.
- **Production compiler**: compiled to C and by GCC, proved reorderings make the kernels 278× (graph walks) and 4.98× (quantized layers) faster with identical bits, and the bounded contract 469× and 277× on real-valued kernels within the source order's error bound; `-ffast-math` gains at most 1.13×. Hand-written reductions licensed by a certificate run 1.23–6.54× faster with identical bits, and a certified OpenMP reduction gives one result for 1–24 threads.
- **Test adequacy**: small-integer tests cannot notice a compiler that reorders without proof, and no random or domain-bound input notices a 54-bit threshold; witnesses built at the threshold kill it. Nine of ten side-condition mutants are killed.
- **Accuracy** (preregistered, 2,700 real-valued chains): the cheaper bracketing is more accurate than source order (median error ratio 0.941, Holm p = 4.6×10⁻¹¹).

```bash
make contracts           # repeat every measurement into results/contracts/
make contracts-analyze   # regenerate every number, table and figure, and the workspace's evaluation data
make paper               # named and anonymous PDFs, with an existing LaTeX installation
```

[paper/README.md](paper/README.md) maps every result to its raw data and script. The earlier teaching-compiler paper is kept as [paper/archive/matrixlang-teaching-compiler.pdf](paper/archive/matrixlang-teaching-compiler.pdf), and its study remains reproducible with `make research` and `make verify-research`. The paper is a draft for author review; no submission or acceptance is claimed.

## Workspace

The browser workspace is a dark, IDE-style product demo with four views. The **Opener** shows Python's own floating-point results as 64-bit sign, exponent and fraction strips. The **Workspace** puts editable source beside every compiler stage, nine examples, three contracts, an input seed, each output's certificate and a **Bits** panel comparing any output entry with the unoptimized run. The **Race** compiles one program as MatrixLang's three contracts and as NumPy `@`, NumPy `multi_dot`, GCC `-O3` and GCC `-ffast-math`, runs all of them on the same inputs with the same thread count, and shows measured times and whether each printed the bits of the program as written (graph walks: 1.17 ms certified against 322 ms for the C as written and 65 ms for NumPy `@`). The **Results** view puts speedup, bits and guarantees on one screen. A presenter strip steps through a five-minute path ([demo notes](docs/demo-notes.md)), and Ctrl K opens a command palette. The **Evaluation** page shows every measured result with an exactness-threshold explorer.

```bash
make web          # regenerate compiler captures and parser tables; check agreement
make serve        # local C compiler + workspace at http://127.0.0.1:8731/
make race-data    # re-record the Race and Results views on this machine (gcc + numpy)
make serve-static # recorded examples and browser front end, without a compiler API
make test-demo    # local service, compiler integration and recorded-example replay
```

`make serve` runs the C compiler for edited source through a bounded localhost service. Static hosting or opening `demo/index.html` uses labeled compiler captures for unchanged examples; edited source on a static host gets browser scanning and parsing only. Read the [demonstration guide](docs/demo.md), or use **Demo guide** in the workspace. The front-end walkthrough steps through scanner rules, parser states, reductions and syntax recovery, checked against `matrixc`. [Teaching exercises](docs/teaching-exercises.md) and [docs/README.md](docs/README.md) cover the laboratory materials.

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/frontend`, `src/analysis` | Scanner/parser, syntax tree, types, symbols, input domains, semantic analysis |
| `src/ir` | Three-address code, facts (`facts.c`), contracts and certificates (`optimize.c`), segmented chain ordering (`chain.c`), mutants for the adequacy study |
| `src/backend`, `src/support` | Cost model, VM code generation, VM, C output (`emit_c.c`), input loading and checks, diagnostics |
| `examples`, `tests`, `demos` | Accepted/rejected programs, contract examples, application kernels (`examples/kernels`), acceptance checks, review demonstrations |
| `tools/contracts`, `results/contracts`, `bench/licensed` | Contracts study scripts, raw observations, C kernels |
| `paper` | Manuscript, generated macros and tables, figures, evidence map |
| `demo`, `docs` | Browser workspace and evaluation page, laboratory and teaching materials |

## Limitations

The language is straight-line and statically shaped. Exactness proofs apply to integer and dyadic data, not general reals. The bounded contract promises the standard-model bound and does not cover gradual underflow. Workloads are generated or written for the study, not drawn from applications; runtime results come from one machine with one compiler. The C backend checks the VM's arithmetic independently but shares its front end and optimizer. Numerical checks do not cover exception flags, NaN payloads or alternate rounding modes.

The [MIT license](LICENSE) covers code and original artifacts. Use [CITATION.cff](CITATION.cff) for citation metadata. [CONTRIBUTING.md](CONTRIBUTING.md) describes verification, and [CHANGELOG.md](CHANGELOG.md) records changes.
