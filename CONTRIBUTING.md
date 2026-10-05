# Contributing to MatrixLang

Describe the affected language behavior and include a small reproducing program
with expected and actual output. For numerical changes, state whether strict or
algebraic mode is intended and compare hexadecimal output with `--exact-output`.

Build with Flex, Bison, GNU Make and a C11 compiler:

```bash
make
make test
make web
make verify-research
```

Use native Python through `PYTHON` if MSYS2 selects a different interpreter.
Display dependencies are pinned in `requirements-lock.txt`. LaTeX uses the
publisher's `acmart` class; no generated parser or executable is committed.

Changes to compiler behavior, the program generator or the recorded protocol
require a complete `make research` run before publishing new research numbers.
Retain failures and zero-saving cases. Rebuild the displays with `make analyze`
and both PDFs with `make paper`, then inspect their layout. Changes confined to
prose need document and link checks rather than another measurement run.

Add regressions for a repaired defect. Browser parser changes need regenerated
Bison tables and the compiler/browser agreement check. Keep claims limited to
the evidence: modeled arithmetic is not runtime, exact agreement on a tested
population is not a proof, and proposed exercises are not learning outcomes.

Discuss new language scope or a change to the study design in an issue before
undertaking a large implementation. Keep review discussion clear and respectful.
