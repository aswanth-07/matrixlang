# The MatrixLang language reference

The definition of what `matrixc` accepts. Where this document and
`src/frontend/matrix.l` / `src/frontend/matrix.y` disagree, the source is correct and this
document is stale.

---

## 1. Overview

MatrixLang is a small language whose type system understands matrix shapes. A
type is not `matrix`; it is `Matrix<2x3>`. Almost every rule in the language is
a statement about shapes, and almost every error the compiler reports is a
shape that does not fit.

```matrixlang
matrix A[2,3] = {{1, 2, 3},
                 {4, 5, 6}};

matrix B[3,4] = {{1, 0, 0, 1},
                 {0, 1, 0, 2},
                 {0, 0, 1, 3}};

matrix C = A * B;      // the compiler works out Matrix<2x4>

print(C);
```

A program is a sequence of statements. There are no functions, no `if`, and no
loops — see [design.md](design.md) for why that is a decision rather than an
omission.

---

## 2. Lexical structure

### Keywords

```
matrix   scalar   print   transpose   identity   zeros   ones   input
```

All are reserved.

### Identifiers

```
IDENT -> (letter | '_') (letter | digit | '_')*
```

Case sensitive. An identifier may not begin with a digit: `12abc` is a lexical
error, not a number followed by a name.

### Numbers

```
NUMBER -> digit+
        | digit+ '.' digit*   [exponent]
        | '.' digit+          [exponent]
        | digit+ exponent
exponent -> ('e'|'E') ['+'|'-'] digit+
```

So `3`, `2.5`, `.5`, `4.`, `1e3` and `1.5E-2` are all numbers. There is one
numeric kind; scalars use C double (binary64 on the evaluated platform).
Source numeric tokens must be finite. Arithmetic on finite tokens may overflow;
such computed Infinity/NaN values are supported by the VM.

### Comments

```
// to the end of the line
/* possibly spanning
   several lines     */
```

Block comments do not nest; an unterminated one is a lexical error.

### Token names

These are the names the `--tokens` table prints.

| Token | Lexemes |
| --- | --- |
| `MATRIX` `SCALAR` `PRINT` `TRANSPOSE` `IDENTITY` `ZEROS` `ONES` | the keywords |
| `IDENTIFIER` | identifiers |
| `NUMBER` | numeric literals |
| `PLUS` `MINUS` `MULTIPLY` | `+` `-` `*` |
| `ASSIGN` | `=` |
| `LBRACKET` `RBRACKET` | `[` `]` |
| `LPAREN` `RPAREN` | `(` `)` |
| `LBRACE` `RBRACE` | `{` `}` |
| `COMMA` `SEMICOLON` | `,` `;` |

Whitespace and comments produce no tokens.

---

## 3. Grammar

```
program        -> stmt_list

stmt_list      -> stmt_list stmt
                | eps

stmt           -> declaration
                | assignment
                | print_statement
                | ';'

declaration    -> 'matrix' IDENT '[' NUMBER ',' NUMBER ']' ';'
                | 'matrix' IDENT '[' NUMBER ',' NUMBER ']' '=' expression ';'
                | 'matrix' IDENT '=' expression ';'
                | 'scalar' IDENT ';'
                | 'scalar' IDENT '=' expression ';'

assignment     -> IDENT '=' expression ';'

print_statement-> 'print' '(' expression ')' ';'

expression     -> expression '+' expression
                | expression '-' expression
                | expression '*' expression
                | '-' expression
                | 'transpose' '(' expression ')'
                | 'identity'  '(' expression ')'
                | 'zeros'     '(' expression ',' expression ')'
                | 'ones'      '(' expression ',' expression ')'
                | 'input' '(' IDENT ')'                                   bool ... int32, real
                | 'input' '(' IDENT '(' expression ')' ')'                real(B)
                | 'input' '(' IDENT '(' expression ',' expression ')' ')' int(lo,hi), real(lo,hi)
                | '(' expression ')'
                | matrix_literal
                | NUMBER
                | IDENT

matrix_literal -> '{' row_list '}'
row_list       -> row | row_list ',' row
row            -> '{' num_list '}'
num_list       -> expression | num_list ',' expression
```

The expression rules are written ambiguously and disambiguated by precedence
declarations rather than by stratifying into `expr / term / factor`. Both
describe the same language; the precedence form keeps the grammar short and the
tree-building actions uniform.

### Precedence

Lowest binding first:

| Level | Operators | Associativity |
| --- | --- | --- |
| 1 | `+` `-` | left |
| 2 | `*` | left |
| 3 | unary `-` | right |

