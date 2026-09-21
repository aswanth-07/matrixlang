/* lexer.js -- MatrixLang's scanner, as flex runs it.
 *
 * This is the one part of the demo that is a re-implementation rather than a
 * capture, and it exists so the page can scan text you type. It is written to
 * be flex, not to be like flex:
 *
 *   * the rules are in matrix.l's order, because flex breaks a tie by rule
 *     order and a reordering would be a different scanner;
 *   * at every position every rule is tried and the LONGEST match wins, with
 *     the lowest rule number breaking a tie -- which is why "matrix" is a
 *     keyword and "matrixx" is an identifier;
 *   * the cursor advances exactly as YY_USER_ACTION advances it, a tab
 *     counting as four columns, so a position the page prints is the position
 *     a diagnostic from the real compiler would print.
 *
 * tools/check-demo-engines.py runs this over every program in examples/ and
 * compares the result token for token against `matrixc --tokens`. The page
 * reports what that comparison found; if the two ever disagree the build
 * fails rather than the page quietly drifting.
 *
 * Every rule below carries the number of the matrix.l rule it implements, and
 * verifyAgainst() checks those numbers against the rule table that
 * tools/build-grammar.py reads out of matrix.l, so a rule added to the
 * scanner cannot be forgotten here.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) { module.exports = api; }
  if (root) { root.MatrixLexer = api; }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* The rules of src/frontend/matrix.l, in file order.
   *
   * kind is what the action does: "skip" runs no action, "token" returns one,
   * "error" reports a diagnostic and returns nothing -- the three shapes the
   * scanner's actions actually take. */
  var RULES = [
    { n: 1,  kind: "skip",  re: /[ \t\r\n]+/y,                       what: "whitespace" },
    { n: 2,  kind: "skip",  re: /\/\/[^\n]*/y,                       what: "line comment" },
    { n: 3,  kind: "skip",  re: /\/\*([^*]|\*+[^*/])*\*+\//y,        what: "block comment" },
    { n: 4,  kind: "error", re: /\/\*([^*]|\*+[^*/])*/y,             what: "unterminated block comment",
              message: function () { return "unterminated block comment"; } },

    { n: 5,  kind: "token", re: /matrix/y,    symbol: "KW_MATRIX",    category: "MATRIX" },
    { n: 6,  kind: "token", re: /scalar/y,    symbol: "KW_SCALAR",    category: "SCALAR" },
    { n: 7,  kind: "token", re: /print/y,     symbol: "KW_PRINT",     category: "PRINT" },
    { n: 8,  kind: "token", re: /transpose/y, symbol: "KW_TRANSPOSE", category: "TRANSPOSE" },
    { n: 9,  kind: "token", re: /identity/y,  symbol: "KW_IDENTITY",  category: "IDENTITY" },
    { n: 10, kind: "token", re: /zeros/y,     symbol: "KW_ZEROS",     category: "ZEROS" },
    { n: 11, kind: "token", re: /ones/y,      symbol: "KW_ONES",      category: "ONES" },

    /* {REALLIT} and {INTLIT} expanded. Both return NUMBER; they are two rules
     * because a real and an integer are two patterns, not because the parser
     * can tell them apart. */
    { n: 12, kind: "token", symbol: "NUMBER", category: "NUMBER",
              re: /(?:(?:[0-9]+\.[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?|[0-9]+[eE][+-]?[0-9]+)/y },
    { n: 13, kind: "token", re: /[0-9]+/y,                symbol: "NUMBER", category: "NUMBER" },
    { n: 14, kind: "token", re: /[A-Za-z_][A-Za-z_0-9]*/y, symbol: "IDENT", category: "IDENTIFIER" },

    { n: 15, kind: "token", re: /\+/y, symbol: "'+'", category: "PLUS" },
    { n: 16, kind: "token", re: /-/y,  symbol: "'-'", category: "MINUS" },
    { n: 17, kind: "token", re: /\*/y, symbol: "'*'", category: "MULTIPLY" },
    { n: 18, kind: "token", re: /=/y,  symbol: "'='", category: "ASSIGN" },
    { n: 19, kind: "token", re: /\[/y, symbol: "'['", category: "LBRACKET" },
    { n: 20, kind: "token", re: /\]/y, symbol: "']'", category: "RBRACKET" },
    { n: 21, kind: "token", re: /\(/y, symbol: "'('", category: "LPAREN" },
    { n: 22, kind: "token", re: /\)/y, symbol: "')'", category: "RPAREN" },
    { n: 23, kind: "token", re: /\{/y, symbol: "'{'", category: "LBRACE" },
    { n: 24, kind: "token", re: /\}/y, symbol: "'}'", category: "RBRACE" },
    { n: 25, kind: "token", re: /,/y,  symbol: "','", category: "COMMA" },
    { n: 26, kind: "token", re: /;/y,  symbol: "';'", category: "SEMICOLON" },

    { n: 27, kind: "error", re: /[0-9]+[A-Za-z_][A-Za-z_0-9]*/y,
              what: "malformed number or identifier",
              message: function (t) {
                return "malformed number or identifier '" + t
                     + "' (an identifier may not begin with a digit)";
              } },
    { n: 28, kind: "error", re: /[^\n]/y, what: "illegal character",
              message: function (t) { return "illegal character '" + t + "'"; } }
  ];

  /* The cursor, moved exactly as matrix.l's lex_advance moves it. A tab is
   * four columns, which is the only reason this is not a character count. */
  function advance(pos, text) {
    var line = pos.line, col = pos.col, i;
    for (i = 0; i < text.length; i++) {
      if (text[i] === "\n") { line += 1; col = 1; }
      else if (text[i] === "\t") { col += 4; }
      else { col += 1; }
    }
    return { line: line, col: col };
  }

  /* One scan step: try every rule at this offset, keep the longest match, and
   * break a tie with the lowest rule number. Returning every match rather
   * than just the winner is what lets the page show why the winner won. */
  function candidates(source, offset) {
    var out = [], i, rule, m;
    for (i = 0; i < RULES.length; i++) {
      rule = RULES[i];
      rule.re.lastIndex = offset;
      m = rule.re.exec(source);
      if (m && m[0].length > 0) {
        out.push({ rule: rule.n, length: m[0].length, text: m[0] });
      }
    }
    return out;
  }

  function best(matches) {
    var b = null, i;
    for (i = 0; i < matches.length; i++) {
      if (!b || matches[i].length > b.length) { b = matches[i]; }
    }
    return b;
  }

  /* Scan the whole source.
   *
   * Returns the token stream the parser will read, the diagnostics the
   * scanner reported, and a step-by-step trace of how each one was decided. */
  function scan(source) {
    var tokens = [], errors = [], trace = [];
    var offset = 0, pos = { line: 1, col: 1 };

    while (offset < source.length) {
      var matches = candidates(source, offset);
      var win = best(matches);

      /* Nothing can match only if the source holds a newline that rule 1 did
       * not take, which cannot happen; the guard is here so a future rule
       * change fails loudly instead of spinning. */
      if (!win) {
        errors.push({ line: pos.line, col: pos.col, kind: "lexical",
                      message: "no scanner rule matches here" });
        break;
      }

      var rule = RULES[win.rule - 1];
      var step = {
        offset: offset,
        line: pos.line,
        col: pos.col,
        lexeme: win.text,
        chosen: rule.n,
        kind: rule.kind,
        candidates: matches,
        what: rule.what || rule.category
      };

      if (rule.kind === "token") {
        var token = {
          index: tokens.length + 1,
          symbol: rule.symbol,
          category: rule.category,
          lexeme: win.text,
          line: pos.line,
          col: pos.col,
          offset: offset,
          rule: rule.n
        };
        tokens.push(token);
        step.token = token;
      } else if (rule.kind === "error") {
        var diag = {
          line: pos.line,
          col: pos.col,
          kind: "lexical",
          message: rule.message(win.text)
        };
        errors.push(diag);
        step.error = diag;
      }

      trace.push(step);
      pos = advance(pos, win.text);
      offset += win.text.length;
    }

    /* The parser reads one end-of-input marker after the last token, and the
     * demo shows it, because $end is a symbol the automaton shifts. */
    var eof = {
      index: tokens.length + 1,
      symbol: "$end",
      category: "END",
      lexeme: "",
      line: pos.line,
      col: pos.col,
      offset: source.length,
      rule: null,
      eof: true
    };

    return { tokens: tokens, eof: eof, errors: errors, trace: trace,
             source: source };
  }

  /* Check this table against the one tools/build-grammar.py read out of
   * matrix.l. A rule added to the scanner and not added here would otherwise
   * be invisible until it changed somebody's parse. */
  function verifyAgainst(scannerRules) {
    var problems = [], i, a, b;
    if (scannerRules.length !== RULES.length) {
      problems.push("matrix.l has " + scannerRules.length + " rule(s), "
                    + "lexer.js implements " + RULES.length);
    }
    for (i = 0; i < Math.min(scannerRules.length, RULES.length); i++) {
      a = scannerRules[i];
      b = RULES[i];
      if (a.n !== b.n) {
        problems.push("rule " + (i + 1) + ": numbering disagrees");
      }
      if (a.kind !== b.kind) {
        problems.push("rule " + a.n + " (" + a.pattern + "): matrix.l "
                      + a.kind + ", lexer.js " + b.kind);
      }
      if (a.kind === "token"
          && (a.symbol !== b.symbol || a.category !== b.category)) {
        problems.push("rule " + a.n + " (" + a.pattern + "): matrix.l returns "
                      + a.symbol + "/" + a.category + ", lexer.js returns "
                      + b.symbol + "/" + b.category);
      }
    }
    return problems;
  }

  return { scan: scan, rules: RULES, verifyAgainst: verifyAgainst };
}));
