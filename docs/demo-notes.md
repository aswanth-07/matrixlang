# Demo notes: five minutes, one-on-one

You drive; your faculty member watches the screen beside you. The workspace has a **presenter strip** at the bottom: press **→** (or click the arrow) to move to the next step, and it opens the right view, example, contract and race for you. The talking point for each step is in the strip; the notes icon on its right hides it if you prefer to speak from memory. **Ctrl K** opens a command palette that reaches every example, race and action.

## Before you start (two minutes, once)

1. Close any terminal that is still running an old `make serve` (an older service does not have the live race).
2. In MSYS2 Bash with MinGW first on `PATH`:
   ```bash
   make
   make serve
   ```
   Open <http://127.0.0.1:8731/>. The top right must read **Local compiler ready**.
3. Click **Race**, then **Run on this laptop** once, so GCC and NumPy are warm. It takes about ten seconds.
4. Click the first dot in the presenter strip, so the demo starts at the opener.

If the service will not start, the page still works from recorded results: every Race and Results number then comes from `demo/race-data.js`, measured on this laptop at 12:24 on 8 October 2026, and the provenance line under each race says so.

## The five minutes

| Step | Time | What is on screen | What to say | What to point at |
| --- | --- | --- | --- | --- |
| 1 · Opener | 0:00–0:30 | Python's own results, drawn as bits | "Same value, computed two ways, different bits. Python says `(0.1+0.2)+0.3` is not `0.1+(0.2+0.3)`, and rewriting `x * 0` as `0` flips the sign of zero. That is why compilers refuse to reorder floating point, or do it blindly with `-ffast-math`." | The white cells: the bits that changed. The last row overflows to infinity. |
| 2 · Shapes before code | 0:30–1:00 | Workspace, *Matrix product* | "It is a real compiler: flex, bison, C. It infers every shape and rejects a bad product before generating code." | *Shape check* stage. Optionally pick *Shape mismatch* in the explorer. |
| 3 · Proved exact | 1:00–1:45 | *Exact integer chain*, strict, Guarantees | "The inputs are declared `int8`. The compiler never sees the values, only the domain, and proves every bracketing is exact, so it reorders 11,120 operations to 556 and certifies the output bit-identical." | The certificate reason ("needs at most 28 of 53 significand bits") and the bit strips: no white cells. |
| 4 · Bounded | 1:45–2:15 | *Real-valued chain*, bounded | "Over real values the bits may change, so strict refuses. Bounded reorders and states the error bound it keeps." Click **Compare contracts** if there is time. | The amber *bound-preserving* label; white cells only at the end of the fraction. |
| 5 · Race: graph walks | 2:15–3:00 | Race, *Graph walks*, 1 thread | "Same program, same inputs, timed on this laptop. MatrixLang's proved reordering runs in about 1.2 ms against 322 ms for the C you would write, 274 times faster, and every bit is identical. NumPy's default `@` takes 65 ms." Click **Replay**: the bars fill in proportion to real time. | The MatrixLang side finishing first; the *identical bits* chips. |
| 6 · Race: diffusion | 3:00–3:30 | *Diffusion* | "On real data strict keeps your order. Bounded is about 219 times faster within a certified bound. `multi_dot` is fast too, but its bits differ and it says nothing about it." | Strict lane at about 1×, bounded lane with *within certified bound*, multi_dot with *no guarantee*. |
| 7 · Race: overflow trap | 3:30–4:00 | *Overflow trap* | "Here the cheaper order overflows. `multi_dot` takes it and returns infinity. MatrixLang's facts see the overflow coming and keep the finite answer; only the algebraic contract takes the shortcut, and it labels the output relaxed." | multi_dot: *returns +∞ · no warning*. Click its lane: the bit check shows the exponent all ones. |
| 8 · Results | 4:00–5:00 | Results | "Measured here: faster than what you would write, and across 57,600 output comparisons per contract, not one output certified bit-identical was wrong." | Speedup chart, the bits table, *0 of 147,042*. |

## How to contrast each baseline

