# MatrixLang research artifact

**MatrixLang: Connecting Shape, Cost, and Numerical Contracts in a Teaching Compiler**

Authors, in order: **A Aswanth Raj**, **Dr. RANJITHKUMAR S**. Both are affiliated with the School of Computer Science and Engineering, VIT Vellore, India. Ranjithkumar's stated role is mentorship/supervision. See the [author checklist](submission-checklist.md) for unconfirmed administrative details.

The [named manuscript](matrixlang.pdf) and [anonymous review build](anonymous.pdf) describe a technical educational-tool study. There is no classroom experiment, claimed new optimization algorithm, runtime speedup, or proof of universal floating-point preservation. The [venue assessment](venue.md) recommends the next announced SPLASH-E archival call; the 2026 deadline has passed.

## Reproduce

Build tools: Flex, Bison, GCC or a compatible C11 compiler, GNU Make. Evaluation scripts use Python 3.10 or newer and the standard library. Display generation uses the packages in `requirements.txt`; `requirements-lock.txt` records the evaluated Python package versions. PDFs use the publisher's `acmart` class with `sigplan,review` options and an existing LaTeX installation.

From the repository root:

```bash
make
make test
make verify-research  # check recorded lineage, every program hash, and replay
make analyze          # rebuild summary, tables, and figure from recorded data
make paper            # build named and anonymous PDFs, twice each
```

To repeat every measurement:

```bash
make research
make verify-research
make paper
```

`make research` replaces the local recorded research output. Copy it elsewhere first if comparing versions. The reference run takes about ten minutes on the evaluated machine; this is evaluation-driver duration, not a compiler benchmark. A rebuilt binary can have a different digest because of platform or build timestamps. The verifier requires recorded source/protocol equality and checks representative replay rather than demanding identical executable bytes across machines.

Git pins text files to LF, raw observations are written with LF, and source-lineage keys use portable forward-slash paths. The verifier compares exact recorded bytes; preserve these line endings when copying the artifact outside Git. A fresh Git-exported checkout was built and verified on the evaluated Windows host. This packaging check does not establish cross-platform numerical equivalence.

On Windows, use MSYS2 Bash with `/mingw64/bin` before `/usr/bin`; do not substitute WSL Bash for the native MinGW build. LaTeX compilation was verified with MiKTeX's `acmart` 2.20. The built-in document compiler was unavailable on this host, so the exported PDFs were compiled with the existing MiKTeX installation.

## Evidence map

| Result | Data | Check |
| --- | --- | --- |
| 5,000 cost programs, 40,000 arm observations | `results/research/cost.jsonl` | All five profiles, ten seeds, 100 programs, eight arms; medians, IQRs, zero and negative counts |
| Paired arithmetic minus instruction contrast | `results/research/summary.json` | Median per-program difference; seed-cluster bootstrap, 2,000 resamples, seed 87123 |
| 2,000 execution programs | `results/research/execution.jsonl` | Strict and algebraic comparisons against unoptimized hexadecimal output; all mismatch outputs retained |
| 1,250 chains, 48,750 candidate trees | `results/research/oracle.jsonl` | Exhaustive independent parenthesization enumeration, without dynamic programming or compiler cost imports |
| 15 numerical fixtures | `results/research/numerics.json` | Strict equality, intended algebraic differences, six independent scalar references |
| Tables, macros, and Figure 1 | `paper/generated/`, `paper/figures/research.pdf` | `tools/analyze_research.py` reads raw data and checks recorded output hashes |
| Protocol and lineage | `paper/evaluation-protocol.json`, `results/research/environment.json` | Source, binary, program, protocol, and output SHA-256 hashes |

The original two-seed datasets are retained as development experiments for the laboratory demonstration. Their measurements use algebraic mode for cost and strict mode for execution; they are not the paper's evaluation population. The historical repository-marker comparison is exploratory metadata and is excluded from the paper's evidence.

## Contracts and interpretation

Strict mode is the default. `--fp-algebraic` explicitly permits reassociation and real-number identity rewrites, including changes in rounding, signed zero, and NaN/Infinity propagation. `--exact-output` prints hexadecimal values for comparisons. NaN payloads, exception flags, memory failures, and alternate floating-point environments are outside the tested observation model.

The arithmetic objective is `m*p*(2*n-1)` for a dense matrix product, with zero arithmetic assigned to movement and constructors. The VM also adds the first product to a positive-zero accumulator; those initial additions are outside the conventional model. The paper reports model reductions, not executed machine instructions or elapsed time.

The heterogeneous algebraic median is 45.3% arithmetic reduction (IQR 0.8–79.9%) and 5.9% instruction reduction (IQR 0.0–9.5%). Square and elementwise controls have zero chain savings. Strict output matches all 2,000 generated execution cases; algebraic output differs on 813/1,000 broad-value cases despite zero differences on 1,000 dyadic cases. These observations are scoped to the declared synthetic populations.

## License and provenance

Scientific-writing review also used the procedural guidance in Timothy Kassis,
Vinayak Agarwal, Yuhuan He, Darshil Patel, and Aubrey M. Brueckner (2026),
[Scientific Agent Skills: A Library of Procedural Knowledge for Research Agents](https://doi.org/10.48550/arXiv.2609.00065).
This identifies assisted workflow provenance; it is not experimental evidence
for MatrixLang or independent human verification.

All research observations are generated locally from synthetic programs. No third-party dataset or human-participant data is included. Compiler, generators, raw results, and original figures are covered by the repository's existing MIT license. References and their source URLs are documented in [literature.md](literature.md); third-party papers and publisher templates are referenced rather than redistributed. GitHub is the current distribution point, not a persistent archival DOI.
