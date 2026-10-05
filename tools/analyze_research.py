"""Regenerate the paper's summary, numeric macros, tables, and plots from raw runs."""
import argparse
from collections import defaultdict
import hashlib
import json
import math
from pathlib import Path
import random
import statistics as stats

ROOT=Path(__file__).resolve().parents[1]


def percentile(v,p):
    v=sorted(v)
    x=(len(v)-1)*p
    lo=int(x); hi=min(lo+1,len(v)-1)
    return v[lo]+(v[hi]-v[lo])*(x-lo)


def describe(v):
    return {"n":len(v),"median":stats.median(v),"q1":percentile(v,.25),
            "q3":percentile(v,.75),"zero":sum(x==0 for x in v),
            "negative":sum(x<0 for x in v)}


def wilson(k,n):
    z=1.959963984540054; p=k/n; d=1+z*z/n
    center=(p+z*z/(2*n))/d
    half=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d
    return [100*(center-half),100*(center+half)]


def read_rows(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--data",type=Path,default=ROOT/"results/research")
    ap.add_argument("--paper",type=Path,default=ROOT/"paper")
    a=ap.parse_args()
    environment=json.loads((a.data/"environment.json").read_text())
    if environment["status"]!="complete":
        raise RuntimeError("Evaluation is incomplete")
    for name,digest in environment["outputs_sha256"].items():
        assert hashlib.sha256((a.data/name).read_bytes()).hexdigest()==digest,name
    cost=read_rows(a.data/"cost.jsonl")
    execution=read_rows(a.data/"execution.jsonl")
    oracle=read_rows(a.data/"oracle.jsonl")
    groups=defaultdict(list)
    for row in cost:
        groups[row["profile"],row["arm"]].append(row)
    summary={"cost":{},"execution":{},"oracle":{"chains":len(oracle),"trees":sum(r["trees"] for r in oracle)},
             "numerics":json.loads((a.data/"numerics.json").read_text()),
             "bootstrap":{"seed":87123,"resamples":2000,"unit":"seed cluster; pooled paired median"}}
    for (profile,arm),rows in groups.items():
        per_seed={}
        for seed in sorted(set(r["seed"] for r in rows)):
            rr=[r for r in rows if r["seed"]==seed]
            per_seed[str(seed)]={"arithmetic":describe([r["arithmetic_pct"] for r in rr]),
                                 "instructions":describe([r["instruction_pct"] for r in rr])}
        delta=[r["arithmetic_pct"]-r["instruction_pct"] for r in rows]
        clusters={s:[r["arithmetic_pct"]-r["instruction_pct"] for r in rows if r["seed"]==s]
                  for s in sorted(set(r["seed"] for r in rows))}
        rng=random.Random(87123)
        boot=[]
        for _ in range(2000):
            sample=[x for s in rng.choices(list(clusters),k=len(clusters)) for x in clusters[s]]
            boot.append(stats.median(sample))
        summary["cost"].setdefault(profile,{})[arm]={
            "arithmetic":describe([r["arithmetic_pct"] for r in rows]),
            "instructions":describe([r["instruction_pct"] for r in rows]),
            "paired_difference":{"median":stats.median(delta),"ci95":[percentile(boot,.025),percentile(boot,.975)]},
            "seed_results":per_seed}
        if profile in ("square","elementwise") and arm=="chain_only":
            assert all(r["arithmetic_pct"]==0 for r in rows)
    for values in ("dyadic","broad"):
        summary["execution"][values]={}
        for arm in ("strict","algebraic"):
            rows=[r for r in execution if r["values"]==values and r["arm"]==arm]
            k=sum(not r["identical"] for r in rows)
            summary["execution"][values][arm]={"n":len(rows),"differences":k,"pct":100*k/len(rows),"wilson95":wilson(k,len(rows)),
                "per_seed":{str(s):sum(not r["identical"] for r in rows if r["seed"]==s) for s in sorted(set(r["seed"] for r in rows))}}
    (a.data/"summary.json").write_text(json.dumps(summary,indent=2)+"\n",encoding="utf-8",newline="\n")
    generated=a.paper/"generated"
    generated.mkdir(parents=True,exist_ok=True)
    def cell(d):
        return f'{d["median"]:.1f} ({d["q1"]:.1f}--{d["q3"]:.1f})'
    lines=[r"\begin{tabular}{@{}lrrrr@{}}",r"\toprule",r"Distribution & Algebraic & Instructions & Chain only & Strict \\",r"\midrule"]
    for profile in ("heterogeneous","square","narrow","balanced","elementwise"):
        g=summary["cost"][profile]
        lines.append(f'{profile.capitalize()} & {cell(g["algebraic"]["arithmetic"])} & {cell(g["algebraic"]["instructions"])} & {cell(g["chain_only"]["arithmetic"])} & {cell(g["strict"]["arithmetic"])} '+r"\\")
    lines.extend([r"\bottomrule",r"\end{tabular}"])
    (generated/"distributions.tex").write_text("\n".join(lines)+"\n",encoding="utf-8",newline="\n")
    lines=[r"\begin{tabular}{@{}lrrr@{}}",r"\toprule",r"Configuration & Arithmetic & Instructions & No arithmetic saving \\",r"\midrule"]
    for arm in ("algebraic","no_chain","chain_only","strict","algebra_only","cse_only","copy_only","dce_only"):
        g=summary["cost"]["heterogeneous"][arm]
        lines.append(f'{arm.replace("_"," ").capitalize()} & {cell(g["arithmetic"])} & {cell(g["instructions"])} & {g["arithmetic"]["zero"]} / {g["arithmetic"]["n"]} '+r"\\")
    lines.extend([r"\bottomrule",r"\end{tabular}"])
    (generated/"ablations.tex").write_text("\n".join(lines)+"\n",encoding="utf-8",newline="\n")
    lines=[r"\begin{tabular}{@{}lrrrr@{}}",r"\toprule",r"Seed & Algebraic arithmetic & Instructions & Chain only & Broad mismatches \\",r"\midrule"]
    for seed,g in summary["cost"]["heterogeneous"]["algebraic"]["seed_results"].items():
        chain=summary["cost"]["heterogeneous"]["chain_only"]["seed_results"][seed]
        mismatch=summary["execution"]["broad"]["algebraic"]["per_seed"][seed]
        lines.append(f'{seed} & {cell(g["arithmetic"])} & {cell(g["instructions"])} & {cell(chain["arithmetic"])} & {mismatch}/100 '+r"\\")
    lines.extend([r"\bottomrule",r"\end{tabular}"])
    (generated/"seeds.tex").write_text("\n".join(lines)+"\n",encoding="utf-8",newline="\n")
    h=summary["cost"]["heterogeneous"]["algebraic"]
    c=summary["cost"]["heterogeneous"]["chain_only"]["arithmetic"]
    macros={"ArithmeticMedian":h["arithmetic"]["median"],"ArithmeticQone":h["arithmetic"]["q1"],"ArithmeticQthree":h["arithmetic"]["q3"],
            "InstructionMedian":h["instructions"]["median"],"InstructionQone":h["instructions"]["q1"],"InstructionQthree":h["instructions"]["q3"],
            "DeltaMedian":h["paired_difference"]["median"],"DeltaLow":h["paired_difference"]["ci95"][0],"DeltaHigh":h["paired_difference"]["ci95"][1],
            "ChainShare":100*(c["n"]-c["zero"])/c["n"]}
    text="\n".join(f"\\newcommand{{\\{key}}}{{{value:.1f}}}" for key,value in macros.items())
    counts={"CostPrograms":len(cost)//len(environment["arm_flags"]),"CostObservations":len(cost),
            "ExecutionPrograms":len(execution)//2,"OracleChains":len(oracle),"OracleTrees":sum(r["trees"] for r in oracle),
            "BroadDifferences":summary["execution"]["broad"]["algebraic"]["differences"],
            "DyadicDifferences":summary["execution"]["dyadic"]["algebraic"]["differences"],
            "NumericalFixtures":summary["numerics"]["fixtures"],"FixtureDifferences":summary["numerics"]["algebraic_differences"]}
    text+="\n"+"\n".join(f"\\newcommand{{\\{key}}}{{{value:,}}}" for key,value in counts.items())
    (generated/"numbers.tex").write_text(text+"\n",encoding="utf-8",newline="\n")
    # The plot contains no fitted trends; all curves are empirical CDFs.
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams.update({"font.size":9,"pdf.fonttype":42,"ps.fonttype":42})
    fig,axes=plt.subplots(1,2,figsize=(7.1,2.7),layout="constrained")
    for arm,label,style in (("algebraic","Algebraic arithmetic","-"),("chain_only","Chain-only arithmetic","--"),("strict","Strict arithmetic",":")):
        vals=sorted(r["arithmetic_pct"] for r in groups["heterogeneous",arm])
        axes[0].plot(vals,[(i+1)/len(vals) for i in range(len(vals))],style,label=label,color="black",linewidth=1.3)
    vals=sorted(r["instruction_pct"] for r in groups["heterogeneous","algebraic"])
    axes[0].plot(vals,[(i+1)/len(vals) for i in range(len(vals))],"-.",label="Algebraic instructions",color="#666666")
    axes[0].set(xlabel="Reduction (%)",ylabel="Cumulative fraction of programs",xlim=(0,100),ylim=(0,1))
    axes[0].legend(fontsize=7,loc="lower right")
    profiles=("heterogeneous","square","narrow","balanced","elementwise")
    for i,profile in enumerate(profiles):
        g=summary["cost"][profile]["algebraic"]["arithmetic"]
        axes[1].errorbar(i,g["median"],yerr=[[g["median"]-g["q1"]],[g["q3"]-g["median"]]],fmt="o",color="black",capsize=3)
        strict=summary["cost"][profile]["strict"]["arithmetic"]
        axes[1].plot(i,strict["median"],"x",color="#777777")
    axes[1].set(xticks=range(5),xticklabels=["Hetero.","Square","Narrow","Balanced","Element."],ylabel="Arithmetic reduction (%)",ylim=(-2,102))
    axes[1].plot([],[],"ko",label="Algebraic median + IQR")
    axes[1].plot([],[],"x",color="#777777",label="Strict median")
    axes[1].legend(fontsize=7)
    for ax in axes:
        ax.grid(axis="y",alpha=.2)
    (a.paper/"figures").mkdir(exist_ok=True)
    fig.savefig(a.paper/"figures/research.pdf",metadata={"CreationDate":None,"ModDate":None})
    fig.savefig(a.paper/"figures/research.png",dpi=180)
    plt.close(fig)
    print(json.dumps({"heterogeneous":h,"execution":summary["execution"],"oracle":summary["oracle"]},indent=2))


if __name__=="__main__":
    main()
