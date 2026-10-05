# MatrixLang teaching exercises

These are proposed instructional materials, not a tested curriculum. Learners need basic C, syntax trees, type checking, and matrix multiplication. An instructor can supply the scanner, parser, and virtual machine, or build the phases sequentially. No completion-time estimate is presented as measured.

## 1. Reuse a shape rule

Run `bin/matrixc --ast --symbols --target examples/valid/scalars.ml` and inspect how scalar multiplication and matrix scaling produce different target instructions. Then run `bin/matrixc --check examples/errors/mul_mismatch.ml`.

Implement or explain the product, transpose, and addition rules in `src/analysis/types.c`. Submit two accepted cases and two rejected cases with the operand shapes and expected diagnostic. A solution must preserve assignment shape and use the shared rules for instruction selection; recognizing token spelling alone is insufficient.

## 2. Explain a saving and a zero result

```bash
bin/matrixc --fp-strict --optimize --tac --cost examples/optimize/chain_order.ml
bin/matrixc --fp-algebraic --opt-chain --tac --cost --explain examples/optimize/chain_order.ml
```

Calculate both costs from `m*p*(2*n-1)`. The example changes modeled product work from 69,800 to 1,396 operations. Product instruction count stays the same. Replace every dimension by 10 and explain why no parenthesization can save arithmetic. Enumerate a four-operand chain independently and compare with `tools/evaluate_research.py`'s exhaustive oracle.

Submit the chosen tree, arithmetic reduction, instruction reduction, and contract. Do not interpret either reduction as a measured runtime speedup. Explain the VM's additional initial accumulator additions and why the stated cost convention excludes them.

## 3. State legality before applying an identity

Create `scalar x=-2; scalar y=x*0; print(y);` and run it with `-q --run --exact-output`, then add `--optimize`, then add `--fp-algebraic --optimize`. Strict results retain negative zero; the algebraic replacement can produce positive zero.

Inspect the identity-with-Infinity and chain-overflow fixtures in `tools/check_numerics.py`. Explain why a shape-correct real-number identity may change floating-point output. Inspect the reassignment and chain-dependency fixtures, and identify the fact invalidated by a write and the computation that must not move before its definition.

Submit one counterexample, its exact outputs, and a contract statement. An exact-output change is a failure in strict mode and can be permitted in algebraic mode. Algebraic mode does not promise a relative-error bound.

## 4. Audit a reassuring test

Generate two small execution populations:

```bash
python tools/gen_programs.py --out build/dyadic --count 100 --seed 501 --mode exec --values dyadic
python tools/gen_programs.py --out build/broad --count 100 --seed 501 --mode exec --values broad
```

Write a script that compares unoptimized and optimized hexadecimal outputs, records all failures, and retains source programs. Contrast strict with algebraic mode. Repeat one case using the normal six-digit display and explain what it can hide. Supply an independent scalar reference or an independently enumerated chain rather than treating agreement between shared compiler paths as proof of correctness.

## Proposed rubric

| Criterion | Weight | Evidence |
| --- | ---: | --- |
| Shape correctness and diagnostics | 25% | Accepted/rejected programs, inferred types, precise error rules |
| Dependence and property reasoning | 25% | Reassignment invalidation, temporary naming, chain movement guard |
| Numerical contract compliance | 25% | Exact counterexamples, correct distinction between strict and permitted algebraic changes |
| Faithful measurement and reproduction | 25% | Seeds, raw outputs, cost convention, both metrics, zero results, independent reference |

The rubric is a proposal. Percentage optimization gains earn no credit without an explanation and a legal contract. An instructor should pilot these tasks and measure usability, completion, and conceptual understanding before claiming educational benefit.
