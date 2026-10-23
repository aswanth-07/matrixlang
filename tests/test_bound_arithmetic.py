"""The compiler's upward-rounded bound arithmetic against exact rational oracles.

Magnitude bounds decide exactness, so an underestimate is a soundness defect.
Each case reconstructs the exact binary64 operands with Fraction and checks
that the compiler's bound is never below the exact value. The magnitude
arithmetic is built for generic x86-64 (library fma) and for Haswell
(hardware FMA), because the residual check depends on fma.
"""

import math
import random
import shutil
import subprocess
import tempfile
import unittest
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AREAS = ["frontend", "analysis", "ir", "backend", "support"]
UNIT = Fraction(1, 1 << 53)


def objects():
    found = sorted(p for p in (ROOT / "build").glob("*/*.o") if p.parent.name in AREAS)
    return found + [ROOT / "build" / "matrix.tab.o", ROOT / "build" / "lex.yy.o"]


def compile_driver(source, output, flags=(), exclude=()):
    gcc = shutil.which("gcc") or "C:/msys64/mingw64/bin/gcc.exe"
    command = [gcc, "-std=c11", "-ffp-contract=off", *flags]
    command += ["-I" + str(ROOT / "src")] + ["-I" + str(ROOT / "src" / a) for a in AREAS]
    command += ["-I" + str(ROOT / "build"), str(source)]
    command += [str(p) for p in objects() if p not in exclude]
    command += ["-o", str(output), "-lm"]
    result = subprocess.run(command, capture_output=True, text=True, timeout=120)
    if result.returncode:
        raise RuntimeError(result.stdout + result.stderr)


def run(driver, *args):
    result = subprocess.run([str(driver), *map(str, args)], capture_output=True,
                            text=True, timeout=10, check=True)
    return result.stdout.strip()


class BoundArithmeticTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not (ROOT / "build" / "ir" / "facts.o").exists():
            raise unittest.SkipTest("build the compiler first (make)")
        cls.temporary = tempfile.TemporaryDirectory(prefix="bound-tests-", dir=ROOT / "build")
        work = Path(cls.temporary.name)
        cls.arithmetic = {}
        for target in ["x86-64", "haswell"]:
            driver = work / f"bound-arithmetic-{target}.exe"
            compile_driver(ROOT / "tests" / "bound_arithmetic_driver.c", driver,
                           flags=["-O3", f"-march={target}"],
                           exclude=[ROOT / "build" / "ir" / "facts.o"])
            cls.arithmetic[target] = driver
        cls.chain = work / "chain-bound.exe"
        compile_driver(ROOT / "tests" / "chain_bound_driver.c", cls.chain)

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def test_magnitude_products_bound_exact_rationals_near_underflow(self):
        # (1 + 2^-52) 2^-511 times (1 - 2^-53) 2^-511 rounds to the smallest
        # normal number while its positive residual is below the subnormal
        # range, so an unscaled fma residual is zero.
        cases = [(0.0, 1.0), (0.5, 0.5), (3.0, 5.0)]
        for shift in [-511, -510, -500, -485, -484, 0]:
            cases.append((math.ldexp(1.0 + 2.0**-52, shift), math.ldexp(1.0 - 2.0**-53, shift)))
            cases.append((math.ldexp(1.0 + 2.0**-52, shift), math.ldexp(1.0 + 2.0**-52, shift)))
            cases.append((math.ldexp(1.0, shift), math.ldexp(1.0, shift)))
        for target, driver in self.arithmetic.items():
            for a, b in cases:
                with self.subTest(target=target, a=a.hex(), b=b.hex()):
                    bound = float.fromhex(run(driver, "mul", a.hex(), b.hex()))
                    exact = Fraction(a) * Fraction(b)
                    self.assertGreaterEqual(Fraction(bound), exact)
                    if exact == Fraction(a * b):
                        self.assertEqual(bound, a * b, "an exact product must stay sharp")

    def test_nonfinite_bound_never_fits_a_coarse_grid(self):
        driver = self.arithmetic["x86-64"]
        for grid in [971, 1000, 1023]:
            with self.subTest(grid=grid):
                self.assertEqual(run(driver, "fits", "inf", grid), "0")
                self.assertEqual(run(driver, "fits", (2.0**1023).hex(), grid), "1")
        self.assertEqual(run(driver, "fits", "0", 0), "1")

    def test_chain_bound_never_understates_exact_coefficient(self):
        # The componentwise coefficient of a chain with inner dimensions d_t
        # is prod (1 + gamma_{d_t}) - 1, where 1 + gamma_d = 1 / (1 - d u).
        rng = random.Random(801)
        cases = [[1], [1, 1], [1] * 31, [3, 5, 7], [4096] * 31]
        cases += [[rng.randint(1, 4096) for _ in range(rng.randint(1, 31))] for _ in range(80)]
        for dims in cases:
            with self.subTest(dims=dims):
                exact = Fraction(1)
                for d in dims:
                    exact *= 1 / (1 - d * UNIT)
                exact -= 1
                value = float.fromhex(run(self.chain, *dims))
                self.assertGreaterEqual(Fraction(value), exact)
                self.assertLessEqual(value / float(exact), 1 + 1e-12, "the bound is loose")


if __name__ == "__main__":
    unittest.main()
