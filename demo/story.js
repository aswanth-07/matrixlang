"use strict";
/* The shell: views, the five-minute presenter path, the command palette and
 * the opener. Steps drive the Workspace and Race through their public calls. */
(() => {
  const $ = (id) => document.getElementById(id);
  const escape = (t) => String(t).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const views = ["opener", "workspace", "race", "results"];
  let view = "opener", step = 0;

  function show(name, push = true) {
    if (!views.includes(name)) return;
    view = name;
    document.body.dataset.view = name;
    views.forEach((v) => { $(`view-${v}`).hidden = v !== name; });
    const rec = window.MATRIXLANG_RACES && MATRIXLANG_RACES.races && MATRIXLANG_RACES.races[0] && MATRIXLANG_RACES.races[0].runs["1"];
    const when = rec && rec.machine ? `recorded ${rec.machine.measured}` : "recorded";
    $("status-other").textContent = name === "opener"
      ? `Opener · Python ${(window.MATRIXLANG_RACES || {}).python || ""} · four comparisons, evaluated by tools/build-race.py`
      : `Results · five kernels · one thread for every contestant · ${when} on ${rec && rec.machine ? rec.machine.cpu : "this laptop"}`;
    document.querySelectorAll("[data-view]").forEach((b) => {
      if (b.dataset.view === name) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    if (name === "race" && window.Race) Race.replay();
    if (push) { try { history.replaceState(null, "", `#${name}`); } catch (_) { /* file:// may refuse */ } }
  }

  /* --- opener --------------------------------------------------------------- */
  const races = window.MATRIXLANG_RACES;
  if (races && races.opener) {
    $("opener-python").textContent = `Python ${races.python}`;
    const notes = [
      "The same three numbers, grouped differently: the last bit of the fraction moves.",
      "Adding 0.1 ten times, left to right, misses 1.0; a correctly rounded sum lands on it.",
      "IEEE 754 has two zeros. The rewrite x * 0 → 0 turns (−1.0) * 0.0, which is −0.0, into +0.0: the sign bit flips.",
      "Dividing before multiplying stays finite; multiplying first overflows to infinity.",
    ];
    $("opener-list").innerHTML = races.opener.map((f, i) => {
      const a = Bits.fromPattern(f.left.bits), b = Bits.fromPattern(f.right.bits);
      const same = a === b;
      const apart = same ? "identical" : Bits.ulpText(a, b);
      return `<li class="fact"><div><h2>${escape(f.title)}</h2><p class="fact-note">${escape(notes[i] || "")}</p><p class="fact-ulp">${escape(Bits.differing(a, b))} of 64 bits differ · ${escape(apart)}</p></div>
        <div class="fact-rows">
          <div class="fact-row"><code>${escape(f.left.code)}</code><span class="bit-value">${escape(f.left.repr)}</span>${Bits.strip(a, null, {legend: false})}</div>
          <div class="fact-row"><code>${escape(f.right.code)}</code><span class="bit-value${same ? "" : " changed"}">${escape(f.right.repr)}</span>${Bits.strip(b, a)}</div>
        </div></li>`;
    }).join("");
  }

  /* --- presenter path ------------------------------------------------------- */
  const steps = [
    {title: "Python disagrees with itself", view: "opener",
     note: "Same value, computed two ways, different bits. So compilers either never reorder, or do it blindly with -ffast-math."},
    {title: "Shapes before code", view: "workspace", example: "multiply", contract: "strict", stage: "check",
     note: "The compiler infers every matrix shape and rejects a mismatched product before generating any code."},
    {title: "Proved exact", view: "workspace", example: "exact", contract: "strict", stage: "guarantees",
     note: "It sees only the domain int8, proves every bracketing exact, reorders 11,120 → 556 operations, and certifies the output bit-identical."},
    {title: "Bounded, not exact", view: "workspace", example: "real", contract: "bounded", stage: "guarantees",
     note: "Over real values strict refuses; bounded reorders and states the error bound. The bit strip shows only the last bits move."},
    {title: "Race: graph walks", view: "race", race: "walks", threads: 1,
     note: "Same program, same inputs, timed here. Proved reordering beats the C you would write by hundreds of times, with every bit identical."},
    {title: "Race: diffusion on reals", view: "race", race: "diffusion", threads: 1,
     note: "Strict keeps your order on real data; bounded runs about 200× faster within a certified bound. multi_dot changes bits and says nothing."},
    {title: "Race: the overflow trap", view: "race", race: "overflow", threads: 1,
     note: "The cheaper order overflows. multi_dot takes it and returns infinity; MatrixLang proves the danger and keeps the finite answer."},
    {title: "Results", view: "results",
     note: "Measured on this laptop: faster than what you would write, and every certified-identical output really was identical."},
  ];

  function go(i) {
    step = Math.max(0, Math.min(steps.length - 1, i));
    const s = steps[step];
    if (s.example && window.Workspace) {
      if (Workspace.state.example !== s.example) Workspace.select(s.example);
      if (s.contract) Workspace.setContract(s.contract);
      if (s.stage) Workspace.setStage(s.stage);
    }
    if (s.race && window.Race) { Race.setThreads(s.threads || 1); Race.select(s.race); }
    show(s.view);
    $("step-title").textContent = `${step + 1} · ${s.title}`;
    $("step-note").textContent = s.note;
    document.querySelectorAll(".step-dot").forEach((d, k) => {
      d.setAttribute("aria-selected", String(k === step)); d.classList.toggle("done", k < step);
      d.tabIndex = k === step ? 0 : -1;
    });
    $("step-prev").disabled = step === 0; $("step-next").disabled = step === steps.length - 1;
  }

  steps.forEach((s, k) => {
    const d = document.createElement("button"); d.type = "button"; d.className = "step-dot"; d.setAttribute("role", "tab");
    d.setAttribute("aria-label", `Step ${k + 1}: ${s.title}`); d.title = `${k + 1} · ${s.title}`;
    d.addEventListener("click", () => go(k)); $("step-dots").append(d);
  });
  $("step-prev").addEventListener("click", () => go(step - 1));
  $("step-next").addEventListener("click", () => go(step + 1));
  $("notes-toggle").addEventListener("click", () => {
    const off = $("presenter").classList.toggle("notes-off");
    $("notes-toggle").setAttribute("aria-pressed", String(!off));
  });

  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));
  document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => {
    const k = steps.findIndex((s) => s.view === b.dataset.go);
    if (k >= 0) go(k); else show(b.dataset.go);
  }));

  /* --- command palette ------------------------------------------------------ */
  const palette = $("palette"), input = $("palette-input"), list = $("palette-list");
  let items = [], active = 0;
  function commands() {
    const out = [];
    steps.forEach((s, k) => out.push({label: `Step ${k + 1}: ${s.title}`, hint: "demo path", run: () => go(k)}));
    views.forEach((v) => out.push({label: `Go to ${v[0].toUpperCase()}${v.slice(1)}`, hint: "view", run: () => show(v)}));
    if (window.Workspace) {
      Workspace.examples.forEach((e) => out.push({label: `Open example: ${e.title}`, hint: "workspace", run: () => { Workspace.select(e.id); show("workspace"); }}));
      Workspace.contracts.forEach((c) => out.push({label: `Contract: ${c}`, hint: "workspace", run: () => { Workspace.setContract(c); show("workspace"); }}));
      out.push({label: "Compile & run", hint: "Ctrl Enter", run: () => { show("workspace"); Workspace.compile(); }});
      out.push({label: "Compare contracts", hint: "Ctrl Shift Enter", run: () => { show("workspace"); Workspace.showComparison(); }});
    }
    if (window.Race) {
      Race.races.forEach((r) => out.push({label: `Race: ${r.title}`, hint: "race", run: () => { Race.select(r.id); show("race"); }}));
      out.push({label: "Run the race on this laptop", hint: "race", run: () => { show("race"); Race.run(); }});
      out.push({label: "Race with 1 thread", hint: "race", run: () => { show("race"); Race.setThreads(1); }});
      out.push({label: "Race with 8 threads", hint: "race", run: () => { show("race"); Race.setThreads(8); }});
    }
    out.push({label: "Open the full evaluation", hint: "page", run: () => { location.href = "evaluation.html"; }});
    out.push({label: "Open the demo guide", hint: "page", run: () => { location.href = "guide.html"; }});
    return out;
  }
  function paint() {
    const q = input.value.trim().toLowerCase();
    items = commands().filter((c) => !q || q.split(/\s+/).every((w) => c.label.toLowerCase().includes(w)));
    active = Math.min(active, Math.max(0, items.length - 1));
    list.innerHTML = items.map((c, k) => `<li role="option" id="cmd-${k}" aria-selected="${k === active}" data-k="${k}"><span>${escape(c.label)}</span><small>${escape(c.hint)}</small></li>`).join("") || `<li aria-disabled="true"><span>No matching command</span></li>`;
    input.setAttribute("aria-activedescendant", items.length ? `cmd-${active}` : "");
    const el = $(`cmd-${active}`); if (el) el.scrollIntoView({block: "nearest"});
  }
  function openPalette() { input.value = ""; active = 0; paint(); palette.showModal(); input.focus(); }
  function runActive() { const c = items[active]; palette.close(); if (c) c.run(); }
  $("palette-open").addEventListener("click", openPalette);
  input.addEventListener("input", () => { active = 0; paint(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(items.length - 1, active + 1); paint(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); paint(); }
    else if (e.key === "Enter") { e.preventDefault(); runActive(); }
  });
  list.addEventListener("click", (e) => { const li = e.target.closest("li[data-k]"); if (li) { active = Number(li.dataset.k); runActive(); } });
  palette.addEventListener("click", (e) => { if (e.target === palette) palette.close(); });

  /* --- keyboard ------------------------------------------------------------- */
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); palette.open ? palette.close() : openPalette(); return; }
    if (palette.open) return;
    const typing = e.target.closest && e.target.closest("textarea, input, select, [contenteditable]");
    if (typing) return;
    if (e.target.closest && e.target.closest('[role="tab"]')) return;
    if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); go(step + 1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(step - 1); }
    else if (e.altKey && /^[1-4]$/.test(e.key)) { e.preventDefault(); show(views[Number(e.key) - 1]); }
  });

  const hash = location.hash.replace("#", "");
  const start = new URLSearchParams(location.search).get("example") ? "workspace" : hash;
  if (views.includes(start)) { show(start, false); const k = steps.findIndex((s) => s.view === start); step = Math.max(0, k); $("step-title").textContent = `${step + 1} · ${steps[step].title}`; $("step-note").textContent = steps[step].note; document.querySelectorAll(".step-dot").forEach((d, k2) => d.setAttribute("aria-selected", String(k2 === step))); }
  else go(0);
  window.addEventListener("hashchange", () => {
    const name = location.hash.replace("#", "");
    if (views.includes(name) && name !== view) show(name, false);
  });
  window.Story = {go, show, steps};
})();
