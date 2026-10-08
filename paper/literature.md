# Literature review and positioning

Search date: **2026-10-05**. This is a scoped review for a technical teaching-tool paper. It does not establish priority, exhaustive coverage, or a field-wide gap in compiler pedagogy. Static matrix shapes, property inference, matrix-chain dynamic programming, numerical contracts, and differential testing are established techniques.

## Recorded index queries

The following queries were sent to Crossref and arXiv, with eight records requested per source. Every returned set was inspected. Broad matching was often noisy, especially where “matrix,” “compiler,” or “signed” appeared in unrelated domains. Those misses led to exact-title and primary-source follow-ups, not assertions that related work does not exist.

| Formulation | Tool/cost study query | Numerical-contract/testing query |
| --- | --- | --- |
| Function | teaching compiler construction domain specific language | compiler differential testing floating point |
| Structure | linear algebra compiler matrix shape type | generating diverse valid compiler test cases |
| Mechanism | compiler arithmetic cost matrix chain | floating point algebraic compiler rewrite correctness |
| Problem | compiler course optimization evaluation | compiler numerical inconsistency testing |
| Effect | matrix chain floating point operations cost | matrix chain numerical accuracy |
| Inverse | compiler IEEE floating point correctness | compiler miscompilation signed zero |
| Adjacent domain | tensor compiler automated test generation | certified compilation education |

An additional broad cost-model query answered through Crossref; OpenAlex returned a rate-limit response and established no coverage. Exact-title searches and web searches followed the vocabulary of the closest work. Examples include `compiler course floating-point optimizer teaching`, `compiler education shape matrix optimizer`, `Linnea matrix compiler cost numerical stability`, and `compiler teaching matrix floating point 2025 2026`.

Reference inspection followed the closest accessible primary texts: Schwartzbach's course design, Linnea's linear-algebra generation, and Icing's rewrite semantics, with Csmith/NNSmith providing testing context. Targeted citing-title searches were used as a limited forward check. Complete forward-citation and co-citation coverage was not achieved; this is a material search limitation. Recent arXiv compiler-education work and the 2025–2026 SPLASH-E programs were checked separately. No saturation or systematic-review designation is claimed.

## Closest work and the actual delta

