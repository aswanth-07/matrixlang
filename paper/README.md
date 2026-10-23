# MatrixLang research artifact

**Exact, Bounded, or Relaxed: Proving Which Floating-Point Guarantee a Compiler Rewrite Keeps**

Authors, in order: **A Aswanth Raj** and **Dr. RANJITHKUMAR S**, School of Computer Science and Engineering, VIT Vellore, India.

- [submission-checklist.md](submission-checklist.md): administrative details the authors have not yet confirmed.
- [venue.md](venue.md): the venue assessment (ACM TACO).
- [review-notes.md](review-notes.md): an internal review.
- [cover-letter.md](cover-letter.md): a draft cover letter.

The manuscript comes in two builds, both journal-format (`acmart`, `acmsmall,review`) and 20 pages including references:

- [matrixlang.pdf](matrixlang.pdf), the named manuscript;
- [anonymous.pdf](anonymous.pdf), the double-anonymous build to submit to TACO.

They present:

- three numerical contracts (strict, bounded, algebraic) and per-output guarantee certificates, with their soundness argument;
- the correctly-rounded-chain, guarded-reduction and bracketing-invariance results;
- two implementations: the MatrixLang compiler with a C backend, and ExactReduce, an LLVM pass in [`../llvm/`](../llvm);
- nine measured research questions.

The conference version that targeted CC (SIGPLAN format) and the earlier teaching-compiler paper ([archive/matrixlang-teaching-compiler.pdf](archive/matrixlang-teaching-compiler.pdf)) are in the Git history. The teaching-compiler data in `results/research/` remain reproducible with `make research`.

## Reproduce

Build tools: Flex, Bison, GCC (C11) and GNU Make. The LLVM study also needs LLVM 18 with its development headers, Clang 18 and `libomp`.

The scripts need Python 3.10 or newer with numpy and matplotlib (`requirements.txt`). The real datasets are downloaded once by `llvm_data.py` and checked against their SHA-256 digests. PDFs use the publisher's `acmart` class.

From the repository root:

```bash
make && make test
make -C llvm && make -C llvm test       # the LLVM pass and its checks

make contracts                          # RQ1-RQ6 and RQ4 on generated data (about 35 minutes on M1)
make contracts-analyze                  # numbers, tables and figures of RQ1-RQ6

python tools/contracts/llvm_data.py     # MNIST and Cora into build/data/
python tools/contracts/e2e_real.py      # RQ4 on real data, GCC and Clang
CONTRACTS_RESULTS=results/contracts-linux python tools/contracts/bench.py
CONTRACTS_RESULTS=results/contracts-linux python tools/contracts/e2e.py
CONTRACTS_RESULTS=results/contracts-linux-clang E2E_CC=clang python tools/contracts/e2e.py
python tools/contracts/analyze_platforms.py

python tools/contracts/llvm_eval.py     # RQ7, RQ8
python tools/contracts/llvm_scan.py     # RQ9: existing code bases
python tools/contracts/llvm_audioop.py  # RQ9: audioop end to end
python tools/contracts/analyze_llvm.py

CONTRACTS_RESULTS=results/contracts-wsl python tools/contracts/llvm_eval.py  # RQ7/RQ8 on M1 (WSL), with the two baselines
python tools/contracts/analyze_baselines.py   # integer accumulators and in-order reductions against the license
python tools/contracts/analyze_spread.py   # timing spread behind every speedup
python tools/contracts/bound_repair.py     # bound-arithmetic repair, before and after
for s in corpus tightness width mutation accuracy; do  # optional: rerun the deterministic studies ...
  CONTRACTS_RESULTS=build/rerun python tools/contracts/$s.py; done
python tools/contracts/bound_repair.py --reuse --rerun build/rerun  # ... and compare with results/contracts

make paper                              # named and anonymous PDFs
```

`make contracts` builds the compiler and the mutant compiler, then runs `tools/contracts/run_all.py`:

