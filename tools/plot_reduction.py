"""Draw the paper's figure: what the optimizer removes, by each metric.

Reads the recorded experiment output rather than any number typed by hand, so
the figure cannot drift from the measurement it reports.

    python tools/plot_reduction.py --data results \
                                   --out paper/figures/reduction.pdf
"""

import argparse
import json
import os

import statistics

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

INK = "#1b2a24"
TEAL = "#0e7c6b"
AMBER = "#b4690e"
GREY = "#98a4a0"


def load(base, seed):
    with open(os.path.join(base, f"seed{seed}", "cost.json")) as f:
        return json.load(f)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    rows = load(a.data, 1) + load(a.data, 2)
    flops = sorted(r["flops_pct"] for r in rows)
    instr = sorted(r["instr_pct"] for r in rows)
    n = len(flops)

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(7.0, 2.5))

    # -- left: the two distributions, as cumulative curves ------------------
    ys = [100.0 * i / (n - 1) for i in range(n)]
    ax1.plot(flops, ys, color=TEAL, lw=2, label="arithmetic (FLOP)")
    ax1.plot(instr, ys, color=AMBER, lw=2, ls="--", label="instructions")
    ax1.set_xlabel("reduction on one program (\\%)")
    ax1.set_ylabel("programs at or below (\\%)")
    ax1.set_xlim(0, 100)
    ax1.set_ylim(0, 100)
    ax1.grid(alpha=0.25, lw=0.6)
    ax1.legend(frameon=False, fontsize=8, loc="lower right")
    ax1.set_title("Distribution over 400 generated programs",
                  fontsize=9, color=INK)

    # -- right: the medians side by side ------------------------------------
    # statistics.median, not the middle element: with an even count those are
    # different numbers, and the paper cites this one.
    med_f = statistics.median(flops)
    med_i = statistics.median(instr)
    bars = ax2.bar(["arithmetic", "instructions"], [med_f, med_i],
                   color=[TEAL, AMBER], width=0.55)
    for b, v in zip(bars, [med_f, med_i], strict=True):
        ax2.text(b.get_x() + b.get_width() / 2, v + 1.5, f"{v:.1f}\\%",
                 ha="center", fontsize=9, color=INK)
    ax2.set_ylim(0, 60)
    ax2.set_ylabel("median reduction (\\%)")
    ax2.grid(axis="y", alpha=0.25, lw=0.6)
    ax2.set_axisbelow(True)
    ax2.set_title("Median, same programs", fontsize=9, color=INK)

    for ax in (ax1, ax2):
        for spine in ("top", "right"):
            ax.spines[spine].set_visible(False)
        ax.tick_params(labelsize=8, colors=INK)

    fig.tight_layout()
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    fig.savefig(a.out, bbox_inches="tight")
    print(f"wrote {a.out}: median arithmetic {med_f:.1f}%, "
          f"median instructions {med_i:.1f}%, n={n}")


if __name__ == "__main__":
    main()
