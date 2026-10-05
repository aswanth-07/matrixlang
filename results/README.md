# Recorded synthetic observations

These data describe MatrixLang's compiler and declared program generators.
They contain no student records, human-participant measurements, third-party
dataset or sampled real-world application. Code and original observations use
the repository's MIT license.

## Research population

`research/` is the paper's exploratory technical study. The protocol is
`paper/evaluation-protocol.json`; seeds 101–110 are separate from the two
development seeds. Every declared case is retained. The generator deliberately
creates compatible shapes and chain opportunities; its populations do not
represent courses or applications.

| File | Unit and fields |
| --- | --- |
| `cost.jsonl` | One program/configuration observation: profile, seed, index, source SHA-256, arm, baseline/optimized arithmetic and TAC counts, and per-program percentage reductions; 40,000 rows |
| `execution.jsonl` | One program/contract comparison: value population, seed, index, source SHA-256, arm, equality, and unoptimized/optimized output hashes; mismatch outputs are retained; 4,000 rows |
| `oracle.jsonl` | One chain: seed, length, index, dimensions, source hash, enumerated tree count, minimum and compiler cost, and before/after instruction counts; 1,250 rows |
| `numerics.json` | Fifteen named regression fixtures, exact outputs, strict agreement, intended algebraic differences and six independent scalar-reference checks |
| `environment.json` | Measured source, binary, protocol and raw-output hashes, platform/Python, arm flags, command, completion state and evaluation duration |
| `summary.json` | Recomputed per-profile/arm medians, IQRs, zero/negative counts, per-seed summaries, paired contrasts, bootstrap intervals and mismatch frequencies |

Arithmetic uses the conventional objective `m*p*(2*n-1)` per product, not VM
runtime. Percentages compare each program with its own unoptimized baseline.
Zero-cost baselines receive zero percentage reduction. Exact execution compares
printed hexadecimal values and labels; NaN payloads and exception flags are
outside the observation model. Algebraic differences can be permitted by the
selected numerical contract.

The source and output digests identify exact bytes. Git and the generators
preserve LF line endings; lineage paths use forward slashes. A rebuilt executable
may differ by platform or timestamp, so replay validates behavior without
requiring the recorded executable digest. Cross-platform numerical equivalence
has not been established.

`make verify-research` checks complete coverage, every generated program hash,
recomputed statistics, all 48,750 oracle trees, 440 sampled arm replays and all
numerical fixtures. `make analyze` rebuilds summary tables and the figure.
`make research` repeats the full protocol and replaces these local research
files; retain a copy first when comparing runs. Use Python without `-O`.

## Development and historical metadata

`seed1/` and `seed2/` retain the two development populations used in the
laboratory deck and browser demonstration. Cost measurements use algebraic
mode; output comparisons use strict mode. They are separate from the paper's
reported population.

`baseline-comparison.json` is historical exploratory repository-marker metadata.
Filename/text matches do not establish implemented functionality, and the
convenience sample does not represent compiler courses. These counts are
excluded from the research paper's evidence.

Known limitations include designed workload distributions, a shared frontend
and VM between execution paths, one evaluated platform, bounded small-chain
enumeration and no classroom study. The paper reports those limits beside the
results. GitHub distributes the data; no persistent archival DOI is claimed.
