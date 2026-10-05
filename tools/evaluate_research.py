"""Execute paper/evaluation-protocol.json and save every observation and lineage.

Run after make: python tools/evaluate_research.py
Analyze separately with tools/analyze_research.py. No observations are discarded.
"""
import argparse
import hashlib
import itertools
import json
from pathlib import Path
import platform
import random
import subprocess
import sys
import tempfile
import time

from gen_programs import Gen
from run_experiments import parse_cost, parse_instructions
from check_numerics import BINARY, check

ROOT=Path(__file__).resolve().parents[1]
ARMS={
    "strict":["--optimize"],
    "algebraic":["--fp-algebraic","--optimize"],
    "chain_only":["--fp-algebraic","--opt-chain"],
    "no_chain":["--fp-algebraic","--opt-algebraic","--opt-cse","--opt-copyprop","--opt-dce"],
    "algebra_only":["--fp-algebraic","--opt-algebraic"],
    "cse_only":["--opt-cse"],"copy_only":["--opt-copyprop"],"dce_only":["--opt-dce"],
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def call(path, flags):
    p=subprocess.run([str(BINARY)]+flags+[str(path)],capture_output=True,text=True,timeout=60)
    if p.returncode:
        raise RuntimeError(f"Compiler failed: {p.returncode}: {p.stdout} {p.stderr}")
    return p.stdout


def all_costs(dims):
    """Enumerate every binary tree, with no DP memoization or compiler imports."""
    if len(dims)==2:
        return [0]
    costs=[]
    for split in range(1,len(dims)-1):
        combine=dims[0]*dims[-1]*(2*dims[split]-1)
        for a,b in itertools.product(all_costs(dims[:split+1]),all_costs(dims[split:])):
            costs.append(a+b+combine)
    return costs


def write_program(path, source):
    path.write_text(source,encoding="utf-8",newline="\n")
    return hashlib.sha256(source.encode()).hexdigest()


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--protocol",type=Path,default=ROOT/"paper/evaluation-protocol.json")
    ap.add_argument("--out",type=Path,default=ROOT/"results/research")
    a=ap.parse_args()
    protocol=json.loads(a.protocol.read_text())
    a.out.mkdir(parents=True,exist_ok=True)
    start=time.monotonic()
    sources=sorted((ROOT/"src").rglob("*"))
    sources=[p for p in sources if p.is_file()]+[ROOT/"tools/gen_programs.py",Path(__file__),ROOT/"tools/check_numerics.py"]
    lineage={p.relative_to(ROOT).as_posix():sha(p) for p in sources}
    environment={"platform":platform.platform(),"python":sys.version,"binary_sha256":sha(BINARY),
                 "source_sha256":lineage,"protocol_sha256":sha(a.protocol),"arm_flags":ARMS,
                 "command":"python tools/evaluate_research.py","status":"running"}
    (a.out/"environment.json").write_text(json.dumps(environment,indent=2)+"\n", encoding="utf-8", newline="\n")
    numeric=check()
    (a.out/"numerics.json").write_text(json.dumps(numeric,indent=2)+"\n", encoding="utf-8", newline="\n")
    with tempfile.TemporaryDirectory(prefix="matrixlang-research-") as tmp:
        path=Path(tmp)/"program.ml"
        with (a.out/"cost.jsonl").open("w",encoding="utf-8",newline="\n") as f:
            for profile in protocol["profiles"]:
                for seed in protocol["evaluation_seeds"]:
                    for index in range(protocol["programs_per_seed_profile"]):
                        source=Gen(random.Random(seed*1000003+index),"cost",profile).build(5,4)
                        digest=write_program(path,source)
                        for arm in protocol["arms"]:
                            output=call(path,["--tac","--cost","--report"]+ARMS[arm])
                            cb,ca=parse_cost(output); ib,ia=parse_instructions(output)
                            if None in (cb,ca,ib,ia):
                                raise RuntimeError("Missing cost/instruction measurement")
                            if arm=="chain_only" and ib!=ia:
                                raise AssertionError("Chain changed instruction count")
                            row={"profile":profile,"seed":seed,"index":index,"sha256":digest,"arm":arm,
                                 "cost_before":cb,"cost_after":ca,"instructions_before":ib,"instructions_after":ia,
                                 "arithmetic_pct":100*(cb-ca)/cb if cb else 0.,
                                 "instruction_pct":100*(ib-ia)/ib if ib else 0.}
                            f.write(json.dumps(row,separators=(",",":"))+"\n")
                    f.flush()
                    print(f"cost {profile} seed={seed} complete",flush=True)
        with (a.out/"execution.jsonl").open("w",encoding="utf-8",newline="\n") as f:
            for values in protocol["execution_values"]:
                for seed in protocol["evaluation_seeds"]:
                    for index in range(protocol["execution_programs_per_seed_values"]):
                        source=Gen(random.Random(seed*1000003+index),"exec",values=values).build(5,4)
                        digest=write_program(path,source)
                        plain=call(path,["-q","--exact-output","--run"])
                        for arm in ("strict","algebraic"):
                            optimized=call(path,["-q","--exact-output","--run"]+ARMS[arm])
                            identical=plain==optimized
                            row={"values":values,"seed":seed,"index":index,"sha256":digest,"arm":arm,
                                 "identical":identical,"plain_sha256":hashlib.sha256(plain.encode()).hexdigest(),
                                 "optimized_sha256":hashlib.sha256(optimized.encode()).hexdigest()}
                            if not identical:
                                row.update({"plain":plain,"optimized":optimized})
                            f.write(json.dumps(row,separators=(",",":"))+"\n")
                            if arm=="strict" and not identical:
                                (a.out/"failed.ml").write_text(source)
                                raise AssertionError(f"Strict mismatch at {values} {seed} {index}")
                    f.flush()
                    print(f"execution {values} seed={seed} complete",flush=True)
        with (a.out/"oracle.jsonl").open("w",encoding="utf-8",newline="\n") as f:
            for seed in protocol["evaluation_seeds"]:
                for length in protocol["oracle_chain_lengths"]:
                    for index in range(protocol["oracle_chains_per_seed_length"]):
                        rng=random.Random(seed*1000003+length*10007+index)
                        dims=[rng.choice([1,2,3,5,8,12,20,32,50,80,120,200]) for _ in range(length+1)]
                        source="\n".join(f"matrix M{i}[{dims[i]},{dims[i+1]}];" for i in range(length))
                        source+="\nmatrix R="+"*".join(f"M{i}" for i in range(length))+"; print(R);\n"
                        digest=write_program(path,source)
                        output=call(path,["--fp-algebraic","--opt-chain","--tac","--cost"])
                        cb,ca=parse_cost(output); ib,ia=parse_instructions(output)
                        candidates=all_costs(dims)
                        assert ca==min(candidates) and ib==ia
                        f.write(json.dumps({"seed":seed,"length":length,"index":index,"sha256":digest,"dims":dims,
                                            "trees":len(candidates),"minimum":min(candidates),"compiler":ca,
                                            "instructions_before":ib,"instructions_after":ia})+"\n")
                print(f"oracle seed={seed} complete",flush=True)
    environment.update({"status":"complete","elapsed_seconds":time.monotonic()-start,
                        "outputs_sha256":{p.name:sha(p) for p in sorted(a.out.iterdir()) if p.suffix in (".jsonl",) or p.name=="numerics.json"}})
    (a.out/"environment.json").write_text(json.dumps(environment,indent=2)+"\n", encoding="utf-8", newline="\n")
    print(f'Completed in {environment["elapsed_seconds"]:.1f}s',flush=True)


if __name__=="__main__":
    main()