| Work | Access inspected | Position relative to MatrixLang |
| --- | --- | --- |
| [Henry, 2005](https://doi.org/10.1145/1047344.1047364) | Abstract/index metadata | A domain-specific language for compiler teaching is already an explicit proposal. MatrixLang does not claim novelty in choosing a DSL. |
| [Schwartzbach, 2008](https://doi.org/10.1007/978-3-540-78791-4_1), [author text](https://www.cs.tufts.edu/~nr/cs257/archive/michael-schwartzbach/dovs.pdf) | Full text | Examines source-language and phase choices. The earlier “language choice is rarely examined” premise was withdrawn. |
| [Stella, 2024](https://arxiv.org/abs/2407.08089) | Full text | Extensible type-system implementation teaching. MatrixLang focuses on connecting one shape domain to a cost model and numerical rewrite checks; no educational superiority comparison. |
| [Certified compilation in education, 2019](https://doi.org/10.4204/EPTCS.295.5) | Abstract | Formal correctness education predates this artifact. MatrixLang supplies empirical checks, not a certified compiler. |
| [Bowman, 2025](https://arxiv.org/abs/2509.19607) | Abstract | Intermediate-language interpreters and reuse for compiler-course testing. MatrixLang does not claim the first inspectable compiler pipeline. |
| [URIUM, 2026](https://arxiv.org/abs/2608.28202) | Abstract | Practical compiler course with multiple processors and operating systems. MatrixLang deliberately has a smaller target and language scope. |
| [Linnea, 2021](https://doi.org/10.1145/3446632), [full text](https://arxiv.org/pdf/1912.12924) | Full text | Property-aware cost-guided linear-algebra generation is established and richer than MatrixLang. The delta is an instructional artifact and controlled characterization. |
| [Generalized Matrix Chain Algorithm, 2018](https://doi.org/10.1145/3179541.3168804) | Abstract | Broader structured matrix-chain optimization. MatrixLang uses ordinary dense products, not a new chain algorithm. |
| [Goldberg, 1991](https://doi.org/10.1145/103162.103163), [reprint](https://docs.oracle.com/cd/E19957-01/806-3568/ncg_goldberg.html) | Full text, compiler sections | Floating-point non-associativity and unsafe algebraic rewrites are textbook results. The artifact makes selected boundaries executable. |
| [Icing, 2019](https://doi.org/10.1007/978-3-030-25543-5_10), [author text](https://cakeml.org/cav19.pdf) | Full text | Configurable fast-math semantics and verified optimizers. MatrixLang's two empirical modes have a much weaker guarantee. |
| [LLVM fast-math flags](https://llvm.org/docs/LangRef.html#fast-math-flags) | Official documentation | Separate rewrite permissions are established. MatrixLang uses one coarse instructional switch. |
| [Csmith, 2011](https://doi.org/10.1145/1993316.1993532), [author text](https://users.cs.utah.edu/~regehr/papers/pldi11-preprint.pdf) | Full text | Validity-aware random generation and differential compiler testing are mature. The small generator is not a new testing method. |
| [NNSmith, 2023](https://doi.org/10.1145/3575693.3575707), [full text](https://arxiv.org/html/2207.13066) | Full text | Shape validity and numerical considerations in compiler fuzzing. Our generated tests characterize one implementation and retain common-mode limitations. |
| [Curated semantic mutants, 2026](https://doi.org/10.1145/3841644.3842688), [author text](https://www.jonbell.net/preprint/splashe26-mutants.pdf) | Full text | Specification-aware testing and classroom deployment. MatrixLang has executable numerical fixtures but no student-test or feedback study. |

The surviving contribution is the executable teaching artifact and its measured connection between objective, workload, and legality. The paper's findings are local empirical results with controlled negative cases. It does not describe the technique combination as unprecedented.

## Contracts paper: sources verified on 2026-10-08

The contracts manuscript cites the following additions, each checked against a primary source (publisher or Crossref record, official documentation, release-branch source, or the author's own article). Items that could not be verified were left out of the manuscript.

| Topic | Source | How it was checked |
| --- | --- | --- |
| GCC floating-point ranges (ranger, frange) | A. Hernandez, Red Hat Developer article, 2023 | Author's article; the GCC 13 release notes do not describe the feature |
| LLVM `KnownFPClass` / `computeKnownFPClass` | `ValueTracking.h`, release/17.x (absent in release/16.x) | Release-branch headers |
| LLVM `foldFBinOpOfIntCasts` | `InstCombineInternal.h`, release/18.x (absent in release/17.x) | Release-branch headers |
| Ozaki scheme | Ozaki, Ogita, Oishi, Rump, Numer. Algorithms 59(1):95–118, 2012 | Crossref |
| FP64 GEMM on integer units | Ootomo, Ozaki, Yokota, IJHPCA 38(4):297–313, 2024; Ozaki, Uchino, Imamura, Ozaki Scheme II, IJHPCA 2026 | Crossref, arXiv |
| Reproducible summation | Ahrens, Demmel, Nguyen, ACM TOMS 46(3), 2020 | Crossref |
| Intel oneMKL CNR | oneMKL Developer Guide, "Obtaining Numerically Reproducible Results" | Official page |
| FPRev | Xie, Gao, Wang, Xue, USENIX ATC '25, 1425–1440 | USENIX page |
| RealCake | Becker et al., ECOOP 2022, LIPIcs 222 | Dagstuhl page |
| CIGEN | Miao, Laguna, Rubio-González, ICS '24, 201–212 | Crossref |
| Alive2 | Lopes et al., PLDI 2021, 65–79 | Crossref |
| Icing | Becker et al., CAV 2019, 155–173 | Crossref (LNCS volume not settled, so not cited) |
| OpenMP reduction order | OpenMP 5.2, Section 5.5.6: combination order unspecified | Specification |
| GCC `-fassociative-math` prerequisites | GCC manual, Optimize Options | Official manual |
| CC 2026 call (precedent for CC 2027) | conf.researchr.org, CC 2026 calls | Official page; no CC 2027 call posted on 2026-10-08 |