- `tools/check_emit_c.py`: the C backend against the VM
- `corpus.py`: RQ1, RQ2
- `tightness.py`: RQ3
- `width.py`
- `mutation.py`: RQ5
- `accuracy.py`: RQ6
- `overhead.py`: compile time
- `bench.py` and `e2e.py`: RQ4. These run last, so that nothing competes for the CPU.
- `analyze.py`

On Windows, run Make from MSYS2 with `/mingw64/bin` first on `PATH`, and pass `PYTHON=` a Python that has numpy.

`CONTRACTS_RESULTS` sends a script's raw output to another directory; that is how the second machine's results are kept apart. `E2E_CC` selects the C compiler, and `E2E_THREADS` sets the thread count.

## Machines

- **M1** (RQ1–RQ6, Tables 6 and 9): Intel Core Ultra 9 275HX, 24 cores, Windows 11, GCC 15.2.
- **M2** (Tables 7, 8 and 12–14): Intel Xeon cloud instance at 2.8 GHz, 4 cores, AVX-512, Ubuntu 24.04, GCC 13.3 and Clang 18.1.
- **M1 under WSL** (the RQ7 baselines): the M1 laptop, Ubuntu 24.04 in WSL 2, Clang 18.1.3 and GCC 13.3, AVX2.

Each run's `*_env.json` records its machine, compiler versions and the digests of every source and tool.

## Evidence map

Every number in the manuscript is a macro or a table cell generated from the raw files below. Nothing is typed by hand. The generated files are:

- `generated/contracts.tex`, from `tools/contracts/analyze.py`
- `generated/platforms.tex`, from `analyze_platforms.py`
- `generated/llvm.tex`, from `analyze_llvm.py`
- `generated/spread.tex`, from `analyze_spread.py`
- `generated/repair.tex`, from `bound_repair.py`
- the `generated/tab-*.tex` tables

