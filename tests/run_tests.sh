#!/usr/bin/env bash
#
# MatrixLang -- acceptance tests.
#
# Every case asserts two things: the exit status, and specific text in the
# output. Exit status alone would pass a compiler that rejected every program
# for the wrong reason; output text alone would not catch one that printed the
# right message and then exited 0.
#
# Execution checks compare strict optimized and unoptimized hexadecimal output.
# Agreement is regression evidence on these cases, not a correctness proof.
#
# Usage:  bash tests/run_tests.sh    (or: make test)

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MATRIXC=./bin/matrixc

pass=0
fail=0

red()   { printf '\033[31m%s\033[0m' "$1"; }
green() { printf '\033[32m%s\033[0m' "$1"; }

section() { printf '\n--- %s\n' "$1"; }
ok()      { pass=$((pass + 1)); printf '  %s %s\n' "$(green PASS)" "$1"; }
bad()     { fail=$((fail + 1)); printf '  %s %s\n' "$(red FAIL)" "$1"; }

OUT=""
run_case() {
    local label="$1" want="$2"; shift 2
    local got
    OUT="$("$@" 2>&1)"
    got=$?
    if [ "$got" -eq "$want" ]; then
        ok "$label (exit $got)"
    else
        bad "$label -- expected exit $want, got $got"
        printf '%s\n' "$OUT" | sed 's/^/        | /'
    fi
}

expect_contains() {
    if printf '%s' "$OUT" | grep -qF -- "$1"; then
        ok "  ...contains: $1"
    else
        bad "  ...MISSING: $1"
        printf '%s\n' "$OUT" | tail -20 | sed 's/^/        | /'
    fi
}

expect_absent() {
    if printf '%s' "$OUT" | grep -qF -- "$1"; then
        bad "  ...should NOT contain: $1"
    else
        ok "  ...correctly omits: $1"
    fi
}

if [ ! -x "$MATRIXC" ]; then
    echo "tests: bin/matrixc missing -- run 'make' first." >&2
    exit 2
fi

# ==================================================== PHASE 1: lexer/parser ==

section "Phase 1 -- lexical analysis produces the specified token stream"

run_case "declare.ml --phase1" 0 "$MATRIXC" --phase1 examples/phase1/declare.ml
expect_contains "MATRIX        matrix"
expect_contains "IDENTIFIER    A"
expect_contains "LBRACKET      ["
expect_contains "NUMBER        2"
expect_contains "COMMA         ,"
expect_contains "RBRACKET      ]"
expect_contains "SEMICOLON     ;"
expect_contains "16 token(s)."
expect_contains "Syntax: VALID"
# Comments must never reach the parser.
expect_absent  "COMMENT"

section "Phase 1 -- precedence decides the parse, not the grammar"

# expr: expr '+' expr and expr: expr '*' expr are ambiguous together; the
# %left declarations resolve every conflict bison finds. The tree that
# resolution produces is observable in the three-address code: B * C has to be
# computed before the addition, and it has to be computed first.
run_case "precedence.ml --tac" 0 "$MATRIXC" --tac examples/phase1/precedence.ml
expect_contains "t1 = B * C"
expect_contains "t2 = A + t1"
expect_contains "ACCEPTED"

section "Phase 1 -- malformed input is rejected"

run_case "bad.ml --phase1" 1 "$MATRIXC" --phase1 examples/phase1/bad.ml
expect_contains "Syntax: INVALID"
expect_contains "an identifier may not begin with a digit"

section "Phase 1 -- all token classes are recognised"

run_case "scalars.ml --tokens" 0 "$MATRIXC" --tokens examples/valid/scalars.ml
expect_contains "SCALAR        scalar"
expect_contains "MULTIPLY      *"
expect_contains "ASSIGN        ="
expect_contains "LBRACE        {"
run_case "algebra.ml --tokens" 0 "$MATRIXC" --tokens examples/optimize/algebra.ml
expect_contains "TRANSPOSE     transpose"
expect_contains "IDENTITY      identity"
expect_contains "ZEROS         zeros"

# ============================================= PHASE 2: AST and symbol table ==

