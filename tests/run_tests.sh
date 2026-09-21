#!/usr/bin/env bash
#
# MatrixLang -- acceptance tests.
#
# Every case asserts two things: the exit status, and specific text in the
# output. Exit status alone would pass a compiler that rejected every program
# for the wrong reason; output text alone would not catch one that printed the
# right message and then exited 0.
#
# The final section is the strongest test in the suite. It runs each program
# with and without the optimizer and requires byte-identical output, which is
# the only way to show that the optimizer preserves meaning rather than merely
# producing fewer instructions.
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

run_case "algebra.ml" 0 "$MATRIXC" --optimize --explain --report examples/optimize/algebra.ml
expect_contains "(x * I = x)"
expect_contains "(I * x = x)"
expect_contains "(x + 0 = x)"
expect_contains "(x - 0 = x)"
expect_contains "(transpose(transpose(x)) = x)"
expect_contains "(x * 1 = x)"
expect_contains "Identity operations       :      3"
expect_contains "Double transposes         :      1"

section "Phase 3 -- an identity written as a literal is still an identity"

run_case "literal identity is recognised" 0 "$MATRIXC" --optimize --explain examples/optimize/literal_identity.ml
expect_contains "(x * I = x)"

section "Phase 3 -- individual passes can be selected"

run_case "algebra only" 0 "$MATRIXC" --opt-algebraic --report examples/optimize/algebra.ml
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

# ====================================== PHASE 3: the optimizer is meaning-safe ==

section "Phase 3 -- optimization does not change what a program computes"

for f in examples/valid/*.ml examples/optimize/*.ml; do
    plain=$("$MATRIXC" -q --run "$f" 2>&1)
    opt=$("$MATRIXC" -q --optimize --run "$f" 2>&1)
    if [ "$plain" == "$opt" ]; then
        ok "identical output with and without the optimizer: $f"
    else
        bad "optimizer changed the output of $f"
        diff <(printf '%s\n' "$plain") <(printf '%s\n' "$opt") | sed 's/^/        | /'
    fi
done

# =========================================================== CLI behaviour ====

section "Driver"

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
