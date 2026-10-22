# Cover letter (draft for the authors to edit)

To the Editor-in-Chief, ACM Transactions on Architecture and Code Optimization

Dear Editor,

Please consider our manuscript, "Exact, Bounded, or Relaxed: Proving Which Floating-Point Guarantee a Compiler Rewrite Keeps," for publication in ACM TACO.

Compilers give programmers two choices for floating-point code: strict IEEE semantics, or fast-math permissions that allow reassociation. The manuscript shows that a compiler can do better. From facts about the values a program will see, it can prove for each rewrite whether the result is bit-identical, within the source program's error bound, or valid only over the reals. It can then certify every output accordingly.

The contributions are:

- the contract lattice with per-output certificates;
- a theorem giving the exact threshold below which every bracketing of a matrix chain returns the correctly rounded product;
- a proof that the standard error bound is invariant under bracketing;
- two implementations, a matrix-language compiler with a C backend and an LLVM pass;
- an evaluation of nine research questions.

The LLVM pass may interest TACO's readers most. It derives the facts from integer conversions in ordinary C and marks a reduction reassociable only where every order is exact, statically or behind a run-time guard. With it, Clang's vectorizer runs strict programs as fast as with `-ffast-math`, and the bits never change, even on adversarial inputs that break `-ffast-math` and a mutant of the pass. The evaluation uses real data (the Cora citation graph and MNIST), two machines, GCC and Clang, and existing code: CPython's `audioop` module, Pillow, SciPy `ndimage` and PolyBench/C.

The manuscript is original, has not been published, and is not under review elsewhere. It does not extend a published conference paper. All code, scripts, raw measurements and the scripts that generate every number in the paper are available to reviewers as an anonymous artifact.

[Corresponding author: name, email, institution, ORCID.]

Sincerely,
[Authors]