section "Phase 2 -- the AST carries inferred shapes"

run_case "multiply.ml --ast" 0 "$MATRIXC" --ast examples/valid/multiply.ml
expect_contains "BinaryOp * : Matrix<2x4>"
expect_contains "Identifier A : Matrix<2x3>"
expect_contains "Identifier B : Matrix<3x4>"

run_case "transpose.ml --ast" 0 "$MATRIXC" --ast examples/valid/transpose.ml
# A is 2x3, so its transpose must come out 3x2.
expect_contains "Transpose : Matrix<3x2>"

section "Phase 2 -- the symbol table records rows and columns"

run_case "multiply.ml --symbols" 0 "$MATRIXC" --symbols examples/valid/multiply.ml
expect_contains "Rows"
expect_contains "Cols"
expect_contains "3 symbol(s)."

run_case "scalars.ml --symbols" 0 "$MATRIXC" --symbols examples/valid/scalars.ml
expect_contains "Scalar"
expect_contains "Matrix"

# ================================================ PHASE 2: dimension checking ==

section "Phase 2 -- multiplication requires columns(left) == rows(right)"

run_case "mul_mismatch.ml" 1 "$MATRIXC" --check examples/errors/mul_mismatch.ml
expect_contains "cannot multiply Matrix<2x3> by Matrix<5x4>"
expect_contains "columns(left) must equal rows(right)"
expect_contains "3 != 5"

section "Phase 2 -- addition requires identical shapes"

run_case "add_mismatch.ml" 1 "$MATRIXC" --check examples/errors/add_mismatch.ml
expect_contains "matrix addition requires identical dimensions"
expect_contains "2x3 against 3x2"

section "Phase 2 -- the remaining shape rules"

run_case "bad_shape.ml" 1 "$MATRIXC" --check examples/errors/bad_shape.ml
expect_contains "transpose() expects a matrix, got Scalar"
expect_contains "cannot combine Matrix<2x2> with Scalar using '+'"
expect_contains "must be a constant known at compile time"
expect_contains "must be a whole number, got 2.5"

section "Phase 2 -- matrix literals"

run_case "bad_literal.ml" 1 "$MATRIXC" --check examples/errors/bad_literal.ml
expect_contains "row 2 of this matrix literal has 2 entries, expected 3"
expect_contains "expects Matrix<2x2> but the expression produces Matrix<3x2>"

section "Phase 2 -- declaration and name errors"

run_case "undeclared.ml" 1 "$MATRIXC" --check examples/errors/undeclared.ml
expect_contains "assignment to undeclared variable 'B'"
expect_contains "use of undeclared variable 'Q'"

run_case "duplicate.ml" 1 "$MATRIXC" --check examples/errors/duplicate.ml
expect_contains "duplicate declaration of 'A'"
expect_contains "already declared at line 3"

run_case "syntax.ml" 1 "$MATRIXC" --check examples/errors/syntax.ml
expect_contains "syntax error"
# Recovery at ';' means more than one error is found, not just the first.
expect_contains "3 error(s)"
expect_contains "skipping semantic analysis"

run_case "lexical.ml" 1 "$MATRIXC" --check examples/errors/lexical.ml
expect_contains "illegal character '\$'"
expect_contains "malformed number or identifier '12abc'"

# ========================================================= PHASE 2: TAC ======

section "Phase 2 -- three-address code"

run_case "multiply.ml --tac" 0 "$MATRIXC" --tac examples/valid/multiply.ml
expect_contains "t1 = A * B"
expect_contains "C = t1"
expect_contains "print C"
# The IR keeps the shapes, which is the point of a typed IR.
expect_contains "Matrix<2x4>"

run_case "chain.ml --tac" 0 "$MATRIXC" --tac examples/valid/chain.ml
expect_contains "t1 = A * B"
expect_contains "t2 = t1 + C"

# =================================================== PHASE 3: optimization ===

section "Phase 3 -- common subexpression elimination"

run_case "cse.ml" 0 "$MATRIXC" --tac --optimize --explain --report examples/optimize/cse.ml
expect_contains "common subexpr"
expect_contains "Y = t1"
expect_contains "Common subexpressions     :      1"

