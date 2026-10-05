"""Independent numerical regression fixtures for the two optimizer contracts."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
BINARY = ROOT / "bin" / ("matrixc.exe" if (ROOT / "bin/matrixc.exe").exists() else "matrixc")


def matrix(name, r, c, values):
    rows = ["{" + ",".join(values[i*c:(i+1)*c]) + "}" for i in range(r)]
    return f"matrix {name}[{r},{c}] = {{" + ",".join(rows) + "};\n"


FIXTURES = {
    "literal_roundtrip": "scalar x=1.2345678901234567; print(x);",
    "fold_roundtrip": "scalar x=1.2345678901234567*1.9876543210987654; print(x);",
    "fold_cancellation": "scalar x=(1.2345678901234567*1.9876543210987654)-2.45389; print(x);",
    "signed_zero_add": "matrix A[1,1]={{-0.0}}; matrix R=A+zeros(1,1); print(R);",
    "signed_zero_scale": "scalar x=-2; scalar y=x*0; print(y);",
    "zero_inf": "scalar x=1e308; scalar z=x*x; scalar y=z*0; print(y);",
    "identity_inf": "matrix A[2,2]={{1e308*1e308,2},{3,4}}; matrix R=A*identity(2); print(R);",
    "identity_zero": "matrix A[2,2]={{-0.0,0},{0,-0.0}}; matrix R=A*identity(2); print(R);",
    "double_transpose": "matrix A[2,2]={{-0.0,0.1},{1e-300,1e300}}; matrix R=transpose(transpose(A)); print(R);",
    "reassignment": "matrix A[2,2]={{1,2},{3,4}}; matrix T=transpose(A); A=ones(2,2); matrix R=transpose(T); print(R);",
    "temporary_namespace": "scalar t1=7; scalar t10=9; scalar x=t1+2; scalar y=x*t10; print(t1); print(y);",
    "subnormal": "scalar x=1e-300; scalar y=x*1e-20; scalar z=y+0; print(z);",
}
FIXTURES["chain_overflow"] = (matrix("A",5,1,["1e200"]*5) +
    matrix("B",1,5,["1e200"]*5) + matrix("C",5,1,["1e-200"]*5) +
    "matrix R=A*B*C; print(R);")
FIXTURES["chain_rounding"] = (matrix("A",5,1,["0.1","0.3","0.7","1.1","1.3"]) +
    matrix("B",1,5,["0.2","0.4","0.6","0.8","1.2"]) +
    matrix("C",5,1,["0.3","0.9","1.7","2.1","2.3"]) +
    "matrix R=A*B*C; print(R);")
FIXTURES["chain_dependency"] = (matrix("A",5,1,["1"]*5) +
    matrix("B",1,5,["2"]*5) + matrix("C",1,5,["3"]*5) +
    "matrix R=A*B*transpose(C); print(R);")
EXPECTED_SCALARS = {
    "literal_roundtrip": [1.2345678901234567],
    "fold_roundtrip": [1.2345678901234567*1.9876543210987654],
    "fold_cancellation": [1.2345678901234567*1.9876543210987654-2.45389],
    "signed_zero_scale": [-0.0],
    "temporary_namespace": [7.0,81.0],
    "subnormal": [1e-300*1e-20+0.0],
}


def execute(source, flags, exact=True):
    with tempfile.TemporaryDirectory(prefix="matrixlang-numeric-") as tmp:
        path = Path(tmp)/"case.ml"
        path.write_text(source, encoding="utf-8")
        cmd = [str(BINARY), "-q", "--run"]
        if exact:
            cmd.append("--exact-output")
        p = subprocess.run(cmd+flags+[str(path)], capture_output=True, text=True, timeout=30)
        if p.returncode:
            raise RuntimeError(f"execution failed {p.returncode}: {p.stdout} {p.stderr}")
        return p.stdout


def check():
    rows=[]
    for name, source in FIXTURES.items():
        plain = execute(source, [])
        strict = execute(source, ["--optimize"])
        algebraic = execute(source, ["--fp-algebraic", "--optimize"])
        if strict != plain:
            raise AssertionError(f"strict mismatch: {name}\n{plain}\n{strict}")
        if name in EXPECTED_SCALARS:
            actual = [float.fromhex(line.split(" = ")[1]) for line in plain.splitlines()]
            if [struct.pack("d",x) for x in actual] != [struct.pack("d",x) for x in EXPECTED_SCALARS[name]]:
                raise AssertionError(f"Python binary64 reference mismatch: {name}")
        rows.append({"fixture":name,"source_sha256":hashlib.sha256(source.encode()).hexdigest(),
                     "plain":plain,"strict":strict,"algebraic":algebraic,
                     "strict_identical":plain==strict,"algebraic_identical":plain==algebraic,
                     "independent_scalar_reference":name in EXPECTED_SCALARS})
    # Counterexamples are intended to show the relaxed contract's boundary.
    required = {"signed_zero_scale","zero_inf","identity_inf","chain_overflow"}
    assert all(not r["algebraic_identical"] for r in rows if r["fixture"] in required)
    assert next(r for r in rows if r["fixture"]=="chain_dependency")["algebraic_identical"]
    return {"fixtures":len(rows),"strict_identical":len(rows),
            "algebraic_differences":sum(not r["algebraic_identical"] for r in rows),"results":rows}


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out",type=Path)
    args=parser.parse_args()
    result=check()
    if args.out:
        args.out.parent.mkdir(parents=True,exist_ok=True)
        args.out.write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")
    print(f'{result["strict_identical"]}/{result["fixtures"]} strict fixtures identical; '
          f'{result["algebraic_differences"]} intentional algebraic differences')
