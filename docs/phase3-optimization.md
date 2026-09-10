# Phase 3 — Optimization, Target Code and Testing

The Review 3 deliverable.

Demonstration: `make demo3`

---

## Why local optimization is exact here

MatrixLang has no control flow, so a whole program is a **single basic block**.
That is not a limitation being worked around; it is what makes these passes
correct without any control-flow graph, without dataflow iteration, and without
the conservative assumptions that ordinarily weaken local optimization:

- **Available expressions** for CSE are exact — one linear scan, killing entries
  when anything they mention is redefined.
- **Liveness** for dead code elimination is exact in a single backward sweep,
  because liveness at any point depends only on what comes after it.
- Nothing is live at program exit. A MatrixLang program has no return value and
  no observable state after its last statement, so the only thing that keeps a
  computation alive is a `print` that consumes it.

That last point is what makes the standard dead-code example behave as it should.

---

## The pass pipeline

```
algebraic simplification  ->  CSE  ->  copy propagation  ->  dead code
        ^                                                        |
        +--------------------  repeat until nothing changes  -----+
```

The order is not arbitrary — each pass feeds the next. Simplification turns
operations into copies; CSE turns repeated expressions into copies; copy
propagation makes those copies unused; dead code elimination deletes them. And
one round is not enough, because deleting an instruction can make another one
dead. The sequence repeats until a round changes nothing.

Passes can be selected individually (`--opt-algebraic`, `--opt-cse`,
`--opt-copyprop`, `--opt-dce`) so one transformation can be demonstrated at a
time.

---

## 1. Common subexpression elimination

```matrixlang
matrix X = A * B;
matrix Y = A * B;
```

Before:

```
    3  t1 = A * B
    4  X = t1
    5  t2 = A * B
    6  Y = t2
```

After:

```
    3  t1 = A * B
    4  X = t1
    5  Y = t1
```

```
common subexpr   : t2 = A * B    -> t2 = t1  (already computed)
dead code        : t2 = t1       -> removed  (t2 is never used)
```

Two passes cooperated: CSE turned the second multiply into a copy, copy
propagation replaced `t2` with `t1` in `Y = t2`, and dead code elimination
deleted the copy that was left. A matrix multiply is the most expensive
operation in the language, so removing one matters more than the instruction
count suggests.

---

## 2. Dead code elimination

```matrixlang
X = A * B;
X = C * D;
print(X);
```

Before (9 instructions), after (5). The log shows the cascade:

```
dead code : X = t1       -> removed  (X is never used)
dead code : t1 = A * B   -> removed  (t1 is never used)
dead code : B = #1       -> removed  (B is never used)
dead code : A = #0       -> removed  (A is never used)
```

Removing `X = A * B` made `t1` dead, which made `A` and `B` dead. That is why
the driver loop repeats.

---

## 3. Matrix-specific optimization — the original contribution

A general-purpose optimizer cannot perform these, because it does not know what
a matrix is. `A * I = A` is a theorem of linear algebra, and exploiting it
requires the compiler to know that a particular value **is** an identity matrix.

### The analysis that makes it possible

`src/optimize.c` maintains a property for each name:

| Property | Set by |
| --- | --- |
| `P_IDENTITY` | `identity(n)`, or a literal that *is* an identity |
| `P_ZERO_MAT` | `zeros(r,c)`, or a literal that is all zeros |
| `P_SCALAR_ONE` / `P_SCALAR_ZERO` | the constants 1 and 0 |
| "transpose of X" | a `TRANS` instruction, remembered per destination |

Properties propagate through copies, and are invalidated when the name they
describe is redefined — skipping that invalidation is how an optimizer silently
miscompiles a reassignment.

Because literals are inspected for the same properties, a hand-written identity
optimizes exactly like a constructed one:

```matrixlang
matrix I[2,2] = {{1, 0},
                 {0, 1}};
matrix R = A * I;          // still folds to R = A
```

### The rewrites

| Source | Becomes | Counted as |
| --- | --- | --- |
| `A * I`, `I * A` | `A` | identity |
| `A * 1`, `1 * A` | `A` | identity |
| `A + Z`, `Z + A`, `A - Z` | `A` | zero |
| `Z - A` | `-A` | zero |
| `A * 0`, `A * Z` | `zeros(rows,cols)` | zero |
| `transpose(transpose(A))` | `A` | double transpose |
| constant scalar arithmetic | the value | constant fold |

`examples/optimize/algebra.ml` exercises all of them:

```
identity operand : t3 = A * I          -> t3 = A  (x * I = x)
identity operand : t4 = I * A          -> t4 = A  (I * x = x)
zero operand     : t5 = A + Z          -> t5 = A  (x + 0 = x)
zero operand     : t6 = A - Z          -> t6 = A  (x - 0 = x)
double transpose : t8 = transpose(t7)  -> t8 = A  (transpose(transpose(x)) = x)
identity operand : t9 = A * 1          -> t9 = A  (x * 1 = x)
zero operand     : t10 = A * 0         -> t10 = zeros(3,3)
```

Note the double transpose: `t7 = transpose(A)` then `t8 = transpose(t7)` becomes
`t8 = A`, and `t7` itself then falls to dead code elimination. Two matrix
transposes removed from a program that appeared to need them.

