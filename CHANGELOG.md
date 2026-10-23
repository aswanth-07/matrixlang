# Changelog

## Sound bound arithmetic and a 20-page manuscript

- Repaired two understated bounds in `src/ir/facts.c`. `mul_up` lost a
  positive FMA residual that fell below the subnormal range, so a product
  bound near the smallest normal number could sit below the exact product; the
  residual is now compared after an exact scaling by 2^54. `facts_chain_bound`
  formed the bounded contract's coefficient as fl(prod(1+gamma)) - 1 and could
  understate it; it is now accumulated upward. `fits` also rejects a
  non-finite bound before its coarse-grid shortcut.
- Added `tests/test_bound_arithmetic.py` (run by `make test`), which checks the
  bound arithmetic against exact rationals on generic x86-64 and Haswell.
- Added `tools/contracts/bound_repair.py`: the measured commit against the
  repaired one, on the oracle, on every example under every contract, and on
  rerun deterministic study records. Nothing measured changed.
- Added `tools/contracts/analyze_spread.py`, which states the timing spread
  behind every speedup.
- The manuscript caps the exactness condition at `DBL_MAX`, reports the repair,
  states timing spread, writes its contributions as findings, describes the
  RQ6 protocol as recorded locally rather than preregistered, and fits 20
  pages including references.

## The journal version: an LLVM license, real data, a second machine

- Added ExactReduce (`llvm/`), an LLVM 18 pass plugin that derives grid facts
  from integer conversions in C and sets `reassoc` on a floating-point add
  reduction only when every order of its additions is exact: statically, or
  by versioning the loop behind a guard on the actual start value and trip
  count. `make -C llvm test` checks its decisions, that exactly the licensed
  reductions vectorize, and bit equality with strict Clang on adversarial
  inputs, and that a one-bit-wider mutant is caught.
- Added the LLVM study: `llvm_data.py` (MNIST, Cora, an int8 classifier,
  digests checked), `llvm_eval.py` (RQ7 speed, RQ8 stress and mutants),
  `llvm_scan.py` (RQ9: audioop, Pillow, SciPy ndimage, PolyBench/C) and
  `llvm_audioop.py` (audioop strict against licensed, end to end), analysed by
  `analyze_llvm.py`.
- RQ4 now also runs on real data (`examples/kernels/real/`, `e2e_real.py`) and
  on a second machine with GCC and Clang (`CONTRACTS_RESULTS`, `E2E_CC`),
  analysed by `analyze_platforms.py`; Table 6 gains the algebraic column, the
  fair baseline for chain reordering.
- The manuscript moves to ACM TACO's journal format (acmsmall,
  double-anonymous) with the LLVM section, RQ7-RQ9, a soundness argument for
  certificates, the guarded-reduction proposition and threats to validity; the
  venue notes, checklist, review notes and a cover letter follow it.

## Product demo and race

- Redesigned the workspace as a dark, IDE-style product in an IEEE 754 field-diagram world: every reported value can be opened as its sign, exponent and fraction bits, compared bit for bit.
- Added the Race view (`tools/race.py`, `POST /api/race`): one program raced as MatrixLang's three contracts against NumPy `@`, NumPy `multi_dot`, GCC `-O3` and GCC `-ffast-math`, on the same inputs, with one thread count for every contestant, timed and compared bit for bit on the local machine.
- Added the Opener (Python's floating-point results in bits), the Results view (speedup, bits and guarantees), a presenter strip for the five-minute path, a command palette, and `docs/demo-notes.md`.
- Added `examples/race/overflow_trap.ml`, where the cheaper bracketing overflows: `multi_dot` returns infinity and MatrixLang keeps the finite answer.

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
