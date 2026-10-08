# MatrixLang research artifact

**Exact, Bounded, or Relaxed: Proving Which Floating-Point Guarantee a Compiler Rewrite Keeps**

Authors, in order: **A Aswanth Raj**, **Dr. RANJITHKUMAR S**, School of Computer Science and Engineering, VIT Vellore, India. See the [author checklist](submission-checklist.md) for unconfirmed administrative details.

The [named manuscript](matrixlang.pdf) and [anonymous review build](anonymous.pdf) present three numerical contracts (strict, bounded, algebraic), per-output guarantee certificates derived from declared input domains, two theorems behind them, and six measured research questions. The earlier teaching-compiler paper is kept as [archive/matrixlang-teaching-compiler.pdf](archive/matrixlang-teaching-compiler.pdf); its source is in the Git history, and its data in `results/research/` remain reproducible with `make research`.

## Reproduce

Build tools: Flex, Bison, GCC (C11) and GNU Make. The contracts study needs Python 3.10 or newer with numpy and matplotlib (`requirements.txt`). PDFs use the publisher's `acmart` class (`sigplan,review`).

From the repository root:

```bash
make
make test
make contracts           # repeat every measurement into results/contracts/ (about 20 minutes)
make contracts-analyze   # regenerate summary, macros, tables, figures and demo data
make paper               # named and anonymous PDFs
```

`make contracts` builds the compiler and the mutant compiler first, then runs `tools/contracts/run_all.py`: `corpus.py` (RQ1, RQ2), `tightness.py` (RQ3), `mutation.py` (RQ5), `accuracy.py` (RQ6), `bench.py` (RQ4, last, so that nothing competes for the CPU), and `analyze.py`. `overhead.py` measures compile time serially. On Windows, run Make from MSYS2 with `/mingw64/bin` first on `PATH`, and use a Python that has numpy.

## Evidence map

Every number in the manuscript is a macro in `generated/contracts.tex` or a cell of a `generated/tab-*.tex` table, written by `tools/contracts/analyze.py` from the raw files below. Nothing is typed by hand.

| Result | Raw data | Script | What is checked |
| --- | --- | --- | --- |
| RQ1 recovery (Table 2, Figure 1) | `results/contracts/rq1_recovery.jsonl` | `corpus.py` | 15,000 programs, 10 seeds, 6 profiles, 10 value populations, 4 arms; pooled modeled saving and recovery per domain |
| RQ2 soundness (Table 3) | `rq2_soundness.jsonl` | `corpus.py` | 4,800 programs × 3 input seeds × 4 arms; per-output bit equality against the unoptimized run, by certificate level |
| RQ3 threshold (Table 4) | `rq3_tightness.jsonl`, `rq3_env.json` | `tightness.py` | Compiler threshold by binary search versus closed form; 17 witnesses at 14 values of m per family |
| RQ4 kernels (Table 5) | `rq4_bench.jsonl`, `rq4_threads.jsonl`, `rq4_vectorizer.txt` | `bench.py`, `bench/licensed/kernels.c` | GCC 15.2 strict versus licensed builds; 7 processes × 21 repetitions; result bits; OpenMP 1–24 threads |
| RQ5 mutation (Table 6) | `rq5_mutation.jsonl` | `mutation.py`, `witnesses/` | 9 mutants of `src/ir/mutant.h` against 6 test populations |
| RQ6 accuracy (Table 7, Figure 2) | `rq6_accuracy.jsonl`, `rq6_validation.jsonl` | `accuracy.py` | 2,700 chains, exact integer references, VM emulation validated bit for bit; sign tests, Holm, seed-cluster bootstrap |
| Compile-time overhead | `overhead.jsonl` | `overhead.py` | Sequential compilations, 5 repetitions, median per program and arm |

## Preregistration and deviations

RQ6 follows the research contract IG-RD-010 recorded before the confirmatory run. Deviations, all stated in the paper: profiles that draw identical chain shapes (balanced) or have no chains (elementwise) are not separate populations, and square chains enter only the ablation; no SuiteSparse or other dataset could be downloaded, so value distributions are synthetic; chains whose exact reference needs more than 1.5 million scalar products are redrawn. The decision rule's "four of five profiles" becomes "both eligible profiles".

## Scope of the claims

Certificates are static claims over the declared input domains; execution checks them on drawn inputs only. The bounded contract promises the standard-model error bound; gradual underflow is outside it. Modeled arithmetic is a cost model, not runtime; runtime appears only in RQ4, on one machine and one compiler. Workloads are generated; no benchmark suite or application data is used.