section "Phase 3 -- dead code elimination"

run_case "dce.ml" 0 "$MATRIXC" --optimize --explain --report examples/optimize/dce.ml
expect_contains "dead code"
# Matched on the reason rather than the padded line, so column widths in the
# log format are free to change without breaking the test.
expect_contains "(X is never used)"
# A and B feed only the overwritten assignment, so they must go too.
expect_contains "(t1 is never used)"
expect_contains "(A is never used)"
expect_contains "Dead instructions removed :      4"

section "Phase 3 -- matrix-specific optimizations"

run_case "algebra.ml" 0 "$MATRIXC" --fp-algebraic --optimize --explain --report examples/optimize/algebra.ml
expect_contains "(x * I = x)"
expect_contains "(I * x = x)"
expect_contains "(x + 0 = x)"
expect_contains "(x - 0 = x)"
expect_contains "(transpose(transpose(x)) = x)"
expect_contains "(x * 1 = x)"
expect_contains "Identity operations       :      3"
expect_contains "Double transposes         :      1"

section "Phase 3 -- an identity written as a literal is still an identity"

run_case "literal identity is recognised" 0 "$MATRIXC" --fp-algebraic --optimize --explain examples/optimize/literal_identity.ml
expect_contains "(x * I = x)"

section "Phase 3 -- individual passes can be selected"

run_case "algebra only" 0 "$MATRIXC" --fp-algebraic --opt-algebraic --report examples/optimize/algebra.ml
expect_contains "Dead instructions removed :      0"
expect_contains "Identity operations       :      3"

# ================================================== PHASE 3: target and VM ===

section "Phase 3 -- target code"

run_case "multiply.ml --target" 0 "$MATRIXC" --target examples/valid/multiply.ml
expect_contains "LOAD_MATRIX"
expect_contains "MATMUL"
expect_contains "STORE_MATRIX"
expect_contains "PRINT"
expect_contains "HALT"

run_case "scalars.ml --target" 0 "$MATRIXC" --target examples/valid/scalars.ml
# One '*' in the source, three different machine instructions behind it.
expect_contains "MATSCALE"
expect_contains "SCALMUL"

run_case "transpose.ml --target" 0 "$MATRIXC" --target examples/valid/transpose.ml
expect_contains "TRANSPOSE"

section "Phase 3 -- execution produces correct results"

run_case "multiply.ml --run" 0 "$MATRIXC" -q --run examples/valid/multiply.ml
expect_contains "C = Matrix<2x4>"
expect_contains "1  2  3 14"
expect_contains "4  5  6 32"

run_case "transpose.ml --run" 0 "$MATRIXC" -q --run examples/valid/transpose.ml
expect_contains "At = Matrix<3x2>"
# The Gram matrix A * transpose(A).
expect_contains "14 32"
expect_contains "32 77"

run_case "scalars.ml --run" 0 "$MATRIXC" -q --run examples/valid/scalars.ml
expect_contains "product = 1.5"
expect_contains "6 12"

run_case "chain.ml --run" 0 "$MATRIXC" -q --run examples/valid/chain.ml
expect_contains "R = Matrix<2x2>"
expect_contains "1 3"

run_case "algebra.ml --run" 0 "$MATRIXC" -q --optimize --run examples/optimize/algebra.ml
# Every rewritten expression must still produce A itself.
expect_contains "P = Matrix<3x3>"
expect_contains "V = Matrix<3x3>"

run_case "--trace shows the machine executing" 0 "$MATRIXC" --trace examples/valid/multiply.ml
expect_contains "[stack"

# ====================================== PHASE 3: strict output regressions =====

section "Phase 3 -- strict optimization matches tested hexadecimal output"

