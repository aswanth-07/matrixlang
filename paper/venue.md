# Venue strategy

Checked on 2026-10-08 for the contracts paper (*Exact, Bounded, or Relaxed*). The earlier recommendation of SPLASH-E applied to the archived teaching-compiler paper and no longer fits this manuscript, which is a compiler-optimization and floating-point paper.

## Verified

- **CGO 2027** (IEEE/ACM Code Generation and Optimization), Salt Lake City, 20–24 March 2027, co-located with HPCA, PPoPP and CC 2027. Two submission rounds: 11 June 2026 and 10 September 2026; **both have closed**. Papers use the ACM format, up to 11 pages excluding references; tool papers require a successful artifact evaluation. Source: the [official CGO 2027 call](https://2027.cgo.org/track/cgo-2027-papers), read 2026-10-08.

## Not verified

- **CC 2027** (ACM SIGPLAN Compiler Construction) is listed as co-located with CGO 2027 in Salt Lake City, but no CC 2027 call for papers could be found on 2026-10-08. Earlier editions set full-paper deadlines in November (CC 2026: 10 November 2025, per a [third-party aggregator](https://www.myhuiban.com/conference/259?lang=en-us); CC 2021: 10 November 2020, per its [call](https://www.sigarch.org/call-contributions/compiler-construction-cc-2021/)). A November 2026 deadline is an inference, not a date. Check [conf.researchr.org/series/CC](https://conf.researchr.org/series/CC) before planning.

## Recommendation

1. **CC 2027**, if its call opens with a deadline that allows the remaining work: the paper's scope (an analysis, a contract design, an implementation in a compiler, and an evaluation) matches CC's research papers, and the 8-page draft fits a typical CC limit. Confirm the page limit and format from the call.
2. **CGO 2028**, first round (expected around June 2027 if CGO keeps its two-round model; not announced). The RQ4 results with GCC are the part closest to CGO's interests; a CGO submission would be stronger with the exactness check implemented as an LLVM pass on real loop reductions.

What would most strengthen either submission: evaluation on real programs or benchmark kernels with integer-valued data (PolyBench, image and signal processing, quantized inference), which this machine could not download; an LLVM prototype; and a second author pass over the related work for any recent fast-math semantics papers the bounded search missed. No acceptance probability is claimed.
