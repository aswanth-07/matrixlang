# Author and submission checklist (ACM TACO)

The manuscript and artifact are complete for author review. Nothing has been submitted. This checklist separates verified items from decisions only the authors can make.

## Recorded author details

1. A Aswanth Raj
2. Dr. RANJITHKUMAR S

Both: School of Computer Science and Engineering, VIT Vellore, India. Ranjithkumar is the mentor, and supervision is his stated contribution. No other contribution roles have been confirmed, and none are inferred from the author order.

## Authors must complete before submission

- Confirm that both authors qualify for authorship, consent to the author order, approve the final manuscript, and accept responsibility under ACM's authorship policy.
- Supply the corresponding author's email, ORCID iDs and any other identifiers the submission system asks for.
- Confirm the funding and competing-interest declarations. Missing information is not the same as declaring no funding or no interests.
- Review the "Use of generative AI" statement at the end of the manuscript and make it match what was actually done (implementation, literature search, evaluation scripts, analysis, drafting), as ACM policy requires.
- Check the current TACO author guidelines against `anonymous.pdf`: the 20-page limit (references excluded; both builds are now 20 pages *including* references), the `acmsmall` format, and double-anonymous review. See [venue.md](venue.md).
- Check TACO's abstract length. The abstract is 260 words; no TACO limit was found on 2026-10-23. If the limit is 250, trim ten words.
- Decide which declarations TACO wants in the manuscript itself (conflict of interest, funding, ethics). The manuscript has none, because only the authors can state them; no human subjects or personal data are involved beyond the public MNIST and Cora datasets.
- Put the artifact at an **anonymous** URL (for example an anonymised repository or archive) and cite it in the Data availability section. The public repository is not anonymous. `anonymous.pdf` removes names, affiliations and the repository URL; also check the PDF metadata of the file you upload.
- Check whether VIT Vellore participates in ACM Open. If it does not, budget for the article processing charge.
- Edit and send the cover letter ([cover-letter.md](cover-letter.md)).
- If you want a persistent archive, authorise a versioned release. No DOI is claimed here.

## Technical checks (done)

- `make test` passes: acceptance checks, strict numerical fixtures, browser-engine agreement, workspace service tests, the bound arithmetic against exact rationals, and the C backend against the VM.
- The bound-arithmetic repair is verified by `tools/contracts/bound_repair.py` (`results/contracts/bound_repair.json`): the unrepaired commit understates bounds in the oracle, the repaired one does not; every example under every contract compiles to byte-identical output; and the deterministic records of RQ1–RQ3, RQ5 and RQ6, rerun on the repaired compiler, match the recorded ones.
- `make -C llvm test` passes: the pass's expected decisions on the smoke tests, vectorization of exactly the licensed reductions, bit equality of the licensed build with strict Clang on every stress case, and detection of the one-bit mutant.
- Every number, table and figure is generated from raw results:
  - MatrixLang study: `tools/contracts/analyze.py`, from `results/contracts/`
  - Second machine and real data: `analyze_platforms.py`, from `results/contracts-linux*/` and `e2e_real.jsonl`
  - LLVM study: `analyze_llvm.py`, from `results/contracts/llvm_*`
  - Timing spread: `analyze_spread.py`; repair evidence: `bound_repair.py`
- Negative and null results are reported:
  - Reduction clauses gave no speedup on the generated kernels.
  - One mutant is equivalent.
  - The narrow-profile accuracy test is not significant.
  - 16-bit `audioop` functions gain nothing, because of the vectorizer's stride handling.
  - Most reductions in existing scientific code are declined.
- The real datasets are public, are downloaded by script, and are checked against SHA-256 digests (`results/contracts/llvm_data.json`).
- The anonymous and named PDFs build with no undefined references.

The missing author declarations mean this cannot yet be called a submission-ready or author-approved paper. They do not prevent reviewing, reproducing or improving the technical draft.
