# Venue strategy

Revised on 2026-10-22 for the journal version of the contracts paper (*Exact, Bounded, or Relaxed*). The earlier assessment, written for a conference submission, is in the Git history.

## Target: ACM Transactions on Architecture and Code Optimization (TACO)

What TACO is: ACM's journal for hardware, software and system research in computer architecture and code optimization. Compiler optimization papers with an implementation and a measured evaluation are in its core scope.

Rules that shape the manuscript. These come from TACO's author guidelines as quoted by search results on 2026-10-22; dl.acm.org could not be opened from this machine, so confirm them on the page before submitting:

- **Length:** an initial submission may have at most 20 pages in the ACM small (`acmsmall`) format, references excluded. A revision may be longer, and the published version may have at most 25 pages including references. The current anonymous build is within the 20 pages.
- **Review:** double-anonymous. Remove names, affiliations, funding, acknowledgements, the repository URL and identifying file metadata. Cite your own earlier work in the third person. `anonymous.pdf` is the build to submit.
- **Decisions:** accept, minor revision, major revision or reject. A paper gets one major revision, not several. Reported time to a first decision is about two months.
- **Conference extensions:** a paper extended from a conference version needs at least 25–30% new material. This paper has no published conference version, so the rule does not apply.
- **Open access and fees:** since 1 January 2026 ACM publishes everything open access. If the corresponding author's institution is not in ACM Open, an article processing charge applies. The 2026 subsidised journal rate was reported as about USD 950 for ACM members and USD 1,450 for non-members. Check whether VIT Vellore participates in ACM Open, and check the current charge.

Acceptance: the only figure found is a third-party estimate of about 30% after review. No official TACO figure was found.

## How the manuscript was strengthened for TACO

Changes made against the weaknesses that a conference review would raise:

1. **A prototype in a production compiler.** ExactReduce (`llvm/`) is an LLVM 18 pass that derives the paper's facts from integer conversions in C. It marks a reduction reassociable only where every order is exact, either statically or behind a run-time guard. With it, Clang's vectorizer runs strict programs as fast as with `-ffast-math`, and the bits stay the same.
2. **Real data.** The study now uses the Cora citation graph, MNIST, and an int8 classifier trained on MNIST, in both MatrixLang and C.
3. **Existing code.** Four existing code bases were compiled with the pass: CPython's `audioop` module, Pillow, SciPy `ndimage` and PolyBench/C. `audioop` was then tested end to end, with timings.
4. **A second machine and compiler.** RQ4 was repeated on Linux with GCC 13 and Clang 18. Certified outputs are bit-identical across machines, compilers, vector widths and thread counts.
5. **A fair baseline.** The RQ4 tables now show the algebraic contract, which reorders without proofs. The headline speedups are presented as recovering unproved reordering under strict semantics, not as a win over `-ffast-math`.
6. **Soundness under adversarial inputs.** A stress suite was built from the proof obligations, together with two mutants of the pass: one that admits one more significand bit, and one that licenses every reduction without a proof.
7. **Rigor.** The paper adds a soundness argument for bit-identical certificates and the guarded-reduction proposition that the LLVM guard implements.

## Remaining risks a TACO reviewer may raise

- MatrixLang is still straight-line and statically shaped. The loop story is carried by the LLVM pass, not by MatrixLang.
- The pass applies only where integer data is converted where it is summed. In the scanned code bases it guarded a minority of the reductions LLVM recognizes (Table 14 of the paper); most scientific reductions sum floating-point data, and the pass declines those by design. The paper says so.
- Runtime was measured on two machines. One of them is a 4-core cloud instance.
- The theory is clean but not deep. Theorem 5.1 follows from Higham's standard analysis, which the paper states.
- The authors must disclose the use of generative AI under ACM policy. A draft statement is in the manuscript; the authors need to confirm or edit it.

## Alternatives

- **CC 2027**, if its call appears and the deadline allows. The paper would have to be cut back to the conference's page limit, and the LLVM study would make it stronger there too.
- **CGO 2028**, first round (expected around mid-2027). The LLVM pass and the GCC/Clang results are the parts closest to CGO.
- **ACM TOPLAS**, if reviewers mainly value the semantics and theorems. It fits the evaluation less well than TACO.

No acceptance probability is guaranteed. My judgement is in the session that produced this revision, not in the artifact.