`A + B * C` is `A + (B * C)`; `A - B - C` is `(A - B) - C`; `-A * B` is
`(-A) * B`.

The third declaration form, `matrix C = expression;`, has no bracket list: the
shape comes from the expression. That is what makes `matrix C = A * B;` read the
way it should.

---

## 4. Types

Two kinds:

- `Scalar` — one double-precision number.
- `Matrix<r,c>` — `r` rows and `c` columns, both known at compile time.

`Matrix<2x3>` and `Matrix<3x2>` are **different types**.

### Shape rules

Let `A : Matrix<m,n>` and `B : Matrix<p,q>`, and `s`, `t` be scalars.

| Expression | Condition | Result |
| --- | --- | --- |
| `A + B`, `A - B` | `m == p` and `n == q` | `Matrix<m,n>` |
| `s + t`, `s - t` | — | `Scalar` |
| `A + s` | never | **error** |
| `A * B` | `n == p` | `Matrix<m,q>` |
| `s * A`, `A * s` | — | `Matrix<m,n>` |
| `s * t` | — | `Scalar` |
| `-A` | — | `Matrix<m,n>` |
| `-s` | — | `Scalar` |
| `transpose(A)` | — | `Matrix<n,m>` |
| `transpose(s)` | never | **error** |
| `identity(n)` | `n` a constant `>= 1` | `Matrix<n,n>` |
| `zeros(r,c)`, `ones(r,c)` | constants `>= 1` | `Matrix<r,c>` |
| `{{...}}` | rows all the same length | `Matrix<rows,cols>` |

There is **no broadcasting**. `A + s` could only mean "add `s` to every
element", which reads exactly like matrix addition but is not, and accepting it
silently is how a shape bug survives to runtime.

### Storing a value

A value may be stored into a variable only when the shapes match exactly.
There are no implicit conversions in either direction.

### Declaration is initialisation

`matrix A[2,3];` declares **and initialises** a 2x3 matrix of zeros.
`scalar x;` initialises `x` to 0. Reading a variable before assigning to it is
therefore defined behaviour, not a mistake, and the compiler does not warn about
it.

### Dimensions are compile-time

Explicit bracket dimensions and constructor dimensions must be finite whole
numbers from 1 to 4096 inclusive. Validation precedes integer conversion;
`matrix A[2.5,1]` and `matrix A[1e999,1]` are rejected.

Every shape is fixed during compilation. The arguments to `identity`, `zeros`
and `ones`, and every entry of a matrix literal, must therefore fold to a
constant — arithmetic on literals is allowed, variables are not:

```matrixlang
matrix P = zeros(2 + 1, 4);   // fine: folds to zeros(3,4)
scalar n = 3;
matrix Q = zeros(n, 4);       // error: n is a variable
```

---

## 5. Diagnostics

Every message carries `line:column`, and shape errors carry an indented block
naming both operands, the rule, and what was actually found.

### Errors — program rejected, exit status 1

| Message | Cause |
| --- | --- |
| `illegal character 'c'` | a character outside the language |
| `malformed number or identifier` | e.g. `12abc` |
| `unterminated block comment` | `/*` with no `*/` |
| `syntax error, unexpected X, expecting Y` | grammar violation |
| `use of undeclared variable 'v'` | reading an undeclared name |
| `assignment to undeclared variable 'v'` | writing an undeclared name |
| `duplicate declaration of 'v'` | redeclaration, with the first line quoted |
| `cannot multiply Matrix<a> by Matrix<b>` | `columns(left) != rows(right)` |
| `matrix addition requires identical dimensions` | shapes differ |
| `cannot combine Matrix<..> with Scalar using '+'` | no broadcasting |
| `transpose() expects a matrix` | transpose of a scalar |
| `... expects Matrix<a> but the expression produces Matrix<b>` | store into the wrong shape |
| `row N of this matrix literal has X entries, expected Y` | ragged literal |
| `... must be a constant known at compile time` | a dimension from a variable |
| `... must be a whole number` / `must be at least 1` | a bad dimension |
| `unknown value domain 'd'` | `input(d)` with a domain name the language does not define |
| `int(lo, hi) needs lo <= hi` | inverted domain bounds |
| `input matrix 'A' needs a declared shape` | `matrix A = input(...)` without `[r,c]` |
| `input(...) may only initialise a declaration` | `input` used inside an expression |
| `input 'A' entry (i,j) = v is outside its declared domain d` | run time: a supplied value violates its domain (exit status 1, before execution) |

