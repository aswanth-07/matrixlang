# MatrixLang — design notes

Why the code is shaped the way it is. For *what* the language accepts, see
[language-reference.md](language-reference.md).

---

## The one idea

A type carries its shape. Everything else follows from that:

- `src/types.c` holds the shape rules and nothing else. There is exactly one
  place that decides whether `A * B` is legal and what it produces, and both the
  semantic analyser and the code generator consult it. Had those rules been
  written inline in `semantic.c`, the code generator would have had to re-derive
  "is this a matrix product or a scaling?" from operand types a second time, and
  the two derivations would eventually disagree.
- The AST carries a `Type` on every node, so shapes are visible in `--ast`.
- The IR carries a `Type` on every instruction, so `--tac` shows shapes and the
  code generator does not have to recompute them.
- The optimizer uses shapes to build the replacement for `A * 0` — it needs to
  know what shape of zero matrix to produce.
- The VM needs no shape checks at all, because everything it executes was
  already proved to fit.

---

## Decisions worth defending

### No control flow

`if` and `while` are absent by choice. The consequence is that a program is a
single basic block, and that is what makes the Phase 3 optimizations *exact*
rather than conservative: available expressions and liveness are both computed
by one linear scan, with no control-flow graph and no dataflow iteration.

Adding control flow would roughly double the size of the optimizer while adding
nothing to what this project is actually about — dimension-aware semantics and
matrix-specific optimization. It is the obvious first extension, and
[phase3-optimization.md](phase3-optimization.md#8-possible-future-work) says so.

### Declaration is initialisation

`matrix A[2,3];` means a 2x3 matrix of zeros, and the VM creates it that way.
So there is no use-before-initialisation warning: reading `A` before assigning
to it is defined behaviour, and warning about it would be wrong.

This was not the first design. The compiler initially warned, inherited from a
language where declaration leaves a variable undefined — which contradicted what
the VM actually did. The symbol table's `Init` column was then always "yes" and
told the reader nothing, so it became `Writes`.

### `identity()`, `zeros()` and `ones()` are not conveniences

They are what make `A * I -> A` implementable. An optimizer can only fold an
identity away if the compiler knows some value *is* an identity, and a language
with no way to construct one gives it nothing to know. These builtins put that
fact into the compiler's hands.

Matrix literals are inspected for the same properties, so `{{1,0},{0,1}}`
optimizes exactly like `identity(2)`. That was worth the few lines: without it,
the optimization would only fire on a notation the programmer had to know to
use, which is close to cheating.

### No broadcasting

`A + s` is rejected. It could only mean "add `s` to every element", which reads
exactly like matrix addition and is not, and accepting it silently is how a
shape bug survives to runtime. Rejecting it costs nothing and the error message
says why.

### Dimensions must be compile-time constants

`zeros(n, 4)` with `n` a variable is an error. This is the premise of the
language rather than a limitation of the implementation — if a shape could
depend on a value, none of the checking, none of the inference, and none of the
optimization would be possible.

Constant *expressions* are folded, so `zeros(2+1, 4)` works.

### A stack machine for the target

The MVM has no registers, so code generation needs no register allocation. That
keeps the phase about the thing worth showing — choosing `MATMUL` vs `MATSCALE`
vs `SCALMUL` from inferred types — instead of turning into a second, unrelated
problem.

---

## Structural choices

### One AST node type, not fifteen

A generic node with a child vector, rather than a union of per-construct
structs. Four passes walk this tree (semantic analysis, the printer, TAC
generation, expression rendering for diagnostics), and with a tagged union each
would be a hand-written traversal that must be kept in step with the others.
With a uniform node each is one `switch` over `NodeKind`.

The cost is that the meaning of `kids[0]` is positional and documented in
`ast.h` rather than enforced by the compiler. That is a real trade; it is worth
it at this size and would not be at ten times this size.

### All diagnostics through one reporter

The lexer, parser, semantic analyser and VM all call `diag_report`. That buys
three things direct printing would not: messages emerge **sorted by source
position** regardless of which pass found them; errors can be counted, which is
what the exit status depends on; and `diag_detail` can attach the indented
explanation blocks that make shape errors readable.

### Expressions are rendered back to source for diagnostics

`ast_expr_text()` turns a subtree back into readable text so a message can say
`left : A * B` rather than `left operand`. Small feature, large difference in
how actionable an error is.

### Interned IR operands

TAC operands are strings, textbook style, and their spelling classifies them
(`A` variable, `t1` temporary, `3` constant, `#0` literal). Interning means
every operand pointer stays valid for the life of the IR, so optimizer passes
can copy operand pointers between instructions without any ownership question.

### Error containment via a poison type

Once an expression is `TY_ERROR`, later checks treat it as acceptable. Without
that, one undeclared variable inside a large expression produces an error for
the variable and then another at every operator above it.

---

## Bugs worth remembering

**The optimizer's log read the instruction after rewriting it.**
`rewrite_to_copy()` clears `a2` and changes `op`, so two log messages printed
`(null)` for an operand and the wrong operator symbol. The fix is to read out
whatever the message needs *before* the rewrite. The transformation itself was
correct throughout — only the explanation was wrong, which is the kind of bug a
test that checks only instruction counts would never catch.

**A `%destructor` for AST nodes freed the finished tree.** Bison pops and
destroys the whole remaining parse stack as `yyparse` returns — including after
a *successful* parse — so a `<node>` destructor freed the completed AST and left
`parse_root` dangling. `matrix.y` keeps only the `<str>` destructor; subtrees
discarded by error recovery are leaked deliberately, since the process is about
to exit and the obvious fix corrupts every good run. The comment in `matrix.y`
says so, because the omission looks like an oversight otherwise.

---

## Build environment

Two things about this machine cost real debugging time.

**gcc's temporary directory.** `TMP` and `TEMP` do not survive into make's child
processes on Windows, so gcc falls back to `GetTempPath()`, which returns
`C:\Windows` — not writable. The build fails with `Cannot create temporary
file`. The Makefile exports `TMPDIR`, `TMP` and `TEMP` itself, pointed at
`build/tmp` via `cygpath -m`. Do not remove that block.

**PATH ordering.** `/c/msys64/mingw64/bin` must come before the rest of `PATH`.
If a conflicting runtime DLL is found first, gcc's `cc1.exe` fails to start and
gcc exits 1 with no diagnostic whatsoever.

Also: `make` defines `CC = cc` as a built-in, so `CC ?= gcc` never fires. The
Makefile uses `ifeq ($(origin CC),default)` instead, which still respects a `CC`
given on the command line.

---

## Testing philosophy

Each case asserts **two** things: the exit status and specific text in the
output. Exit status alone would pass a compiler that rejected everything for the
wrong reason; output text alone would not catch one that printed the right
message and then exited 0.

The suite's strongest check is that every example produces byte-identical output
with and without the optimizer. A smaller program that computes something else
is not an optimization, and instruction counts cannot tell the difference.

What the tests do not cover is listed explicitly in
[phase3-optimization.md](phase3-optimization.md#what-the-tests-do-not-cover),
because a limitations section that is actually accurate is worth more than a
claim of completeness.
