"""Replay exported matrix-chain obligations with exact rational arithmetic.

Usage: python tools/check_chain_certificate.py certificates.jsonl
Operand facts and their connection to source/code remain trusted.
"""
import json
import math
import sys
from fractions import Fraction as F

MAX = F(float.fromhex("0x1.fffffffffffffp+1023"))
U = F(1, 2**53)


def power(e):
    return F(2**e) if e >= 0 else F(1, 2**-e)


def check(c):
    if not __debug__:
        raise RuntimeError("run the checker without Python -O: assertions are required")
    assert c["schema"] == 1 and c["kind"] == "matrix-chain"
    assert c["format"] == "binary64" and c["rounding"] == "nearest-even"
    assert c["gradual_underflow"] is True
    ds, ops = c["dimensions"], c["operands"]
    k = len(ops)
    assert 3 <= k <= 32 and len(ds) == k + 1
    assert all(type(d) is int and 0 < d <= 2**31 - 1 for d in ds)
    mags, grids = [], []
    for o in ops:
        m = float.fromhex(o["magnitude"])
        g = o["grid"]
        assert o["finite"] is True and math.isfinite(m) and m >= 0
        assert type(g) is int and -1074 <= g <= 100000
        mags.append(F(m)); grids.append(g)
    def sub(i, j):
        m, g = mags[i], grids[i]
        for t in range(i + 1, j + 1):
            m *= mags[t] * ds[t]
            g += grids[t]
        return m, g
    def fits(m, g):
        return m == 0 or (g >= -1074 and m <= MAX and m <= power(g + 53))
    pi = F(1)
    for d in ds[1:-1]:
        assert d * U < 1
        pi *= 1 / (1 - d * U)
    declared = float.fromhex(c["relative_coefficient"])
    assert math.isfinite(declared) and F(declared) >= pi - 1, "understated coefficient"
    guarantee = c["guarantee"]
    assert guarantee in {"bit-identical", "bound-preserving"}
    for i in range(k):
        for j in range(i + 1, k):
            m, g = sub(i, j)
            if m == 0:
                continue
            if guarantee == "bound-preserving":
                assert g >= -1074, "inexact underflow not excluded"
                assert m <= power(1020) and pi < 2, "overflow slack not established"
            elif not fits(m, g):
                assert (i, j) == (0, k - 1), "inexact proper sub-chain"
                assert g >= -1074 and m <= MAX
                for s in range(k - 1):
                    ml, _ = sub(0, s); mr, _ = sub(s + 1, k - 1)
                    term = ml * mr
                    assert term <= MAX
                    assert fits((ds[s + 1] - 1) * term, g), "root may round more than once"
    return guarantee


def main():
    counts = {}
    with open(sys.argv[1], encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            try:
                level = check(json.loads(line))
            except (AssertionError, KeyError, ValueError, TypeError, OverflowError) as e:
                raise SystemExit(f"record {n}: rejected: {e}")
            counts[level] = counts.get(level, 0) + 1
    if not counts:
        raise SystemExit("no certificate records: nothing verified")
    print(json.dumps({"checked": sum(counts.values()), "levels": counts,
                      "scope": "numerical obligations conditional on supplied operand facts"}))


if __name__ == "__main__":
    main()
