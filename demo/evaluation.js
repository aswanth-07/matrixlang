"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const data = window.MATRIXLANG_EVALUATION;
  const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const n = (value) => value == null ? "—" : Number(value).toLocaleString("en-US");
  const pct = (value, digits = 1) => value == null ? "—" : `${(100 * value).toFixed(digits)}%`;
  const label = {bool: "bool", uint8: "uint8", int8: "int8", int16: "int16", int32: "int32", real: "real(1)",
    realx: "real", mixed: "mixed", dyadic: "dyadic literals", broad: "broad literals"};
  const table = (head, rows, caption = "") => `<table class="eval-table"><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => typeof c === "object" && c !== null ? `<td class="${c.cls || ""}">${c.v}</td>` : `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>${caption ? `<caption>${caption}</caption>` : ""}</table>`;

  /* --- exactness threshold explorer (closed form of Theorem 1) ------------ */
  function bitLength(big) { return big <= 0n ? 0 : big.toString(2).length; }
  function explore() {
    const dims = $("ex-dims").value.split(/[\s,x×]+/).filter(Boolean).map(Number);
    const m = Number($("ex-m").value);
    const out = $("ex-result");
    if (dims.length < 3 || dims.some((d) => !Number.isInteger(d) || d < 1 || d > 4096) || !Number.isInteger(m) || m < 0 || m > 2 ** 53) {
      out.innerHTML = `<p class="verdict-line invalid">Enter at least three dimensions between 1 and 4,096 and an integer bound 0 ≤ m ≤ 2<sup>53</sup>.</p>`;
      return;
    }
    const k = dims.length - 1, limit = 2n ** 53n, rows = [];
    const boundOf = (a, b) => {
      let bound = BigInt(m) ** BigInt(b - a + 1);
      for (let p = a + 1; p <= b; p++) bound *= BigInt(dims[p]);
      return bound;
    };
    let worst = null, rounded = false;
    for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) {
      const bound = boundOf(a, b), whole = a === 0 && b === k - 1;
      const bits = bitLength(bound > 0n ? bound - 1n : 0n);
      if (bound <= limit) {
        rows.push([`A${a + 1}…A${b + 1}`, n(bound.toString()), {v: "≤ 53, exact", cls: "good"}]);
        continue;
      }
      if (whole) {
        /* The whole chain may round once: in a bracketing whose last product
           contracts d, every sum of at most d − 1 terms must still fit. */
        let part = 0n;
        for (let s = a; s < b; s++) {
          const p = boundOf(a, s) * boundOf(s + 1, b) * BigInt(dims[s + 1] - 1);
          if (p > part) part = p;
        }
        if (part <= limit) {
          rounded = true;
          rows.push([`A${a + 1}…A${b + 1}`, n(bound.toString()), {v: `${bits}, final sum rounds once`, cls: "good"}]);
          continue;
        }
        const partBits = bitLength(part - 1n);
        rows.push([`A${a + 1}…A${b + 1}`, n(bound.toString()), {v: `partial sums need ${partBits}`, cls: "bad"}]);
        if (!worst || partBits > worst.bits) worst = {a, b, bits: partBits};
        continue;
      }
      rows.push([`A${a + 1}…A${b + 1}`, n(bound.toString()), {v: `${bits}`, cls: "bad"}]);
      if (!worst || bits > worst.bits) worst = {a, b, bits};
    }
    const verdict = worst
      ? `<p class="verdict-line inexact">Not provable: sub-chain A${worst.a + 1}…A${worst.b + 1} can need ${worst.bits} significand bits. Strict keeps the source order there; a shorter segment may still be reordered, and bounded may reorder with a certified error bound.</p>`
      : rounded
        ? `<p class="verdict-line exact">Correctly rounded: every proper sub-chain is exact and only the final sums can round, so every bracketing, in any order of summation, prints the same bits and strict may reorder the whole chain.</p>`
        : `<p class="verdict-line exact">Exact: every intermediate of every bracketing fits in 53 significand bits, so every bracketing prints the same bits and strict may reorder the whole chain.</p>`;
    out.innerHTML = verdict + table(["Sub-chain", "Magnitude bound m<sup>len</sup>·∏ inner", "Bits needed"], rows);
  }
  ["ex-dims", "ex-m"].forEach((id) => $(id).addEventListener("input", explore));
  $("explorer").addEventListener("submit", (event) => event.preventDefault());
  explore();

  if (!data) { $("eval-missing").hidden = false; return; }

  const three = data.rq3;
  if (three) {
    $("ex-measured").innerHTML = "Measured by binary search on the compiler's own certificates: " + Object.entries(three.families).map(([family, c]) =>
      `<code>${escape(family)}</code> m* = ${n(c.m_star)}`).join(" · ") + ". Try <code>100, 2, 100, 2</code> with 35578, 35697 and 35698.";
  }

  /* --- RQ1 ---------------------------------------------------------------- */
  const one = data.rq1;
  if (one) {
    $("rq1-meta").textContent = `${n(one.programs)} programs · ${n(one.programs * 4)} compilations · ${n(one.failures)} failures`;
    const arms = [["noproof", "No proofs"], ["strict", "Strict"], ["bounded", "Bounded"], ["algebraic", "Algebraic"]];
    const max = Math.max(...Object.values(one.domains).map((c) => c.algebraic.saving), 0.01);
    $("rq1-chart").innerHTML = `<div class="legend">${arms.map(([id, name]) => `<span style="--c: var(--${id === "noproof" ? "line" : id === "strict" ? "accent" : id === "bounded" ? "bound" : "warning"})">${name}</span>`).join("")}</div>` +
      Object.entries(one.domains).map(([domain, c]) => `<div class="bar-row"><span class="label">${escape(label[domain] || domain)}</span><div class="bar-track stack">${arms.map(([id]) => `<div class="bar ${id}" style="width:${(100 * c[id].saving / max).toFixed(2)}%" title="${id}: ${pct(c[id].saving)}"></div>`).join("")}</div><span class="value">strict ${pct(c.strict.saving)} · recovery ${pct(c.strict.recovery, 0)}</span></div>`).join("");
  }

  const width = data.width;
  if (width && one) {
    const bits = Object.entries(width.bits).sort((a, b) => Number(a[0]) - Number(b[0]));
    $("rq1-chart").insertAdjacentHTML("afterend", `<h3 class="eval-sub">Chains proved exact as the integer domain widens</h3><p class="eval-sub-note">${n(width.programs_per_width)} heterogeneous and narrow programs per width, every matrix over int(−(2<sup>b</sup>−1), 2<sup>b</sup>−1): share of the algebraic contract's chain reorderings that strict proves exact.</p><div class="bars">${bits.map(([b, c]) => `<div class="bar-row"><span class="label">${b} bit${b === "1" ? "" : "s"}</span><div class="bar-track"><div class="bar strict" style="width:${(100 * (c.exact_share || 0)).toFixed(1)}%"></div></div><span class="value">${pct(c.exact_share, 0)} · ${n(c.strict_chains)} / ${n(c.algebraic_chains)}</span></div>`).join("")}</div>`);
  }

  /* --- RQ2 ---------------------------------------------------------------- */
  const two = data.rq2;
  if (two) {
    $("rq2-meta").textContent = `${n(two.programs)} programs · ${n(two.runs)} runs · 3 input seeds`;
    const rows = ["noproof", "strict", "bounded", "algebraic"].map((arm) => {
      const c = two.arms[arm], lv = c.levels || {}, df = c.level_differ || {};
      const bitBad = df["bit-identical"] || 0;
      return [arm === "noproof" ? "no proofs" : arm, n(c.outputs), {v: n(c.differ), cls: c.differ ? "warn" : "zero"},
        n(lv["bit-identical"] || (arm === "noproof" ? null : 0)), {v: n(bitBad), cls: bitBad ? "bad" : "good"},
        n(lv["bound-preserving"] || 0), n(df["bound-preserving"] || 0), n(lv["relaxed"] || 0), n(df["relaxed"] || 0)];
    });
    $("rq2-table").innerHTML = table(["Contract", "Outputs", "Differ", "Certified bit-identical", "…of which differ", "Bound-preserving", "…differ", "Relaxed", "…differ"], rows,
      "A bit-identical certificate is sound when none of its outputs differs; bound-preserving and relaxed outputs may differ by definition.");
  }

  /* --- RQ3 ---------------------------------------------------------------- */
  if (three) {
    $("rq3-meta").textContent = `${n(three.runs)} witness runs · ${n(three.strict_differ_total)} strict differences`;
    const rows = Object.entries(three.families).map(([family, c]) => [`<code>${escape(family)}</code>`,
      n(c.m_star_exact_only), {v: n(c.m_star_closed_form), cls: c.m_star_closed_form === c.m_star ? "good" : "bad"}, n(c.m_star),
      c.first_witness ? {v: `${n(c.first_witness)} (m* + ${c.first_witness_offset})`, cls: c.first_witness_offset === 1 ? "good" : "warn"} : "none",
      {v: n(c.witnessed_at_or_below), cls: c.witnessed_at_or_below ? "bad" : "good"},
      {v: n(c.strict_differ), cls: c.strict_differ ? "bad" : "good"}]);
    $("rq3-table").innerHTML = table(["Chain", "Exact only", "Closed form", "m* (compiler)", "First witness", "Witnesses at or below m*", "Strict differ"], rows,
      "A witness is an input on which the bracketing strict refused, run as written, prints different bits from the source order. The four-operand chain is reordered segment by segment; at m* + 1 its maximum is even and no witness can exist.");
  }

  /* --- RQ4 ---------------------------------------------------------------- */
  const four = data.rq4;
  if (four && four.kernels) {
    const kernels = Object.entries(four.kernels).filter(([k]) => k !== "guard_i16");
    const max = Math.max(...kernels.map(([, c]) => c.speedup));
    const guard = four.kernels.guard_i16, dot = four.kernels.dot_i16;
    $("rq4-meta").textContent = "generated kernels: medians of 50 runs in 5 processes · hand-written reductions: 7 processes × 21 runs";
    $("rq4-chart").innerHTML = kernels.map(([k, c]) => `<div class="bar-row"><span class="label">${escape(k)}</span><div class="bar-track"><div class="bar ${c.identical ? "strict" : "algebraic"}" style="width:${(100 * c.speedup / max).toFixed(1)}%"></div></div><span class="value">${c.speedup.toFixed(2)}× · ${c.identical ? "same bits" : "bits differ"}</span></div>`).join("") +
      (guard && dot ? `<p class="eval-note">A run-time domain check of both <code>dot_i16</code> inputs, for data that arrives untyped, takes ${(guard.licensed.median_ns / 1e3).toFixed(0)} µs against the kernel's ${(dot.licensed.median_ns / 1e3).toFixed(0)} µs; MatrixLang performs that check once, when inputs are loaded, and every later kernel reuses it.</p>` : "");
    const threads = Object.entries(four.threads || {});
    if (threads.length) $("rq4-threads").innerHTML = table(["OpenMP kernel", "Thread counts", "Distinct results", "Most results at one count"],
      threads.map(([k, c]) => [`<code>${escape(k)}</code>`, c.counts.join(", "), {v: n(c.results), cls: c.results === 1 ? "good" : "warn"}, n(c.max_distinct_per_count)]),
      "An OpenMP reduction combines partial sums in an unspecified order. On certified data the result cannot depend on that order.");
  }

  /* --- RQ4, generated code -------------------------------------------------- */
  const e2e = data.rq4b;
  if (e2e && e2e.kernels) {
    const cols = [["source-fast-math", "fast-math"], ["strict", "strict"], ["strict-licensed", "+ reduction clauses"],
      ["bounded-licensed", "bounded"], ["strict-licensed-8t", "8 threads"]];
    const fmt = (c) => ({v: `${c.speedup >= 100 ? c.speedup.toFixed(0) : c.speedup.toFixed(2)}×${c.same ? "" : " †"}`, cls: c.same ? (c.speedup >= 1.5 ? "good" : "") : "warn"});
    $("rq4-e2e").innerHTML = table(["Kernel", "Inputs", "Source (ms)", ...cols.map(([, l]) => l), "Distinct results"],
      Object.entries(e2e.kernels).map(([k, c]) => [`<code>${escape(k)}</code>`, `<code>${escape(c.inputs)}</code>`, c.source_ms.toPrecision(3),
        ...cols.map(([id]) => fmt(c.configs[id])), {v: n(c.distinct_results), cls: c.distinct_results === 1 ? "good" : "warn"}]),
      "Speedup over the program as written, compiled from matrixc's C by GCC 15.2 -O3 -march=native. † marks outputs that differ from the source program. Distinct results are counted over eleven builds, including SSE2-only builds and eight threads.");
  }

  /* --- RQ5 ---------------------------------------------------------------- */
  const five = data.rq5;
  if (five) {
    const pops = ["dyadic", "broad", "domain", "extreme", "fixtures", "witness", "boundary"];
    const names = {1: "reorder without proof", 2: "check whole chain only", 3: "allow 54 bits", 4: "A·I ignores −0", 5: "A·I ignores non-finite",
      6: "A+0 ignores −0", 7: "A·0 ignores non-finite", 8: "0·A ignores sign", 9: "negation yields no −0", 10: "one rounding in every sub-chain"};
    const total = Object.keys(five.mutants).length;
    $("rq5-meta").textContent = `${Object.values(five.populations).reduce((a, b) => a + b, 0).toLocaleString("en-US")} tests · ${five.killed_by_any.length} of ${total} mutants killed`;
    $("rq5-table").innerHTML = table(["Mutant", ...pops.map((p) => `${p} (${n(five.populations[p])})`)],
      Object.entries(five.mutants).map(([m, c]) => [`${m} · ${names[m]}`, ...pops.map((p) => ({v: n(c[p]), cls: c[p] ? "good" : "zero"}))]),
      "Mutant 5 is equivalent: a non-finite fact never carries “no −0”, so the −0 condition already blocks it. The boundary population runs the threshold witnesses of RQ3 just above each threshold.");
  }

  /* --- RQ6 ---------------------------------------------------------------- */
  const six = data.rq6;
  if (six) {
    $("rq6-meta").textContent = `${n(six.chains)} chains · emulation ${n(six.validation.identical)}/${n(six.validation.bracketings)} bit-identical to matrixc`;
    const rows = Object.entries(six.profiles).map(([p, c]) => [p, n(c.chains), n(c.unequal), `${n(c.optimal_better)} / ${n(c.source_better)}`,
      {v: c.p_holm.toPrecision(2), cls: c.p_holm < 0.01 ? "good" : "zero"}, `${c.median_ratio.toFixed(3)} [${c.ratio_ci[0].toFixed(3)}, ${c.ratio_ci[1].toFixed(3)}]`]);
    const abl = Object.entries(six.ablation).map(([p, c]) => [`ablation · ${p}`, n(c.pairs), n(c.unequal), `${n(c.first_better)} / ${n(c.second_better)}`, {v: c.p.toPrecision(2), cls: c.p < 0.01 ? "warn" : "zero"}, ""]);
    $("rq6-table").innerHTML = table(["Population", "Chains", "Unequal error", "Cheaper better / source better", "p (Holm)", "Median error ratio [95% CI]"], [...rows, ...abl],
      `No chain exceeded the bracketing-invariant error bound (largest error ${(six.max_err_over_bound * 100).toFixed(1)}% of it). Prediction ${six.prediction_holds ? "holds" : "does not hold"}; equal-cost ablation ${six.ablation_removes_effect ? "shows no effect" : "shows an effect"}.`);
  }
})();
