"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const data = window.MATRIXLANG_WORKSPACE;
  if (!data || !data.examples.length) {
    $("notice").hidden = false;
    $("notice").textContent = "Demo captures are unavailable. Run make web and reload the page.";
    $("compile").disabled = $("compare").disabled = true;
    return;
  }
  const examples = data.examples;
  const groups = [["Numerical contracts", ["exact", "real", "outputs", "unbounded", "numerics", "inherited"]],
    ["Language", ["multiply", "mismatch", "reuse"]]];
  const contracts = ["strict", "bounded", "algebraic"];
  const contractNames = {strict: "Strict", bounded: "Bounded", algebraic: "Algebraic"};
  const contractNotes = {
    strict: "Strict applies a value-changing rewrite only when the declared input domains prove it bit-identical to the source program.",
    bounded: "Bounded also applies rewrites that keep the source order's worst-case error bound. Values may differ within that bound; NaN and infinity behaviour is unchanged.",
    algebraic: "Algebraic applies any rewrite that is valid over the real numbers. Rounding, signed zero and non-finite results may change.",
  };
  const levelNames = {"bit-identical": "Bit-identical", "bound-preserving": "Bound-preserving", "relaxed": "Relaxed"};
  const levelMeaning = {
    "bit-identical": "Every bit equals the unoptimized program for every input in the declared domains.",
    "bound-preserving": "Within the source order's worst-case error bound; the bits may differ.",
    "relaxed": "Valid over the reals only; no floating-point guarantee is kept.",
  };
  const stageNames = [["tokens", "Tokens"], ["ast", "AST"], ["symbols", "Symbols"],
    ["check", "Shapes"], ["tac", "TAC"], ["optimize", "Optimize"], ["guarantees", "Guarantees"],
    ["target", "VM code"], ["execute", "Run"]];
  const recordedSeed = data.seed || 1;
  let example = examples[0], mode = "strict", stage = "check", live = false, busy = false;
  let results = {}, origin = "recorded", revision = 0, compiledSource = "", compiledSeed = recordedSeed, comparing = false;
  let controller = null, bitsChoice = {output: 0, entry: null};
  const source = $("source"), seedField = $("seed");
  const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const number = (value) => value == null ? "—" : value.toLocaleString("en-US");
  const normalize = (text) => text.replace(/\r\n/g, "\n");
  const plural = (count, word) => `${number(count)} ${word}${count === 1 ? "" : "s"}`;
  const listeners = [];

  function announce(message) {
    $("notice").hidden = !message;
    $("notice").textContent = message;
  }

  function persist() {
    try { localStorage.setItem("matrixlang-workspace", JSON.stringify({example: example.id, source: source.value, mode, stage, seed: seedValue()})); }
    catch (_) { /* Editing remains available when browser storage is disabled. */ }
  }

  function seedValue() {
    const value = Number(seedField.value);
    return Number.isInteger(value) && value >= 1 && value <= 2147483647 ? value : null;
  }

  function highlightHTML(text) {
    const pattern = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|\b(?:matrix|scalar|print|transpose|zeros|ones|identity|input)\b|\b(?:bool|uint8|int8|uint16|int16|int32|int|real)\b(?=\s*[(),])|\b(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
    let html = "", end = 0;
    for (const match of text.matchAll(pattern)) {
      html += escape(text.slice(end, match.index));
      const t = match[0];
      const kind = t.startsWith("/") ? "comment" : /^[\d.]/.test(t) ? "number" : /^(bool|uint8|int8|uint16|int16|int32|int|real)$/.test(t) ? "domain" : "keyword";
      html += `<span class="${kind}">${escape(t)}</span>`;
      end = match.index + t.length;
    }
    return html + escape(text.slice(end));
  }

  function highlight() {
    $("highlight").innerHTML = highlightHTML(source.value) + "\n";
    $("line-numbers").textContent = Array.from({length: source.value.split("\n").length}, (_, i) => i + 1).join("\n");
    syncScroll(); updateCursor();
    $("reset").disabled = normalize(source.value) === normalize(example.source);
  }

  function syncScroll() {
    $("highlight").scrollTop = source.scrollTop;
    $("highlight").scrollLeft = source.scrollLeft;
    $("line-numbers").scrollTop = source.scrollTop;
  }

  function updateCursor() {
    const before = source.value.slice(0, source.selectionStart).split("\n");
    $("cursor").textContent = `Ln ${before.length}, Col ${before[before.length - 1].length + 1}`;
  }

  function setBusy(value) {
    busy = value;
    $("compile").disabled = $("compare").disabled = value;
    $("compile-label").textContent = value ? "Compiling…" : live ? "Compile & run" : "Inspect program";
    if (value) $("verdict").textContent = "Compiling";
    $("result-heading").closest("section").setAttribute("aria-busy", String(value));
  }

  function chooseExample(item) {
    revision++;
    if (controller) controller.abort();
    setBusy(false); example = item; source.value = item.source; stage = item.stage;
    seedField.value = String(recordedSeed); compiledSeed = recordedSeed; bitsChoice = {output: 0, entry: null};
    results = {...item.captures}; origin = "recorded"; comparing = false; compiledSource = source.value;
    $("example-title").textContent = item.title;
    $("example-description").textContent = item.description;
    $("source-file").textContent = item.file.split("/").pop();
    document.querySelectorAll(".example-button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.example === item.id)));
    source.scrollTop = source.scrollLeft = 0;
    announce(""); highlight(); render(); persist();
  }

  function browserResult(text) {
    if (new TextEncoder().encode(text).length > 16000) throw new Error("Source exceeds the 16,000-byte demo limit. Reduce it and try again.");
    const scanned = MatrixLexer.scan(text);
    if (scanned.tokens.length > 1200) throw new Error("Program exceeds the 1,200-token demo limit. Reduce it and try again.");
    const parsed = MatrixParser.parse(window.MATRIXLANG_GRAMMAR, scanned);
    const errors = [...scanned.errors, ...parsed.errors].sort((a, b) => a.line - b.line || a.col - b.col);
    const tokens = scanned.tokens.map((token) => `${token.line}:${token.col}`.padEnd(8) + token.symbol.padEnd(15) + token.lexeme).join("\n");
    const trace = parsed.steps.map((step, i) => `${i + 1}. ${step.headline || step.kind || "parser step"}`).join("\n");
    const check = errors.length ? errors.map((error) => `${error.line}:${error.col}: ${error.kind} error: ${error.message}`).join("\n") : "Syntax accepted by the browser parser.\n\nShape checking, guarantees and execution require the local compiler.\nRun make serve, then compile this source again.";
    return {mode, status: errors.length || !parsed.accepted ? "syntax-error" : "parsed", diagnostics: errors.map((error) => ({...error, column: error.col})), symbols: [], inputs: [], guarantees: {promise: null, outputs: []}, metrics: {tokens: scanned.tokens.length}, comparison: null, execution: "blocked",
      stages: stageNames.map(([id, title]) => ({id, title: id === "ast" ? "Parser trace" : id === "check" ? "Syntax validation (browser)" : title,
        state: ["tokens", "ast", "check"].includes(id) ? "complete" : "blocked",
        text: id === "tokens" ? tokens || "No tokens." : id === "ast" ? trace : id === "check" ? check : "This stage requires the local C compiler. Run make serve, then compile again."}))};
  }

  async function requestCompile(text, contract, seed, signal) {
    const response = await fetch("api/compile", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({source: text, mode: contract, seed}), signal});
    let payload;
    try { payload = await response.json(); } catch (_) { throw new Error("The compiler service is unavailable. Start make serve and try again."); }
    if (!response.ok) throw new Error(payload.error || "Compilation failed. Check the local compiler and try again.");
    return payload;
  }

  async function compile(compare = false) {
    if (busy) return;
    const seed = seedValue();
    if (seed == null) { announce("Enter an input seed between 1 and 2,147,483,647."); seedField.focus(); return; }
    const currentRevision = ++revision, text = source.value, contract = mode;
    controller = new AbortController(); announce(""); setBusy(true);
    try {
      let next = {};
      if (live) {
        const wanted = compare ? [contract, ...contracts.filter((item) => item !== contract)] : [contract];
        for (const item of wanted) next[item] = await requestCompile(text, item, seed, controller.signal);
      } else {
        const match = examples.find((item) => normalize(item.source) === normalize(text));
        if (match) {
          next = {...match.captures};
          if (seed !== recordedSeed) announce(`Recorded examples use input seed ${recordedSeed}. Start make serve to run other seeds.`);
        } else {
          next[contract] = browserResult(text); compare = false;
          announce("Browser front end only. Shape checking, guarantees and execution require make serve.");
        }
      }
      if (revision !== currentRevision) return;
      results = next; bitsChoice = {output: 0, entry: null};
      origin = live ? "live" : ["parsed", "syntax-error"].includes(results[contract].status) ? "browser" : "recorded";
      compiledSource = text; compiledSeed = live ? seed : recordedSeed; comparing = compare; render(); persist();
    } catch (error) {
      if (error.name !== "AbortError" && revision === currentRevision) {
        announce(error.message); $("verdict").textContent = "Compile failed"; $("verdict").className = "verdict error";
      }
    } finally { if (revision === currentRevision) setBusy(false); }
  }

  function costTable(result) {
    const metrics = result.metrics;
    if (metrics.before == null) return "";
    return `<table class="cost-table"><thead><tr><th scope="col">Metric</th><th scope="col">Source</th><th scope="col">${contractNames[result.mode]}</th></tr></thead><tbody><tr><td>Modeled arithmetic</td><td>${number(metrics.before)}</td><td>${number(metrics.after)}</td></tr><tr><td>TAC instructions</td><td>${number(metrics.instructionsBefore)}</td><td>${number(metrics.instructionsAfter)}</td></tr></tbody></table>`;
  }

  function levelBadge(level) {
    return `<span class="level level-${escape(level)}">${escape(levelNames[level] || level)}</span>`;
  }

  function checkLabel(item, result) {
    if (result.execution !== "complete" || item.identical == null) return `<span class="run-check">Not executed</span>`;
    if (item.identical) return `<span class="run-check same"><svg class="icon"><use href="#i-check"/></svg>Run with seed ${number(result.seed)}: equals unoptimized output</span>`;
    if (item.level === "bit-identical") return `<span class="run-check violation">Run with seed ${number(result.seed)}: differs from unoptimized output</span>`;
    return `<span class="run-check differs">Run with seed ${number(result.seed)}: bits differ, as this level permits</span>`;
  }

  function guaranteeView(result) {
    const outputs = (result.guarantees && result.guarantees.outputs) || [];
    const inputs = result.inputs || [];
    const inputList = inputs.length
      ? `<div class="inputs"><h4>Declared inputs</h4><ul>${inputs.map((input) => `<li><code>${escape(input.name)}</code><span>${input.kind === "Matrix" ? `${input.rows} × ${input.cols}` : "Scalar"}</span><b>${escape(input.domain)}</b><span class="input-meaning">${escape(input.meaning)}</span></li>`).join("")}</ul><p>Values are drawn from each domain with seed ${number(result.seed)} and checked before execution. The compiler sees only the domains.</p></div>`
      : `<div class="inputs"><h4>Declared inputs</h4><p>This program has no <code>input(…)</code> declarations; every value is known at compile time.</p></div>`;
    const cards = outputs.map((item) => `<li class="guarantee"><div class="guarantee-head"><code>print(${escape(item.label)})</code>${levelBadge(item.level)}</div><p class="guarantee-meaning">${escape(levelMeaning[item.level] || "")}</p><ul class="reasons">${item.reasons.map((reason) => `<li>${escape(reason)}</li>`).join("")}</ul>${checkLabel(item, result)}</li>`).join("");
    const promise = result.guarantees && result.guarantees.promise ? `<p class="promise"><b>${contractNames[result.mode]} contract.</b> ${escape(result.guarantees.promise)}</p>` : "";
    return `${promise}${inputList}<ol class="guarantee-list">${cards || "<li class=\"guarantee\">This program prints no output.</li>"}</ol>`;
  }

  /* The signature view: one output entry, unoptimized against optimized, bit for bit. */
  function bitsView(result) {
    if (!result || !result.comparison || result.execution !== "complete" || !window.Bits) return "";
    let before, after;
    try { before = Bits.parseOutputs(result.comparison.baseline); after = Bits.parseOutputs(result.comparison.optimized); }
    catch (_) { return ""; }
    if (!before.length || before.length !== after.length) return "";
    const k = Math.min(bitsChoice.output, before.length - 1);
    const a = before[k], b = after[k];
    if (!a.values.length || a.values.length !== b.values.length) return "";
    let differ = 0, first = null;
    a.values.forEach((value, i) => { if (value !== b.values[i]) { differ++; if (first === null) first = i; } });
    const entry = bitsChoice.entry != null ? Math.min(bitsChoice.entry, a.values.length - 1) : first != null ? first : 0;
    const row = Math.floor(entry / a.cols), col = entry % a.cols;
    const level = ((result.guarantees && result.guarantees.outputs) || [])[k];
    const options = before.map((block, i) => `<option value="${i}"${i === k ? " selected" : ""}>print(${escape(block.label)})</option>`).join("");
    const pa = a.values[entry], pb = b.values[entry];
    return `<h4>Bits of one output entry</h4>
      <div class="bits-controls"><label>Output <select id="bits-output">${options}</select></label>
        <label>Entry <select id="bits-entry">${Array.from({length: Math.min(a.values.length, 400)}, (_, i) => `<option value="${i}"${i === entry ? " selected" : ""}>(${Math.floor(i / a.cols) + 1},${i % a.cols + 1})${a.values[i] !== b.values[i] ? " ·" : ""}</option>`).join("")}</select></label>
        <span class="bit-key"><i></i>bits that differ</span></div>
      <dl class="bit-pair">
        <dt>unoptimized</dt><dd>${Bits.strip(pa, null, {legend: false, size: "md"})}<span class="bit-value">${Bits.describeHTML(pa)}</span></dd>
        <dt>${escape(contractNames[result.mode].toLowerCase())}</dt><dd>${Bits.strip(pb, pa, {size: "md"})}<span class="bit-value">${Bits.describeHTML(pb)}</span></dd>
      </dl>
      <p class="bits-summary">Entry (${row + 1},${col + 1}) of <code>${escape(a.label)}</code>: <b>${Bits.differing(pa, pb)} of 64 bits differ</b>, ${escape(Bits.ulpText(pa, pb))}; exponent field ${escape(Bits.exponentOf(pb))}. Across the output, <b>${number(differ)} of ${number(a.values.length)}</b> entries differ${level ? `; certified <b>${escape(level.level)}</b>` : ""}.</p>`;
  }

  function renderComparison() {
    const available = contracts.filter((item) => results[item]);
    if (available.length < 2) return;
    const checked = available.every((item) => results[item].comparison && results[item].execution === "complete");
    $("stage-title").textContent = "Numerical contracts"; $("stage-state").textContent = `Input seed ${number(compiledSeed)}`;
    $("shape-strip").hidden = $("cost-summary").hidden = $("output").hidden = $("guarantee-panel").hidden = $("bits-panel").hidden = true;
    $("diagnostic-links").replaceChildren(); $("comparison-panel").hidden = false; $("show-stages").hidden = false;
    const differing = available.filter((item) => results[item].comparison && !results[item].comparison.identical);
    const headline = !checked ? "Execution comparison is unavailable for this program. Inspect the diagnostics or reduce its dimensions."
      : differing.length ? `${differing.map((item) => contractNames[item]).join(" and ")} changed the printed bits, within the guarantee certified for each output.`
      : "Every contract printed output identical to the unoptimized program for this input seed.";
    $("comparison-panel").innerHTML = `<p class="comparison-summary">${headline}</p><div class="comparison-grid">${available.map((item) => {
      const result = results[item], ran = result.comparison && result.execution === "complete";
      return `<section class="comparison-side ${item === mode ? "selected-contract" : ""}"><h4><span class="lvl-${item === "strict" ? "bit-identical" : item === "bounded" ? "bound-preserving" : "relaxed"}">${contractNames[item]}</span>${item === mode ? '<span class="comparison-active">Selected</span>' : ""}</h4><p class="comparison-cost"><b>${number(result.metrics.after)}</b> modeled ${result.metrics.after === 1 ? "operation" : "operations"} · ${plural(result.metrics.instructionsAfter, "instruction")}</p><ul class="comparison-outputs">${((result.guarantees && result.guarantees.outputs) || []).map((g) => `<li><code>print(${escape(g.label)})</code>${levelBadge(g.level)}<span class="${g.identical === false ? "differs" : g.identical ? "same" : ""}">${g.identical == null ? "not run" : g.identical ? "same bits" : "bits differ"}</span></li>`).join("")}</ul><span class="comparison-label ${ran && !result.comparison.identical ? "different" : ""}">${ran ? result.comparison.identical ? "Output equals unoptimized run" : "Output differs from unoptimized run" : "Not executed"}</span><pre>${escape(ran ? result.comparison.optimized || "No printed output." : result.stages.find((part) => part.id === (result.status === "rejected" ? "check" : "execute")).text)}</pre></section>`;
    }).join("")}</div>`;
    $("result-footnote").textContent = "Hexadecimal output distinguishes every binary64 value, including the sign of zero.";
  }

  function shapeEquations(result) {
    const types = new Map(result.symbols.filter((symbol) => symbol.kind === "Matrix").map((symbol) => [symbol.name, [symbol.rows, symbol.cols]]));
    const tac = result.stages.find((part) => part.id === "optimize").text;
    const aliases = new Map();
    for (const match of tac.matchAll(/^\s*\d+\s+(\w+) = (\w+)\s+Matrix</gm)) aliases.set(match[2], match[1]);
    const equations = [];
    for (const match of tac.matchAll(/^\s*\d+\s+(\w+) = (\w+) \* (\w+)\s+Matrix<(\d+)x(\d+)>/gm)) {
      const [, name, left, right, rows, cols] = match;
      const a = types.get(left), b = types.get(right);
      types.set(name, [Number(rows), Number(cols)]);
      if (!a || !b) continue;
      const operand = (label, shape, inner) => `<span class="shape-operand"><b>${escape(label)}</b><span class="matrix-dimensions">[<span class="${inner === 0 ? "inner-dimension" : ""}">${shape[0]}</span> × <span class="${inner === 1 ? "inner-dimension" : ""}">${shape[1]}</span>]</span></span>`;
      equations.push(`<div class="shape-equation">${operand(left, a, 1)}<span class="math-operator">×</span>${operand(right, b, 0)}<svg class="icon"><use href="#i-arrow"/></svg>${operand(aliases.get(name) || name, [rows, cols], -1)}</div>`);
    }
    if (equations.length) return equations.slice(0, 2).join("") + `<span class="shape-caption">Matching inner dimensions are underlined.${equations.length > 2 ? " First two matrix products shown." : ""}</span>`;
    return result.symbols.map((symbol) => `<span class="shape-item">${escape(symbol.name)}<span>${symbol.kind === "Matrix" ? `${symbol.rows} × ${symbol.cols}` : "Scalar"}</span></span>`).join("");
  }

  function statusBar(result, pending) {
    $("status-file").textContent = example.file.split("/").pop();
    $("status-contract").textContent = `contract ${mode}`;
    $("status-contract").className = `status-item status-ws lvl-${mode === "strict" ? "bit-identical" : mode === "bounded" ? "bound-preserving" : "relaxed"}`;
    $("status-seed").textContent = `seed ${number(compiledSeed)}`;
    const m = result && result.metrics;
    $("status-cost").textContent = !pending && m && m.before != null ? `${number(m.before)} → ${number(m.after)} modeled operations` : "cost pending";
    const outputs = !pending && result && result.guarantees ? result.guarantees.outputs || [] : [];
    $("status-chips").innerHTML = outputs.map((g) => `<span class="status-chip lvl-${escape(g.level)}" title="${escape(levelNames[g.level])}">print(${escape(g.label)}) ${escape(g.level)}</span>`).join("");
  }

  function render() {
    const result = results[mode], dirty = source.value !== compiledSource;
    contracts.forEach((item) => $(item).setAttribute("aria-pressed", String(mode === item)));
    $("contract-note").textContent = contractNotes[mode];
    $("result-origin").textContent = origin === "live" ? `Local C compiler · ${contractNames[mode]}` : origin === "browser" ? "Browser scanner / parser only" : `Recorded C compiler output · ${contractNames[mode]}`;
    $("source-note").textContent = dirty ? "Changed: compile to update" : "";
    const pending = dirty || !result;
    $("verdict").textContent = pending ? "Needs compilation" : result.status === "accepted" ? "Accepted" : result.status === "parsed" ? "Syntax accepted" : "Rejected";
    $("verdict").className = "verdict" + (pending || result.status === "parsed" ? " pending" : result.status !== "accepted" ? " error" : "");
    const selected = result && result.stages.find((item) => item.id === stage);
    document.querySelectorAll(".stage-tab").forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.stage === stage && !comparing));
      button.tabIndex = button.dataset.stage === stage ? 0 : -1;
      const part = result && result.stages.find((item) => item.id === button.dataset.stage);
      button.textContent = origin === "browser" && button.dataset.stage === "check" ? "Syntax only" : origin === "browser" && button.dataset.stage === "ast" ? "Parser trace" : stageNames.find(([id]) => id === button.dataset.stage)[1];
      button.title = part ? `${part.title}: ${pending ? "needs compilation" : part.state}` : "Compile to inspect this stage";
    });
    if (comparing) $("stage-panel").removeAttribute("aria-labelledby");
    else $("stage-panel").setAttribute("aria-labelledby", `tab-${stage}`);
    $("stage-title").textContent = selected ? selected.title : stageNames.find(([id]) => id === stage)[1];
    $("stage-state").textContent = pending ? "Pending" : !selected ? "Unavailable" : selected.state === "blocked" ? "Unavailable" : selected.state === "limited" ? "Execution limited" : selected.state === "error" ? "Error" : "Complete";
    $("show-stages").hidden = true; $("comparison-panel").hidden = true; $("output").hidden = false;
    $("output").textContent = pending ? "Compile this source to inspect its compiler output.\nPrevious results are hidden until compilation completes." : selected ? selected.text : "This stage is unavailable for this result.";
    $("output").classList.toggle("error-output", !pending && Boolean(selected) && (selected.state === "error" || result.status === "syntax-error"));
    const showGuarantees = !pending && result.status === "accepted" && stage === "guarantees" && result.guarantees;
    $("guarantee-panel").hidden = !showGuarantees;
    $("guarantee-panel").innerHTML = showGuarantees ? guaranteeView(result) : "";
    const showBits = !pending && result.status === "accepted" && ["guarantees", "execute"].includes(stage);
    const bitsHTML = showBits ? bitsView(result) : "";
    $("bits-panel").hidden = !bitsHTML; $("bits-panel").innerHTML = bitsHTML;
    $("output").classList.toggle("secondary-output", Boolean(showGuarantees || bitsHTML));
    const showShapes = !pending && result.status === "accepted" && ["check", "symbols", "tac", "optimize"].includes(stage);
    $("shape-strip").hidden = !showShapes;
    $("shape-strip").innerHTML = showShapes ? shapeEquations(result) : "";
    const showCost = !pending && result.status === "accepted" && stage === "optimize";
    $("cost-summary").hidden = !showCost; $("cost-summary").innerHTML = showCost ? costTable(result) : "";
    if (showCost) {
      const association = selected.text.match(/chain order\s*:\s*(.*?)\s*->\s*(.*?)\n/);
      if (association) $("cost-summary").innerHTML += `<p class="association">${escape(association[1])} → ${escape(association[2])}</p>`;
    }
    $("diagnostic-links").replaceChildren();
    if (!pending && stage === "check") result.diagnostics.filter((error) => error.line > 0).forEach((error) => {
      const button = document.createElement("button"); button.type = "button"; button.textContent = `Go to ${error.line}:${error.column}`;
      button.addEventListener("click", () => {
        const lines = source.value.split("\n");
        const position = lines.slice(0, error.line - 1).reduce((sum, line) => sum + line.length + 1, 0) + error.column - 1;
        source.focus(); source.setSelectionRange(position, position + 1);
        source.scrollTop = Math.max(0, (error.line - 3) * 24); updateCursor();
      });
      $("diagnostic-links").append(button);
    });
    $("result-footnote").textContent = pending ? "Compile to refresh the evidence for this source." : origin === "live" ? `Output from the local matrixc executable · input seed ${number(compiledSeed)}.` : origin === "browser" ? "Browser results cover lexical and syntax analysis." : `Captured from matrixc for the unchanged example source · input seed ${number(recordedSeed)}.`;
    if (comparing && !pending) renderComparison();
    observation(result, pending);
    statusBar(result, pending);
    listeners.forEach((fn) => fn({example, mode, stage, result, pending}));
  }

  function observation(result, pending) {
    let title = "Compile the edited source", text = "Results will update after compilation. Select a stage to inspect the compiler's output.";
    if (!pending) {
      const outputs = (result.guarantees && result.guarantees.outputs) || [];
      const violated = outputs.filter((item) => item.level === "bit-identical" && item.identical === false);
      const weaker = outputs.filter((item) => item.level !== "bit-identical");
      const saved = (result.metrics.before || 0) - (result.metrics.after || 0);
      if (["rejected", "syntax-error"].includes(result.status)) {
        title = "Compilation stopped at a diagnostic";
        text = result.diagnostics[0] ? result.diagnostics[0].message + ". Correct the source and compile again." : "Resolve the reported errors before code generation and execution.";
      } else if (result.status === "parsed") {
        title = "The browser parsed this source"; text = "Syntax acceptance does not establish valid shapes. Start make serve to use the full C compiler.";
      } else if (result.execution === "error") {
        title = "Execution reported an error"; text = "Inspect the execution output and correct the source before comparing numerical results.";
      } else if (violated.length) {
        title = "A bit-identical certificate disagrees with execution";
        text = `print(${violated[0].label}) was certified bit-identical but differs from the unoptimized run. Report this program as a compiler defect.`;
      } else if (weaker.length) {
        title = `${plural(weaker.length, "output")} certified below bit-identical`;
        text = `${weaker.map((item) => `print(${item.label}) is ${item.level}`).join("; ")}. ${saved > 0 ? `The ${contractNames[mode].toLowerCase()} contract removes ${number(saved)} of ${number(result.metrics.before)} modeled operations.` : ""} Compare contracts to inspect the exact bits.`;
      } else if (saved > 0) {
        title = `${plural(saved, "modeled operation")} removed, every output bit-identical`;
        text = `${number(result.metrics.before)} → ${number(result.metrics.after)} scalar operations; ${number(result.metrics.instructionsBefore)} → ${number(result.metrics.instructionsAfter)} TAC instructions. Counts are modeled work; the Race view measures time.`;
      } else {
        title = result.comparison ? "Every output bit-identical to the source program" : "Compiler stages complete";
        text = mode === "strict" ? "No value-changing rewrite was proved for this program. Compare contracts to inspect the bounded and algebraic results." : "No modeled arithmetic reduction for this program. Inspect the stage output or choose another example.";
      }
    }
    $("observation-title").textContent = title; $("observation-text").textContent = text;
  }

  $("example-count").textContent = String(examples.length);
  for (const [name, ids] of groups) {
    const heading = document.createElement("div"); heading.className = "example-group"; heading.textContent = name; $("examples").append(heading);
    ids.map((id) => examples.find((item) => item.id === id)).filter(Boolean).forEach((item) => {
      const button = document.createElement("button"); button.type = "button"; button.className = "example-button"; button.dataset.example = item.id;
      button.innerHTML = `<strong>${escape(item.title)}</strong><span>${escape(item.description)}</span>`;
      button.addEventListener("click", () => chooseExample(item)); $("examples").append(button);
    });
  }
  stageNames.forEach(([id, title], index) => {
    const button = document.createElement("button"); button.type = "button"; button.className = "stage-tab"; button.id = `tab-${id}`; button.dataset.stage = id;
    button.setAttribute("role", "tab"); button.setAttribute("aria-controls", "stage-panel"); button.textContent = title;
    button.addEventListener("click", () => { stage = id; comparing = false; render(); persist(); });
    button.addEventListener("keydown", (event) => {
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % stageNames.length;
      else if (event.key === "ArrowLeft") next = (index + stageNames.length - 1) % stageNames.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = stageNames.length - 1;
      else return;
      event.preventDefault(); event.stopPropagation(); stage = stageNames[next][0]; comparing = false; render(); $(`tab-${stage}`).focus(); persist();
    });
    $("stage-tabs").append(button);
  });
  function setContract(contract) {
    if (!contracts.includes(contract) || mode === contract) return;
    mode = contract; revision++; if (controller) controller.abort(); setBusy(false);
    comparing = Boolean(comparing && contracts.filter((item) => results[item]).length > 1);
    if (!results[mode] && live) compile(); else render();
    persist();
  }
  contracts.forEach((contract) => $(contract).addEventListener("click", () => setContract(contract)));
  source.addEventListener("input", () => {
    revision++; if (controller) controller.abort(); setBusy(false); comparing = false; highlight(); render(); persist(); announce("");
  });
  seedField.addEventListener("change", () => { persist(); if (live && seedValue() != null && seedValue() !== compiledSeed) announce("Input seed changed. Compile to run the program with the new inputs."); });
  source.addEventListener("scroll", syncScroll);
  ["click", "keyup", "select"].forEach((event) => source.addEventListener(event, updateCursor));
  source.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); compile(event.shiftKey); }
    if ((event.ctrlKey || event.metaKey) && event.key === "]") {
      event.preventDefault(); source.setRangeText("  ", source.selectionStart, source.selectionEnd, "end"); source.dispatchEvent(new Event("input"));
    }
  });
  document.querySelectorAll("[data-snippet]").forEach((button) => button.addEventListener("click", () => {
    const at = source.selectionEnd, text = source.value;
    const lineStart = text.lastIndexOf("\n", at - 1) + 1, lineEnd = text.indexOf("\n", at);
    const atEnd = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd).trim() !== "";
    const insert = (atEnd ? "\n" : "") + button.dataset.snippet;
    const position = atEnd ? (lineEnd === -1 ? text.length : lineEnd) : at;
    source.focus(); source.setRangeText(insert, position, position, "end"); source.dispatchEvent(new Event("input"));
  }));
  $("bits-panel").addEventListener("change", (event) => {
    if (event.target.id === "bits-output") bitsChoice = {output: Number(event.target.value), entry: null};
    if (event.target.id === "bits-entry") bitsChoice.entry = Number(event.target.value);
    render();
  });
  $("compile").addEventListener("click", () => compile()); $("compare").addEventListener("click", () => compile(true));
  $("reset").addEventListener("click", () => chooseExample(example));
  $("show-stages").addEventListener("click", () => { comparing = false; render(); });
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); announce("Copied to clipboard."); }
    catch (_) { announce("Clipboard unavailable. Select the text and copy it with your keyboard."); }
  }
  $("copy").addEventListener("click", () => copy(source.value));
  $("copy-output").addEventListener("click", () => copy(comparing ? $("comparison-panel").innerText : stage === "guarantees" && !$("guarantee-panel").hidden ? $("guarantee-panel").innerText + "\n\n" + $("output").textContent : $("output").textContent));
  $("download").addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([source.value + "\n"], {type: "text/plain"}));
    const link = document.createElement("a"); link.href = url; link.download = "program.ml"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  window.Workspace = {
    examples, contracts, highlightHTML,
    select(id) { const item = examples.find((e) => e.id === id); if (item) chooseExample(item); },
    setContract,
    setStage(id) { if (stageNames.some(([s]) => s === id)) { stage = id; comparing = false; render(); persist(); } },
    compile, compare: () => compile(true),
    showComparison() { if (contracts.filter((c) => results[c]).length > 1) { comparing = true; render(); } else compile(true); },
    onRender(fn) { listeners.push(fn); },
    get live() { return live; },
    get state() { return {example: example.id, mode, stage}; },
  };

  let saved;
  try { saved = JSON.parse(localStorage.getItem("matrixlang-workspace")); } catch (_) { saved = null; }
  const params = new URLSearchParams(location.search);
  const requested = params.get("example");
  chooseExample(examples.find((item) => item.id === requested) || examples.find((item) => saved && item.id === saved.example) || examples[0]);
  if (!requested && saved) {
    if (contracts.includes(saved.mode)) mode = saved.mode;
    if (stageNames.some(([id]) => id === saved.stage)) stage = saved.stage;
    if (typeof saved.source === "string" && saved.source.length <= 16000) source.value = saved.source;
    if (Number.isInteger(saved.seed) && saved.seed >= 1) seedField.value = String(saved.seed);
    highlight(); render();
  }
  const requestedMode = params.get("contract");
  if (contracts.includes(requestedMode)) { mode = requestedMode; render(); }
  const healthController = new AbortController(); const healthTimer = setTimeout(() => healthController.abort(), 2500);
  fetch("api/health", {signal: healthController.signal}).then((response) => response.ok ? response.json() : null).then((health) => {
    live = Boolean(health && health.available && health.compiler === "matrixc" && health.schema >= 2);
    window.MATRIXLANG_LIVE = {compile: live, race: live && Boolean(health.race)};
  }).catch(() => { live = false; window.MATRIXLANG_LIVE = {compile: false, race: false}; }).finally(() => {
    clearTimeout(healthTimer); $("connection-dot").classList.toggle("connected", live);
    $("connection-label").textContent = live ? "Local compiler ready" : "Recorded results";
    $("connection-detail").textContent = live ? "Edited source compiles with matrixc on this machine; races run live." : "Run make serve for live compilation and races.";
    if (!busy) setBusy(false);
    document.dispatchEvent(new CustomEvent("matrixlang:live", {detail: window.MATRIXLANG_LIVE}));
  });
})();
