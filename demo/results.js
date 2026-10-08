"use strict";
/* Results: the measured story in three panels. Speed and trust come from the
 * recorded races (race-data.js, one thread); the guarantees from the full
 * evaluation (evaluation-data.js). Nothing here is typed by hand. */
(() => {
  const $ = (id) => document.getElementById(id);
  const races = (window.MATRIXLANG_RACES && window.MATRIXLANG_RACES.races) || [];
  const evaluation = window.MATRIXLANG_EVALUATION || {};
  const escape = (t) => String(t).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const n = (v) => v == null ? "—" : Number(v).toLocaleString("en-US");
  const fmtX = (x) => x == null || !isFinite(x) ? "—" : (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2).replace(/0$/, "")) + "×";
  const value = (hex) => hex ? Bits.toNumber(Bits.fromPattern(hex)) : NaN;
  if (!races.length) { $("chart-speed").textContent = "Race recordings are unavailable. Run python tools/build-race.py."; return; }

  const level = (c) => c && c.guarantees && c.guarantees.levels[0] && c.guarantees.levels[0].level;
  function certified(list) {
    const pick = ["ml-strict", "ml-bounded"].map((id) => list.find((c) => c.id === id))
      .filter((c) => c && c.median_ns && c.bits && c.bits.comparable && level(c) !== "relaxed");
    return pick.sort((a, b) => a.median_ns - b.median_ns)[0];
  }
  function mark(c) {
    if (!c || c.error || !c.bits || !c.bits.comparable) return "differ";
    if (c.bits.identical) return "same";
    const w = c.bits.worst || {};
    if (w.value && !isFinite(value(w.value)) && isFinite(value(w.reference))) return "broken";
    if (level(c) === "bound-preserving") return "bound";
    return "differ";
  }

  const rows = races.map((r) => {
    const list = (r.runs["1"] || {}).contestants || [];
    const get = (id) => list.find((c) => c.id === id);
    const ml = certified(list);
    return {id: r.id, title: r.title, ml, matmul: get("numpy-matmul"), multidot: get("numpy-multidot"), fast: get("gcc-fastmath"), list};
  });
  const machine = ((races[0].runs["1"] || {}).machine) || {};
  $("results-machine").textContent = `Measured on ${machine.cpu || "this laptop"} with ${(machine.gcc || "GCC").replace(/\s*\(.*?\)/, "")} and NumPy, one thread for every contestant, the same seeded inputs, compute time only. Recorded ${machine.measured || ""}.`;

  /* Panel 1: grouped horizontal bars, log scale. */
  const series = [
    {key: "ml", label: "MatrixLang, certified", color: "var(--exp)"},
    {key: "matmul", label: "NumPy A @ B @ C", color: "#6b7889"},
    {key: "fast", label: "GCC -ffast-math", color: "#465363"},
    {key: "multidot", label: "NumPy multi_dot (no guarantee)", color: "none"},
  ];
  const W = 760, left = 150, right = 70, barH = 15, gap = 4, groupGap = 22, top = 26;
  const lo = 0.1, hi = 3000;
  const x = (v) => left + (W - left - right) * (Math.log10(Math.max(lo, Math.min(hi, v))) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
  const groupH = series.length * (barH + gap) - gap;
  const H = top + rows.length * (groupH + groupGap) + 10;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Speedup over GCC -O3 on the program as written, per kernel, log scale">`;
  for (const t of [0.1, 1, 10, 100, 1000]) {
    svg += `<line class="${t === 1 ? "axis" : "grid"}" x1="${x(t)}" x2="${x(t)}" y1="${top - 8}" y2="${H - 6}" stroke-width="1"/>`;
    svg += `<text x="${x(t)}" y="${top - 13}" text-anchor="middle" font-size="11" fill="#8d99aa">${t >= 1 ? t + "×" : t + "×"}</text>`;
  }
  rows.forEach((row, gi) => {
    const y0 = top + gi * (groupH + groupGap);
    svg += `<text x="0" y="${y0 + groupH / 2 + 4}" font-size="13" font-weight="600" fill="#e4e9f0">${escape(row.title)}</text>`;
    series.forEach((s, si) => {
      const c = row[s.key], y = y0 + si * (barH + gap);
      if (!c || !c.speedup_vs_source) return;
      const v = c.speedup_vs_source, xv = x(v), x1 = x(1);
      const broken = mark(c) === "broken";
      const from = Math.min(x1, xv), w = Math.max(2, Math.abs(xv - x1));
      const fill = s.color === "none" ? "transparent" : s.color;
      const stroke = s.color === "none" ? (broken ? "var(--relaxed)" : "#8d99aa") : "none";
      svg += `<rect x="${from}" y="${y}" width="${w}" height="${barH}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="${s.color === "none" ? 1.3 : 0}" ${s.color === "none" ? 'stroke-dasharray="4 3"' : ""}/>`;
      const kept = s.key === "ml" && c.guarantees && c.guarantees.modeled_after === c.guarantees.modeled_before;
      const label = broken ? `${fmtX(v)} · returns ∞` : kept ? "kept the safe order" : s.key === "ml" ? `${fmtX(v)} · ${c.id === "ml-strict" ? "strict" : "bounded"}` : fmtX(v);
      svg += `<text x="${Math.max(xv, x1) + 6}" y="${y + barH - 3}" font-size="11.5" fill="${s.key === "ml" ? "#36cfe0" : broken ? "#ff6b6b" : "#aab4c2"}" font-weight="${s.key === "ml" ? 650 : 450}">${escape(label)}</text>`;
    });
  });
  svg += "</svg>";
  $("chart-speed").innerHTML = svg + `<div class="chart-legend">${series.map((s) => `<span><i style="background:${s.color === "none" ? "transparent" : s.color};${s.color === "none" ? "border:1.3px dashed #8d99aa" : ""}"></i>${escape(s.label)}</span>`).join("")}</div>`;

  /* Panel 2: bits against the program as written. */
  const icons = {same: "i-check", bound: "i-approx", differ: "i-neq", broken: "i-cross"};
  const words = {same: "identical bits", bound: "within certified bound", differ: "bits differ, no statement", broken: "returns ∞ or NaN"};
  const cell = (c) => { const m = mark(c); return `<td><span class="mark mark-${m}" title="${words[m]}"><svg class="icon"><use href="#${icons[m]}"/></svg></span></td>`; };
  $("chart-trust").innerHTML = `<table><thead><tr><th scope="col">Kernel</th><th scope="col">MatrixLang</th><th scope="col">NumPy @</th><th scope="col">multi_dot</th><th scope="col">-ffast-math</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${escape(r.title)}</td>${cell(r.ml)}${cell(r.matmul)}${cell(r.multidot)}${cell(r.fast)}</tr>`).join("")}</tbody></table>
    <div class="trust-key">${["same", "bound", "differ", "broken"].map((m) => `<span><span class="mark mark-${m}"><svg class="icon"><use href="#${icons[m]}"/></svg></span>${words[m]}</span>`).join("")}</div>`;

  /* Panel 3: the guarantees, from the full evaluation. */
  const two = evaluation.rq2, one = evaluation.rq1, five = evaluation.rq5, six = evaluation.rq6;
  const items = [];
  if (two) {
    const s = two.arms.strict, wrong = ["strict", "bounded", "algebraic"].reduce((t, a) => t + ((two.arms[a].level_differ || {})["bit-identical"] || 0), 0);
    const certifiedTotal = ["strict", "bounded", "algebraic"].reduce((t, a) => t + ((two.arms[a].levels || {})["bit-identical"] || 0), 0);
    items.push({big: n(wrong), good: wrong === 0, text: `of ${n(certifiedTotal)} outputs certified bit-identical differed when executed`, small: `${n(two.programs)} generated programs, three input seeds, all three contracts; strict changed ${n(s.differ)} of ${n(s.outputs)} outputs.`});
  }
  if (one && one.domains.int8) items.push({big: (100 * one.domains.int8.strict.recovery).toFixed(0) + "%", good: true, text: "of the algebraic saving recovered on int8 data with every bit kept", small: `${n(one.programs)} programs; bool ${(100 * one.domains.bool.strict.recovery).toFixed(0)}%, uint8 ${(100 * one.domains.uint8.strict.recovery).toFixed(0)}%, and all of it under bounded wherever values are bounded.`});
  if (five) items.push({big: `${five.mutants["1"].dyadic} of ${n(five.populations.dyadic)}`, good: false, text: "small-integer tests notice a compiler that reorders without proof", small: `Such tests are exact under every order, so they cannot see the defect; targeted witnesses catch ${five.killed_by_any.length} of 10 broken side conditions.`});
  if (six) items.push({big: six.profiles.pooled.median_ratio.toFixed(2), good: true, text: "median error of the cheaper bracketing relative to source order", small: `Preregistered study, ${n(six.chains)} real-valued chains with exact references; more accurate in ${n(six.profiles.pooled.optimal_better)} of ${n(six.profiles.pooled.unequal)} (Holm p ${six.profiles.pooled.p_holm.toExponential(1)}).`});
  $("chart-proof").innerHTML = items.map((i) => `<div class="proof-row"><b class="${i.good ? "good" : ""}">${escape(i.big)}</b><span>${escape(i.text)}</span><small>${escape(i.small)}</small></div>`).join("");
})();
