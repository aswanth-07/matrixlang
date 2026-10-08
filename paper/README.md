# MatrixLang research artifact

**Exact, Bounded, or Relaxed: Proving Which Floating-Point Guarantee a Compiler Rewrite Keeps**

Authors, in order: **A Aswanth Raj**, **Dr. RANJITHKUMAR S**, School of Computer Science and Engineering, VIT Vellore, India. See the [author checklist](submission-checklist.md) for unconfirmed administrative details and [venue.md](venue.md) for the venue assessment.

The [named manuscript](matrixlang.pdf) and [anonymous review build](anonymous.pdf) present three numerical contracts (strict, bounded, algebraic), per-output guarantee certificates derived from declared input domains, the correctly-rounded-chain and bracketing-invariance theorems behind them, a C backend that turns the facts into OpenMP reduction clauses, and six measured research questions. Both builds use `acmart` with `sigplan,10pt,review` (the anonymous one adds `anonymous`), as CC 2026 required. The earlier teaching-compiler paper is kept as [archive/matrixlang-teaching-compiler.pdf](archive/matrixlang-teaching-compiler.pdf); its source is in the Git history, and its data in `results/research/` remain reproducible with `make research`.

## Reproduce

Build tools: Flex, Bison, GCC (C11) and GNU Make. The contracts study needs Python 3.10 or newer with numpy and matplotlib (`requirements.txt`) and GCC on `PATH` for the C backend. PDFs use the publisher's `acmart` class.

From the repository root:

```bash
make
make test
make contracts           # repeat every measurement into results/contracts/ (about 35 minutes)
make contracts-analyze   # regenerate summary, macros, tables, figures and demo data
make paper               # named and anonymous PDFs
```

`make contracts` builds the compiler and the mutant compiler, then runs `tools/contracts/run_all.py`: `tools/check_emit_c.py` (C backend against the VM), `corpus.py` (RQ1, RQ2), `tightness.py` (RQ3), `width.py`, `mutation.py` (RQ5), `accuracy.py` (RQ6), `overhead.py` (compile time), `bench.py` and `e2e.py` (RQ4, last, so that nothing competes for the CPU), and `analyze.py`. On Windows, run Make from MSYS2 with `/mingw64/bin` first on `PATH`, and pass `PYTHON=` a Python that has numpy.

## Evidence map

Every number in the manuscript is a macro in `generated/contracts.tex` or a cell of a `generated/tab-*.tex` table, written by `tools/contracts/analyze.py` from the raw files below. Nothing is typed by hand.

| Result | Raw data | Script | What is checked |
| --- | --- | --- | --- |
| C backend (Section 8) | `results/contracts/emit_check.json` | `tools/check_emit_c.py` | 83 programs × 3 contracts × 4 GCC builds; the VM's bits required, and under strict also with licensed reductions on vector lanes and four threads |
| RQ1 recovery (Table 3, Figure 1) | `rq1_recovery.jsonl`, `width.jsonl` | `corpus.py`, `width.py` | 15,000 programs, 10 seeds, 6 profiles, 10 value populations, 4 arms; pooled modeled saving and recovery per domain; share proved by integer width |
| RQ2 soundness (Table 4) | `rq2_soundness.jsonl` | `corpus.py` | 4,800 programs × 3 input seeds × 4 arms; per-output bit equality against the unoptimized run, by certificate level |
| RQ3 threshold (Table 5) | `rq3_tightness.jsonl`, `rq3_env.json` | `tightness.py` | Compiler threshold by binary search versus the closed form and the exact-only condition; at 12 values of m per family, generic witnesses and an emulated search, every witness confirmed by running the refused bracketing in the VM |
| RQ4 generated code (Table 6) | `e2e.jsonl`, `e2e_env.json` | `e2e.py`, `examples/kernels/` | Six kernels × eleven GCC builds (source, fast-math, three contracts with and without reduction clauses, eight threads, SSE2); 5 processes × 10 timed runs; output bits against the source build and the VM |
| RQ4 hand-written reductions (Table 7) | `rq4_bench.jsonl`, `rq4_threads.jsonl`, `rq4_vectorizer.txt` | `bench.py`, `bench/licensed/kernels.c` | GCC 15.2 strict versus licensed builds; 7 processes × 21 repetitions; result bits; OpenMP 1–24 threads |
| RQ5 mutation (Table 8) | `rq5_mutation.jsonl` | `mutation.py`, `witnesses/` | 10 mutants of `src/ir/mutant.h` against 7 test populations, including witnesses built at the RQ3 thresholds |
| RQ6 accuracy (Table 9, Figure 2) | `rq6_accuracy.jsonl`, `rq6_validation.jsonl` | `accuracy.py` | 2,700 chains, exact integer references, VM emulation validated bit for bit; sign tests, Holm, seed-cluster bootstrap |
| Compile-time overhead | `overhead.jsonl` | `overhead.py` | Sequential compilations, 5 repetitions, median per program and arm |

## Preregistration and deviations

RQ6 follows the research contract IG-RD-010 recorded before the confirmatory run. Deviations, all stated in the paper: profiles that draw identical chain shapes (balanced) or have no chains (elementwise) are not separate populations, and square chains enter only the ablation; no SuiteSparse or other dataset could be downloaded, so value distributions are synthetic; chains whose exact reference needs more than 1.5 million scalar products are redrawn. The decision rule's "four of five profiles" becomes "both eligible profiles".

## Scope of the claims

Certificates are static claims over the declared input domains; execution checks them on drawn inputs only. The threshold is shown to be the true boundary for the measured chain families, not in general. The bounded contract promises the standard-model error bound; gradual underflow is outside it. Modeled arithmetic is a cost model, not runtime; runtime appears only in RQ4, on one machine and one compiler. Reduction clauses gave no speedup on the generated kernels; their measured benefit is on the hand-written reductions. Workloads are generated or written for the study; no benchmark suite or application data is used.
