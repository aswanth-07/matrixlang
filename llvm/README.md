# ExactReduce: the per-reduction license in LLVM

`ExactReduce.cpp` is an LLVM 18 pass plugin. It derives integer facts to justify regrouping selected floating-point reductions, statically or behind a run-time guard. At `VectorizerStart` in the tested pipeline, it attaches `reassoc` to supported recurrence instructions, including addition, subtraction and `fmuladd`, or accumulates suitable integer terms in integer registers. Guarded paths retain strict fallbacks.

The numerical proof covers regrouping the same terms. LLVM's `reassoc` permission allows more, so the regression-tested LLVM 18 integration does not verify every permitted transformation or final machine code. The [manuscript](../paper/matrixlang.pdf) states the contraction assumptions and proof boundary.

```bash
make -C llvm                    # builds ExactReduce.so with llvm-config and clang++
make -C llvm test               # tests/run.sh: decisions, vectorization, stress equality, mutant detection
clang -O3 -march=native -fpass-plugin=llvm/ExactReduce.so prog.c
EXACT_REDUCE_REPORT=- clang ... # one line per reduction: licensed | versioned | declined, with the reason
```

How it decides:

- **Facts.** Facts come from `sitofp`/`uitofp` of integers whose range LLVM knows from value tracking and scalar evolution. They propagate through `fmul`, `fadd`, `fsub`, `fneg`, `fabs`, `fpext`, `fptrunc`, `select`, phis and `llvm.fmuladd`. A value loaded from a floating-point array has no fact.
- **Static license.** The pass licenses a reduction statically when its start value has a fact and its trip count has a bound under which every partial sum fits in the significand.
- **Guarded license.** Otherwise it versions the loop. A guard in the preheader checks, on the actual start value and trip count, that `|s0| / 2^G + trip count * K <= 2^p`, and runs a licensed copy of the loop only when that holds.
- **Never `nsz`.** The pass never sets `nsz`, so the vectorizer's identity stays -0.0.
- **Integer rewrite** (`EXACT_REDUCE_INTEGER=1`). Where every term of a licensed sum is an integer expression (conversions, products, negations, constants), the pass accumulates the sum in an integer register and converts it once after the loop: the same exact sum, in narrower lanes. The accumulator is `i32` when the static bound on the terms' sum, or the guard's limit, is below 2^31, and `i64` otherwise; a static license whose terms fit 32 bits is versioned on its trip count so that short entries use `i32`. It needs a straight chain, a loop that exits from its latch, and a constant start value other than -0; otherwise the license stays.

`EXACT_REDUCE_EXTRA_BITS=1` and `EXACT_REDUCE_FORCE=1` build the two mutants used in RQ8, and `EXACT_REDUCE_TIER32_SLACK=2` a mutant of the integer rewrite whose 32-bit limit is two trips too generous, which `tests/tier32.c` must catch. `EXACT_REDUCE_VERSION=0` disables loop versioning.

`kernels/` holds the C kernels of RQ7, the driver that times them on MNIST, Cora and generated data, the same kernels with hand-written integer accumulators (`intacc.c`), and the stress harness of RQ8. `tests/` holds the plugin's own checks: decisions, vectorization, and strict equality of the licensed and integer builds on the smoke tests, the stress suite and the 32-bit limit.
