# Revised compiler manuscript — 24 October 2026

Title: Proof-Guided Floating-Point Optimization: Exact Reassociation,
Error Bounds, and Compiler Certificates

The named and anonymous PDFs each have 22 pages, including references.
They share the scientific content in matrixlang.tex; anonymous.tex selects
the anonymous build. This archive contains every locally referenced TeX
input and figure. References are embedded in the main TeX source.

Build with a current TeX Live or MiKTeX installation providing acmart,
booktabs, graphicx, listings, xurl, and amsmath:

    pdflatex -interaction=nonstopmode -halt-on-error matrixlang.tex
    pdflatex -interaction=nonstopmode -halt-on-error matrixlang.tex
    pdflatex -interaction=nonstopmode -halt-on-error anonymous.tex
    pdflatex -interaction=nonstopmode -halt-on-error anonymous.tex

The review, nonacm settings retain line numbers and omit placeholder
publication metadata. Confirm the venue's current submission settings
before submitting. The anonymous wrapper does not anonymize the named
source archive; send only the anonymous PDF where anonymity is required.

The generated-review inputs replace historical RQ1/RQ2 results after the
underflow repair. Other performance measurements retain their original
scope. Former bounded real-domain timings are labelled as historical in
the paper, not asserted as results of the repaired admission policy.

The adjacent review-response.md explains the corrections and their limits.
The full compiler and raw experiments remain in the matrixlang repository.
From that repository, validation entry points are:

    make test
    make -C llvm test LLVM_CONFIG=llvm-config-18 CXX=clang++-18 CLANG=clang-18
    python tools/replay_review_corpus.py --help
    python tools/replay_review_certificates.py --binary /absolute/path/to/matrixc
    python tools/review_displays.py

To replay the exported numerical obligations without the compiler, run
from the delivery directory (Python 3.10+; do not enable Python -O):

    python check_chain_certificate.py numerical-certificates.jsonl

That check validates numerical obligations conditional on the recorded
operand facts. It does not verify fact extraction, identity rewrites,
LLVM transformations, or emitted machine code.

Author approval, declarations, reviewer artifact access and an independent
scientific review remain author responsibilities. No submission was made.