- **GCC -O3, the program as written.** The fair baseline: the same C, compiled the same way, in the order the programmer wrote. MatrixLang's speedup over it (274× on graph walks) comes from the reordering the certificate allows, not from a better C compiler.
- **GCC -ffast-math.** The standard industry permission. It may reassociate, but it works on loops and cannot see that a matrix chain can be bracketed differently, so it gains about 1.0–1.3×, and where it changes results it gives no report. MatrixLang's point is not "more permission", it is *permission it can justify, per output*.
- **NumPy `A @ B @ C`.** Python's default. It evaluates left to right, exactly as written, so it pays the expensive order: 65 ms against MatrixLang's 1.2 ms on graph walks. With BLAS it also does not reproduce the written order's bits on real data.
- **NumPy `multi_dot`.** The honest strongest baseline. It does choose the cheaper bracketing, and with OpenBLAS's hand-tuned kernels it is often faster than MatrixLang's generated C (0.52 ms against 1.17 ms on graph walks). Say this yourself before you are asked: *multi_dot finds the order but cannot know whether taking it is safe.* On integer data it happens to be exact and cannot tell; on real data it changes bits silently; on the overflow trap it returns infinity. MatrixLang finds the same order **and proves which guarantee it keeps**, at compile time, in compiled code.
- **Python floats.** The opener: not a baseline, the reason the problem exists.

## Questions you may get, and straight answers

**"Is the 274× real or a trick?"** Real and measured: the race compiles all seven contestants on this laptop, runs each on the same dumped inputs, times only the compute section, and reports the median of repeated runs. The speedup comes from doing 683 times less arithmetic (the chain `A·A·A·1` becomes three matrix-vector products). The *bits* line confirms agreement for these inputs; the static certificate supplies the domain-wide guarantee.

**"Why not just use `multi_dot`?"** It reorders blindly. It cannot tell an integer kernel (safe) from the overflow trap (returns infinity) or real data (bits change). MatrixLang tells you, before running, which outputs are bit-identical, which stay within a stated error bound, and refuses where it cannot prove either. It is also a compiler: the same proof licenses reordering in generated C, not only in one Python call.

**"Is NumPy handicapped?"** No: one thread means one thread for everyone, NumPy's OpenBLAS included (switch to 8 threads to show the same ranking). NumPy is fast; on several kernels `multi_dot` wins on raw speed, and the demo says so.

**"How does it know the values are int8?"** The program declares `input(int8)`; the runtime checks every value against its domain before execution and refuses out-of-domain input. The proof is over the whole domain, not the sampled inputs.

**"What exactly is proved?"** For integer chains: every intermediate of every bracketing fits in binary64's 53 significand bits, so no operation rounds (the exactness theorem). For real data: every bracketing has the same standard worst-case error bound, so reordering keeps it (the bounded contract), provided no intermediate can overflow.

**"Has the certificate ever been wrong?"** Once, in development: the soundness experiment found a rewrite that relied on an earlier, weaker rewrite. It was fixed, and *Inherited guarantee* in the explorer shows the case. Since then, 0 of 147,042 outputs certified bit-identical differed when executed.

**"Is modeled arithmetic the same as time?"** No. The workspace's operation counts are a cost model; the Race view is the measured time.

**"What is novel compared with LLVM fast-math flags or Icing?"** Flags grant permission; they do not state what holds. MatrixLang derives the guarantee from declared input domains and reports it per output, and its strict mode reorders exactly where exactness is proved.

## Numbers to remember (recorded, one thread, this laptop)

| Kernel | MatrixLang | GCC as written | NumPy `@` | `multi_dot` | Bits |
| --- | --- | --- | --- | --- | --- |
| Graph walks | 1.17 ms (strict) | 322 ms | 64.8 ms | 0.52 ms | all identical |
| Quantized layers | 0.20 ms (strict) | 1.06 ms | 0.40 ms | 0.07 ms | all identical |
| Diffusion | 1.17 ms (bounded) | 257 ms | 73.2 ms | 0.53 ms | MatrixLang within certified bound; NumPy differs, no statement |
| Low-rank adapter | 0.022 ms (bounded) | 12.0 ms | 12.7 ms | 0.009 ms | same pattern as diffusion |
| Overflow trap | 0.66 ms (strict keeps order) | 0.67 ms | 3.18 ms | returns ∞ | MatrixLang identical; multi_dot infinite |

Live runs vary by about 10–20% from these; the shape of the result does not change.

## If something goes wrong

- **"Recorded results" in the top right:** the service is not running; everything still works from recordings. Say "these are the numbers recorded on this laptop this morning".
- **A live race fails:** the lanes keep the recorded run; the message above them says why. Continue with the recorded numbers.
- **You lose your place:** Ctrl K, type "step", choose the step.

