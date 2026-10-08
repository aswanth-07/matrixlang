"""RQ5: which test populations notice a compiler that drops one side condition.

Each mutant of bin/matrixc-mutants (src/ir/mutant.h) disables one proof
obligation of the strict contract. A mutant is killed by a test when its
strict-optimized output differs, bit for bit, from the correct compiler's
unoptimized output. Five populations are compared:

    dyadic    literal programs with small integer entries (the earlier study)
    broad     literal programs with entries spread over 10^-12 .. 10^12
    domain    input-domain programs on inputs drawn from their domains
    extreme   input-domain programs on inputs at the domain bounds, with -0
    fixtures  the hand-written numerical fixtures of tools/check_numerics.py
    witness   one program per side condition, written from the condition
              (tools/contracts/witnesses/); mutant 3 has none, and mutant 5
              is equivalent: a non-finite fact never carries "no -0", so the
              -0 condition already blocks every rewrite mutant 5 would admit

    python tools/contracts/mutation.py

Writes results/contracts/rq5_mutation.jsonl and rq5_env.json.
"""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import random
import re
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import common  # noqa: E402
import genprog  # noqa: E402
from check_numerics import FIXTURES  # noqa: E402

MUTANTS = list(range(1, 10))
PROFILES = ["heterogeneous", "balanced", "algebraic"]
SEEDS = range(1, 6)
PER_CELL = 6
INPUT_SEEDS = (11, 22)
EXTREME_DRAWS = 2
WITNESSES = Path(__file__).resolve().parent / "witnesses"
DECL = re.compile(r"^matrix (\w+)\[(\d+),(\d+)\] = input\(([^;]*)\);$", re.M)
BOUNDS = {"bool": [0, 1], "uint8": [0, 255], "int8": [-128, 127], "int16": [-32768, 32767],
          "int32": [-2147483648, 2147483647], "real(1)": [-1.0, 1.0, "-0", 0.5],
          "real": [-1e200, 1e200, "-0", 1.0]}


def extreme_inputs(source, workdir, tag, draw):
    rng = random.Random(f"{tag}/{draw}")
    flags = []
    for name, rows, cols, domain in DECL.findall(source):
        values = [str(rng.choice(BOUNDS[domain])) for _ in range(int(rows) * int(cols))]
        path = Path(workdir) / f"{tag}_{draw}_{name}.txt"
        path.write_text(" ".join(values) + "\n", encoding="utf-8")
        flags += ["--input", f"{name}={path}"]
    return flags


def tests():
    """Yields (population, tag, source, list of input-flag lists)."""
    for seed in SEEDS:
        for profile in PROFILES:
            for index in range(PER_CELL):
                for literals in ("dyadic", "broad"):
                    yield literals, f"{literals}_{seed}_{profile}_{index}", \
                        genprog.program(seed, index, "exec", profile, "int8", literals), [[]]
                for domain in genprog.DOMAINS:
                    src = genprog.program(seed, index, "exec", profile, domain)
                    tag = f"{seed}_{profile}_{domain}_{index}"
                    yield "domain", "domain_" + tag, src, [["--random-inputs", str(s)] for s in INPUT_SEEDS]
                    yield "extreme", "extreme_" + tag, src, [("extreme", d) for d in range(EXTREME_DRAWS)]
    for name, src in FIXTURES.items():
        yield "fixtures", "fixture_" + name, src, [[]]
    for path in sorted(WITNESSES.glob("*.ml")):
        yield "witness", "witness_" + path.stem, path.read_text(encoding="utf-8"), [[]]


def evaluate(test, workdir):
    population, tag, source, input_sets = test
    path = Path(workdir) / f"{tag}.ml"
    path.write_text(source, encoding="utf-8")
    rows = []
    for k, inputs in enumerate(input_sets):
        if isinstance(inputs, tuple):
            inputs = extreme_inputs(source, workdir, tag, inputs[1])
        run = ["-q", "--run", "--exact-output", *inputs, path]
        base_code, base = common.call(run)
        if base_code:
            rows.append({"population": population, "test": tag, "input": k, "valid": False})
            continue
        killed = []
        for mutant in MUTANTS:
            code, out = common.call(["--optimize", *run], binary=common.MUTANTS,
                                    env={"MATRIXC_MUTANT": str(mutant)})
            if code or out != base:
                killed.append(mutant)
        rows.append({"population": population, "test": tag, "input": k, "valid": True, "killed": killed})
    return rows


def main():
    if not common.MUTANTS.exists():
        sys.exit("bin/matrixc-mutants is missing; run make mutants first")
    common.RESULTS.mkdir(parents=True, exist_ok=True)
    rows = []
    with tempfile.TemporaryDirectory(prefix="mutation-") as workdir:
        # A correct build must kill nothing; mutant 0 is the unmutated binary.
        with ThreadPoolExecutor(max_workers=20) as pool:
            for result in pool.map(lambda t: evaluate(t, workdir), list(tests())):
                rows.extend(result)
    common.write_jsonl(common.RESULTS / "rq5_mutation.jsonl", rows)
    common.write_json(common.RESULTS / "rq5_env.json", common.environment(
        {"mutants": MUTANTS, "profiles": PROFILES, "seeds": list(SEEDS), "per_cell": PER_CELL,
         "input_seeds": list(INPUT_SEEDS), "extreme_draws": EXTREME_DRAWS,
         "mutants_sha256": common.sha256_file(common.MUTANTS)}))
    print(f"RQ5: {len(rows)} test executions")


if __name__ == "__main__":
    main()
