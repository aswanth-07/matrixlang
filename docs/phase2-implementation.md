# Phase 2 — Core Implementation

The Review 2 deliverable. The manual is explicit that presenting source code
without execution is not sufficient, so everything below is something that runs.

Demonstration: `make demo2`

---

## What Phase 2 built

```
    source -> tokens -> AST -> symbol table -> dimension checking -> TAC
```

| Module | File | Lines |
| --- | --- | --- |
| Lexical analyser | `src/matrix.l` | 119 |
| Parser and AST construction | `src/matrix.y` | 201 |
| AST representation and printer | `src/ast.c` | 206 |
| Symbol table | `src/symtab.c` | 178 |
| Shape rules | `src/types.c` | 108 |
| Semantic analysis | `src/semantic.c` | 469 |
| Three-address code | `src/tac.c` | 376 |
| Diagnostics | `src/diag.c` | 133 |

---

## 1. Lexical analysis

`src/matrix.l`, generated with Flex.

Recognises keywords, identifiers, numeric literals (including decimals and
exponents), all operators, brackets, braces, separators, and both comment
forms. It reports illegal characters and identifiers that begin with a digit.

Two implementation points worth explaining at a viva:

**Position tracking.** A single `lex_advance()` function walks the matched text
and updates line and column. Putting it in one place is what makes a multi-line
block comment update the position correctly without needing a start condition,
and exact positions are what let a later dimension error point at the precise
operator that failed.

**The token table.** Bison pulls tokens one at a time and discards each once it
is shifted, so after the parse there is no stream left to display. Scanning the
file twice would report every lexical error twice. Instead the scanner appends
each token to `src/tokens.c` on its way out, so the token table is a byproduct
of the parse rather than separate work.

```
$ ./bin/matrixc --tokens examples/valid/multiply.ml
```

---

## 2. Syntax analysis

`src/matrix.y`, generated with Bison as an LALR(1) parser. **No conflicts** —
the build runs `bison -Wcounterexamples`, which would explain any it found.

The parser builds an AST and does nothing else: no name resolution, no shape
checking. It cannot know the shape of an identifier, and making it try would
tangle two phases together.

**Error recovery.** The production `stmt -> error ';'` resynchronises at the
next semicolon, so a file with three syntax errors reports three:

```
$ ./bin/matrixc --check examples/errors/syntax.ml
6:1:  error [syntax] syntax error, unexpected IDENT, expecting ';' or '='
7:12: error [syntax] syntax error, unexpected NUMBER, expecting ','
8:8:  error [syntax] syntax error, unexpected ';', expecting '+' or '-' or '*' or ')'
3 error(s), 0 warning(s).
```

---

## 3. The abstract syntax tree

One generic node type with a child vector, rather than a union of
per-construct structs. Four passes walk this tree — semantic analysis, the
printer, TAC generation, and expression rendering for diagnostics — and a
uniform node makes each of them a single `switch` instead of a bespoke
traversal that has to be kept in step with the others.

After semantic analysis every node carries its inferred shape, and the printer
shows it:

```
$ ./bin/matrixc --ast examples/valid/multiply.ml

Program  (line 1)
|-- Declare A : Matrix<2x3>  (line 5)
|   `-- MatrixLiteral : Matrix<2x3>  (line 5)
|       ...
|-- Declare C : Matrix<2x4>  (line 13)
|   `-- BinaryOp * : Matrix<2x4>  (line 13)
|       |-- Identifier A : Matrix<2x3>  (line 13)
|       `-- Identifier B : Matrix<3x4>  (line 13)
`-- Print : Matrix<2x4>  (line 15)
    `-- Identifier C : Matrix<2x4>  (line 15)
```

`Matrix<2x4>` on the `*` node was never written in the source. That single line
is the clearest evidence that dimension inference works.

---

## 4. Symbol table

A single hash table (djb2, 211 buckets). `sym_insert` refuses a name that
already exists and returns NULL, and the caller looks the previous declaration
up to report where it was.

There is one scope, and no scope stack. MatrixLang has no blocks and no
functions -- a deliberate language decision, not an unfinished one -- so a stack
could only ever hold a single entry. The printed Scope column reads `global` on
every row because that is the truth about the language.

Symbols are also kept on one insertion-ordered list, separate from the hash
buckets, because the table has to print in declaration order rather than in
whatever order hashing produced.

```
$ ./bin/matrixc --symbols examples/valid/scalars.ml

