# Author and submission checklist

The manuscript and artifact are complete for author review. Submission has not occurred. This checklist separates completed verification from decisions that only the authors can make.

## Recorded author details

1. A Aswanth Raj
2. Dr. RANJITHKUMAR S

Both: School of Computer Science and Engineering, VIT Vellore, India. Ranjithkumar is the mentor; supervision is the stated contribution. Other contribution roles have not been confirmed and are not inferred from the author order.

## Authors must complete before submission

- Confirm that both authors qualify for authorship, consent to the order, approve the final manuscript, and accept responsibility under the venue's policy.
- Supply the corresponding author's email and any requested identifiers.
- Confirm funding and competing-interest declarations. Absence of information is not a declaration of no funding or no interests.
- Confirm contribution statements and review the disclosure of AI assistance in implementation, literature search, evaluation, analysis and drafting, as the venue requires.
- Select the call (see [venue.md](venue.md)); check its page limit, template options and disclosure rules against the anonymous build.
- Supply an anonymous artifact URL or archive if the call requires one. The anonymous PDF removes names and the repository URL; the public repository itself is not anonymous.
- If a persistent archive is wanted, authorize a versioned release; no DOI is claimed here.

## Technical checks (done)

- `make test` passes: acceptance checks, strict numerical fixtures, browser-engine agreement and the workspace service tests.
- `tools/check_emit_c.py` passes: GCC's build of the emitted C prints the virtual machine's bits for every example and generated program, under every contract.
- Every number, table and figure in the manuscript is generated from `results/contracts/` by `tools/contracts/analyze.py`; `make contracts` repeats every measurement.
- Negative and null results are reported (reduction clauses give no speedup on the generated kernels; one mutant is equivalent; the narrow-profile accuracy test is not significant).
- Related-work citations were checked against primary sources or Crossref records on 2026-10-08; items that could not be verified were left out.
- The named and anonymous PDFs build with no undefined references and no overfull boxes.

The missing author declarations prevent describing this as a submission-ready or author-approved paper. They do not prevent reviewing, reproducing or improving the technical draft.