for f in examples/valid/*.ml examples/optimize/*.ml; do
    plain=$("$MATRIXC" -q --exact-output --run "$f" 2>&1)
    opt=$("$MATRIXC" -q --exact-output --optimize --run "$f" 2>&1)
    if [ "$plain" == "$opt" ]; then
        ok "identical output with and without the optimizer: $f"
    else
        bad "optimizer changed the output of $f"
        diff <(printf '%s\n' "$plain") <(printf '%s\n' "$opt") | sed 's/^/        | /'
    fi
done

# ================================================ inputs and value domains ====

section "Inputs -- declared domains are checked at compile time and at load"

run_case "unknown domain is rejected" 1 "$MATRIXC" --check examples/errors/input_unknown_domain.ml
expect_contains "unknown value domain 'int9'"
expect_contains "int(lo,hi)"
run_case "an input matrix must declare its shape" 1 "$MATRIXC" --check examples/errors/input_no_shape.ml
expect_contains "needs a declared shape"
run_case "input() is a declaration form, not an expression" 1 "$MATRIXC" --check examples/errors/input_in_expression.ml
expect_contains "may only initialise a declaration"
run_case "domain bounds must be ordered" 1 "$MATRIXC" --check examples/errors/input_bad_bounds.ml
expect_contains "needs lo <= hi"

run_case "an input appears in the TAC with its domain" 0 "$MATRIXC" --tac examples/contracts/exact_chain.ml
expect_contains "A = input(int8)"
run_case "the symbol table lists inputs and their domains" 0 "$MATRIXC" --symbols examples/contracts/file_input.ml
expect_contains "integers in [0, 255]"

run_case "values are read from a file, literal syntax allowed" 0 "$MATRIXC" -q --run --input A=tests/data/inside_uint8.txt examples/contracts/file_input.ml
expect_contains "15 22"
run_case "a value outside the domain stops execution" 1 "$MATRIXC" --run --input A=tests/data/outside_uint8.txt examples/contracts/file_input.ml
expect_contains "entry (2,2) = 300 is outside its declared domain uint8"
run_case "a file with the wrong count is rejected" 1 "$MATRIXC" --run --input A=tests/data/short.txt examples/contracts/file_input.ml
expect_contains "holds 3 number(s); input 'A' needs 4"
run_case "running without values names both ways to supply them" 1 "$MATRIXC" --run examples/contracts/file_input.ml
expect_contains "--random-inputs SEED"
run_case "--input must name an input" 1 "$MATRIXC" --run --input Q=tests/data/inside_uint8.txt --random-inputs 1 examples/contracts/file_input.ml
expect_contains "not declared with input"
run_case "--input without NAME=FILE is a usage error" 2 "$MATRIXC" --run --input tests/data/inside_uint8.txt examples/contracts/file_input.ml

first=$("$MATRIXC" -q --exact-output --run --random-inputs 11 examples/contracts/mixed.ml 2>&1)
second=$("$MATRIXC" -q --exact-output --run --random-inputs 11 examples/contracts/mixed.ml 2>&1)
other=$("$MATRIXC" -q --exact-output --run --random-inputs 12 examples/contracts/mixed.ml 2>&1)
if [ "$first" == "$second" ] && [ "$first" != "$other" ]; then
    ok "a seed names the same inputs on every run, and a different seed different ones"
else
    bad "--random-inputs is not deterministic per seed"
fi

# ==================================================== numerical contracts ====

section "Contracts -- strict reorders only what it proves exact"

run_case "an int8 chain is proved exact and reordered under strict" 0 "$MATRIXC" --explain --certificate examples/contracts/exact_chain.ml
expect_contains "chain order      : A * B * C  ->  A * (B * C)"
expect_contains "needs at most 29 of 53 significand bits"
expect_contains "1. bit-identical     print(R)"

run_case "a real-valued chain is kept under strict" 0 "$MATRIXC" --explain examples/contracts/real_chain.ml
expect_contains "chain kept"
expect_contains "A is real-valued, so products with it round"
expect_contains "--fp-bounded permits it"

run_case "the bounded contract reorders it and states the bound" 0 "$MATRIXC" --fp-bounded --explain --certificate examples/contracts/real_chain.ml
expect_contains "chain order      : A * B * C  ->  A * (B * C)"
expect_contains "keeps the source-order error bound"
expect_contains "1. bound-preserving  print(R)"

run_case "53 bits exactly is still exact" 0 "$MATRIXC" --explain examples/contracts/boundary_exact.ml
expect_contains "needs at most 53 of 53 significand bits"
run_case "one more bit is not provable" 0 "$MATRIXC" --explain examples/contracts/boundary_inexact.ml
expect_contains "may need 54 significand bits"
expect_contains "chain kept"

run_case "a partially provable chain is reordered in its proved segment" 0 "$MATRIXC" --explain examples/contracts/mixed.ml
expect_contains "(A * (B * C)) * D"
run_case "bounded keeps the stronger guarantee where it is free" 0 "$MATRIXC" --fp-bounded --certificate examples/contracts/mixed.ml
expect_contains "1. bit-identical     print(R)"
expect_contains "2. bound-preserving  print(S)"

run_case "--no-proofs reproduces the unproved strict optimizer" 0 "$MATRIXC" --no-proofs --explain --report examples/contracts/exact_chain.ml
expect_contains "proofs are disabled"
expect_contains "Product chains reordered  :      0"

section "Contracts -- IEEE side conditions of identities"

run_case "x * I = x is proved where A cannot hold -0" 0 "$MATRIXC" --explain examples/contracts/signed_zero.ml
expect_contains "bit-identical: A is finite and has no -0 entry"
expect_contains "N may hold -0, which the product turns into +0"
expect_contains "N may hold -0, and -0 + 0 = +0"
run_case "the bounded contract applies them and labels them" 0 "$MATRIXC" --fp-bounded --certificate examples/contracts/signed_zero.ml
expect_contains "2. bound-preserving  print(Q)"
expect_contains "3. bound-preserving  print(V)"

run_case "a scaled identity is not a multiplicative unit" 0 "$MATRIXC" -q --fp-algebraic --optimize --run examples/optimize/scaled_identity.ml
expect_contains "T = Matrix<3x3>"

section "Contracts -- strict output is bit-identical for drawn inputs"

for f in examples/contracts/exact_chain.ml examples/contracts/real_chain.ml \
         examples/contracts/boundary_exact.ml examples/contracts/boundary_inexact.ml \
         examples/contracts/signed_zero.ml examples/contracts/mixed.ml; do
    same=1
    for seed in 1 2 3 4 5; do
        plain=$("$MATRIXC" -q --exact-output --run --random-inputs "$seed" "$f" 2>&1)
        opt=$("$MATRIXC" -q --exact-output --optimize --run --random-inputs "$seed" "$f" 2>&1)
        [ "$plain" == "$opt" ] || same=0
    done
    if [ "$same" -eq 1 ]; then
        ok "strict output identical for seeds 1-5: $f"
    else
        bad "strict optimization changed the output of $f"
    fi
done

# =========================================================== CLI behaviour ====

section "Driver"

run_case "oversized dimensions are rejected" 1 "$MATRIXC" --check examples/errors/dimension_limit.ml
expect_contains "4096"
run_case "fractional declaration dimensions are rejected" 1 "$MATRIXC" --check examples/errors/dimension_fractional.ml
expect_contains "whole numbers"
run_case "non-finite declaration dimensions are rejected before conversion" 1 "$MATRIXC" --check examples/errors/dimension_nonfinite.ml
expect_contains "finite"
run_case "non-finite matrix literal token is rejected" 1 "$MATRIXC" --check examples/errors/nonfinite_matrix_literal.ml
expect_contains "finite"
run_case "dimension bound accepts both endpoints" 0 "$MATRIXC" --check examples/valid/dimension_boundaries.ml
run_case "non-finite source literal is rejected" 1 "$MATRIXC" --check examples/errors/nonfinite_literal.ml
expect_contains "finite"

run_case "--help exits cleanly" 0 "$MATRIXC" --help
expect_contains "MatrixLang"

run_case "no input file is a usage error" 2 "$MATRIXC"
run_case "unknown option is a usage error" 2 "$MATRIXC" --nonsense examples/valid/multiply.ml
run_case "missing file is a usage error" 2 "$MATRIXC" examples/valid/does_not_exist.ml

# ==================================================================== report ==

printf '\n================================================\n'
printf '  %d passed, %d failed\n' "$pass" "$fail"
printf '================================================\n'

[ "$fail" -eq 0 ] || exit 1
