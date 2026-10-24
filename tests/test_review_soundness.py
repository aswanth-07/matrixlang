"""Regression for the subnormal counterexample and independent obligations."""
import copy
import json
import math
import os
import re
from fractions import Fraction as F
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from check_chain_certificate import check
from test_bound_arithmetic import compile_driver


class ReviewSoundnessTests(unittest.TestCase):
    def test_relative_bound_counterexample(self):
        q = math.ulp(0.0)
        a, b, c = 3*q, .5, .75
        self.assertEqual((a*b)*c, 2*q)
        self.assertEqual(a*(b*c), q)
        exact = F(a)*F(b)*F(c)
        self.assertEqual(exact/F(q), F(9, 8))
        u = F(1, 2**53)
        coeff = 1/((1-u)*(1-2*u))-1
        for got in [(a*b)*c, a*(b*c)]:
            self.assertGreater(abs(F(got)-exact), coeff*abs(exact))

    def test_product_grid_boundary(self):
        with tempfile.TemporaryDirectory(dir=ROOT / "build") as td:
            exe = Path(td) / "range.exe"
            compile_driver(ROOT / "tests/range_driver.c", exe)
            out = subprocess.check_output([str(exe)], text=True)
            self.assertEqual(out.splitlines(), ["exact-subnormal=1", "inexact-underflow=0", "inexact-integer-chain=1"])

    def test_vm_preserves_counterexample_source_order(self):
        exe = ROOT / "bin" / ("matrixc.exe" if os.name == "nt" else "matrixc")
        with tempfile.TemporaryDirectory(dir=ROOT / "build") as td:
            td = Path(td)
            source = td / "underflow.ml"
            inputs = {"A": "0x0.0000000000003p-1022 0", "B": "0.5 0", "C": "0.75 0"}
            flags = []
            for name, values in inputs.items():
                path = td / (name + ".txt")
                path.write_text(values)
                flags.extend(["--input", f"{name}={path}"])
            def result(expression, *opts):
                source.write_text("matrix A[2,1]=input(real(1)); matrix B[1,2]=input(real(1)); "
                                  "matrix C[2,1]=input(real(1)); matrix R="+expression+"; print(R);")
                out = subprocess.check_output([str(exe), "-q", "--run", "--exact-output", *opts, *flags, str(source)], text=True)
                return [float.fromhex(x) for x in re.findall(r"-?0x[0-9a-f.]+p[+-]\d+", out)]
            q = math.ulp(0.0)
            self.assertEqual(result("A*B*C"), [2*q, 0])
            self.assertEqual(result("A*(B*C)"), [q, 0])
            self.assertEqual(result("A*B*C", "--optimize", "--fp-bounded"), [2*q, 0])

    def test_compiler_and_checker(self):
        exe = ROOT / "bin" / ("matrixc.exe" if os.name == "nt" else "matrixc")
        with tempfile.TemporaryDirectory(dir=ROOT / "build") as td:
            td = Path(td)
            source = td / "chain.ml"
            cert = td / "cert.jsonl"
            env = dict(os.environ, MATRIXC_CERTIFICATE_JSONL=str(cert))
            def run(domain, contract):
                source.write_text(f"matrix A[2,1] = input({domain});\nmatrix B[1,2] = input({domain});\nmatrix C[2,1] = input({domain});\nmatrix R = A*B*C;\nprint(R);\n")
                return subprocess.check_output([str(exe), "--optimize", contract, "--certificate", "--cost", str(source)], env=env, text=True)
            out = run("real(1)", "--fp-bounded")
            self.assertNotIn("bound-preserving", out)
            self.assertEqual(cert.read_text(), "")
            run("int8", "--fp-strict")
            exact = json.loads(cert.read_text())
            self.assertEqual(check(exact), "bit-identical")
            run("int32", "--fp-bounded")
            bounded = json.loads(cert.read_text())
            self.assertEqual(check(bounded), "bound-preserving")
            bad = copy.deepcopy(bounded)
            bad["operands"][0]["grid"] = -1074
            bad["operands"][1]["grid"] = -1074
            with self.assertRaises(AssertionError): check(bad)
            bad = copy.deepcopy(bounded)
            bad["relative_coefficient"] = "0x0p+0"
            with self.assertRaises(AssertionError): check(bad)
            bad = copy.deepcopy(exact)
            bad["operands"][0]["magnitude"] = "0x1p+1023"
            with self.assertRaises(AssertionError): check(bad)


if __name__ == "__main__":
    unittest.main()