---

## 4. Measured results

`--report` prints these; the figures below are from the current test corpus.

| Program | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| `algebra.ml` | 27 | 16 | **40.7%** |
| `dce.ml` | 9 | 5 | **44.4%** |
| `literal_identity.ml` | 5 | 3 | **40.0%** |
| `cse.ml` | 8 | 7 | 12.5% |
| `chain.ml` | 8 | 8 | 0.0% |

`chain.ml` is in the table on purpose. It contains nothing redundant, and the
optimizer correctly does nothing to it. An optimizer that always reports an
improvement is not measuring anything.

```
==================================================
 MATRIXLANG OPTIMIZATION REPORT
==================================================

  Original TAC instructions   :     27
  Optimized TAC instructions  :     16

  General optimizations
    Constant folds            :      0
    Common subexpressions     :      1
    Copies propagated         :      7
    Dead instructions removed :     11

  Matrix-specific optimizations
    Identity operations       :      3
    Zero-matrix operations    :      3
    Double transposes         :      1

  Passes to fixed point       :      2
  Instruction reduction       :  40.7%
==================================================
```

---

## 5. Target code generation

`src/codegen.c` lowers the live TAC to MatrixLang VM instructions. The MVM is a
stack machine, which means there is no register allocation and this phase stays
about the one thing worth demonstrating: **instruction selection from inferred
types**.

One `*` in the source becomes one of three machine instructions:

| Source | Operand types | Instruction |
| --- | --- | --- |
| `A * B` | matrix, matrix | `MATMUL` |
| `k * M` | scalar, matrix | `MATSCALE` |
| `k * h` | scalar, scalar | `SCALMUL` |

Nothing in the syntax distinguishes them. Only the shapes the semantic pass
inferred do.

```
$ ./bin/matrixc --target examples/valid/multiply.ml

    0  PUSH_MATRIX    #0
    1  STORE_MATRIX   A
    2  PUSH_MATRIX    #1
    3  STORE_MATRIX   B
    4  LOAD_MATRIX    A
    5  LOAD_MATRIX    B
    6  MATMUL
    7  STORE_MATRIX   t1
    8  LOAD_MATRIX    t1
    9  STORE_MATRIX   C
   10  LOAD_MATRIX    C
   11  PRINT          C
   12  HALT
```

The full instruction set is in
[language-reference.md](language-reference.md#6-the-matrixlang-virtual-machine).

---

## 6. Execution

`src/vm.c`. Every declared variable exists from the start, zero-filled at its
declared shape.

```
$ ./bin/matrixc --optimize --run examples/valid/multiply.ml

C = Matrix<2x4>
  [  1  2  3 14 ]
  [  4  5  6 32 ]
```

The VM contains **no dimension checks**, and that is a statement about the
compiler rather than an oversight: every operation it will ever execute was
proved shape-correct before the code was generated. If a shape error could reach
the VM, the compiler would be broken.

`--trace` steps through execution showing each instruction and the stack depth.

---

## 7. Testing

`tests/run_tests.sh` — 139 assertions, run by `make test`. Each case asserts
**both** the exit status and specific output text: status alone would pass a
compiler that rejected every program for the wrong reason, and output text alone
would not catch one that printed the right message and exited 0.

Coverage: token classes; AST shapes including inference through `*` and
`transpose`; symbol table contents; all six error files; TAC output; each
optimizer pass individually and together; target code including the three
multiply instructions; execution results checked against hand-computed matrices;
and the driver's exit codes.

### The strongest test

For every example program, the suite runs it twice — once with the optimizer and
once without — and requires byte-identical output:

```
identical output with and without the optimizer: examples/valid/multiply.ml
identical output with and without the optimizer: examples/valid/transpose.ml
identical output with and without the optimizer: examples/optimize/algebra.ml
...
```

A smaller program that computes something else is not an optimization. This is
the check that distinguishes the two.

### What the tests do not cover

Stated plainly, because an honest limitations section is worth more than a
claim of completeness:

- **No memory checking.** Nothing runs under valgrind or a sanitizer. Frees are
  called at exit but are unverified.
- **No large or pathological inputs.** Nothing exercises very large matrices,
  deeply nested expressions, or programs long enough to reallocate the
  instruction buffer many times.
- **Fixed corpus.** There is no randomised or generated input, so the suite
  proves the compiler handles the cases someone thought of. The
  optimized-equals-unoptimized check would be far stronger against generated
  programs.
- **One platform.** Every result was produced on Windows with mingw64 gcc 15.2.
  Nothing has been built or run on Linux or macOS.
- **Floating point.** Results are compared as printed text, so a difference
  below display precision would not be caught.

---

## 8. Possible future work

- Control flow (`if`, `while`), which would require a real control-flow graph
  and turn these local passes into global ones.
- Loop-invariant code motion, once there are loops.
- Associativity optimization for matrix chains: `(A*B)*C` and `A*(B*C)` compute
  the same result at very different cost, and the compiler already knows every
  shape needed to choose. This is the natural next matrix-specific optimization
  and the most valuable one not implemented.
- Register allocation, if the VM were given registers instead of a stack.
