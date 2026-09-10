#!/usr/bin/env bash
#
# Review 1 demonstration -- Phase 1: Problem Definition and Design.
#
# What Phase 1 has to show, per the lab manual: the language specification, the
# grammar, the architecture, and an initial working prototype. The documents are
# in docs/; this script is the prototype running.
#
#     source text -> lexical analyser -> token stream -> parser -> valid/invalid
#
# Run with: make demo1

set -u
cd "$(dirname "${BASH_SOURCE[0]}")/.."

MATRIXC=./bin/matrixc
pause() { echo; echo "------------------------------------------------------------"; echo; }

cat <<'INTRO'

################################################################
#                                                              #
#   MatrixLang -- Review 1 : Design and Prototype              #
#                                                              #
################################################################

Phase 1 answers two questions:

  1. What is MatrixLang?      -> docs/phase1-design.md
  2. Does the prototype run?  -> the rest of this script

INTRO

echo "### 1. The source program"
echo
cat examples/phase1/declare.ml

pause

echo "### 2. Lexical analysis -- every token, classified and located"
$MATRIXC --phase1 examples/phase1/declare.ml

pause

echo "### 3. The same prototype rejects malformed input"
echo
echo "    Source:"
sed 's/^/        /' examples/phase1/bad.ml
echo
$MATRIXC --phase1 examples/phase1/bad.ml
echo
echo "Exit status: $?  (0 = accepted, 1 = rejected)"

pause

cat <<'OUTRO'
Phase 1 deliverables and where they are:

  Project title, abstract, problem statement,
  motivation, objectives, scope                 docs/phase1-design.md
  Language specification and grammar            docs/language-reference.md
  System architecture, technology stack         docs/phase1-design.md
  Initial prototype                             demonstrated above

OUTRO
