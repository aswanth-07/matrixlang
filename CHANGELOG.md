# Changelog

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
