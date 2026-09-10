#!/usr/bin/env bash
#
# Review 2 demonstration -- Phase 2: Core Implementation.
#
# The manual is explicit that source code alone is not sufficient for Review 2:
# the working modules have to be demonstrated. So this script runs them.
#
#   source -> tokens -> AST -> symbol table -> dimension checking -> TAC
#
# The last section is the important one. It changes a single dimension and shows
# the compiler refusing the program, which is what proves the checking is real.
#
# Run with: make demo2

set -u
cd "$(dirname "${BASH_SOURCE[0]}")/.."

MATRIXC=./bin/matrixc
pause() { echo; echo "------------------------------------------------------------"; echo; }

cat <<'INTRO'

################################################################
#                                                              #
#   MatrixLang -- Review 2 : Core Compiler                     #
#                                                              #
################################################################

Every module of the frontend, running on one program:

    lexical analysis  ->  parsing  ->  symbol table
    ->  dimension-aware semantic analysis  ->  three-address code

INTRO

echo "### The source program"
echo
cat examples/valid/multiply.ml

pause

$MATRIXC --phase2 examples/valid/multiply.ml

pause

cat <<'BREAK'
################################################################
#   Now break it deliberately.                                 #
################################################################

The only change is B's shape: 3x4 becomes 5x4. Nothing else moves.
A is 2x3, so columns(A) = 3 and rows(B) = 5, and the product is
no longer defined.

BREAK

echo "### The modified source"
echo
cat examples/errors/mul_mismatch.ml
echo

$MATRIXC --check examples/errors/mul_mismatch.ml
status=$?

pause
echo "Exit status: $status  (non-zero: the compiler refused to continue)"
echo
echo "No target code was generated, because generating it would mean"
echo "emitting a multiplication the machine cannot perform."
echo
