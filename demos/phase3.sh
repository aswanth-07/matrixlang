#!/usr/bin/env bash
#
# Review 3 demonstration -- Phase 3: Final Implementation and Testing.
#
#   optimization  ->  target code  ->  execution  ->  the full test suite
#
# Run with: make demo3

set -u
cd "$(dirname "${BASH_SOURCE[0]}")/.."

MATRIXC=./bin/matrixc
pause() { echo; echo "------------------------------------------------------------"; echo; }

cat <<'INTRO'

################################################################
#                                                              #
#   MatrixLang -- Review 3 : Optimization and Backend          #
#                                                              #
################################################################

INTRO

echo "### 1. Common subexpression elimination"
echo
cat examples/optimize/cse.ml
$MATRIXC --tac --optimize --explain --report examples/optimize/cse.ml \
    | sed -n '/INTERMEDIATE CODE/,$p'

pause

echo "### 2. Dead code elimination"
echo
cat examples/optimize/dce.ml
$MATRIXC --tac --optimize --explain --report examples/optimize/dce.ml \
    | sed -n '/INTERMEDIATE CODE/,$p'

pause

echo "### 3. Matrix-specific optimization -- the original contribution"
echo
echo "    A general optimizer cannot do these, because it does not know what a"
echo "    matrix is. MatrixLang tracks which values are identity matrices, which"
echo "    are all zeros, and which came from a transpose."
echo
cat examples/optimize/algebra.ml
$MATRIXC --tac --optimize --explain --report examples/optimize/algebra.ml \
    | sed -n '/OPTIMIZED INTERMEDIATE/,$p'

pause

echo "### 4. Target code and execution"
echo
cat examples/valid/multiply.ml
$MATRIXC --optimize --target --run examples/valid/multiply.ml \
    | sed -n '/TARGET CODE/,$p'

pause

echo "### 5. The optimizer does not change what the program means"
echo
echo "    For every example, unoptimized and optimized execution are compared"
echo "    byte for byte. A smaller program that computes something else would"
echo "    not be an optimization."
echo
for f in examples/valid/*.ml examples/optimize/*.ml; do
    a=$("$MATRIXC" -q --run "$f" 2>&1)
    b=$("$MATRIXC" -q --optimize --run "$f" 2>&1)
    if [ "$a" == "$b" ]; then
        printf '    identical output   %s\n' "$f"
    else
        printf '    *** DIFFERS ***    %s\n' "$f"
    fi
done

pause

echo "### 6. The full test suite"
echo
bash tests/run_tests.sh | tail -8