### Warnings — program still accepted

| Message | Cause |
| --- | --- |
| `'v' is declared but never read` | dead declaration |

### Error recovery

The parser resynchronises at `;` through the production `stmt -> error ';'`, so
a file with several syntax errors reports several of them in one run.

Semantic analysis is **skipped** when the parse failed: checking a tree whose
statements error recovery discarded produces errors caused by the recovery
rather than by the source.

---

## 6. The MatrixLang Virtual Machine

A stack machine. The compiler chooses between the arithmetic instructions using
the shapes it inferred, which is why one source-level `*` becomes three
different machine instructions depending on its operands.

| Instruction | Effect |
| --- | --- |
| `LOAD_MATRIX n` / `LOAD_SCALAR n` | push the value held in `n` |
| `PUSH_SCALAR v` | push an immediate |
| `PUSH_MATRIX #k` | push matrix literal `k` |
| `STORE_MATRIX n` / `STORE_SCALAR n` | pop into `n` |
| `MATADD` `MATSUB` `MATMUL` | pop two matrices, push the result |
| `MATSCALE` | pop a matrix and a scalar in either order, push the scaled matrix |
| `MATNEG` `TRANSPOSE` | pop one matrix, push the result |
| `SCALADD` `SCALSUB` `SCALMUL` `SCALNEG` | scalar arithmetic |
| `IDENTITY n` | push `identity(n)` |
| `ZEROS r c` / `ONES r c` | push the constructed matrix |
| `PRINT` | pop and display, labelled with the source expression |
| `HALT` | stop |

The machine performs **no dimension checking**. Every operation it executes was
proved shape-correct before the code was generated; if a shape error could
reach the VM, the compiler would be broken.

## 7. Inputs and value domains

The grammar accepts `input(...)` as an expression; the semantic pass allows it
only as the whole initialiser of a declaration, resolves the domain name, and
requires a matrix input to declare its shape. The compiler never sees input values,
only their domain:

| Domain | Values |
| --- | --- |
| `bool` | 0 or 1 |
| `uint8`, `int8`, `uint16`, `int16`, `int32` | integers of that range |
| `int(lo,hi)` | integers in [lo, hi], with \|lo\|, \|hi\| <= 2^53 |
| `real` | any finite binary64 value |
| `real(B)` | finite values in [-B, B] |
| `real(lo,hi)` | finite values in [lo, hi] |

Bounds are constant-folded like dimensions. Values are supplied with
`--input NAME=FILE` (numbers in row-major order; commas, braces, brackets and
semicolons separate, so a matrix literal is a valid file; hexadecimal floats are
accepted) or drawn with `--random-inputs SEED` (one reproducible stream per
input). Before execution every input is checked: finite, integral for integer
domains, within bounds. Integer and non-negative domains store `-0` as `+0`.
`--symbols` lists the declared inputs after the symbol table.

## 8. Numerical optimizer contracts

`--fp-strict` (the default) applies a value-changing rewrite only when facts
derived from the input domains prove it bit-identical. `--fp-bounded` also
applies rewrites that keep the source order's standard-model worst-case error
bound and its NaN and infinity behaviour. `--fp-algebraic` applies any rewrite
valid over the reals, with possible changes in rounding, signed zero and
non-finite propagation. `--certificate` prints each output's guarantee:
bit-identical, bound-preserving or relaxed. `--no-proofs` disables the facts and
admits no value-changing rewrite under strict. `--exact-output` prints
hexadecimal values for output comparisons. [design.md](design.md#numerical-contracts)
explains how rewrites are proved.

## 9. C output

`--emit-c FILE` writes the program (after `--optimize`, if given) as a C11
translation unit; `--dump-inputs FILE` writes the loaded and checked inputs as
raw binary64 in declaration order. Build and run the result with

```bash
gcc -std=c11 -O3 -ffp-contract=off -fopenmp-simd prog.c -o prog -lm
./prog inputs.bin 10
```

The program checks its inputs against their domains, runs the computation the
given number of times, prints every output as `--exact-output` does, and reports
each run's time on standard error. Every sum keeps the virtual machine's order,
except products whose order of summation the contract leaves free, which carry
an OpenMP reduction clause; `--no-license` keeps the machine's order
everywhere. Compiling without `-ffp-contract=off` lets the C compiler fuse
multiplications and additions, which changes results.
Tests target printed values in a fixed floating-point environment and do not
inspect exception flags, NaN payloads or allocation failures. Detailed pass rules
and the conventional arithmetic objective are in [phase3-optimization.md](phase3-optimization.md).
