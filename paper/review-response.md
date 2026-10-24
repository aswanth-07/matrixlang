# Revision in response to the numerical-contract review

The revised title is **Proof-Guided Floating-Point Optimization: Exact Reassociation, Error Bounds, and Compiler Certificates**. ExactReduce remains the LLVM pass name. The named and anonymous manuscripts share one source. Author names use mixed case, including the running headers, and placeholder publication footers are removed.

## Underflow: reproduced and repaired

The reported counterexample is valid. With q = 2^-1074, a = 3q, b = 1/2 and c = 3/4, binary64 evaluation returns 2q for (ab)c and q for a(bc), while the real result is 9q/8. Both violate the previously claimed relative-error bound. The same example runs through MatrixLang in the stated 2x1, 1x2, 2x1 embedding.

The bounded chain and reduction checks now require a representable product grid, in addition to a magnitude ceiling and explicit slack for accumulated error. This excludes inexact underflow while allowing exact subnormal results. The repair is deliberately conservative: a general real(1) chain is refused, whereas suitable integer and dyadic domains retain bounded optimization. Four new regression tests cover the exact counterexample, compiler execution, the product-grid boundary and certificate falsification.

The full exposed RQ1/RQ2 populations were replayed with a separately built GCC 13.3 compiler under Ubuntu 24.04/WSL on M1. RQ1 comprises 15,000 programs and 60,000 compilations; RQ2 comprises 4,800 programs, three input seeds and four optimized arms (57,600 arm executions). Compilation/execution errors and bit-identical-certificate mismatches were zero. Bounded real(1) recovery is now 43.7%, mixed-domain recovery 82.9%; the integer-domain rows are unchanged. New tables and macros are generated from the separate replay records. Historical real-domain bounded timings are retained with their interpretation withdrawn; they were not rerun as new performance results.

## LLVM: narrow the proof claim to its actual boundary

The manuscript names the VectorizerStart insertion point, tested LLVM 18 pipeline, contraction assumptions, fallback path and supported recurrence forms. The flag is also attached to supported subtraction and fmuladd recurrence instructions, so the earlier description of additions alone was too narrow.

The numerical proof covers regrouping the same terms. LLVM's reassoc flag does not enforce that restriction. The paper therefore does not claim that the theorem verifies every transformation permitted by LLVM, future compiler versions, or the final machine code.

New structural IR checks examine nine smoke functions: declined reductions acquire no reassoc, standalone products acquire none, broader fast-math flags are absent, and guarded functions retain strict fallbacks. The LLVM regression suite passed: 75 smoke outputs for each licensed/integer build, 784 stress cases for each, and 20 integer-width boundary cases. The one-extra-bit mutant was detected on ten cases. These are regression results, not a formal pipeline proof.

## Certificates: independent numerical replay

MATRIXC_CERTIFICATE_JSONL exports applied chain obligations as JSON Lines. The separate Python checker uses exact rational arithmetic to check dimensions, grids, finite bounds, all sub-chains/root splits, and the relative coefficient. On 221 example/generated programs, 660 accepted compilations produced 262 checked records: 166 bit-identical and 96 bound-preserving. The three remaining compilations reject one intentionally invalid example.

The checker does not certify extraction of facts from source, binding of records to machine code, all identity rewrites, or LLVM transformations. Per-output guarantee labels remain analysis explanations; an arbitrary program's composed numerical error expression is not independently reconstructed. These limits are explicit in the manuscript.

## Presentation and evaluation

- Rewrote the abstract around the mechanism, the numerical premises and the tested LLVM result.
- Added an overview of input facts, obligations, contract admission and optimization.
- Separated matrix-chain arithmetic reduction from fixed-reduction vectorization in the evaluation narrative.
- Retained the 23/109 coverage denominator and selection bias of the four code bases.
- Promoted the 29% compilation-time increase and 40% text-size increase, including the measured module sizes (4,149 and 5,801 bytes). Per-function compilation attribution was not collected and is not invented.
- Moved the secondary accuracy study to an appendix, retaining its numerical results, intervals, null result and inability to establish a causal mechanism.
- Replaced claims about universal compiler correctness with the demonstrated mathematical or empirical scope.
- Retained a truthful AI-assistance disclosure without asserting that the authors have already approved this revision.

## Remaining author responsibilities

This is a revised local author-review manuscript, not an automatically certified submission. The strict manuscript audit did not pass: the existing source lacks a complete claim/citation binding registry, and author declarations remain unconfirmed. Its prose scanner also misidentifies some LaTeX sections and bibliography content; those mechanical findings do not replace scientific review. A complete independent review of the mathematical arguments and implementation, author approval, funding/interests declarations, reviewer artifact access and venue-specific submission checks remain necessary. No acceptance probability is claimed and nothing has been submitted.

The named source, anonymous wrapper and all transitive LaTeX assets are in the delivery archive. The full compiler and raw replay records remain in the repository. `tools/review_displays.py` regenerates the corrected RQ1/RQ2 tables; the other tables retain their historical records.