+----------------+--------+------+------+----------+---------+--------+-------+
| Name           | Kind   | Rows | Cols | Scope    | Decl@Ln | Writes | Reads |
+----------------+--------+------+------+----------+---------+--------+-------+
| k              | Scalar |    - |    - | global   |       6 |      1 |     2 |
| half           | Scalar |    - |    - | global   |       7 |      1 |     2 |
| M              | Matrix |    2 |    2 | global   |       9 |      1 |     2 |
| Scaled         | Matrix |    2 |    2 | global   |      12 |      1 |     1 |
| Halved         | Matrix |    2 |    2 | global   |      13 |      1 |     1 |
| product        | Scalar |    - |    - | global   |      15 |      1 |     1 |
+----------------+--------+------+------+----------+---------+--------+-------+
6 symbol(s).
```

The `Rows` and `Cols` columns are the entire point: this is where the shape
information that every check consults actually lives.

---

## 5. Semantic analysis — the centrepiece

`src/semantic.c`, with the shape rules isolated in `src/types.c`.

The pass walks the AST, populates the symbol table, annotates every expression
node with the shape it produces, and rejects operations whose shapes do not
combine.

### Shape inference

```
A : Matrix<2x3>    B : Matrix<3x4>
A * B              -> Matrix<2x4>       columns(A) == rows(B)
transpose(A)       -> Matrix<3x2>       rows and columns exchanged
A * transpose(A)   -> Matrix<2x2>
```

### Dimension checking

Multiplication:

```
$ ./bin/matrixc --check examples/errors/mul_mismatch.ml

9:7: error [semantic] cannot multiply Matrix<2x3> by Matrix<5x4>
        left   : A -> Matrix<2x3>
        right  : B -> Matrix<5x4>
        rule   : columns(left) must equal rows(right)
        found  : 3 != 5
```

Addition:

```
6:14: error [semantic] matrix addition requires identical dimensions
        left   : A -> Matrix<2x3>
        right  : B -> Matrix<3x2>
        rule   : rows and columns must match on both sides
        found  : 2x3 against 3x2
```

The detail block names both operands *as they were written*, the rule, and what
was actually found. `src/ast.c` renders an expression back into source text for
this, so the message says `left : A * B` rather than `left operand`.

### Other checks

Undeclared names, duplicate declarations, storing a value into a variable of the
wrong shape, transpose of a scalar, mixing a scalar with a matrix under `+`,
ragged matrix literals, and dimensions that are not compile-time constants. All
are demonstrated in `examples/errors/`, each file documenting what it triggers.

### Error containment

Once an expression is typed `TY_ERROR`, every later check treats it as
acceptable. Without that, one undeclared variable in a large expression produces
an error for the variable and then a further error at every operator above it.
One mistake should produce one message.

---

## 6. Three-address code

`src/tac.c`. Operands are strings in the textbook style, and their spelling
distinguishes them:

```
A, C        a program variable  (an identifier never starts with a digit)
t1, t7      a compiler temporary
3, 2.5      a scalar constant
#0, #4      a matrix literal, by index into the literal pool
```

Every operand string is interned, so equality is a `strcmp` but nothing owns or
frees an individual operand — which is what lets the optimizer copy operand
pointers between instructions freely.

```
$ ./bin/matrixc --tac examples/valid/multiply.ml

    1  A = #0                              Matrix<2x3>
    2  B = #1                              Matrix<3x4>
    3  t1 = A * B                          Matrix<2x4>
    4  C = t1                              Matrix<2x4>
    5  print C                             Matrix<2x4>
```

The right-hand column is the shape each instruction produces. Carrying types
into the IR is what allows the code generator to choose between `MATMUL`,
`MATSCALE` and `SCALMUL` later without re-deriving anything.

---

## 7. Testing at the end of Phase 2

Phase 2's tests are the first five sections of `tests/run_tests.sh`: token
classes, AST shapes, symbol table contents, every error class, and TAC output.
Each case asserts on both the exit status and specific output text.

---

## Review 2 demonstration

`make demo2` runs the full frontend on `examples/valid/multiply.ml`, then
changes B from 3x4 to 5x4 and shows the compiler refusing the program with a
non-zero exit status and no code generated.
