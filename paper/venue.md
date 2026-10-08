# Venue strategy

Checked on 2026-10-08 for the contracts paper (*Exact, Bounded, or Relaxed*), a compiler-optimization and floating-point paper with an implementation and an evaluation.

## Verified

- **CGO 2027** (IEEE/ACM Code Generation and Optimization), Salt Lake City, Utah, USA, 20–24 March 2027, co-located with HPCA, PPoPP and CC 2027. Two submission rounds, 11 June 2026 and 10 September 2026; **both have closed**. Papers use the ACM format, up to 11 pages excluding references. Source: the [CGO 2027 call](https://conf.researchr.org/track/cgo-2027/cgo-2027-papers), read 2026-10-08.
- **CC 2026**, the most recent CC call, as the precedent: full papers due 11 November 2025 (AoE), notification 10 December 2025; at most **10 pages of text, references excluded**; ACM `acmart` with `sigplan,10pt,review,anonymous`; **double-blind**; artifacts encouraged, required for tool papers. Source: the [CC 2026 call](https://conf.researchr.org/track/CC-2026/calls), read 2026-10-08.

## Not verified

- **CC 2027** is listed with CGO, HPCA and PPoPP in Salt Lake City (20–24 March 2027), but no CC 2027 call was posted on 2026-10-08 ([series page](https://conf.researchr.org/series/CC) lists editions up to 2026). A deadline in November 2026 follows the pattern of earlier editions; it is an inference, not a date.

## Recommendation

1. **CC 2027**, when its call appears. The paper's scope (an analysis, a contract design, a theorem, an implementation with a C backend, and an evaluation under GCC) is CC's research-paper scope. The manuscript is formatted as CC 2026 required (`sigplan,10pt,review,anonymous`); check the body against the 10-page limit of the new call.
2. **CGO 2028**, first round (expected around June 2027 if CGO keeps two rounds; not announced). The end-to-end GCC results and the reduction clauses are the parts closest to CGO; an LLVM implementation would strengthen a CGO submission.

What would most strengthen either submission: kernels from existing applications or benchmark suites with integer-valued data (graph analytics, quantized inference, image processing), which this machine could not download; an LLVM prototype of the per-reduction license; and a second author pass over related work. No acceptance probability is claimed.
