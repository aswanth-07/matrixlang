#!/usr/bin/env bash
# run.sh -- checks for the ExactReduce plugin.
#
#  1. smoke.c: every reduction gets the expected decision (smoke.expected).
#  2. The licensed reductions are vectorized; the declined ones are not.
#  3. kernels/stress.c: the licensed build prints the strict build's bits on
#     every input family and trip count, and the one-bit-wider mutant does not.
#  4. The same two comparisons for the integer rewrite (EXACT_REDUCE_INTEGER=1),
#     and tier32.c: its 32-bit tier at the trip count where 32 bits stop sufficing.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
plugin="$here/../ExactReduce.so"
CLANG=${CLANG:-clang}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
fail=0

EXACT_REDUCE_REPORT="$work/report" "$CLANG" -O3 -march=native -g -fpass-plugin="$plugin" \
    -S -emit-llvm "$here/smoke.c" -o "$work/smoke.ll"
awk '{for (i = 2; i <= NF; i++) if ($i ~ /^(licensed|versioned|declined)$/) { print $1, $i; break }}' \
    "$work/report" | sort > "$work/got"
sort "$here/smoke.expected" > "$work/want"
if diff -u "$work/want" "$work/got"; then echo "decisions: ok"; else echo "decisions: FAILED"; fail=1; fi

while read -r fn decision; do
    vec=$(awk "/define.*@$fn\\(/,/^}/" "$work/smoke.ll" | grep -c 'vector.reduce.fadd' || true)
    if [[ $decision == declined && $vec -ne 0 ]] || [[ $decision != declined && $vec -eq 0 ]]; then
        echo "vectorization of $fn ($decision): FAILED"; fail=1
    fi
done < "$here/smoke.expected"
echo "vectorization: checked"
python3 "$here/check_ir_boundary.py" "$work/smoke.ll"

# smoke.c itself, strict against licensed, on families and lengths around each guard.
"$CLANG" -std=c11 -O2 -c "$here/smoke_driver.c" -o "$work/smoke_driver.o"
"$CLANG" -std=c11 -O3 -march=native -c "$here/smoke.c" -o "$work/smoke-strict.o"
"$CLANG" -std=c11 -O3 -march=native -fpass-plugin="$plugin" -c "$here/smoke.c" -o "$work/smoke-licensed.o"
EXACT_REDUCE_INTEGER=1 "$CLANG" -std=c11 -O3 -march=native -fpass-plugin="$plugin" \
    -c "$here/smoke.c" -o "$work/smoke-integer.o"
for v in strict licensed integer; do
    "$CLANG" "$work/smoke_driver.o" "$work/smoke-$v.o" -o "$work/smoke-$v"
    "$work/smoke-$v" > "$work/smoke-out-$v"
done
for v in licensed integer; do
    if cmp -s "$work/smoke-out-strict" "$work/smoke-out-$v"; then
        echo "smoke: $v build matches strict on $(wc -l < "$work/smoke-out-strict") lines"
    else
        echo "smoke: $v FAILED"; diff "$work/smoke-out-strict" "$work/smoke-out-$v" | head; fail=1
    fi
done

"$CLANG" -std=c11 -O2 -c "$here/../kernels/stress.c" -o "$work/stress.o"
build() {  # name, extra environment...
    local name=$1; shift
    env "$@" "$CLANG" -std=c11 -O3 -march=native ${plugin:+-fpass-plugin="$plugin"} \
        -c "$here/../kernels/kernels.c" -o "$work/k-$name.o"
    "$CLANG" "$work/stress.o" "$work/k-$name.o" -o "$work/stress-$name" -lm
    "$work/stress-$name" > "$work/out-$name"
}
plugin_saved=$plugin; plugin=""; build strict; plugin=$plugin_saved
build licensed
build integer EXACT_REDUCE_INTEGER=1
build mutant EXACT_REDUCE_EXTRA_BITS=1
for v in licensed integer; do
    if cmp -s "$work/out-strict" "$work/out-$v"; then
        echo "stress: $v build matches strict on $(wc -l < "$work/out-strict") cases"
    else
        echo "stress: $v FAILED"; diff "$work/out-strict" "$work/out-$v" | head; fail=1
    fi
done
"$CLANG" -std=c11 -O2 -c "$here/tier32.c" -o "$work/tier32.o"
for v in strict integer; do
    "$CLANG" "$work/tier32.o" "$work/k-$v.o" -o "$work/tier32-$v" -lm
    "$work/tier32-$v" > "$work/tier32-out-$v" 2>/dev/null
done
if cmp -s "$work/tier32-out-strict" "$work/tier32-out-integer"; then
    echo "tier32: integer build matches strict at the 32-bit limit on $(wc -l < "$work/tier32-out-strict") cases"
else
    echo "tier32: FAILED"; diff "$work/tier32-out-strict" "$work/tier32-out-integer" | head; fail=1
fi
if cmp -s "$work/out-strict" "$work/out-mutant"; then
    echo "stress: the one-bit-wider mutant was not detected: FAILED"; fail=1
else
    echo "stress: mutant detected on $(diff "$work/out-strict" "$work/out-mutant" | grep -c '^>') cases"
fi
exit $fail
