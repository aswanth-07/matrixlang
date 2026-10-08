"use strict";
/* Results: the measured story in three panels. Speed and bits come from the
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
  if (!races.length) { $("chart-speed").textContent = "Race recordings are unavailable. Run make race-data."; return; }

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
    return {id: r.id, title: r.title, ml: certified(list), matmul: get("numpy-matmul"), multidot: get("numpy-multidot"), fast: get("gcc-fastmath")};
  });
  const machine = ((races[0].runs["1"] || {}).machine) || {};
  $("results-machine").textContent = `Measured on ${machine.cpu || "this laptop"} with ${(machine.gcc || "GCC").replace(/\s*\(.*?\)/, "")} and NumPy: one thread for every contestant, the same seeded inputs, compute time only. Recorded ${machine.measured || ""}.`;

  /* Panel 1: grouped horizontal bars on a log scale, every bar named. */
  const series = [
    {key: "ml", name: "MatrixLang", fill: "var(--exp)", stroke: "none", text: "#36cfe0", weight: 650},
    {key: "matmul", name: "NumPy @", fill: "#8a96a8", stroke: "none", text: "#c3ccd8", weight: 500},
    {key: "fast", name: "-ffast-math", fill: "url(#hatch)", stroke: "#8a96a8", text: "#c3ccd8", weight: 500},
    {key: "multidot", name: "multi_dot", fill: "transparent", stroke: "#c3ccd8", dash: "5 3", text: "#c3ccd8", weight: 500},
  ];
  const W = 780, left = 136, right = 210, barH = 22, gap = 5, groupGap = 30, top = 30;
  const lo = 0.1, hi = 3000;
  const x = (v) => left + (W - left - right) * (Math.log10(Math.max(lo, Math.min(hi, v))) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
  const groupH = series.length * (barH + gap) - gap;
  const H = top + rows.length * (groupH + groupGap);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Speedup over GCC -O3 on the program as written, per kernel and contestant, log scale">
    <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#262e3a"/><line x1="0" y1="0" x2="0" y2="6" stroke="#8a96a8" stroke-width="2"/></pattern></defs>`;
  for (const t of [0.1, 1, 10, 100, 1000]) {
    svg += `<line class="${t === 1 ? "axis" : "grid"}" x1="${x(t)}" x2="${x(t)}" y1="${top - 10}" y2="${H - groupGap + 8}" stroke-width="1"/>`;
    svg += `<text x="${x(t)}" y="${top - 16}" text-anchor="middle" font-size="12" fill="#97a3b4">${t}×</text>`;
  }
  rows.forEach((row, gi) => {
    const y0 = top + gi * (groupH + groupGap);
    svg += `<text x="0" y="${y0 + groupH / 2 + 5}" font-size="14" font-weight="650" fill="#e4e9f0">${escape(row.title)}</text>`;
    series.forEach((s, si) => {
      const c = row[s.key], y = y0 + si * (barH + gap);
      if (!c || !c.speedup_vs_source) return;
      const v = c.speedup_vs_source, xv = x(v), x1 = x(1);
      const broken = mark(c) === "broken";
      const kept = s.key === "ml" && c.guarantees && c.guarantees.modeled_after === c.guarantees.modeled_before;
      const from = Math.min(x1, xv), w = Math.max(2, Math.abs(xv - x1));
      const stroke = broken ? "var(--relaxed)" : s.stroke;
      svg += `<rect x="${from}" y="${y}" width="${w}" height="${barH}" rx="3" fill="${s.fill}" stroke="${stroke}" stroke-width="${stroke === "none" ? 0 : 1.4}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""}/>`;
      const who = s.key === "ml" ? `MatrixLang ${c.id === "ml-strict" ? "strict" : "bounded"}` : s.name;
      const what = broken ? `${fmtX(v)}, returns ∞` : kept ? "1×, kept the safe order" : fmtX(v);
      svg += `<text x="${Math.max(xv, x1) + 8}" y="${y + barH - 6}" font-size="13" fill="${broken ? "#ff6b6b" : s.text}" font-weight="${s.weight}">${escape(who)} · ${escape(what)}</text>`;
    });
  });
  svg += "</svg>";
  $("chart-speed").innerHTML = svg + `<div class="chart-legend">
    <span><i style="background:var(--exp)"></i>MatrixLang, certified (fastest contract that keeps its guarantee)</span>
    <span><i style="background:#8a96a8"></i>NumPy A @ B @ C</span>
    <span><i style="background:repeating-linear-gradient(45deg,#8a96a8 0 2px,#262e3a 2px 5px)"></i>GCC -O3 -ffast-math</span>
    <span><i style="border:1.4px dashed #c3ccd8"></i>NumPy multi_dot, no guarantee</span></div>`;

  /* Panel 2: bits against the program as written. */
  const icons = {same: "i-check", bound: "i-approx", differ: "i-neq", broken: "i-cross"};
  const words = {same: "identical bits", bound: "within certified bound", differ: "bits differ, no statement", broken: "returns ∞ or NaN"};
  const cell = (c) => { const m = mark(c); return `<td><span class="mark mark-${m}" title="${words[m]}"><svg class="icon"><use href="#${icons[m]}"/></svg></span></td>`; };
  $("chart-trust").innerHTML = `<table><thead><tr><th scope="col">Kernel</th><th scope="col">MatrixLang</th><th scope="col">NumPy @</th><th scope="col">multi_dot</th><th scope="col">-ffast-math</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${escape(r.title)}</td>${cell(r.ml)}${cell(r.matmul)}${cell(r.multidot)}${cell(r.fast)}</tr>`).join("")}</tbody></table>
    <div class="trust-key">${["same", "bound", "differ", "broken"].map((m) => `<span><span class="mark mark-${m}"><svg class="icon"><use href="#${icons[m]}"/></svg></span>${words[m]}</span>`).join("")}</div>`;

  /* Panel 3: the guarantees, from the full evaluation, as a table. */
  const two = evaluation.rq2, one = evaluation.rq1, five = evaluation.rq5, six = evaluation.rq6;
  const rowsP = [];
  if (two) {
    const wrong = ["strict", "bounded", "algebraic"].reduce((t, a) => t + ((two.arms[a].level_differ || {})["bit-identical"] || 0), 0);
    const total = ["strict", "bounded", "algebraic"].reduce((t, a) => t + ((two.arms[a].levels || {})["bit-identical"] || 0), 0);
    rowsP.push({check: "Outputs certified bit-identical that differed when run", fig: `${n(wrong)} of ${n(total)}`, good: wrong === 0, scope: `${n(two.programs)} generated programs × 3 input seeds × 3 contracts`});
  }
  if (one && one.domains.int8) rowsP.push({check: "Algebraic saving recovered with every bit kept, int8 data", fig: `${(100 * one.domains.int8.strict.recovery).toFixed(0)}%`, good: true, scope: `${n(one.programs)} programs; bounded recovers all of it wherever values are bounded`});
  if (five) rowsP.push({check: "Small-integer tests that catch reordering without proof", fig: `${five.mutants["1"].dyadic} of ${n(five.populations.dyadic)}`, good: false, scope: `exact under every order, so blind to the defect; targeted witnesses catch ${five.killed_by_any.length} of 10 broken side conditions`});
  if (six) rowsP.push({check: "Error of the cheaper bracketing, relative to source order (median)", fig: six.profiles.pooled.median_ratio.toFixed(2), good: true, scope: `preregistered, ${n(six.chains)} real-valued chains with exact references; Holm p ${six.profiles.pooled.p_holm.toExponential(1)}`});
  $("chart-proof").innerHTML = `<table><thead><tr><th scope="col">Check</th><th scope="col">Result</th></tr></thead><tbody>${rowsP.map((r) => `<tr><td>${escape(r.check)}<small>${escape(r.scope)}</small></td><td class="${r.good ? "good" : ""}">${escape(r.fig)}</td></tr>`).join("")}</tbody></table>`;
})();
