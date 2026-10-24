# Cover letter (draft for the authors to edit)

To the Editor-in-Chief, ACM Transactions on Architecture and Code Optimization

Dear Editor,

Please consider our manuscript, "Proof-Guided Floating-Point Optimization: Exact Reassociation, Error Bounds, and Compiler Certificates," for publication in ACM TACO.

Compilers give programmers two choices for floating-point code: strict IEEE semantics, or fast-math permissions that allow reassociation. The manuscript shows that, from facts about the values a program will see, a compiler can prove for each rewrite whether the result is bit-identical, within the source program's error bound, or valid only over the reals, and can certify every output accordingly.

The contributions are:

- three numerical contracts with per-output certificates, and the inheritance rule that keeps them sound;
- a theorem giving a threshold below which every bracketing of a matrix chain returns the correctly rounded product, which is the true boundary on three of the four measured chain families;
- a proof that the standard componentwise error bound is invariant under bracketing when overflow and inexact underflow are excluded;
- two implementations, a matrix-language compiler with a C backend and an LLVM pass;
- an evaluation of nine research questions on two machines with GCC and Clang.

The LLVM pass may interest TACO's readers most. It derives the facts from integer conversions in ordinary C and marks a reduction reassociable only where every order is exact, statically or behind a run-time guard. With it, Clang runs nine strict integer reductions 5.09–9.71× faster, at 95–102% of the speedup of `-ffast-math`, with the strict bits on all 784 adversarial inputs, where `-ffast-math` and a one-bit mutant of the pass change results. The evaluation uses real data (the Cora citation graph and MNIST) and existing code: CPython's `audioop` module, Pillow, SciPy `ndimage` and PolyBench/C, where the pass licenses 23 of 109 reductions. The same facts let the pass accumulate such sums in integers, which reaches a median 102% of the speed of hand-written integer code without changing a result.

The manuscript is original, has not been published, and is not under review elsewhere. It does not extend a published conference paper. All code, scripts, raw measurements and the scripts that generate every number in the paper are available to reviewers as an anonymous artifact.

[Corresponding author: name, email, institution, ORCID.]

Sincerely,
[Authors]
