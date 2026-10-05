# Phase 3: optimization, target code, and verification

Run `make demo3`. The implementation is organized under `src/ir` and `src/backend`; the current research evaluation is in [paper/README.md](../paper/README.md).

## Contracts before rewrites

Strict mode is the default. It retains source product association and permits finite constant folding, double-transpose elimination, common-subexpression elimination, copy propagation, and dead-code elimination with dependence checks. Hexadecimal output comparisons test printed results in a fixed floating-point environment.

Algebraic identities and chain ordering require `--fp-algebraic`. Real-number equalities such as `A*I=A`, `A+Z=A`, and `A*0=0` can change rounding, signed zero, or NaN/Infinity behavior. The option permits these changes; it does not supply a numerical error bound. Shape checking remains mandatory.

```bash
bin/matrixc --fp-algebraic --optimize --tac --explain --report --cost examples/optimize/algebra.ml
bin/matrixc --optimize --tac --explain --report examples/optimize/cse.ml
bin/matrixc --optimize --tac --explain --report examples/optimize/dce.ml
```

## Local passes and dependence

`src/ir/optimize.c` runs simplification, common-subexpression elimination, copy propagation, and dead code in sequence, repeating until no change or a ten-round ceiling. The straight-line language needs no control-flow merge, but mutation still requires invalidation. Available expressions are killed by relevant redefinitions; copies cannot propagate past writes to their source or destination; transpose provenance cannot refer to a value that has since changed.

Properties for identity/zero matrices and scalar zero/one are separate from shapes. A square matrix is not necessarily an identity. Constructors and inspected literals establish properties; copies propagate them. This is a conventional analysis, not a new compiler technique.

The chain pass in `src/ir/chain.c` uses the conventional dynamic program over compatible shapes. Single-use temporaries and contiguous product slots prevent a rewrite from moving across a leaf definition or variable write. Chains longer than 32 operands are bounded by the implementation. An independent exhaustive oracle checks lengths three through seven.

## What the cost means

The model in `src/ir/cost.c` uses `m*p*(2*n-1)` for a dense product, one operation per entry for addition/subtraction/negation/scaling, and zero arithmetic for transposition, copies, constructors, and printing. The VM also adds each first product to a positive-zero accumulator; that initial addition is outside the conventional model. Allocation, movement, cache effects, and runtime are not measured by this objective.

Every parenthesization of `k` operands contains `k-1` product nodes. Reordering can therefore reduce modeled arithmetic while retaining exactly the same product instruction count. Conversely, eliminating copies can shorten code without removing arithmetic.

## Target and execution

`src/backend/codegen.c` lowers live intermediate instructions into a typed stack machine. A source `*` selects a matrix product, matrix scaling, or scalar multiplication according to operand types. Values are copied rather than exposed through mutable aliases. The VM stores declared variables, initializes uninitialized declarations to zero, executes the selected operations, and prints source-level labels.

```bash
bin/matrixc --target --run examples/valid/multiply.ml
bin/matrixc --trace examples/valid/multiply.ml
```

## Verification and measured limits

`make test` runs acceptance checks and 15 numerical fixtures, including precision, signed zero, overflow/NaN, reassignment, temporary-name collisions, and chain dependencies. Six fixtures have independent Python binary64 scalar references. `make verify-research` checks complete recorded coverage, generator/source hashes, every small-chain enumeration result, and representative replay.

The paper's expanded study has 5,000 cost programs, 40,000 arm observations, 2,000 execution programs, and 1,250 oracle chains. Strict outputs match all tested generated cases. Algebraic output differs in 813 of 1,000 broad-value cases despite matching all small dyadic cases. Tests provide scoped evidence, not a global correctness proof. No classroom or runtime-performance claim follows.