| Result | Raw data | Script | What is checked |
| --- | --- | --- | --- |
| C backend (Section 8) | `results/contracts/emit_check.json` | `tools/check_emit_c.py` | 83 programs × 3 contracts × 4 GCC builds. The VM's bits are required; under strict, also with licensed reductions on vector lanes and four threads. |
| RQ1 recovery (Table 3) | `rq1_recovery.jsonl`, `width.jsonl` | `corpus.py`, `width.py` | 15,000 programs, 10 seeds, 6 profiles, 10 value populations, 4 arms. Pooled modeled saving and recovery per domain; share proved by integer width. |
| RQ2 soundness (Table 4) | `rq2_soundness.jsonl` | `corpus.py` | 4,800 programs × 3 input seeds × 4 arms. Per-output bit equality against the unoptimized run, by certificate level. |
| RQ3 threshold (Table 5) | `rq3_tightness.jsonl`, `rq3_env.json` | `tightness.py` | The compiler's threshold, found by binary search, against the closed form and the exact-only condition. At 12 values of m per family, generic witnesses and an emulated search; every witness is confirmed in the VM. |
| RQ4 on M1 (Table 6) | `e2e.jsonl`, `e2e_env.json` | `e2e.py`, `examples/kernels/` | Six kernels × eleven GCC builds; 5 processes × 10 timed runs; output bits against the source build and the VM. |
| RQ4 on real data (Table 7) | `e2e_real.jsonl`, `llvm_data.json` | `e2e_real.py`, `examples/kernels/real/` | Cora and MNIST programs, eleven builds each with GCC and with Clang on M2. |
| RQ4 across machines (Table 8) | `results/contracts-linux*/e2e.jsonl` | `e2e.py` | Table 6 repeated on M2 with GCC and Clang; distinct outputs across all three toolchains. |
| RQ4 hand-written reductions (Table 9) | `rq4_bench.jsonl`, `rq4_threads.jsonl`, `rq4_vectorizer.txt` | `bench.py`, `bench/licensed/kernels.c` | GCC strict against licensed builds (also repeated on M2 in `results/contracts-linux/`); result bits; OpenMP with 1–24 threads. |
| RQ5 mutation (Table 10) | `rq5_mutation.jsonl` | `mutation.py`, `witnesses/` | 10 mutants of `src/ir/mutant.h` against 7 test populations. |
| RQ6 accuracy (Table 11) | `rq6_accuracy.jsonl`, `rq6_validation.jsonl` | `accuracy.py` | 2,700 chains with exact integer references; sign tests, Holm correction, seed-cluster bootstrap. |
| RQ7 LLVM speed (Table 12) | `llvm_bench.jsonl`, `llvm_decisions.jsonl`, `llvm_compile.jsonl` | `llvm_eval.py`, `llvm/kernels/` | 11 C kernels and a short-loop variant × 6 builds (Clang strict, with ExactReduce, `-ffast-math`, ExactReduce for SSE2, GCC strict and `-ffast-math`); 5 processes × 11 runs. |
| RQ8 LLVM soundness (Table 13) | `llvm_stress.jsonl` | `llvm_eval.py`, `llvm/kernels/stress.c` | 784 adversarial cases × 8 builds, including two mutants of the pass. |
| RQ9 existing code (Table 14) | `llvm_scan.jsonl`, `llvm_audioop.jsonl` | `llvm_scan.py`, `llvm_audioop.py` | The pass's decision for every add reduction in audioop, Pillow, SciPy ndimage and PolyBench/C; `audioop` strict against licensed, on every function with a reduction. |
| RQ7 baselines on M1 (Section 11.7) | `results/contracts-wsl/llvm_bench.jsonl`, `llvm_stress.jsonl`, `llvm_env.json` | `llvm_eval.py`, `analyze_baselines.py`, `llvm/kernels/intacc.c` | Strict, licensed, `-ffast-math`, in-order reductions (`-force-ordered-reductions`) and hand-written integer accumulators, all timed in one run on M1 under WSL (Ubuntu 24.04, Clang 18.1.3, GCC 13.3); RQ8's stress suite on the same machine. `generated/tab-llvm-baselines.tex` has the per-kernel numbers. |
| Timing spread (Section 11) | `e2e*.jsonl`, `llvm_bench.jsonl` | `analyze_spread.py` | Interquartile range of each build's runs (and of RQ7's process medians) relative to the median. |
| Bound-arithmetic repair (Section 10) | `bound_repair.json` | `bound_repair.py`, `tests/test_bound_arithmetic.py` | The bound arithmetic of the measured commit and of the repaired one against exact rationals; every example under every contract with both compilers, byte for byte; the deterministic records of RQ1–RQ3, RQ5 and RQ6 rerun on the repaired compiler. |

## Recorded protocol and deviations

RQ6 follows a protocol recorded in the artifact before the confirmatory run (`results/contracts/rq6_env.json` names its revision); it was not registered in a public registry. The deviations, all stated in the paper, are:

- Profiles that draw identical chain shapes (balanced) or have no chains (elementwise) are not separate populations, and square chains enter only the ablation.
- RQ6's value distributions are synthetic.
- Chains whose exact reference needs more than 1.5 million scalar products are redrawn.
- The decision rule's "four of five profiles" becomes "both eligible profiles".

The real datasets (RQ4, RQ7) were added after the recorded study and are exploratory.

## Scope of the claims

- Certificates and licenses are static claims over the declared domains, or over the IR's integer ranges. Execution checks them on drawn and constructed inputs only.
- The threshold is shown to be the true boundary for the measured chain families, not in general.
- The bounded contract promises the standard-model error bound; gradual underflow is outside it.
- Modeled arithmetic is a cost model, not runtime. Runtime appears in RQ4, RQ7 and RQ9, on two machines.
- ExactReduce licenses only reductions whose terms come from integer conversions.
