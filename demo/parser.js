/* parser.js -- the LALR(1) driver, running bison's own table.
 *
 * The algorithm here is the one in every generated yyparse: a stack of
 * states, one token of lookahead, and a table that says shift, reduce, accept
 * or error. What makes the demo worth watching is that the table is not a
 * teaching table written for the occasion -- demo/grammar.js is read out of
 * `bison --report=all` over src/frontend/matrix.y, the same run that produces
 * the parser matrixc is built from. The states the page walks through are the
 * states the compiler walks through, by number.
 *
 * Error recovery is bison's too: pop until a state can shift the `error`
 * token, shift it, then discard input until the parse can continue. That is
 * what makes `stmt: error ';'` report three syntax errors in a file instead
 * of stopping at the first, and the page shows it happening.
 *
 * Every step is recorded rather than printed, so the page can move forwards
 * and backwards through a parse without re-running it.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) { module.exports = api; }
  if (root) { root.MatrixParser = api; }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* How many tokens must be shifted after an error before the parser will
   * report another one. Bison's yyerrstatus, and the reason a file with two
   * adjacent mistakes reports one message and not a cascade. */
  var ERROR_QUIET = 3;

  function ruleText(g, n) {
    var r = g.rules[n];
    return r.lhs + ": " + (r.rhs.length ? r.rhs.join(" ") : "%empty");
  }

  function itemText(g, item) {
    var r = g.rules[item.rule];
    var rhs = r.rhs.slice();
    rhs.splice(item.dot, 0, "•");
    return r.lhs + ": " + (r.rhs.length ? rhs.join(" ") : "• %empty");
  }

  /* The terminals this state has an explicit action for: what bison's verbose
   * error message means by "expecting". */
  function expected(state) {
    return Object.keys(state.actions).filter(function (t) {
      return t !== "error" && state.actions[t].kind !== "error";
    });
  }

  /* Bison's verbose message carries at most five arguments and the first is
   * the token that was not expected, so a state with more than four usable
   * actions is reported without a list rather than with a truncated one.
   * YYERROR_VERBOSE_ARGS_MAXIMUM, in the skeleton. */
  function describeExpected(list) {
    if (!list.length) { return ""; }
    if (list.length > 4) { return ""; }
    if (list.length === 1) { return ", expecting " + list[0]; }
    return ", expecting " + list.slice(0, -1).join(" or ")
         + " or " + list[list.length - 1];
  }

  /* A conflict the precedence declarations settled in this state, if the
   * action about to be taken is one of them. This is the only place the
   * demo can show what %left actually bought. */
  function resolution(state, token, kind) {
    var i;
    for (i = 0; i < state.resolved.length; i++) {
      if (state.resolved[i].token === token && state.resolved[i].as === kind) {
        return state.resolved[i];
      }
    }
    return null;
  }

  function Parse(grammar, tokens, eof) {
    this.g = grammar;
    this.rule = {};
    grammar.rules.forEach(function (r) { this.rule[r.n] = r; }, this);
    this.input = tokens.concat([eof]);
    this.nodes = [];
    this.steps = [];
    this.errors = [];
    this.accepted = false;
    this.shifts = 0;
    this.reduces = 0;
    this.maxDepth = 1;
  }

  Parse.prototype.node = function (sym, terminal, token, rule, children) {
    var n = {
      id: this.nodes.length,
      sym: sym,
      terminal: terminal,
      text: token ? token.lexeme : null,
      line: token ? token.line : null,
      col: token ? token.col : null,
      rule: rule === undefined ? null : rule,
      children: children || []
    };
    this.nodes.push(n);
    return n;
  };

  Parse.prototype.snapshot = function (stack) {
    return stack.map(function (e) {
      return { state: e.state, sym: e.sym, node: e.node };
    });
  };

  Parse.prototype.roots = function (stack) {
    var out = [], i;
    for (i = 0; i < stack.length; i++) {
      if (stack[i].node !== null && stack[i].node !== undefined) {
        out.push(stack[i].node);
      }
    }
    return out;
  };

  Parse.prototype.run = function () {
    var g = this.g;
    var stack = [{ state: 0, sym: null, node: null }];
    var k = 0;                     /* index of the lookahead token */
    var errorStatus = 0;           /* bison's yyerrstatus */
    var guard = 0;

    while (guard++ < 20000) {
      var state = g.states[stack[stack.length - 1].state];
      /* Once $end has been shifted there is nothing further to read: yyparse
       * holds YYEOF as the lookahead rather than calling the scanner again,
       * so the marker stays put. */
      var token = this.input[Math.min(k, this.input.length - 1)];
      var term = token.symbol;
      var action = state.actions[term] || state.default || null;
      var before = this.snapshot(stack);

      /* ---------------------------------------------------------- accept */
      if (action && action.kind === "accept") {
        this.accepted = true;
        this.push({
          kind: "accept", state: state.id, stack: before, after: before,
          lookahead: token, tokenIndex: k,
          headline: "accept",
          detail: "The stack holds the start symbol and the lookahead is "
                + "$end. yyparse returns 0.",
          roots: this.roots(stack)
        });
        break;
      }

      /* ----------------------------------------------------------- shift */
      if (action && action.kind === "shift") {
        var leaf = this.node(term, true, token);
        stack.push({ state: action.to, sym: term, node: leaf });
        this.shifts += 1;
        this.maxDepth = Math.max(this.maxDepth, stack.length);
        if (errorStatus > 0) { errorStatus -= 1; }
        k += 1;

        this.push({
          kind: "shift", state: state.id, stack: before,
          after: this.snapshot(stack),
          lookahead: token, tokenIndex: k - 1,
          to: action.to,
          headline: "shift " + term + ", go to state " + action.to,
          detail: "State " + state.id + " reads " + term
                + " and pushes it with state " + action.to
                + ". The scanner is asked for the next token.",
          resolved: resolution(state, term, "shift"),
          newNode: leaf.id,
          roots: this.roots(stack)
        });
        continue;
      }

      /* ---------------------------------------------------------- reduce */
      if (action && action.kind === "reduce") {
        var rule = this.rule[action.rule];
        var width = rule.rhs.length;
        var popped = stack.splice(stack.length - width, width);
        var children = popped.map(function (e) { return e.node; })
                             .filter(function (n) { return n !== null; });
        var parent = this.node(rule.lhs, false, null, rule.n, children);
        var back = g.states[stack[stack.length - 1].state];
        var to = back.gotos[rule.lhs];

        stack.push({ state: to, sym: rule.lhs, node: parent });
        this.reduces += 1;
        this.maxDepth = Math.max(this.maxDepth, stack.length);

        /* Rule 8 is `stmt: error ';'`, whose action calls yyerrok: the
         * statement resynchronised, so the next mistake is a new one and
         * must be reported. */
        if (rule.rhs[0] === "error") { errorStatus = 0; }

        this.push({
          kind: "reduce", state: state.id, stack: before,
          after: this.snapshot(stack),
          lookahead: token, tokenIndex: k,
          rule: rule.n, width: width,
          popped: popped.map(function (e) { return e.sym; }),
          goto: to,
          headline: "reduce by rule " + rule.n + ": " + ruleText(g, rule.n),
          detail: (width === 0
                    ? "Rule " + rule.n + " is empty, so nothing is popped: "
                      + rule.lhs + " is pushed straight onto the stack"
                    : "Pop " + width + " symbol" + (width === 1 ? "" : "s")
                      + " (" + popped.map(function (e) { return e.sym; }).join(" ")
                      + "), push " + rule.lhs)
                + ", then state " + back.id
                + " goes to state " + to + " on " + rule.lhs + ".",
          byDefault: !state.actions[term] && !!state.default,
          resolved: resolution(state, term, "reduce"),
          newNode: parent.id,
          roots: this.roots(stack)
        });
        continue;
      }

      /* ----------------------------------------------------------- error */
      if (errorStatus === 0) {
        var list = expected(state);
        var message = "syntax error, unexpected " + term
                    + describeExpected(list);
        this.errors.push({ line: token.line, col: token.col,
                           kind: "syntax", message: message });
        this.push({
          kind: "error", state: state.id, stack: before, after: before,
          lookahead: token, tokenIndex: k,
          headline: "syntax error",
          detail: "State " + state.id + " has no action for " + term + ". "
                + "yyerror is called, and the parser enters error recovery.",
          message: message,
          expected: list,
          roots: this.roots(stack)
        });
      }
      errorStatus = ERROR_QUIET;

      /* Pop until a state can shift the `error` token. */
      var recovered = false;
      while (stack.length) {
        var top = g.states[stack[stack.length - 1].state];
        if (top.actions["error"] && top.actions["error"].kind === "shift") {
          var marker = this.node("error", true,
                                 { lexeme: "error", line: token.line,
                                   col: token.col });
          var popBefore = this.snapshot(stack);
          stack.push({ state: top.actions["error"].to, sym: "error",
                       node: marker });
          this.push({
            kind: "recover", state: top.id, stack: popBefore,
            after: this.snapshot(stack),
            lookahead: token, tokenIndex: k,
            to: top.actions["error"].to,
            headline: "shift error, go to state " + top.actions["error"].to,
            detail: "State " + top.id + " can shift the error token, so the "
                  + "parser shifts it and looks for the rest of "
                  + "`stmt: error ';'`.",
            newNode: marker.id,
            roots: this.roots(stack)
          });
          recovered = true;
          break;
        }
        if (stack.length === 1) { break; }
        var dropped = stack.pop();
        this.push({
          kind: "pop", state: top.id, stack: this.snapshot(stack).concat([dropped]),
          after: this.snapshot(stack),
          lookahead: token, tokenIndex: k,
          headline: "pop " + (dropped.sym || "state " + dropped.state),
          detail: "No state on the stack can shift the error token yet, so "
                + "the parser discards this one and looks further down.",
          roots: this.roots(stack)
        });
      }

      if (!recovered) {
        this.push({
          kind: "abort", state: stack.length ? stack[stack.length - 1].state : 0,
          stack: this.snapshot(stack), after: this.snapshot(stack),
          lookahead: token, tokenIndex: k,
          headline: "parse abandoned",
          detail: "The stack was emptied without finding a state that can "
                + "shift the error token, so yyparse returns 1.",
          roots: this.roots(stack)
        });
        break;
      }

      /* Discard input until the new state can act on it. */
      while (k < this.input.length - 1) {
        var look = this.input[k];
        var here = g.states[stack[stack.length - 1].state];
        if (here.actions[look.symbol] || here.default) { break; }
        if (look.symbol === "$end") { break; }
        this.push({
          kind: "discard", state: here.id, stack: this.snapshot(stack),
          after: this.snapshot(stack),
          lookahead: look, tokenIndex: k,
          headline: "discard " + look.symbol,
          detail: "State " + here.id + " cannot act on " + look.symbol
                + ", so the token is thrown away. This is the parser reading "
                + "forward to the semicolon that ends the broken statement.",
          roots: this.roots(stack)
        });
        k += 1;
      }

      if (this.input[Math.min(k, this.input.length - 1)].symbol === "$end"
          && !g.states[stack[stack.length - 1].state].actions["$end"]
          && !g.states[stack[stack.length - 1].state].default) {
        this.push({
          kind: "abort", state: stack[stack.length - 1].state,
          stack: this.snapshot(stack), after: this.snapshot(stack),
          lookahead: this.input[k], tokenIndex: k,
          headline: "parse abandoned at end of input",
          detail: "Recovery ran out of input before it found a token the "
                + "parser could use, so yyparse returns 1.",
          roots: this.roots(stack)
        });
        break;
      }
    }

    return this;
  };

  Parse.prototype.push = function (step) {
    step.i = this.steps.length;
    step.shifts = this.shifts;
    step.reduces = this.reduces;
    this.steps.push(step);
  };

  /* Parse a token stream from lexer.js against the tables in grammar.js. */
  function parse(grammar, scanned) {
    var p = new Parse(grammar, scanned.tokens, scanned.eof).run();
    return {
      accepted: p.accepted,
      steps: p.steps,
      nodes: p.nodes,
      errors: p.errors,
      shifts: p.shifts,
      reduces: p.reduces,
      maxDepth: p.maxDepth,
      states: countStates(p.steps)
    };
  }

  function countStates(steps) {
    var seen = {}, i, j;
    for (i = 0; i < steps.length; i++) {
      for (j = 0; j < steps[i].after.length; j++) {
        seen[steps[i].after[j].state] = true;
      }
    }
    return Object.keys(seen).length;
  }

  return {
    parse: parse,
    ruleText: ruleText,
    itemText: itemText,
    expected: expected
  };
}));
