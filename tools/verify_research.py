"""Check study coverage, source lineage, generator hashes, and sampled replay.

Recorded binary hashes identify the measured executable. Rebuilt binaries may
vary by platform or timestamp; source equality and replay check portability.
"""
import hashlib
import json
from pathlib import Path
import random
import statistics
import tempfile

from check_numerics import check
from evaluate_research import ROOT, ARMS, all_costs, call, write_program
from gen_programs import Gen
from run_experiments import parse_cost, parse_instructions


def rows(path):
    return [json.loads(line) for line in path.read_text().splitlines()]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify():
    if not __debug__:
        raise RuntimeError('Research verification requires Python without -O or PYTHONOPTIMIZE.')
    data=ROOT/'results/research'
    env=json.loads((data/'environment.json').read_text())
    protocol=json.loads((ROOT/'paper/evaluation-protocol.json').read_text())
    assert env['status']=='complete'
    assert digest(ROOT/'paper/evaluation-protocol.json')==env['protocol_sha256']
    assert ARMS==env['arm_flags']
    for name,h in env['source_sha256'].items():
        assert digest(ROOT/name)==h, f'Stale measured source: {name}'
    for name,h in env['outputs_sha256'].items():
        assert digest(data/name)==h, f'Changed raw output: {name}'
    cost=rows(data/'cost.jsonl'); execution=rows(data/'execution.jsonl'); oracle=rows(data/'oracle.jsonl')
    costs={(r['profile'],r['seed'],r['index'],r['arm']):r for r in cost}
    executions={(r['values'],r['seed'],r['index'],r['arm']):r for r in execution}
    oracles={(r['seed'],r['length'],r['index']):r for r in oracle}
    seeds=protocol['evaluation_seeds']; n=protocol['programs_per_seed_profile']
    expected_cost={(p,s,i,a) for p in protocol['profiles'] for s in seeds for i in range(n) for a in protocol['arms']}
    expected_exec={(v,s,i,a) for v in protocol['execution_values'] for s in seeds
                   for i in range(protocol['execution_programs_per_seed_values']) for a in ('strict','algebraic')}
    expected_oracle={(s,k,i) for s in seeds for k in protocol['oracle_chain_lengths']
                     for i in range(protocol['oracle_chains_per_seed_length'])}
    assert len(costs)==len(cost) and set(costs)==expected_cost
    assert len(executions)==len(execution) and set(executions)==expected_exec
    assert len(oracles)==len(oracle) and set(oracles)==expected_oracle
    summary=json.loads((data/'summary.json').read_text())
    replayed=0
    with tempfile.TemporaryDirectory(prefix='matrixlang-replay-') as tmp:
        path=Path(tmp)/'case.ml'
        for profile in protocol['profiles']:
            for seed in seeds:
                for i in range(n):
                    source=Gen(random.Random(seed*1000003+i),'cost',profile).build(5,4)
                    h=hashlib.sha256(source.encode()).hexdigest()
                    for arm in protocol['arms']:
                        r=costs[profile,seed,i,arm]
                        assert r['sha256']==h
                        assert r['arithmetic_pct']==(100*(r['cost_before']-r['cost_after'])/r['cost_before'] if r['cost_before'] else 0.)
                        assert r['instruction_pct']==100*(r['instructions_before']-r['instructions_after'])/r['instructions_before']
                        if arm=='chain_only':
                            assert r['instructions_before']==r['instructions_after']
                            if profile in ('square','elementwise'): assert r['arithmetic_pct']==0
                        if i==0:
                            write_program(path,source)
                            out=call(path,['--tac','--cost','--report']+ARMS[arm])
                            assert parse_cost(out)==(r['cost_before'],r['cost_after'])
                            assert parse_instructions(out)==(r['instructions_before'],r['instructions_after'])
                            replayed+=1
            for arm in protocol['arms']:
                rr=[r for r in cost if r['profile']==profile and r['arm']==arm]
                for metric,key in [('arithmetic_pct','arithmetic'),('instruction_pct','instructions')]:
                    assert statistics.median(r[metric] for r in rr)==summary['cost'][profile][arm][key]['median']
        for values in protocol['execution_values']:
            for seed in seeds:
                for i in range(protocol['execution_programs_per_seed_values']):
                    source=Gen(random.Random(seed*1000003+i),'exec',values=values).build(5,4)
                    h=hashlib.sha256(source.encode()).hexdigest()
                    for arm in ('strict','algebraic'):
                        r=executions[values,seed,i,arm]
                        assert r['sha256']==h
                        assert r['identical']==(r['plain_sha256']==r['optimized_sha256'])
                        if arm=='strict': assert r['identical']
                        if i==0:
                            write_program(path,source)
                            plain=call(path,['-q','--exact-output','--run'])
                            optimized=call(path,['-q','--exact-output','--run']+ARMS[arm])
                            assert hashlib.sha256(plain.encode()).hexdigest()==r['plain_sha256']
                            assert hashlib.sha256(optimized.encode()).hexdigest()==r['optimized_sha256']
                            replayed+=1
            for arm in ('strict','algebraic'):
                rr=[r for r in execution if r['values']==values and r['arm']==arm]
                assert sum(not r['identical'] for r in rr)==summary['execution'][values][arm]['differences']
        for r in oracle:
            candidates=all_costs(r['dims'])
            assert len(candidates)==r['trees'] and min(candidates)==r['compiler']==r['minimum']
            assert r['instructions_before']==r['instructions_after']
        numeric=check()
        assert numeric==json.loads((data/'numerics.json').read_text())
    return {'status':'passed','cost_observations':len(cost),'execution_observations':len(execution),
            'oracle_chains':len(oracle),'enumerated_trees':sum(r['trees'] for r in oracle),
            'replayed_arm_observations':replayed,'numerical_fixtures':numeric['fixtures']}


if __name__=='__main__':
    result=verify()
    (ROOT/'build').mkdir(exist_ok=True)
    (ROOT/'build/research-verification.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))
