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
  const stageNames = [["tokens", "Tokens"], ["ast", "Syntax tree"], ["symbols", "Symbols"],
    ["check", "Shape check"], ["tac", "TAC"], ["optimize", "Optimization"], ["target", "VM code"], ["execute", "Execution"]];
  let example = examples[0], mode = "strict", stage = "check", live = false, busy = false;
  let results = {}, origin = "recorded", revision = 0, compiledSource = "", comparing = false;
  let controller = null;
  const source = $("source");
  const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
  const number = (value) => value == null ? "—" : value.toLocaleString("en-US");
  const normalize = (text) => text.replace(/\r\n/g, "\n");

  function announce(message) {
    $("notice").hidden = !message;
    $("notice").textContent = message;
  }

  function persist() {
    try { localStorage.setItem("matrixlang-workspace", JSON.stringify({example: example.id, source: source.value, mode, stage})); }
    catch (_) { /* Editing remains available when browser storage is disabled. */ }
  }

  function highlight() {
    const pattern = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|\b(?:matrix|scalar|print|transpose|zeros|ones|identity)\b|\b(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
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
    const check = errors.length ? errors.map((error) => `${error.line}:${error.col}: ${error.kind} error: ${error.message}`).join("\n") : "Syntax accepted by the browser parser.\n\nShape checking and execution require the local compiler.\nRun make serve, then compile this source again.";
    return {mode, status: errors.length || !parsed.accepted ? "syntax-error" : "parsed", diagnostics: errors.map((error) => ({...error, column: error.col})), symbols: [], metrics: {tokens: scanned.tokens.length}, comparison: null, execution: "blocked",
      stages: stageNames.map(([id, title]) => ({id, title: id === "ast" ? "Parser trace" : id === "check" ? "Syntax validation (browser)" : title,
        state: ["tokens", "ast", "check"].includes(id) ? "complete" : "blocked",
        text: id === "tokens" ? tokens || "No tokens." : id === "ast" ? trace : id === "check" ? check : "This stage requires the local C compiler. Run make serve, then compile again."}))};
  }

  async function requestCompile(text, contract, signal) {
    const response = await fetch("api/compile", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({source: text, mode: contract}), signal});
    let payload;
    try { payload = await response.json(); } catch (_) { throw new Error("The compiler service is unavailable. Start make serve and try again."); }
    if (!response.ok) throw new Error(payload.error || "Compilation failed. Check the local compiler and try again.");
    return payload;
  }

  async function compile(compare = false) {
    if (busy) return;
    const currentRevision = ++revision, text = source.value, contract = mode;
    controller = new AbortController(); announce(""); setBusy(true);
    try {
      let next = {};
      if (live) {
        next[contract] = await requestCompile(text, contract, controller.signal);
        if (compare) next[contract === "strict" ? "algebraic" : "strict"] = await requestCompile(text, contract === "strict" ? "algebraic" : "strict", controller.signal);
      } else {
        const match = examples.find((item) => normalize(item.source) === normalize(text));
        if (match) next = {...match.captures};
        else {
          next[contract] = browserResult(text); compare = false;
          announce("Browser front end only. Full shape checking, optimization and execution are available with make serve.");
        }
      }
      if (revision !== currentRevision) return;
      results = next;
      origin = live ? "live" : ["parsed", "syntax-error"].includes(results[contract].status) ? "browser" : "recorded";
      compiledSource = text; comparing = compare; render(); persist();
    } catch (error) {
      if (error.name !== "AbortError" && revision === currentRevision) {
        announce(error.message); $("verdict").textContent = "Compile failed"; $("verdict").className = "verdict error";
      }
    } finally { if (revision === currentRevision) setBusy(false); }
  }

  function costTable(result) {
    const metrics = result.metrics;
    if (metrics.before == null) return "";
    return `<table class="cost-table"><thead><tr><th scope="col">Metric</th><th scope="col">Source</th><th scope="col">${mode === "strict" ? "Strict" : "Algebraic"}</th></tr></thead><tbody><tr><td>Modeled arithmetic</td><td>${number(metrics.before)}</td><td>${number(metrics.after)}</td></tr><tr><td>TAC instructions</td><td>${number(metrics.instructionsBefore)}</td><td>${number(metrics.instructionsAfter)}</td></tr></tbody></table>`;
  }

  function renderComparison() {
    const strict = results.strict, algebraic = results.algebraic;
    if (!strict || !algebraic) return;
    const checked = strict.comparison && algebraic.comparison && strict.execution === "complete" && algebraic.execution === "complete";
    const same = checked && strict.comparison.optimized === algebraic.comparison.optimized;
    $("stage-title").textContent = "Numerical contracts"; $("stage-state").textContent = "Exact output";
    $("shape-strip").hidden = $("cost-summary").hidden = $("output").hidden = true;
    $("diagnostic-links").replaceChildren(); $("comparison-panel").hidden = false; $("show-stages").hidden = false;
    $("comparison-panel").innerHTML = `<p class="comparison-summary">${checked ? same ? "Both optimized modes produced identical hexadecimal output for this program." : "The optimized modes produced different hexadecimal output. Algebraic mode permits this numerical change." : "Execution comparison is unavailable for this program. Inspect the diagnostics or reduce its dimensions."}</p><div class="comparison-grid">${[strict, algebraic].map((result) => `<section class="comparison-side ${result.mode === mode ? "selected-contract" : ""}"><h4>${result.mode === "strict" ? "Strict" : "Algebraic"}${result.mode === mode ? '<span class="comparison-active">Selected</span>' : ''}</h4><span class="comparison-label ${result.comparison && !result.comparison.identical ? "different" : ""}">${result.comparison && result.execution === "complete" ? result.comparison.identical ? "Matches source execution" : "Differs from source execution" : "No execution comparison"}</span><pre>${escape(result.comparison && result.execution === "complete" ? result.comparison.optimized || "No printed output." : result.stages.find((item) => item.id === (result.status === "rejected" ? "check" : "execute")).text)}</pre><p>${number(result.metrics.after)} modeled ${result.metrics.after === 1 ? "operation" : "operations"} · ${number(result.metrics.instructionsAfter)} TAC instructions</p></section>`).join("")}</div>`;
    $("result-footnote").textContent = "Hexadecimal output distinguishes binary64 values and signed zero.";
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
    $("strict").setAttribute("aria-pressed", String(mode === "strict"));
    $("algebraic").setAttribute("aria-pressed", String(mode === "algebraic"));
    $("contract-note").textContent = mode === "strict" ? "Strict retains arithmetic order. Algebraic permits rewrites that can change floating-point output." : "Algebraic permits reassociation and identity rewrites. Rounding, signed zero and non-finite output may change.";
    $("result-origin").textContent = origin === "live" ? "Local C compiler · " + mode : origin === "browser" ? "Browser scanner / parser only" : "Recorded C compiler output · " + mode;
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
    $("stage-state").textContent = pending ? "Pending" : selected.state === "blocked" ? "Unavailable" : selected.state === "limited" ? "Execution limited" : selected.state === "error" ? "Error" : "Complete";
    $("show-stages").hidden = true; $("comparison-panel").hidden = true; $("output").hidden = false;
    $("output").textContent = pending ? "Compile this source to inspect its compiler output.\nPrevious results are hidden until compilation completes." : selected.text;
    $("output").classList.toggle("error-output", !pending && (selected.state === "error" || result.status === "syntax-error"));
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
    $("result-footnote").textContent = pending ? "Compile to refresh the evidence for this source." : origin === "live" ? "Output from the local matrixc executable." : origin === "browser" ? "Browser results cover lexical and syntax analysis." : "Captured from matrixc for the unchanged example source.";
    if (comparing && !pending) renderComparison();
    observation(result, pending);
  }

  function observation(result, pending) {
    let title = "Compile the edited source", text = "Results will update after compilation. Select a stage to inspect the compiler's output.";
    if (!pending) {
      if (["rejected", "syntax-error"].includes(result.status)) {
        title = "Compilation stopped at a diagnostic";
        text = result.diagnostics[0] ? result.diagnostics[0].message + ". Correct the source and compile again." : "Resolve the reported errors before code generation and execution.";
      } else if (result.status === "parsed") {
        title = "The browser parsed this source"; text = "Syntax acceptance does not establish valid shapes. Start make serve to use the full C compiler.";
      } else if (result.execution === "error") {
        title = "Execution reported an error"; text = "Inspect the execution output and correct the source before comparing numerical results.";
      } else if (result.comparison && !result.comparison.identical) {
        title = "Algebraic output differs from source execution"; text = "This contract permits floating-point changes. Compare modes to inspect the exact hexadecimal values.";
      } else if (result.metrics.before > result.metrics.after) {
        const removed = result.metrics.before - result.metrics.after;
        title = `${number(removed)} modeled ${removed === 1 ? "operation" : "operations"} removed`;
        text = `${number(result.metrics.before)} → ${number(result.metrics.after)} scalar operations; ${number(result.metrics.instructionsBefore)} → ${number(result.metrics.instructionsAfter)} TAC instructions. These counts do not measure runtime speed.`;
      } else {
        title = result.comparison ? "Optimized execution matches the source for this program" : "Compiler stages complete";
        text = mode === "strict" ? "Strict optimization retains arithmetic order. Compare modes to inspect the algebraic result and its modeled cost." : "No modeled arithmetic reduction for this program. Inspect the stage output or choose Chain ordering.";
      }
    }
    $("observation-title").textContent = title; $("observation-text").textContent = text;
  }

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
  ["strict", "algebraic"].forEach((contract) => $(contract).addEventListener("click", () => {
    if (mode === contract) return;
    mode = contract; revision++; if (controller) controller.abort(); setBusy(false);
    comparing = Boolean(comparing && results.strict && results.algebraic); render(); persist();
  }));
  source.addEventListener("input", () => {
    revision++; if (controller) controller.abort(); setBusy(false); comparing = false; highlight(); render(); persist(); announce("");
  });
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
  $("copy-output").addEventListener("click", () => copy(comparing ? $("comparison-panel").innerText : $("output").textContent));
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
    if (["strict", "algebraic"].includes(saved.mode)) mode = saved.mode;
    if (stageNames.some(([id]) => id === saved.stage)) stage = saved.stage;
    if (typeof saved.source === "string" && saved.source.length <= 16000) source.value = saved.source;
    highlight(); render();
  }
  const healthController = new AbortController(); const healthTimer = setTimeout(() => healthController.abort(), 2500);
  fetch("api/health", {signal: healthController.signal}).then((response) => response.ok ? response.json() : null).then((health) => {
    live = Boolean(health && health.available && health.compiler === "matrixc");
  }).catch(() => { live = false; }).finally(() => {
    clearTimeout(healthTimer); $("connection-dot").classList.toggle("connected", live);
    $("connection-label").textContent = live ? "Local compiler ready" : "Recorded examples";
    $("connection-detail").textContent = live ? "Edited source compiles with matrixc on this machine." : "Run make serve for full compilation of edited source.";
    if (!busy) setBusy(false);
  });
})();
