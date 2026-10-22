# ExactReduce: the per-reduction license in LLVM

`ExactReduce.cpp` is an LLVM 18 pass plugin. It sets `reassoc` on a floating-point add reduction only when every order of its additions returns the same bits. The loop vectorizer then vectorizes and interleaves exactly those reductions, under otherwise strict IEEE semantics. Section 9 of the paper describes the pass, and Proposition 4.5 is the result it relies on.

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

The environment variables `EXACT_REDUCE_EXTRA_BITS=1` and `EXACT_REDUCE_FORCE=1` build the two mutants used in RQ8. `EXACT_REDUCE_VERSION=0` disables loop versioning.

`kernels/` holds the C kernels of RQ7, the driver that times them on MNIST, Cora and generated data, and the stress harness of RQ8. `tests/` holds the plugin's own checks.
