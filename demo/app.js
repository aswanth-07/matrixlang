/* app.js -- the demonstration page.
 *
 * Four things live here:
 *
 *   the machine   the scanner and the parser, run one step at a time over
 *                 text you can edit, plus the automaton and the grammar they
 *                 run on. demo/lexer.js and demo/parser.js do the work; this
 *                 file only draws what they recorded.
 *   the walk      captured matrixc output, one flag per phase.
 *   the explorer  the cost model, re-implemented so it can answer as you type.
 *   the evidence  the measurements, read from results/ at build time.
 *
 * Nothing here computes a figure. Anything with a number in it came from
 * demo/data.js, demo/grammar.js or demo/agreement.js, all generated.
 */
(function () {
  "use strict";

  var D = window.MATRIXLANG;
  var G = window.MATRIXLANG_GRAMMAR;
  var A = window.MATRIXLANG_AGREEMENT;
  if (!D || !G) { return; }

  var M = window.MATRIXLANG_MEASURE || D.measurement;

  function el(id) { return document.getElementById(id); }
  function pct(x) { return x.toFixed(1) + "%"; }
  function commas(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

  function make(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (text !== undefined && text !== null) { n.textContent = String(text); }
    return n;
  }
  function clear(node) { while (node.firstChild) { node.removeChild(node.firstChild); } }

  /* ======================================================== the machine ==

     One source, two traces, and four tabs over them. The scanner's trace and
     the parser's trace are separate because they answer different questions
     and have different lengths, but they are driven by the same transport so
     a presenter has one set of controls to learn. */

  var PROGRAMS = D.machine && D.machine.length ? D.machine : D.programs;

  var m = {
    tab: "parse",
    step: { scan: 0, parse: 0 },
    playing: false,
    timer: null,
    speed: 420,
    scan: null,
    parse: null,
    program: 0,
    state: 0,
    visible: false
  };

  function trace() { return m.tab === "scan" ? m.scan.trace : m.parse.steps; }
  function at() { return m.step[m.tab === "scan" ? "scan" : "parse"]; }
  function setAt(i) { m.step[m.tab === "scan" ? "scan" : "parse"] = i; }
  function stepped() { return m.tab === "scan" || m.tab === "parse"; }

  /* ---------------------------------------------------------- recompute - */

  function recompute(keepPosition) {
    var source = el("src").value;
    m.scan = window.MatrixLexer.scan(source);
    m.parse = window.MatrixParser.parse(G, m.scan);

    var maxScan = Math.max(0, m.scan.trace.length - 1);
    var maxParse = Math.max(0, m.parse.steps.length - 1);
    if (keepPosition) {
      m.step.scan = Math.min(m.step.scan, maxScan);
      m.step.parse = Math.min(m.step.parse, maxParse);
    } else {
      m.step.scan = 0;
      m.step.parse = 0;
    }
    drawVerdict();
    draw();
  }

  function drawVerdict() {
    var box = el("verdict-box");
    clear(box);

    var errors = m.scan.errors.concat(m.parse.errors).sort(function (a, b) {
      return a.line - b.line || a.col - b.col;
    });

    var line = make("div", "act " + (errors.length ? "error" : "accept"));
    line.appendChild(make("div", "what",
      errors.length
        ? "REJECTED — " + errors.length + " error"
             + (errors.length === 1 ? "" : "s")
        : "ACCEPTED"));

    var why = make("div", "why");
    why.textContent = m.scan.tokens.length + " token"
      + (m.scan.tokens.length === 1 ? "" : "s") + " · "
      + m.parse.steps.length + " parser step"
      + (m.parse.steps.length === 1 ? "" : "s") + " · "
      + m.parse.shifts + " shift" + (m.parse.shifts === 1 ? "" : "s") + ", "
      + m.parse.reduces + " reduction"
      + (m.parse.reduces === 1 ? "" : "s") + " · "
      + m.parse.states + " state" + (m.parse.states === 1 ? "" : "s")
      + " of " + G.states.length + " visited";
    line.appendChild(why);
    box.appendChild(line);

    if (errors.length) {
      var list = make("div", "rows");
      list.style.marginTop = "12px";
      errors.slice(0, 8).forEach(function (e) {
        var row = make("div");
        row.appendChild(make("span", "d", e.line + ":" + e.col + ": "));
        row.appendChild(make("span", "k", "[" + e.kind + "] "));
        row.appendChild(document.createTextNode(e.message));
        list.appendChild(row);
      });
      if (errors.length > 8) {
        list.appendChild(make("div", "", "... and " + (errors.length - 8) + " more"));
      }
      box.appendChild(list);
    }
  }

  /* ---------------------------------------------------------- transport - */

  function draw() {
    var steps = stepped() ? trace() : [];
    var i = at();
    var last = Math.max(0, steps.length - 1);

    el("t-first").disabled = !stepped() || i <= 0;
    el("t-prev").disabled = !stepped() || i <= 0;
    el("t-next").disabled = !stepped() || i >= last;
    el("t-last").disabled = !stepped() || i >= last;
    el("t-play").disabled = !stepped() || steps.length === 0;
    el("t-play").textContent = m.playing ? "⏸ Pause" : "▶ Play";

    el("t-count").innerHTML = "";
    if (stepped()) {
      el("t-count").appendChild(make("b", "", steps.length ? (i + 1) : 0));
      el("t-count").appendChild(document.createTextNode(" / " + steps.length
        + (m.tab === "scan" ? " scans" : " steps")));
    } else {
      el("t-count").textContent = G.states.length + " states · "
        + G.rules.length + " rules";
    }

    el("t-bar").style.width =
      (stepped() && steps.length ? 100 * (i + 1) / steps.length : 0) + "%";
    el("transport").hidden = !stepped();

    if (m.tab === "scan") { drawScan(); }
    else if (m.tab === "parse") { drawParse(); }
    else if (m.tab === "auto") { drawAutomaton(); }
  }

  function goto(i) {
    var steps = trace();
    if (!steps.length) { return; }
    setAt(Math.max(0, Math.min(steps.length - 1, i)));
    draw();
  }

  function play() {
    if (m.playing) { return stop(); }
    if (at() >= trace().length - 1) { setAt(0); }
    m.playing = true;
    m.timer = setInterval(function () {
      if (at() >= trace().length - 1) { stop(); return; }
      goto(at() + 1);
    }, m.speed);
    draw();
  }

  function stop() {
    m.playing = false;
    if (m.timer) { clearInterval(m.timer); m.timer = null; }
    draw();
  }

  /* --------------------------------------------------- the source, marked -

     The scanner marks the text it is about to consume; the parser marks the
     lexeme of its lookahead. Both are the same three-part render, so it is
     one function. */

  function film(target, from, to, bad) {
    var src = m.scan.source;
    clear(target);
    target.appendChild(make("span", "done", src.slice(0, from)));
    if (to > from) {
      target.appendChild(make("span", "now" + (bad ? " bad" : ""),
                              src.slice(from, to)));
    } else {
      var caret = make("span", "now" + (bad ? " bad" : ""), "▏");
      target.appendChild(caret);
    }
    target.appendChild(make("span", "rest", src.slice(to)));

    var mark = target.querySelector(".now");
    if (mark && mark.scrollIntoView) {
      var top = mark.offsetTop - target.clientHeight / 2;
      target.scrollTop = Math.max(0, top);
    }
  }

  /* ------------------------------------------------------- scanner tab -- */

  function drawScan() {
    var steps = m.scan.trace;
    var s = steps[at()];

    if (!s) {
      film(el("scan-film"), 0, 0, false);
      el("scan-cands").textContent = "";
      clear(el("scan-act"));
      el("scan-act").appendChild(make("div", "what", "nothing to scan"));
      drawStream(-1);
      return;
    }

    film(el("scan-film"), s.offset, s.offset + s.lexeme.length,
         s.kind === "error");

    el("scan-where").textContent = "line " + s.line + ", column " + s.col
      + " · offset " + s.offset;

    var box = el("scan-cands");
    clear(box);
    var sorted = s.candidates.slice().sort(function (a, b) {
      return b.length - a.length || a.rule - b.rule;
    });
    sorted.forEach(function (c) {
      var rule = G.scanner.rules[c.rule - 1];
      var row = make("div", "cand" + (c.rule === s.chosen ? " win" : ""));
      row.appendChild(make("span", "rn", "rule " + c.rule));
      row.appendChild(make("span", "pat", rule ? rule.pattern : "?"));
      row.appendChild(make("span", "len", c.length + " ch"));
      box.appendChild(row);
    });
    if (!sorted.length) { box.appendChild(make("div", "empty", "no rule matches")); }

    var act = el("scan-act");
    clear(act);
    act.className = "act " + (s.kind === "token" ? "shift"
                            : s.kind === "error" ? "error" : "skip");
    if (s.kind === "token") {
      act.appendChild(make("div", "what",
        s.token.category + "  " + JSON.stringify(s.lexeme)));
      act.appendChild(make("div", "why",
        "Rule " + s.chosen + " returns " + s.token.symbol
        + " to the parser, and records the lexeme at " + s.line + ":" + s.col
        + ". This is token " + s.token.index + "."));
    } else if (s.kind === "error") {
      act.appendChild(make("div", "what", s.error.message));
      act.appendChild(make("div", "why",
        "Rule " + s.chosen + " reports a diagnostic and returns nothing, so "
        + "the parser never sees these characters. Scanning continues at the "
        + "next one, which is why one bad character does not end the file."));
    } else {
      act.appendChild(make("div", "what", s.what + ", discarded"));
      act.appendChild(make("div", "why",
        "Rule " + s.chosen + " has no action, so the text is consumed and "
        + "nothing reaches the parser. The cursor still moves over it, which "
        + "is how the next token keeps its true line and column."));
    }

    drawStream(s.token ? s.token.index : -1);
  }

  function drawStream(freshIndex) {
    var pane = el("scan-stream");
    clear(pane);

    var upto = 0, i;
    for (i = 0; i <= at() && i < m.scan.trace.length; i++) {
      if (m.scan.trace[i].token) { upto = m.scan.trace[i].token.index; }
    }

    var table = make("table");
    var head = make("tr");
    ["#", "TOKEN", "LEXEME", "LINE:COL", "RULE"].forEach(function (h) {
      head.appendChild(make("th", "", h));
    });
    table.appendChild(head);

    m.scan.tokens.slice(0, upto).forEach(function (t) {
      var row = make("tr", t.index === freshIndex ? "fresh" : "");
      row.appendChild(make("td", "rl", t.index));
      row.appendChild(make("td", "cat", t.category));
      row.appendChild(make("td", "lex", t.lexeme));
      row.appendChild(make("td", "at", t.line + ":" + t.col));
      row.appendChild(make("td", "rl", t.rule));
      table.appendChild(row);
    });
    pane.appendChild(table);

    if (!upto) {
      pane.appendChild(make("div", "empty", "no tokens produced yet"));
    } else {
      var rows = pane.querySelectorAll("tr");
      var lastRow = rows[rows.length - 1];
      if (lastRow) { pane.scrollTop = Math.max(0, lastRow.offsetTop - pane.clientHeight + 40); }
    }
  }

  /* -------------------------------------------------------- parser tab -- */

  function drawParse() {
    var steps = m.parse.steps;
    var s = steps[at()];

    if (!s) {
      clear(el("parse-stack"));
      clear(el("parse-act"));
      el("parse-act").appendChild(make("div", "what", "nothing to parse"));
      clear(el("parse-queue"));
      clear(el("parse-items"));
      clear(el("parse-rows"));
      clear(el("parse-forest"));
      clear(el("parse-log"));
      film(el("parse-film"), 0, 0, false);
      return;
    }

    /* the source, with the lookahead marked */
    var look = s.lookahead;
    var from = look && look.offset !== undefined ? look.offset : m.scan.source.length;
    film(el("parse-film"), from, from + (look ? look.lexeme.length : 0),
         s.kind === "error" || s.kind === "abort" || s.kind === "discard");

    drawStack(s);
    drawQueue(s);
    drawAction(s);
    drawItems(s);
    drawForest(s);
    drawLog();
  }

  function drawStack(s) {
    var box = el("parse-stack");
    clear(box);
    var doomed = s.kind === "reduce" ? s.width : 0;
    var showing = s.kind === "reduce" ? s.stack : s.after;

    showing.forEach(function (e, i) {
      var cls = "cell " + (e.sym === null ? "base"
                          : e.node && e.node.terminal ? "term" : "nonterm");
      if (s.kind === "reduce" && i >= showing.length - doomed && doomed) {
        cls += " doomed";
      }
      if (s.kind !== "reduce" && s.newNode !== undefined
          && e.node && e.node.id === s.newNode) {
        cls += " fresh";
      }
      var cell = make("div", cls);
      cell.appendChild(make("div", "sym", e.sym === null ? "⊥" : e.sym));
      cell.appendChild(make("div", "st", e.state));
      box.appendChild(cell);
    });

    el("parse-depth").textContent = showing.length + " deep"
      + (s.kind === "reduce" && doomed
          ? " · " + doomed + " about to be popped" : "");
  }

  function drawQueue(s) {
    var box = el("parse-queue");
    clear(box);
    var all = m.scan.tokens.concat([m.scan.eof]);
    var first = Math.max(0, s.tokenIndex - 3);
    var slice = all.slice(first, first + 16);

    if (first > 0) { box.appendChild(make("span", "qtok eaten", "…")); }
    slice.forEach(function (t, j) {
      var idx = first + j;
      var cls = idx < s.tokenIndex ? "qtok eaten"
              : idx === s.tokenIndex ? "qtok look" : "qtok ahead";
      box.appendChild(make("span", cls,
        t.eof ? "$end" : t.lexeme));
    });
    if (first + slice.length < all.length) {
      box.appendChild(make("span", "qtok ahead", "…"));
    }

    el("parse-look").textContent = s.lookahead
      ? s.lookahead.symbol + (s.lookahead.eof ? "" :
          "  ·  " + JSON.stringify(s.lookahead.lexeme)
          + "  at " + s.lookahead.line + ":" + s.lookahead.col)
      : "";
  }

  function drawAction(s) {
    var act = el("parse-act");
    clear(act);
    act.className = "act " + s.kind;
    act.appendChild(make("div", "what", s.headline));
    act.appendChild(make("div", "why", s.message ? s.message : s.detail));
    if (s.message) {
      act.appendChild(make("div", "why", s.detail));
    }

    /* The thing this demo exists to show: where a grammar was ambiguous and
     * a precedence declaration decided it. */
    if (s.resolved) {
      var note = make("div", "callout");
      note.appendChild(document.createTextNode(
        "This was a shift/reduce conflict. Rule " + s.resolved.rule
        + " could have been reduced and " + s.resolved.token
        + " could have been shifted; bison resolved it as "
        + s.resolved.as + ", because of "));
      note.appendChild(make("b", "", s.resolved.why));
      note.appendChild(document.createTextNode(
        ". Without that declaration the grammar would not be LALR(1)."));
      act.appendChild(note);
    }

    if (s.byDefault) {
      var d = make("div", "callout warn");
      d.appendChild(document.createTextNode("This state has no entry for "));
      d.appendChild(make("b", "", s.lookahead.symbol));
      d.appendChild(document.createTextNode(
        ", so the default reduction runs. Bison uses a default to shrink the "
        + "table, which is why an error is sometimes noticed a reduction or "
        + "two after the token that caused it — never before the token, "
        + "so the position it reports is still right."));
      act.appendChild(d);
    }
  }

  function drawItems(s) {
    var state = G.states[s.state];
    var box = el("parse-items");
    clear(box);
    el("parse-state").textContent = "state " + s.state;

    state.items.forEach(function (item) {
      var rule = G.rules[item.rule];
      var row = make("div", item.rule === s.rule ? "hot" : "");
      row.appendChild(make("span", "rn", String(item.rule).padStart(4) + "  "));
      row.appendChild(make("span", "", rule.lhs + ": "));

      var parts = rule.rhs.length ? rule.rhs.slice() : ["%empty"];
      var dot = rule.rhs.length ? item.dot : 0;
      parts.forEach(function (p, j) {
        if (j === dot) { row.appendChild(make("span", "dot", "• ")); }
        row.appendChild(document.createTextNode(p + " "));
      });
      if (dot >= parts.length) { row.appendChild(make("span", "dot", "•")); }
      if (item.lookahead.length) {
        row.appendChild(make("span", "look", "  [" + item.lookahead.join(", ") + "]"));
      }
      box.appendChild(row);
    });

    var rows = el("parse-rows");
    clear(rows);
    Object.keys(state.actions).forEach(function (t) {
      var a = state.actions[t];
      var row = make("div", t === (s.lookahead && s.lookahead.symbol) ? "hot" : "");
      row.appendChild(make("span", "k", t.padEnd(14)));
      if (a.kind === "shift") {
        row.appendChild(make("span", "s", "shift, go to state " + a.to));
      } else if (a.kind === "reduce") {
        row.appendChild(make("span", "r", "reduce using rule " + a.rule));
      } else {
        row.appendChild(make("span", "d", a.kind));
      }
      rows.appendChild(row);
    });
    if (state.default) {
      var drow = make("div");
      drow.appendChild(make("span", "k", "$default".padEnd(14)));
      drow.appendChild(make("span", "d",
        state.default.kind === "accept" ? "accept"
          : "reduce using rule " + state.default.rule));
      rows.appendChild(drow);
    }
    Object.keys(state.gotos).forEach(function (n) {
      var grow = make("div");
      grow.appendChild(make("span", "k", n.padEnd(14)));
      grow.appendChild(make("span", "g", "go to state " + state.gotos[n]));
      rows.appendChild(grow);
    });
  }

  /* The forest on the stack. Each reduction takes k boxes off and puts one
   * box on with those k underneath it, so the tree the parser builds is the
   * tree the audience watches assemble. */

  function treeOf(node, newId, depth) {
    var box = make("div", "tnode" + (node.terminal ? " leaf" : "")
                         + (node.id === newId ? " new" : ""));
    var label = make("div", "tlabel");
    label.appendChild(document.createTextNode(
      node.terminal ? (node.text === "" ? node.sym : node.text) : node.sym));
    if (!node.terminal && node.rule !== null) {
      label.appendChild(make("span", "rn", node.rule));
    }
    box.appendChild(label);

    if (node.children.length && depth < 22) {
      var kids = make("div", "tkids");
      node.children.forEach(function (c) {
        kids.appendChild(treeOf(c, newId, depth + 1));
      });
      box.appendChild(kids);
    }
    return box;
  }

  function drawForest(s) {
    var pane = el("parse-forest");
    clear(pane);
    var forest = make("div", "forest");

    var roots = s.roots || [];
    var shown = roots.length > 14 ? roots.slice(roots.length - 14) : roots;
    if (roots.length > shown.length) {
      forest.appendChild(make("div", "empty",
        (roots.length - shown.length) + " earlier →"));
    }
    shown.forEach(function (n) {
      forest.appendChild(treeOf(n, s.newNode, 0));
    });
    if (!shown.length) {
      forest.appendChild(make("div", "empty",
        "the stack holds no symbols yet"));
    }
    pane.appendChild(forest);

    var fresh = pane.querySelector(".tnode.new");
    if (fresh) {
      pane.scrollLeft = Math.max(0, fresh.offsetLeft - pane.clientWidth / 2);
    }

    el("parse-nodes").textContent = m.parse.nodes.length + " node"
      + (m.parse.nodes.length === 1 ? "" : "s") + " built in all";
  }

  function drawLog() {
    var box = el("parse-log");
    clear(box);
    var i = at();
    var first = Math.max(0, i - 40);

    m.parse.steps.slice(first, i + 1).forEach(function (s, j) {
      var idx = first + j;
      var b = make("button", s.kind + (idx === i ? " on" : ""));
      b.type = "button";
      b.appendChild(make("span", "n", String(idx + 1).padStart(4)));
      b.appendChild(make("span", "t", s.headline));
      b.addEventListener("click", function () { stop(); goto(idx); });
      box.appendChild(b);
    });

    var on = box.querySelector(".on");
    if (on) { box.scrollTop = Math.max(0, on.offsetTop - box.clientHeight + 36); }
  }

  /* ----------------------------------------------------- automaton tab -- */

  function drawAutomaton() {
    var n = Math.max(0, Math.min(G.states.length - 1, m.state));
    var state = G.states[n];
    el("auto-n").value = n;
    el("auto-prev").disabled = n <= 0;
    el("auto-next").disabled = n >= G.states.length - 1;

    var items = el("auto-items");
    clear(items);
    state.items.forEach(function (item) {
      var rule = G.rules[item.rule];
      var row = make("div");
      row.appendChild(make("span", "rn", String(item.rule).padStart(4) + "  "));
      row.appendChild(make("span", "lhs", rule.lhs + ": "));
      var parts = rule.rhs.length ? rule.rhs.slice() : ["%empty"];
      var dot = rule.rhs.length ? item.dot : 0;
      parts.forEach(function (p, j) {
        if (j === dot) { row.appendChild(make("span", "dot", "• ")); }
        row.appendChild(document.createTextNode(p + " "));
      });
      if (dot >= parts.length) { row.appendChild(make("span", "dot", "•")); }
      if (item.lookahead.length) {
        row.appendChild(make("span", "look", "  [" + item.lookahead.join(", ") + "]"));
      }
      items.appendChild(row);
    });

    var rows = el("auto-rows");
    clear(rows);
    Object.keys(state.actions).forEach(function (t) {
      var a = state.actions[t];
      var row = make("div");
      row.appendChild(make("span", "k", t.padEnd(14)));
      row.appendChild(make("span", a.kind === "shift" ? "s" : a.kind === "reduce" ? "r" : "d",
        a.kind === "shift" ? "shift, go to state " + a.to
        : a.kind === "reduce" ? "reduce using rule " + a.rule : a.kind));
      rows.appendChild(row);
    });
    if (state.default) {
      var d = make("div");
      d.appendChild(make("span", "k", "$default".padEnd(14)));
      d.appendChild(make("span", "d", state.default.kind === "accept"
        ? "accept" : "reduce using rule " + state.default.rule));
      rows.appendChild(d);
    }
    Object.keys(state.gotos).forEach(function (t) {
      var row = make("div");
      row.appendChild(make("span", "k", t.padEnd(14)));
      row.appendChild(make("span", "g", "go to state " + state.gotos[t]));
      rows.appendChild(row);
    });
    if (!rows.childNodes.length) {
      rows.appendChild(make("div", "empty", "this state has no actions"));
    }

    var res = el("auto-resolved");
    clear(res);
    if (state.resolved.length) {
      state.resolved.forEach(function (r) {
        var note = make("div", "callout");
        note.appendChild(document.createTextNode(
          "Rule " + r.rule + " against " + r.token + ": resolved as "
          + r.as + " by "));
        note.appendChild(make("b", "", r.why));
        note.appendChild(document.createTextNode("."));
        res.appendChild(note);
      });
    } else {
      res.appendChild(make("div", "empty",
        "No conflict here: the item set decides this state on its own."));
    }
  }

  /* ------------------------------------------------------- grammar tab -- */

  function drawGrammar() {
    var box = el("gram-rules");
    clear(box);
    G.rules.forEach(function (r) {
      var row = make("div");
      row.appendChild(make("span", "rn", String(r.n).padStart(4) + "  "));
      row.appendChild(make("span", "lhs", r.lhs));
      row.appendChild(document.createTextNode(": "));
      if (!r.rhs.length) {
        row.appendChild(make("span", "rn", "%empty"));
      } else {
        r.rhs.forEach(function (sym) {
          var terminal = /^'.*'$/.test(sym) || /^[A-Z]/.test(sym) || sym === "error";
          row.appendChild(make("span", terminal ? "t" : "", sym + " "));
        });
      }
      box.appendChild(row);
    });

    var prec = el("gram-prec");
    clear(prec);
    G.precedence.forEach(function (p) {
      var row = make("div");
      row.appendChild(make("span", "rn", "level " + p.level + "  "));
      row.appendChild(make("span", "lhs", "%" + p.assoc + " "));
      row.appendChild(make("span", "t", p.tokens.join(" ")));
      prec.appendChild(row);
    });
    prec.appendChild(make("div", "", ""));
    prec.appendChild(make("div", "rn",
      "later declarations bind tighter; " + G.conflicts.resolvedByPrecedence
      + " conflicts were resolved by these three lines"));

    var flex = el("gram-flex");
    clear(flex);
    G.scanner.rules.forEach(function (r) {
      var row = make("div");
      row.appendChild(make("span", "rn", String(r.n).padStart(4) + "  "));
      row.appendChild(make("span", "", r.pattern.padEnd(36)));
      row.appendChild(make("span", r.kind === "token" ? "t" : "rn",
        r.kind === "token" ? r.symbol + "  " + r.category
        : r.kind === "error" ? "(diagnostic)" : "(discarded)"));
      flex.appendChild(row);
    });
  }

  /* ------------------------------------------------------------- wiring - */

  function buildMachine() {
    /* sample programs */
    var chooser = el("prog-chooser");
    PROGRAMS.forEach(function (p, i) {
      var b = make("button", "", p.name);
      b.type = "button";
      b.setAttribute("aria-pressed", String(i === m.program));
      b.addEventListener("click", function () {
        m.program = i;
        el("src").value = p.source;
        el("prog-note").textContent = p.blurb || "";
        Array.prototype.forEach.call(chooser.children, function (c, j) {
          c.setAttribute("aria-pressed", String(j === i));
        });
        stop();
        recompute(false);
      });
      chooser.appendChild(b);
    });

    el("src").value = PROGRAMS[0].source;
    el("prog-note").textContent = PROGRAMS[0].blurb || "";
    el("src").addEventListener("input", function () {
      stop();
      recompute(true);
    });

    /* transport */
    el("t-first").addEventListener("click", function () { stop(); goto(0); });
    el("t-prev").addEventListener("click", function () { stop(); goto(at() - 1); });
    el("t-next").addEventListener("click", function () { stop(); goto(at() + 1); });
    el("t-last").addEventListener("click", function () { stop(); goto(trace().length - 1); });
    el("t-play").addEventListener("click", play);
    el("t-speed").addEventListener("input", function () {
      m.speed = 1000 - parseInt(el("t-speed").value, 10);
      if (m.playing) { stop(); play(); }
    });

    /* tabs */
    var TABS = [["scan", "Scanner"], ["parse", "Parser"],
                ["auto", "Automaton"], ["gram", "Grammar"]];
    var tabs = el("mtabs");
    TABS.forEach(function (t) {
      var b = make("button", "", t[1]);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(t[0] === m.tab));
      b.addEventListener("click", function () {
        stop();
        m.tab = t[0];
        Array.prototype.forEach.call(tabs.children, function (c, j) {
          c.setAttribute("aria-selected", String(TABS[j][0] === m.tab));
        });
        ["scan", "parse", "auto", "gram"].forEach(function (name) {
          el("pane-" + name).hidden = name !== m.tab;
        });
        draw();
      });
      tabs.appendChild(b);
    });
    ["scan", "parse", "auto", "gram"].forEach(function (name) {
      el("pane-" + name).hidden = name !== m.tab;
    });

    /* the automaton's own navigation */
    el("auto-n").max = G.states.length - 1;
    el("auto-prev").addEventListener("click", function () { m.state -= 1; drawAutomaton(); });
    el("auto-next").addEventListener("click", function () { m.state += 1; drawAutomaton(); });
    el("auto-n").addEventListener("input", function () {
      m.state = parseInt(el("auto-n").value, 10) || 0;
      drawAutomaton();
    });
    el("auto-here").addEventListener("click", function () {
      var s = m.parse.steps[m.step.parse];
      m.state = s ? s.state : 0;
      drawAutomaton();
    });

    /* presenter mode: bigger type, nothing else */
    el("presenter").addEventListener("click", function () {
      var on = document.body.classList.toggle("presenting");
      el("presenter").setAttribute("aria-pressed", String(on));
    });

    /* keyboard, but only while the machine is on screen and the caret is not
     * in the editor */
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        m.visible = entries[0].isIntersecting;
      }, { rootMargin: "-5% 0px -30% 0px" }).observe(el("machine"));
    }
    document.addEventListener("keydown", function (e) {
      var tag = (e.target.tagName || "").toUpperCase();
      if (tag === "TEXTAREA" || tag === "INPUT") { return; }
      if (!m.visible || !stepped()) { return; }
      if (e.key === " ") { e.preventDefault(); play(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); stop(); goto(at() + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); stop(); goto(at() - 1); }
      else if (e.key === "Home") { e.preventDefault(); stop(); goto(0); }
      else if (e.key === "End") { e.preventDefault(); stop(); goto(trace().length - 1); }
    });

    /* the standing figures */
    el("fact-states").textContent = G.states.length;
    el("fact-rules").textContent = G.rules.length;
    el("fact-conflicts").textContent =
      G.conflicts.shiftReduce + G.conflicts.reduceReduce;
    el("fact-resolved").textContent = G.conflicts.resolvedByPrecedence;
    el("bison-version").textContent = G.bison;

    if (A) {
      el("agreement").textContent =
        "Checked against the compiler: " + commas(A.tokens) + " tokens and "
        + A.diagnostics + " frontend diagnostics over " + A.programs
        + " programs, " + (A.disagreements === 0 ? "with no disagreement"
                          : "with " + A.disagreements + " disagreement(s)") + ".";
    }

    drawGrammar();
    recompute(false);
  }

  buildMachine();

  /* ============================================== the captured phase walk = */

  var PHASES = [
    ["lexical", "lexical"], ["syntax", "syntax"], ["symbols", "symbol table"],
    ["semantic", "semantic"], ["tac", "intermediate"],
    ["optimize", "optimization"], ["target", "target code"],
    ["execute", "execution"]
  ];

  el("hero-flop").textContent = pct(M.flops.median);
  el("hero-instr").textContent = pct(M.instr.median);
  el("hero-note").textContent =
    "Same optimizer. The same " + M.n + " programs. A different question.";

  var progIdx = 1, stageIdx = 5;

  var choice = el("prog-choice");
  D.programs.forEach(function (p, i) {
    var b = make("button", "", p.name);
    b.type = "button";
    b.setAttribute("aria-pressed", String(i === progIdx));
    b.addEventListener("click", function () { progIdx = i; drawPipeline(); });
    choice.appendChild(b);
  });

  var tabs = el("stage-tabs");
  PHASES.forEach(function (ph, i) {
    var b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "tab");
    b.appendChild(make("span", "i", i + 1));
    b.appendChild(document.createTextNode(ph[1]));
    b.addEventListener("click", function () {
      if (b.disabled) { return; }
      stageIdx = i;
      drawPipeline();
    });
    tabs.appendChild(b);
  });

  function drawPipeline() {
    var p = D.programs[progIdx];

    Array.prototype.forEach.call(choice.children, function (b, i) {
      b.setAttribute("aria-pressed", String(i === progIdx));
    });
    el("prog-blurb").textContent = p.blurb;
    el("prog-source").textContent = p.source;
    el("prog-file").textContent = p.file;

    var rejected = p.stages.semantic.status !== 0;
    Array.prototype.forEach.call(tabs.children, function (b, i) {
      var dead = rejected && i > 3;
      b.disabled = dead;
      b.setAttribute("aria-selected", String(i === stageIdx && !dead));
    });
    if (rejected && stageIdx > 3) { stageIdx = 3; drawPipeline(); return; }

    var st = p.stages[PHASES[stageIdx][0]];
    el("stage-cmd").textContent = "$ " + st.command;
    el("stage-out").textContent = st.text;

    var note = st.elided
      ? st.elided + " line(s) of this phase's output are elided above to keep the page short."
      : "";
    if (rejected && stageIdx === 3) {
      note = "The compiler stops here. Nothing downstream of semantic "
           + "analysis runs, so there is no intermediate code, no target code "
           + "and nothing to execute." + (note ? " " + note : "");
    }
    el("stage-note").textContent = note;
  }
  drawPipeline();

  /* ==================================================== the cost explorer = */

  var dims = [100, 2, 100, 2];

  function matmulCost(a, b, c) { return a * c * (2 * b - 1); }

  function leftToRight(d) {
    var total = 0, i;
    for (i = 1; i < d.length - 1; i++) { total += matmulCost(d[0], d[i], d[i + 1]); }
    return total;
  }

  function solve(d) {
    var k = d.length - 1, i, j, s, len;
    var cost = [], split = [];
    for (i = 0; i < k; i++) {
      cost.push(new Array(k).fill(0));
      split.push(new Array(k).fill(0));
    }
    for (len = 2; len <= k; len++) {
      for (i = 0; i + len - 1 < k; i++) {
        j = i + len - 1;
        cost[i][j] = Infinity;
        for (s = i; s < j; s++) {
          var q = cost[i][s] + cost[s + 1][j] + matmulCost(d[i], d[s + 1], d[j + 1]);
          if (q < cost[i][j]) { cost[i][j] = q; split[i][j] = s; }
        }
      }
    }
    return { cost: cost, split: split };
  }

  function name(i) { return String.fromCharCode(65 + i); }

  function render(split, i, j) {
    if (i === j) { return name(i); }
    var s = split[i][j];
    return "(" + render(split, i, s) + " * " + render(split, s + 1, j) + ")";
  }

  function renderLeft(k) {
    var out = name(0), i;
    for (i = 1; i < k; i++) { out = "(" + out + " * " + name(i) + ")"; }
    return out;
  }

  function buildDims() {
    var box = el("dims");
    clear(box);
    dims.forEach(function (v, i) {
      var inp = document.createElement("input");
      inp.type = "number";
      inp.min = "1";
      inp.max = "5000";
      inp.step = "1";
      inp.value = String(v);
      inp.setAttribute("aria-label", "Dimension " + (i + 1));
      inp.addEventListener("input", function () {
        dims[i] = Math.max(1, Math.min(5000, parseInt(inp.value, 10) || 1));
        compute();
      });
      box.appendChild(inp);
      if (i < dims.length - 1) { box.appendChild(make("span", "x", "x")); }
    });
    el("add").disabled = dims.length > 6;
    el("drop").disabled = dims.length < 3;
  }

  function compute() {
    var k = dims.length - 1;
    var lr = leftToRight(dims);
    var r = solve(dims);
    var best = k === 1 ? 0 : r.cost[0][k - 1];
    var top = Math.max(lr, best, 1);

    var shapes = el("shapes");
    clear(shapes);
    for (var i = 0; i < k; i++) {
      var row = make("div");
      row.appendChild(make("b", "", name(i)));
      row.appendChild(document.createTextNode(" " + dims[i] + "x" + dims[i + 1]));
      shapes.appendChild(row);
    }

    el("lr-cost").textContent = commas(lr) + " FLOP";
    el("opt-cost").textContent = commas(best) + " FLOP";
    el("lr-bracket").textContent = renderLeft(k);
    el("opt-bracket").textContent = k === 1 ? name(0) : render(r.split, 0, k - 1);
    el("lr-bar").style.width = (100 * lr / top) + "%";
    el("opt-bar").style.width = (100 * best / top) + "%";

    var saved = lr - best;
    var share = lr > 0 ? 100 * saved / lr : 0;
    var v = el("verdict");
    clear(v);
    if (saved > 0) {
      v.appendChild(document.createTextNode("The compiler re-brackets and removes "));
      v.appendChild(make("b", "", commas(saved) + " FLOP"));
      v.appendChild(document.createTextNode(", which is "));
      v.appendChild(make("b", "", share.toFixed(1) + "%"));
      v.appendChild(document.createTextNode(" of the arithmetic. Both bracketings emit "));
      v.appendChild(make("b", "", k - 1));
      v.appendChild(document.createTextNode(" product" + (k === 2 ? "" : "s")
        + ", so the instruction count does not move and a course project "
        + "reporting instructions would record no change at all."));
      v.style.borderLeftColor = "var(--mint)";
    } else {
      v.textContent = "Left to right is already the cheapest bracketing for "
        + "these shapes, so the compiler leaves the expression alone. About a "
        + "fifth of generated programs land here, and an optimizer that always "
        + "claimed an improvement would be measuring nothing.";
      v.style.borderLeftColor = "var(--gold)";
    }
  }

  el("add").addEventListener("click", function () {
    if (dims.length > 6) { return; }
    dims.push(dims[dims.length - 1] === 2 ? 100 : 2);
    buildDims(); compute();
  });
  el("drop").addEventListener("click", function () {
    if (dims.length < 3) { return; }
    dims.pop();
    buildDims(); compute();
  });

  [
    ["The paper's example", [100, 2, 100, 2]],
    ["Already optimal", [10, 100, 5, 50]],
    ["A five-matrix chain", [40, 20, 300, 10, 250, 15]]
  ].forEach(function (preset) {
    var b = make("button", "", preset[0]);
    b.type = "button";
    b.addEventListener("click", function () {
      dims = preset[1].slice();
      buildDims(); compute();
    });
    el("presets").appendChild(b);
  });

  buildDims();
  compute();

  /* ========================================================== the evidence = */

  el("ev-lede").textContent =
    M.n + " programs from a generator, across two seeds. The corpus was not "
    + "written by whoever wrote the optimizer, which is the point: a corpus "
    + "the author chose can only show that the optimizer runs.";

  var tiles = [
    [pct(M.flops.median), "var(--mint)",
     "median arithmetic removed per program (IQR " + M.flops.q1.toFixed(1)
       + " to " + M.flops.q3.toFixed(1) + ")"],
    [pct(M.instr.median), "var(--coral)",
     "median instructions removed, same programs (IQR " + M.instr.q1.toFixed(1)
       + " to " + M.instr.q3.toFixed(1) + ")"],
    [pct(M.chain.sharePct), "var(--violet)",
     "of programs had a chain worth re-bracketing (" + M.chain.helped
       + " of " + M.chain.total + ")"],
    [M.differential.identical + "/" + M.differential.programs, "var(--mint)",
     "programs printed identical bytes with the optimizer and without"]
  ];
  var tileBox = el("tiles");
  clear(tileBox);
  tiles.forEach(function (t) {
    var tile = make("div", "tile");
    var v = make("div", "v", t[0]);
    v.style.color = t[1];
    tile.appendChild(v);
    tile.appendChild(make("div", "k", t[2]));
    tileBox.appendChild(tile);
  });

  function cdf(values, colour) {
    var n = values.length, pts = [], i;
    var step = Math.max(1, Math.round(n / 120));
    for (i = 0; i < n; i += step) { pts.push([values[i], 100 * i / (n - 1)]); }
    pts.push([values[n - 1], 100]);
    return { pts: pts, colour: colour };
  }

  function drawCdf() {
    var W = 460, H = 260, L = 46, R = 14, T = 14, B = 40;
    var iw = W - L - R, ih = H - T - B;
    var x = function (v) { return L + iw * v / 100; };
    var y = function (v) { return T + ih - ih * v / 100; };
    var s = ['<svg viewBox="0 0 ' + W + " " + H + '" role="img" '
           + 'aria-label="Cumulative distribution of reduction per program, '
           + 'arithmetic against instructions.">'];

    var t;
    for (t = 0; t <= 100; t += 25) {
      s.push('<line x1="' + x(t) + '" y1="' + y(0) + '" x2="' + x(t) + '" y2="'
           + y(100) + '" stroke="#242424" stroke-width="1"/>');
      s.push('<line x1="' + x(0) + '" y1="' + y(t) + '" x2="' + x(100)
           + '" y2="' + y(t) + '" stroke="#242424" stroke-width="1"/>');
      s.push('<text x="' + x(t) + '" y="' + (y(0) + 17)
           + '" fill="#8c8c8c" font-size="10" font-family="JetBrains Mono, monospace" '
           + 'text-anchor="middle">' + t + "%</text>");
      s.push('<text x="' + (x(0) - 8) + '" y="' + (y(t) + 3.5)
           + '" fill="#8c8c8c" font-size="10" font-family="JetBrains Mono, monospace" '
           + 'text-anchor="end">' + t + "%</text>");
    }

    [cdf(M.flopsAll, "#4ade80"), cdf(M.instrAll, "#ef4444")].forEach(function (c) {
      var d = c.pts.map(function (p, i) {
        return (i ? "L" : "M") + x(p[0]).toFixed(1) + " " + y(p[1]).toFixed(1);
      }).join(" ");
      s.push('<path d="' + d + '" fill="none" stroke="' + c.colour
           + '" stroke-width="2.2" stroke-linejoin="round"/>');
    });

    s.push('<text x="' + (L + iw / 2) + '" y="' + (H - 6)
         + '" fill="#8c8c8c" font-size="10.5" font-family="Archivo, sans-serif" '
         + 'text-anchor="middle">reduction on one program</text>');
    s.push('<text transform="translate(12,' + (T + ih / 2) + ') rotate(-90)" '
         + 'fill="#8c8c8c" font-size="10.5" font-family="Archivo, sans-serif" '
         + 'text-anchor="middle">programs at or below</text>');
    s.push("</svg>");
    el("chart-cdf").innerHTML = s.join("");
  }

  function drawBox() {
    var W = 460, H = 260, L = 16, R = 62, T = 30, B = 40;
    var iw = W - L - R, ih = H - T - B;
    var x = function (v) { return L + iw * v / 100; };
    var s = ['<svg viewBox="0 0 ' + W + " " + H + '" role="img" '
           + 'aria-label="Median and interquartile range of reduction, '
           + 'arithmetic against instructions.">'];

    var rows = [
      ["arithmetic removed", M.flops, "#4ade80"],
      ["instructions removed", M.instr, "#ef4444"]
    ];
    rows.forEach(function (r, i) {
      var top = T + i * (ih / 2) + 14;
      s.push('<text x="' + L + '" y="' + top + '" fill="#ffffff" font-size="11.5" '
           + 'font-family="Archivo, sans-serif">' + r[0] + "</text>");
      s.push('<rect x="' + x(0) + '" y="' + (top + 12) + '" width="' + iw
           + '" height="14" rx="3" fill="#242424"/>');
      s.push('<rect x="' + x(r[1].q1) + '" y="' + (top + 12) + '" width="'
           + Math.max(2, x(r[1].q3) - x(r[1].q1)) + '" height="14" rx="3" fill="'
           + r[2] + '" opacity="' + (i ? 0.55 : 1) + '"/>');
      s.push('<rect x="' + (x(r[1].median) - 1.4) + '" y="' + (top + 8)
           + '" width="2.8" height="22" fill="#ffffff"/>');
      s.push('<text x="' + (W - R + 10) + '" y="' + (top + 24)
           + '" fill="' + r[2] + '" font-size="15" font-weight="700" '
           + 'font-family="Spectral, Georgia, serif">' + pct(r[1].median) + "</text>");
      s.push('<text x="' + L + '" y="' + (top + 44)
           + '" fill="#8c8c8c" font-size="10" font-family="JetBrains Mono, monospace">'
           + "IQR " + r[1].q1.toFixed(1) + " to " + r[1].q3.toFixed(1) + "</text>");
    });

    s.push('<text x="' + x(0) + '" y="' + (H - 12)
         + '" fill="#8c8c8c" font-size="10" font-family="JetBrains Mono, monospace">0%</text>');
    s.push('<text x="' + x(100) + '" y="' + (H - 12)
         + '" fill="#8c8c8c" font-size="10" font-family="JetBrains Mono, monospace" '
         + 'text-anchor="end">100%</text>');
    s.push('<text x="' + L + '" y="' + (T - 10)
         + '" fill="#8c8c8c" font-size="10" font-family="Archivo, sans-serif">'
         + "bar = interquartile range, tick = median</text>");
    s.push("</svg>");
    el("chart-box").innerHTML = s.join("");
  }

  drawCdf();
  drawBox();

  var LABEL = ["MatrixLang", "baseline 1", "baseline 2", "baseline 3"];
  var rowBox = el("baseline-rows");
  clear(rowBox);
  D.baselines.forEach(function (b, i) {
    var colour = i === 0 ? "var(--mint)" : "var(--coral)";
    var tr = make("tr", i === 0 ? "me" : "");
    tr.appendChild(make("td", "", LABEL[i]));
    var td = make("td");
    var meter = make("div", "meter");
    var fill = make("i");
    fill.style.width = (100 * b.phases / 8) + "%";
    fill.style.background = colour;
    meter.appendChild(fill);
    td.appendChild(meter);
    tr.appendChild(td);
    tr.appendChild(make("td", "num", b.phases + " / 8"));
    rowBox.appendChild(tr);
  });

  /* ============================================================ the rail = */

  var links = Array.prototype.slice.call(document.querySelectorAll("nav a"));
  var sections = links.map(function (a) {
    return document.getElementById(a.getAttribute("href").slice(1));
  });
  if (window.IntersectionObserver) {
    var seen = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { seen[e.target.id] = e.isIntersecting; });
      for (var i = 0; i < sections.length; i++) {
        if (sections[i] && seen[sections[i].id]) {
          links.forEach(function (a, j) { a.classList.toggle("on", j === i); });
          break;
        }
      }
    }, { rootMargin: "-10% 0px -70% 0px" });
    sections.forEach(function (s) { if (s) { io.observe(s); } });
  }
}());
