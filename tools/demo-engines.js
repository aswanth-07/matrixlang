/* demo-engines.js -- run the page's scanner and parser outside the page.
 *
 *     node tools/demo-engines.js FILE.ml
 *
 * Prints the token stream, the syntax verdict and the diagnostics as JSON,
 * so tools/check-demo-engines.py can compare them against what bin/matrixc
 * produced for the same file. Nothing here is used by the page; it exists so
 * the claim the page makes about its engines is a measurement.
 */
"use strict";

var fs = require("fs");
var path = require("path");

var DEMO = path.join(__dirname, "..", "demo");

global.window = global;
/* eslint-disable no-eval */
eval(fs.readFileSync(path.join(DEMO, "grammar.js"), "utf8"));
var Lexer = require(path.join(DEMO, "lexer.js"));
var Parser = require(path.join(DEMO, "parser.js"));

var grammar = global.window.MATRIXLANG_GRAMMAR;

var file = process.argv[2];
if (!file) {
  process.stderr.write("usage: node tools/demo-engines.js FILE.ml\n");
  process.exit(2);
}

var source = fs.readFileSync(file, "utf8");
var scanned = Lexer.scan(source);
var parsed = Parser.parse(grammar, scanned);

var diagnostics = scanned.errors.map(function (e) {
  return { line: e.line, col: e.col, kind: e.kind, message: e.message };
});
parsed.errors.forEach(function (e) {
  diagnostics.push({ line: e.line, col: e.col, kind: e.kind,
                     message: e.message });
});
/* The compiler reports in source order; the scanner and the parser run
 * interleaved, so the two lists have to be merged the same way to compare. */
diagnostics.sort(function (a, b) {
  return a.line - b.line || a.col - b.col;
});

process.stdout.write(JSON.stringify({
  tokens: scanned.tokens.map(function (t) {
    return { category: t.category, lexeme: t.lexeme, line: t.line,
             col: t.col, symbol: t.symbol, rule: t.rule };
  }),
  accepted: parsed.accepted && diagnostics.length === 0,
  diagnostics: diagnostics,
  steps: parsed.steps.length,
  shifts: parsed.shifts,
  reduces: parsed.reduces,
  scannerCheck: Lexer.verifyAgainst(grammar.scanner.rules)
}, null, 1) + "\n");
