# Changelog

## Correctly rounded chains, C output, and the final paper

- The strict contract now accepts a chain whose proper sub-chains are exact and
  whose final sums round at most once: every bracketing and every order of
  summation then returns the correctly rounded product. Thresholds rise (for
  int(0,m) chains 100x2 * 2x100 * 100x2, from 35,578 to 35,697), and the
  threshold study now constructs witnesses showing that one step above it the
  bracketings can differ.
- Added `--emit-c`, `--dump-inputs` and `--no-license`: the program as C11, with
  an OpenMP reduction clause on exactly the products whose order of summation
  the contract leaves free. `tools/check_emit_c.py` requires GCC's build of the
  emitted C to print the virtual machine's bits.
- The chain pass moves `ones()`, `zeros()` and `identity()` operands above a
  chain, so `A * A * A * ones(n,1)` is reordered.
- Added six application kernels (`examples/kernels/`) and an end-to-end GCC
  study (`tools/contracts/e2e.py`); the mutation study gains a tenth mutant and
  a boundary population built from the threshold witnesses.
- The manuscript states the correctly-rounded-chain theorem, adds the C backend
  and the end-to-end results, and cites verified related work.

## Numerical contracts and the contracts paper

- Added run-time inputs with declared value domains (`input(int8)`,
  `input(real(1))`, ...), loaded from files or seeded draws and checked before
  execution.
- Added the grid-magnitude fact analysis, three numerical contracts
  (`--fp-strict`, `--fp-bounded`, `--fp-algebraic`), segmented chain ordering
  and per-output guarantee certificates (`--certificate`); `--no-proofs`
  reproduces the earlier strict optimizer.
- Fixed `2 * identity(n)` being folded to a scalar under algebraic rewriting.
- Fixed a certificate that could claim bit-identical for a result that relied
  on a weaker rewrite's facts; rewrites now inherit the weakest guarantee of
  the definitions their proof reads.
- Added the contracts study (`make contracts`): recovery, soundness, threshold
  tightness, GCC kernels, mutation adequacy and a preregistered accuracy study,
  with every paper number generated from raw observations.
- Replaced the manuscript with the contracts paper; the teaching-compiler paper
  is archived under `paper/archive/`.
- The workspace offers three contracts, an input seed, a Guarantees stage and an
  Evaluation page with an exactness-threshold explorer.

## Compiler workspace

- Added an editable source/results workspace with all compiler stages, five examples, diagnostic line links and a presentation view.
- Added a local compiler service, exact strict/algebraic comparisons and bounded execution.
- Retained the scanner/parser walkthrough and added a seven-minute demo guide.
- Added recorded static examples and service integration tests; the workspace uses no external assets.

## 2026-10-05 — Research artifact revision

- Rewrote the manuscript as a technical educational-tool study in ACM SIGPLAN
  format, with named and anonymous PDFs, primary-source positioning, venue
  strategy, author checklist, and proposed teaching exercises.
- Made strict floating-point optimization the default and added explicit
  `--fp-algebraic` and hexadecimal `--exact-output` modes.
- Repaired constant serialization, temporary-name collisions, chain dependencies,
  and declaration-dimension validation before integer conversion.
- Added a five-profile, eight-arm, ten-seed cost study; two execution value
  populations; an independent exhaustive chain oracle; and numerical fixtures.
- Retained raw observations and source/protocol hashes, generated statistics,
  uncertainty and per-seed tables, and a coverage/replay verifier.
- Repaired Unicode Bison-report export and quoted Python interpreter selection;
  reconciled the development demo, deck and reports with the numerical contracts.

The technical manuscript is for author review. No venue submission, acceptance,
classroom study, runtime speedup or archival DOI is claimed.
