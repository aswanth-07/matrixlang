"use strict";
/* Race view: MatrixLang's certified C on one side, NumPy and GCC on the other,
 * every contestant timed on this machine (tools/race.py). Recorded runs come
 * from race-data.js; with the local service, "Run on this laptop" measures again. */
(() => {
  const $ = (id) => document.getElementById(id);
  const data = window.MATRIXLANG_RACES;
  if (!data || !data.races || !data.races.length) {
    $("race-verdict").textContent = "Race recordings are unavailable. Run python tools/build-race.py and reload the page.";
    $("race-run").disabled = $("race-replay").disabled = true;
    return;
  }
  const escape = (t) => String(t).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const races = data.races.map((r) => ({...r, runs: {...r.runs}, live: {}}));
  let current = races[0], threads = 1, selectedLane = "ml-strict", running = false, timers = [];

  function fmtTime(ns) {
    if (ns == null) return {value: "—", unit: ""};
    if (ns < 100) return {value: "<0.1", unit: "µs"};
    const units = [[1e9, "s"], [1e6, "ms"], [1e3, "µs"], [1, "ns"]];
    for (const [scale, unit] of units) {
      if (ns >= scale || unit === "ns") {
        const v = ns / scale;
        return {value: v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2), unit};
      }
    }
    return {value: "—", unit: ""};
  }
  function fmtX(x) {
    if (x == null || !isFinite(x)) return "—";
    return (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2).replace(/0$/, "")) + "×";
  }
  function patternValue(hex) { return hex ? Bits.toNumber(Bits.fromPattern(hex)) : NaN; }

  function run() { return current.runs[String(threads)]; }
  function lanes() { return (run() && run().contestants) || []; }
  const byId = (id) => lanes().find((c) => c.id === id);

  /* What a lane's bits mean, in words: the race's central honesty. */
  function verdict(c) {
    if (c.error) return {cls: "chip-error", icon: "i-cross", text: "did not run"};
    const b = c.bits;
    if (!b || !b.comparable) return {cls: "chip-differ", icon: "i-approx", text: "not comparable"};
    const level = c.guarantees && c.guarantees.levels && c.guarantees.levels[0] && c.guarantees.levels[0].level;
    if (b.identical) return {cls: "chip-same", icon: "i-check", text: c.id === "gcc-o3" ? "the reference bits" : "measured: identical bits"};
    const w = b.worst || {};
    const broke = w.value && !isFinite(patternValue(w.value)) && isFinite(patternValue(w.reference));
    if (broke) return {cls: "chip-broken", icon: "i-cross", text: `measured: returns ${Bits.describe(Bits.fromPattern(w.value))}${level ? "" : ", no warning"}`};
    if (level === "bound-preserving") return {cls: "chip-bound", icon: "i-approx", text: "measured: bits differ, within the bound"};
    if (level === "relaxed") return {cls: "chip-broken", icon: "i-approx", text: "measured: bits differ"};
    return {cls: "chip-differ", icon: "i-neq", text: "measured: bits differ, no guarantee"};
  }

  function laneHTML(c, scale) {
    const t = fmtTime(c.median_ns);
    const v = verdict(c);
    const ref = c.id === "gcc-o3";
    const speed = ref ? "1× · reference" : c.speedup_vs_source != null ? `${fmtX(c.speedup_vs_source)} vs as written` : "";
    const width = c.median_ns ? scale(c.median_ns) : 0;
    const level = c.guarantees && c.guarantees.levels && c.guarantees.levels[0];
    const proofs = c.guarantees ? `<span class="level level-${escape(level ? level.level : "bit-identical")}" title="The compiler's certificate, issued before the run">${escape(level ? "proved: " + level.level : "no output")}</span>` : "";
    return `<li class="lane" role="option" tabindex="0" data-lane="${escape(c.id)}" data-width="${width.toFixed(2)}" data-ns="${c.median_ns || 0}" aria-selected="${c.id === selectedLane}">
      <div class="lane-top"><span class="lane-name">${escape(c.label)}</span><span class="lane-detail">${escape(c.detail)}</span>
        <span class="lane-time">${c.error ? "—" : `${t.value}<small>${t.unit}</small>`}</span></div>
      <div class="lane-track" aria-hidden="true"><div class="lane-fill"></div></div>
      <div class="lane-meta"><span class="speedup">${escape(speed)}</span>${proofs}<span class="verdict-chip ${v.cls}"><svg class="icon"><use href="#${v.icon}"/></svg>${escape(v.text)}</span>
        ${c.samples ? `<span>median of ${c.samples} runs</span>` : ""}${c.error ? `<span class="lane-error">${escape(c.error)}</span>` : ""}</div></li>`;
  }

  function scaleFor(list) {
    const times = list.filter((c) => c.median_ns > 0).map((c) => c.median_ns);
    const lo = Math.min(...times) / 1.6, hi = Math.max(...times);
    const span = Math.log(hi / lo) || 1;
    return (ns) => 4 + 96 * Math.log(ns / lo) / span;
  }

  function sentence() {
    const strict = byId("ml-strict"), bounded = byId("ml-bounded"), md = byId("numpy-multidot"),
      mm = byId("numpy-matmul"), fm = byId("gcc-fastmath"), src = byId("gcc-o3");
    if (!strict || !src || !strict.median_ns) return "";
    const certified = [strict, bounded].filter((c) => c && c.median_ns && c.bits && c.bits.comparable)
      .sort((a, b) => a.median_ns - b.median_ns)[0] || strict;
    const name = certified.id === "ml-strict" ? "strict" : "bounded";
    const parts = [];
    const sx = certified.speedup_vs_source;
    if (sx > 1.5) {
      parts.push(`<b>MatrixLang ${name}: ${fmtTime(certified.median_ns).value} ${fmtTime(certified.median_ns).unit}, ${fmtX(sx)} faster than the program as written</b>${certified.bits.identical ? ", every bit identical, and proved so before it ran" : ", within the error bound its certificate states"}.`);
    } else {
      const broken = lanes().filter((c) => verdict(c).cls === "chip-broken" && c.side === "baseline");
      const algebraic = byId("ml-algebraic");
      if (broken.length) {
        parts.push(`<b>MatrixLang strict and bounded keep the order you wrote, and the finite answer</b>: the facts show the cheaper order can overflow, so neither contract may take it.`);
        if (algebraic && verdict(algebraic).cls === "chip-broken") parts.push(`MatrixLang algebraic takes it and labels the output relaxed.`);
      } else {
        parts.push(`<b>MatrixLang keeps the order you wrote</b>${strict.bits.identical ? " and every bit" : ""}: no faster order can be proved safe here.`);
      }
    }
    if (mm && mm.median_ns && certified.median_ns < mm.median_ns && sx > 1.5) parts.push(`That is ${fmtX(mm.median_ns / certified.median_ns)} faster than NumPy's default <code>@</code>.`);
    if (md && md.median_ns) {
      const v = verdict(md);
      if (v.cls === "chip-broken") parts.push(`NumPy <code>multi_dot</code> takes the cheaper order anyway and ${escape(v.text.split(" · ")[0])}, with no warning.`);
      else if (md.median_ns < certified.median_ns) parts.push(`NumPy <code>multi_dot</code> is faster still (${fmtTime(md.median_ns).value} ${fmtTime(md.median_ns).unit}) because it reorders whether or not that is safe${md.bits && !md.bits.identical ? ", and here its bits differ from what you wrote" : "; here the data happen to be exact, and it cannot tell"}.`);
      else parts.push(`Faster than <code>multi_dot</code> too.`);
    }
    if (fm && fm.speedup_vs_source != null) parts.push(`<code>-ffast-math</code> manages ${fmtX(fm.speedup_vs_source)}: it may reassociate, but it cannot see the matrix chain.`);
    return parts.join(" ");
  }

  function render(animate) {
    const r = run();
    $("race-picker").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.race === current.id)));
    $("threads-1").setAttribute("aria-pressed", String(threads === 1));
    $("threads-8").setAttribute("aria-pressed", String(threads === 8));
    $("race-program-title").textContent = current.title;
    $("race-program-file").textContent = current.file ? current.file.split("/").pop() : "";
    $("race-program-text").textContent = current.description || "";
    $("race-source").innerHTML = window.Workspace ? Workspace.highlightHTML(current.source.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, "")) : escape(current.source);
    if (!r) { $("race-verdict").textContent = "No recording for this setting. Run it on this laptop."; $("lanes-matrixlang").innerHTML = $("lanes-baseline").innerHTML = ""; $("race-bits").innerHTML = ""; return; }
    const list = r.contestants, scale = scaleFor(list);
    $("lanes-matrixlang").innerHTML = list.filter((c) => c.side === "matrixlang").map((c) => laneHTML(c, scale)).join("");
    $("lanes-baseline").innerHTML = list.filter((c) => c.side === "baseline").map((c) => laneHTML(c, scale)).join("");
    $("race-verdict").innerHTML = sentence();
    const m = r.machine || {};
    const live = current.live[String(threads)];
    const npy = (list.find((c) => c.note && c.note.startsWith("NumPy")) || {}).note || "NumPy";
    $("race-provenance").innerHTML = `<b>${live ? "Measured just now" : "Recorded " + escape(m.measured || "")}</b> on ${escape(m.cpu || "this machine")} · ${escape((m.gcc || "gcc").replace(/\s*\(.*?\)/, ""))} · ${escape(npy)} · <b>${threads} thread${threads > 1 ? "s" : ""}</b> for every contestant (OpenMP for C, OpenBLAS for NumPy) · input seed ${r.seed} · compute section only, median of repeated runs.`;
    fill(animate);
    bitsView();
    const st = document.getElementById("status-race");
    if (st) st.textContent = `Race · ${current.title} · ${threads} thread${threads > 1 ? "s" : ""} for every contestant · reference: GCC -O3 as written · ${live ? "measured just now" : "recorded " + (m.measured || "")}`;
  }

  function fill(animate) {
    timers.forEach(clearTimeout); timers = [];
    const items = [...document.querySelectorAll("#view-race .lane")];
    const slow = Math.max(...items.map((li) => Number(li.dataset.ns) || 0));
    items.forEach((li) => {
      const bar = li.querySelector(".lane-fill"), target = li.dataset.width + "%";
      if (!animate || reduced()) { bar.style.transition = "none"; bar.style.width = target; return; }
      const ms = Math.max(90, 3600 * (Number(li.dataset.ns) || 0) / slow);
      bar.style.transition = "none"; bar.style.width = "0%";
      li.classList.add("racing");
      void bar.offsetWidth;
      bar.style.transition = `width ${ms}ms linear`;
      bar.style.width = target;
      timers.push(setTimeout(() => li.classList.remove("racing"), ms));
    });
  }

  function bitsView() {
    const c = byId(selectedLane) || byId("ml-strict");
    const box = $("race-bits");
    if (!c || !c.bits || !c.bits.comparable || !c.bits.worst) { box.innerHTML = ""; return; }
    const w = c.bits.worst, ref = Bits.fromPattern(w.reference), got = Bits.fromPattern(w.value);
    const n = Bits.differing(ref, got);
    const outs = c.bits.outputs || [];
    const differ = outs.reduce((s, o) => s + o.differ, 0), total = outs.reduce((s, o) => s + o.entries, 0);
    box.innerHTML = `<h3>Bit check · ${escape(c.label)}</h3>
      <p>${n ? `The most different entry, <code>${escape(w.output)}</code>[${w.index}], against the program as written: <b>${n} of 64 bits differ</b>, ${escape(Bits.ulpText(ref, got))}. ${total ? `${differ.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} output entries differ.` : ""}` : `Every one of ${total.toLocaleString("en-US")} output entries carries the same 64 bits as the program as written. Entry <code>${escape(w.output)}</code>[${w.index}] shown.`} Select a lane to inspect its bits.</p>
      <dl class="bit-pair"><dt>as written</dt><dd>${Bits.strip(ref, null, {legend: false})}<span class="bit-value">${escape(Bits.describe(ref))}</span></dd>
      <dt>${escape(c.label.replace(/^MatrixLang · /, "MatrixLang ").replace(/^NumPy\s+/, "NumPy "))}</dt><dd>${Bits.strip(got, ref)}<span class="bit-value">${escape(Bits.describe(got))}</span></dd></dl>`;
  }

  async function runLive() {
    if (running) return;
    const live = window.MATRIXLANG_LIVE;
    if (!live || !live.race) {
      $("race-verdict").innerHTML = "Live races need the local service: run <code>make serve</code> and reload. The lanes show the recorded run from this laptop.";
      return;
    }
    running = true; $("race-run").disabled = true; $("race-run-label").textContent = "Racing…";
    document.querySelectorAll("#view-race .lane").forEach((li) => { li.classList.add("running"); li.querySelector(".lane-fill").style.transition = "none"; li.querySelector(".lane-fill").style.width = ""; });
    $("race-verdict").innerHTML = `Compiling seven builds and timing each on this laptop with ${threads} thread${threads > 1 ? "s" : ""}. Slow baselines take a few seconds each.`;
    try {
      const response = await fetch("api/race", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({source: current.source, seed: 1, threads})});
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The race could not run.");
      current.runs[String(threads)] = payload; current.live[String(threads)] = true;
      render(true);
    } catch (error) {
      $("race-verdict").textContent = error.message || "The race could not run.";
      document.querySelectorAll("#view-race .lane").forEach((li) => li.classList.remove("running"));
    } finally { running = false; $("race-run").disabled = false; $("race-run-label").textContent = "Run on this laptop"; }
  }

  races.forEach((r) => {
    const b = document.createElement("button"); b.type = "button"; b.dataset.race = r.id; b.textContent = r.title;
    b.addEventListener("click", () => select(r.id)); $("race-picker").append(b);
  });
  function select(id, animate = true) {
    const r = races.find((x) => x.id === id); if (!r) return;
    current = r; selectedLane = "ml-strict"; render(animate);
  }
  function setThreads(n) { threads = n === 8 ? 8 : 1; render(true); }
  $("threads-1").addEventListener("click", () => setThreads(1));
  $("threads-8").addEventListener("click", () => setThreads(8));
  $("race-replay").addEventListener("click", () => fill(true));
  $("race-run").addEventListener("click", runLive);
  const pick = (li) => { if (!li) return; selectedLane = li.dataset.lane; document.querySelectorAll("#view-race .lane").forEach((x) => x.setAttribute("aria-selected", String(x === li))); bitsView(); };
  ["lanes-matrixlang", "lanes-baseline"].forEach((id) => {
    $(id).addEventListener("click", (e) => pick(e.target.closest(".lane")));
    $(id).addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(e.target.closest(".lane")); } });
  });
  window.Race = {races, select, setThreads, run: runLive, replay: () => fill(true), get current() { return current.id; }};
  render(false);
})();
