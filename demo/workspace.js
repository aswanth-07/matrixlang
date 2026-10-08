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
  const stageNames = [["tokens", "Tokens"], ["ast", "Syntax tree"], ["symbols", "Symbols"],
    ["check", "Shape check"], ["tac", "TAC"], ["optimize", "Optimization"], ["guarantees", "Guarantees"],
    ["target", "VM code"], ["execute", "Execution"]];
  const recordedSeed = data.seed || 1;
  let example = examples[0], mode = "strict", stage = "check", live = false, busy = false;
  let results = {}, origin = "recorded", revision = 0, compiledSource = "", compiledSeed = recordedSeed, comparing = false;
  let controller = null;
  const source = $("source"), seedField = $("seed");
  const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
  const number = (value) => value == null ? "—" : value.toLocaleString("en-US");
  const normalize = (text) => text.replace(/\r\n/g, "\n");
  const plural = (count, word) => `${number(count)} ${word}${count === 1 ? "" : "s"}`;

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

  function highlight() {
    const pattern = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|\b(?:matrix|scalar|print|transpose|zeros|ones|identity|input)\b|\b(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
    let text = "", end = 0;
    for (const match of source.value.matchAll(pattern)) {
      text += escape(source.value.slice(end, match.index));
      const kind = match[0].startsWith("/") ? "comment" : /^[\d.]/.test(match[0]) ? "number" : "keyword";
      text += `<span class="${kind}">${escape(match[0])}</span>`;
      end = match.index + match[0].length;
    }
    $("highlight").innerHTML = text + escape(source.value.slice(end)) + "\n";
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
    seedField.value = String(recordedSeed); compiledSeed = recordedSeed;
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
      results = next;
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
      ? `<div class="inputs"><h4>Declared inputs</h4><ul>${inputs.map((input) => `<li><code>${escape(input.name)}</code><span>${input.kind === "Matrix" ? `${input.rows} × ${input.cols}` : "Scalar"}</span><b>${escape(input.domain)}</b><span class="input-meaning">${escape(input.meaning)}</span></li>`).join("")}</ul><p>Values are drawn from each domain with input seed ${number(result.seed)} and checked before execution.</p></div>`
      : `<div class="inputs"><h4>Declared inputs</h4><p>This program has no <code>input(…)</code> declarations; every value is known at compile time.</p></div>`;
    const cards = outputs.map((item) => `<li class="guarantee guarantee-${escape(item.level)}"><div class="guarantee-head"><code>print(${escape(item.label)})</code>${levelBadge(item.level)}</div><p class="guarantee-meaning">${escape(levelMeaning[item.level] || "")}</p><ul class="reasons">${item.reasons.map((reason) => `<li>${escape(reason)}</li>`).join("")}</ul>${checkLabel(item, result)}</li>`).join("");
    const promise = result.guarantees && result.guarantees.promise ? `<p class="promise"><b>${contractNames[result.mode]} contract.</b> ${escape(result.guarantees.promise)}</p>` : "";
    return `${promise}${inputList}<ol class="guarantee-list">${cards || "<li class=\"guarantee\">This program prints no output.</li>"}</ol>`;
  }

  function renderComparison() {
    const available = contracts.filter((item) => results[item]);
    if (available.length < 2) return;
    const checked = available.every((item) => results[item].comparison && results[item].execution === "complete");
    $("stage-title").textContent = "Numerical contracts"; $("stage-state").textContent = `Input seed ${number(compiledSeed)}`;
    $("shape-strip").hidden = $("cost-summary").hidden = $("output").hidden = $("guarantee-panel").hidden = true;
    $("diagnostic-links").replaceChildren(); $("comparison-panel").hidden = false; $("show-stages").hidden = false;
    const differing = available.filter((item) => results[item].comparison && !results[item].comparison.identical);
    const headline = !checked ? "Execution comparison is unavailable for this program. Inspect the diagnostics or reduce its dimensions."
      : differing.length ? `${differing.map((item) => contractNames[item]).join(" and ")} changed the printed bits, within the guarantee certified for each output.`
      : "Every contract printed output identical to the unoptimized program for this input seed.";
    $("comparison-panel").innerHTML = `<p class="comparison-summary">${headline}</p><div class="comparison-grid">${available.map((item) => {
      const result = results[item], ran = result.comparison && result.execution === "complete";
      return `<section class="comparison-side ${item === mode ? "selected-contract" : ""}"><h4>${contractNames[item]}${item === mode ? '<span class="comparison-active">Selected</span>' : ""}</h4><p class="comparison-cost"><b>${number(result.metrics.after)}</b> modeled ${result.metrics.after === 1 ? "operation" : "operations"} · ${plural(result.metrics.instructionsAfter, "instruction")}</p><ul class="comparison-outputs">${((result.guarantees && result.guarantees.outputs) || []).map((item) => `<li><code>print(${escape(item.label)})</code>${levelBadge(item.level)}<span class="${item.identical === false ? "differs" : item.identical ? "same" : ""}">${item.identical == null ? "not run" : item.identical ? "same bits" : "bits differ"}</span></li>`).join("")}</ul><span class="comparison-label ${ran && !result.comparison.identical ? "different" : ""}">${ran ? result.comparison.identical ? "Output equals unoptimized run" : "Output differs from unoptimized run" : "Not executed"}</span><pre>${escape(ran ? result.comparison.optimized || "No printed output." : result.stages.find((part) => part.id === (result.status === "rejected" ? "check" : "execute")).text)}</pre></section>`;
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

  function render() {
    const result = results[mode], dirty = source.value !== compiledSource;
    contracts.forEach((item) => $(item).setAttribute("aria-pressed", String(mode === item)));
    $("contract-note").textContent = contractNotes[mode];
    $("result-origin").textContent = origin === "live" ? `Local C compiler · ${contractNames[mode]}` : origin === "browser" ? "Browser scanner / parser only" : `Recorded C compiler output · ${contractNames[mode]}`;
    $("source-note").textContent = dirty ? "Source changed. Compile to update the results." : "Edit the source, then compile to update every stage.";
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
    $("output").classList.toggle("secondary-output", Boolean(showGuarantees));
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
        text = `${number(result.metrics.before)} → ${number(result.metrics.after)} scalar operations; ${number(result.metrics.instructionsBefore)} → ${number(result.metrics.instructionsAfter)} TAC instructions. Counts are modeled work, not measured runtime.`;
      } else {
        title = result.comparison ? "Every output bit-identical to the source program" : "Compiler stages complete";
        text = mode === "strict" ? "No value-changing rewrite was proved for this program. Compare contracts to inspect the bounded and algebraic results." : "No modeled arithmetic reduction for this program. Inspect the stage output or choose another example.";
      }
    }
    $("observation-title").textContent = title; $("observation-text").textContent = text;
  }

  $("example-count").textContent = String(examples.length);
  examples.forEach((item) => {
    const button = document.createElement("button"); button.type = "button"; button.className = "example-button"; button.dataset.example = item.id;
    button.innerHTML = `<strong>${escape(item.title)}</strong><span>${escape(item.description)}</span>`;
    button.addEventListener("click", () => chooseExample(item)); $("examples").append(button);
  });
  stageNames.forEach(([id, title], index) => {
    const button = document.createElement("button"); button.type = "button"; button.className = "stage-tab"; button.id = `tab-${id}`; button.dataset.stage = id;
    button.setAttribute("role", "tab"); button.setAttribute("aria-controls", "stage-panel"); button.textContent = title;
    button.addEventListener("click", () => {stage = id; comparing = false; render(); persist();});
    button.addEventListener("keydown", (event) => {
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % stageNames.length;
      else if (event.key === "ArrowLeft") next = (index + stageNames.length - 1) % stageNames.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = stageNames.length - 1;
      else return;
      event.preventDefault(); stage = stageNames[next][0]; comparing = false; render(); $(`tab-${stage}`).focus(); persist();
    });
    $("stage-tabs").append(button);
  });
  contracts.forEach((contract) => $(contract).addEventListener("click", () => {
    if (mode === contract) return;
    mode = contract; revision++; if (controller) controller.abort(); setBusy(false);
    comparing = Boolean(comparing && contracts.filter((item) => results[item]).length > 1);
    if (!results[mode] && live) compile(); else render();
    persist();
  }));
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
  $("compile").addEventListener("click", () => compile()); $("compare").addEventListener("click", () => compile(true));
  $("reset").addEventListener("click", () => chooseExample(example));
  $("show-stages").addEventListener("click", () => {comparing = false; render();});
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
  $("presentation").addEventListener("click", () => {
    const active = document.body.classList.toggle("presentation"); $("presentation").setAttribute("aria-pressed", String(active)); syncScroll();
  });
  let saved;
  try { saved = JSON.parse(localStorage.getItem("matrixlang-workspace")); } catch (_) { saved = null; }
  const requested = new URLSearchParams(location.search).get("example");
  chooseExample(examples.find((item) => item.id === requested) || examples.find((item) => saved && item.id === saved.example) || examples[0]);
  if (!requested && saved) {
    if (contracts.includes(saved.mode)) mode = saved.mode;
    if (stageNames.some(([id]) => id === saved.stage)) stage = saved.stage;
    if (typeof saved.source === "string" && saved.source.length <= 16000) source.value = saved.source;
    if (Number.isInteger(saved.seed) && saved.seed >= 1) seedField.value = String(saved.seed);
    highlight(); render();
  }
  const requestedMode = new URLSearchParams(location.search).get("contract");
  if (contracts.includes(requestedMode)) { mode = requestedMode; render(); }
  const healthController = new AbortController(); const healthTimer = setTimeout(() => healthController.abort(), 2500);
  fetch("api/health", {signal: healthController.signal}).then((response) => response.ok ? response.json() : null).then((health) => {
    live = Boolean(health && health.available && health.compiler === "matrixc" && health.schema >= 2);
  }).catch(() => { live = false; }).finally(() => {
    clearTimeout(healthTimer); $("connection-dot").classList.toggle("connected", live);
    $("connection-label").textContent = live ? "Local compiler ready" : "Recorded examples";
    $("connection-detail").textContent = live ? "Edited source compiles with matrixc on this machine." : "Run make serve to compile edited source and other input seeds.";
    if (!busy) setBusy(false);
  });
})();
