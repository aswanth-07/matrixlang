"""Check the tested LLVM pipeline's permission boundary on smoke IR.

These structural regressions are not proof of arbitrary downstream passes.
"""
import re
import sys
from pathlib import Path

text = Path(sys.argv[1]).read_text()
functions = dict(re.findall(r"define[^@]*@(\w+)\([^\n]*\n(.*?)^}", text, re.S | re.M))
assert functions, "no functions inspected"
for name, body in functions.items():
    for line in body.splitlines():
        if re.search(r"\b(fadd|fsub|fmul|fdiv|call)\b", line):
            assert not re.search(r"\b(nsz|nnan|ninf|arcp|afn|fast)\b", line), (name, line)
        if re.search(r"\bfmul\b", line):
            assert "reassoc" not in line, (name, "permission escaped to a product", line)
for name in ["dot_real", "dot_i8_f32_2048"]:
    assert name in functions and "reassoc" not in functions[name], name
for name in ["sum_u8_long", "dot_i16_long", "sum2d_u8", "two_sums"]:
    body = functions[name]
    assert "vector.reduce.fadd" in body, (name, "licensed vector path missing")
    strict_add = re.search(r"\bfadd (?:contract )?(?:double|float) ", body)
    strict_fma = re.search(r"\bcall (?:double|float) @llvm\.fmuladd\.", body)
    assert strict_add or strict_fma, (name, "strict fallback missing")
    assert re.search(r"\bbr i1\b", body), (name, "guard branch missing")
print(f"IR boundary: {len(functions)} functions checked; declined paths and strict fallbacks retained")
