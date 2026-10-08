/* ------------------------------------------------------------------ *
 * MatrixLang -- implementation review deck.
 *
 * Seven slides on pure black, built for PowerPoint's Morph transition.
 * Morph pairs objects on consecutive slides by name: an object whose
 * name starts with "!!" is the same object on every slide that carries
 * it, so the transition moves, resizes and recolours it instead of
 * fading it out and in again. The actors:
 *
 *   !!brL !!brR    the matrix brackets; they frame each slide's subject
 *   !!cell1..9     nine cells: a 3x3 matrix, the 1x9 compiler pipeline,
 *                  the guarantee matrix, proof steps and fact chips,
 *                  progress tiles and rows, chart panels and result chips,
 *                  and at the end two panels and most of a 3x3 mark
 *   !!k1..3        the three guarantee levels: green, amber and red
 *   !!kl1..3       their labels
 *   !!e1..7        the slide number, written as a one-hot vector
 *   !!logo !!title !!kicker !!repo   the type that carries over
 *   !!p01..12      faint MatrixLang tokens resting in the empty space
 *
 * Every slide's transition is Morph (PowerPoint 2019, 2021 and 365);
 * older versions fall back to a fade. The palette is deliberately quiet:
 * black, white and greys, with muted green, amber and red kept for the
 * three guarantee levels, and no glow or other effects.
 *
 * Build:  node tools/build-review-deck.js docs/submission/MatrixLang-Implementation-Review.pptx
 * Needs:  pptxgenjs and qrcode from npm; pdftoppm (poppler) renders the
 *         paper's pages from paper/matrixlang.pdf.
 * ------------------------------------------------------------------ */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const pptxgen = require("pptxgenjs");
const QRCode = require("qrcode");
const JSZip = require(require.resolve("jszip", { paths: [path.dirname(require.resolve("pptxgenjs"))] }));

const ROOT = path.resolve(process.env.MATRIXLANG_ROOT || path.join(__dirname, ".."));
const OUT = path.resolve(process.argv[2] || path.join(ROOT, "docs/submission/MatrixLang-Implementation-Review.pptx"));
const REPO = "https://github.com/aswanth-07/matrixlang";
const REPO_TEXT = "github.com/aswanth-07/matrixlang";
const PAPER_URL = REPO + "/blob/main/paper/matrixlang.pdf";

const W = 13.333;
const H = 7.5;
const N = 7;

/* ---------------------------------------------------------------- theme */

const THEME = {
  name: "MatrixLang Noir",
  headFontFace: "Segoe UI Semibold",
  bodyFontFace: "Segoe UI",
  colors: {
    dk1: "000000", lt1: "F2F4F3", dk2: "16291F", lt2: "D5DAD7",
    accent1: "52B788", accent2: "D9A54C", accent3: "D96C6C", accent4: "8E9590",
    accent5: "3E8F68", accent6: "16291F", hlink: "52B788", folHlink: "3E8F68",
  },
};
const HEX = THEME.colors;

const MONO = "Consolas";
const SANS = "Segoe UI";
const SEMI = "Segoe UI Semibold";
const HEAVY = "Segoe UI Black";
const MATH = "Cambria";

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.title = "MatrixLang: implementation review";
pres.subject = "A dimension-aware compiler that proves which floating-point guarantee each optimization keeps";
pres.author = "A Aswanth Raj";
pres.company = "School of Computer Science and Engineering, VIT Vellore";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };

const SC = pres.SchemeColor;
const P = {
  white: SC.background1, ink: SC.background2, green: SC.accent1, amber: SC.accent2,
  red: SC.accent3, gray: SC.accent4, green2: SC.accent5, deep: SC.accent6, black: SC.text1,
};
// Shades the theme has no slot for.
const T = {
  dim: "4A514D", faint: "242A27", line: "1F2523", panel: "0A0C0B", well: "070908",
  green3: "3F6F57", greenTint: "0F1D16", amberTint: "211A0E", redTint: "211212", keptTint: "0B0D0C",
  newFill: "0D1712", rowFill: "0D1110",
};
const CODE = { builtin: "9CC9B2", domain: "7DB597", number: "D5DAD7", ident: "E6EAE8", punct: "8E9590", comment: "5C6560" };

const LEVEL = [
  { name: "bit-identical", color: P.green, hex: HEX.accent1, tint: T.greenTint },
  { name: "bound-preserving", color: P.amber, hex: HEX.accent2, tint: T.amberTint },
  { name: "relaxed", color: P.red, hex: HEX.accent3, tint: T.redTint },
];

/* ---------------------------------------------------------------- layouts */

pres.defineSlideMaster({
  title: "MX_TITLE",
  background: { color: "000000" },
  objects: [{ placeholder: { options: {
    name: "title", type: "title", x: 0.71, y: 1.42, w: 7.4, h: 1.45, margin: 0,
    fontFace: HEAVY, fontSize: 80, color: P.white, valign: "middle", align: "left",
  }, text: "" } }],
});
pres.defineSlideMaster({
  title: "MX_CONTENT",
  background: { color: "000000" },
  objects: [{ placeholder: { options: {
    name: "title", type: "title", x: 0.75, y: 0.74, w: 10.2, h: 0.72, margin: 0,
    fontFace: SEMI, fontSize: 30, color: P.white, valign: "top", align: "left",
  }, text: "" } }],
});
pres.defineSlideMaster({
  title: "MX_CLOSE",
  background: { color: "000000" },
  objects: [{ placeholder: { options: {
    name: "title", type: "title", x: 1.2, y: 1.36, w: 7.5, h: 1.5, margin: 0,
    fontFace: HEAVY, fontSize: 96, color: P.white, valign: "middle", align: "left",
  }, text: "" } }],
});

/* ---------------------------------------------------------------- helpers */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lerpHex(a, b, t) {
  const pa = [0, 2, 4].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [0, 2, 4].map((i) => parseInt(b.slice(i, i + 2), 16));
  return pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("").toUpperCase();
}

// Every object a slide shows at rest reserves its box, so that the drifting
// tokens added last land only in empty space.
const reserved = Array.from({ length: N }, () => []);
function reserve(si, x, y, w, h) { reserved[si].push({ x, y, w, h }); }

function text(slide, si, content, o) {
  const opts = Object.assign({ margin: 0, isTextBox: true, valign: "top", fontFace: SANS, fontSize: 14, color: P.ink }, o);
  const keep = opts.reserve !== false;
  delete opts.reserve;
  if (keep) reserve(si, opts.x, opts.y, opts.w, opts.h);
  slide.addText(content, opts);
}

function panel(slide, si, x, y, w, h, o = {}) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: o.radius || 0.08,
    fill: { color: o.fill || T.panel }, line: { color: o.line || T.line, width: 0.75 },
    objectName: o.name,
  });
  reserve(si, x, y, w, h);
}

// Square matrix brackets, from the left edge of the left one to the right
// edge of the right one.
function brackets(slide, si, x1, x2, y, h, o = {}) {
  const arm = Math.max(0.18, Math.min(0.3, h * 0.09));
  const line = { color: P.green2, width: o.width || 1.75 };
  slide.addShape(pres.shapes.CUSTOM_GEOMETRY, {
    x: x1, y, w: arm, h, line: Object.assign({}, line), objectName: "!!brL",
    points: [{ x: arm, y: 0 }, { x: 0, y: 0 }, { x: 0, y: h }, { x: arm, y: h }],
  });
  slide.addShape(pres.shapes.CUSTOM_GEOMETRY, {
    x: x2 - arm, y, w: arm, h, line: Object.assign({}, line), objectName: "!!brR",
    points: [{ x: 0, y: 0 }, { x: arm, y: 0 }, { x: arm, y: h }, { x: 0, y: h }],
  });
  reserve(si, x1, y, x2 - x1, h);
}

// A downward brace under a group of pipeline cells.
function brace(slide, si, x, y, w) {
  slide.addShape(pres.shapes.CUSTOM_GEOMETRY, {
    x, y, w, h: 0.08, line: { color: T.dim, width: 1 },
    points: [{ x: 0, y: 0 }, { x: 0, y: 0.08 }, { x: w, y: 0.08 }, { x: w, y: 0 }],
  });
  reserve(si, x, y, w, 0.08);
}

function cell(slide, si, i, x, y, w, h, runs, o = {}) {
  const opts = {
    shape: pres.shapes.ROUNDED_RECTANGLE, x, y, w, h, rectRadius: o.radius === undefined ? 0.06 : o.radius,
    fill: { color: o.fill || T.panel },
    line: o.line ? { color: o.line, width: o.lineWidth || 0.75 } : { type: "none" },
    objectName: `!!cell${i}`, margin: o.margin === undefined ? [6, 6, 5, 6] : o.margin,
    valign: o.valign || "top", align: o.align || "left",
    fontFace: SANS, fontSize: 12, color: P.ink,
  };
  slide.addText(runs, opts);
  reserve(si, x, y, w, h);
}

// One of the three guarantee levels: a dot, a pill or a tile outline.
function actor(slide, si, k, x, y, w, h, o = {}) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: o.radius === undefined ? Math.min(w, h) / 2 : o.radius,
    fill: { color: o.fill || LEVEL[k].color },
    line: o.line ? { color: o.line, width: 1 } : { type: "none" },
    objectName: `!!k${k + 1}`,
  });
  reserve(si, x, y, w, h);
}

function kicker(slide, si, s) {
  text(slide, si, s, {
    x: 0.75, y: 0.38, w: 9.6, h: 0.3, fontFace: MONO, fontSize: 12, color: P.green,
    charSpacing: 1.5, valign: "middle", objectName: "!!kicker",
  });
}

function title(slide, si, s) {
  slide.addText(s, { placeholder: "title", objectName: "!!title" });
  reserve(si, 0.75, 0.74, 10.2, 0.72);
}

// The slide number as a one-hot vector: [0 0 1 0 0 0 0] on the third slide.
function progress(slide, si) {
  const y = 0.38, h = 0.3, x0 = 11.31, step = 0.165;
  const small = { color: T.dim, width: 1 };
  slide.addShape(pres.shapes.CUSTOM_GEOMETRY, {
    x: 11.2, y: y + 0.01, w: 0.06, h: 0.28, line: Object.assign({}, small), objectName: "!!vL",
    points: [{ x: 0.06, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0.28 }, { x: 0.06, y: 0.28 }],
  });
  slide.addShape(pres.shapes.CUSTOM_GEOMETRY, {
    x: 12.52, y: y + 0.01, w: 0.06, h: 0.28, line: Object.assign({}, small), objectName: "!!vR",
    points: [{ x: 0, y: 0 }, { x: 0.06, y: 0 }, { x: 0.06, y: 0.28 }, { x: 0, y: 0.28 }],
  });
  for (let i = 0; i < N; i++) {
    const on = i === si;
    slide.addText(on ? "1" : "0", {
      x: x0 + i * step, y, w: 0.16, h, margin: 0, isTextBox: true, align: "center", valign: "middle",
      fontFace: MONO, fontSize: 12, bold: on, color: on ? P.green : T.dim, objectName: `!!e${i + 1}`,
    });
  }
  reserve(si, 11.2, y, 1.38, h);
}

function logoRuns() {
  return [
    { text: "Matrix", options: { color: P.white } },
    { text: "Lang", options: { color: P.green } },
  ];
}

function repoLink(slide, si, o) {
  text(slide, si, [{ text: REPO_TEXT, options: { hyperlink: { url: REPO, tooltip: "Open the MatrixLang repository" }, color: P.green } }],
    Object.assign({ fontFace: MONO, fontSize: 11, valign: "middle", objectName: "!!repo" }, o));
}

function footer(slide, si) {
  text(slide, si, logoRuns(), { x: 0.75, y: 6.98, w: 2.2, h: 0.3, fontFace: HEAVY, fontSize: 13, valign: "middle", objectName: "!!logo" });
  repoLink(slide, si, { x: 8.38, y: 6.98, w: 4.2, h: 0.3, align: "right" });
}

// MatrixLang source, coloured: keywords green, builtins and domains in paler
// greens, identifiers white, punctuation grey.
function mlRuns(lines, size) {
  const runs = [];
  const re = /(\/\/.*$)|\b(matrix|scalar|print)\b|\b(input|identity|zeros|ones|transpose)\b|\b(bool|uint8|int8|uint16|int16|int32|int|real)\b|(\d[\d,.]*)|([A-Za-z_]\w*)|(\s+)|(.)/g;
  lines.forEach((line, li) => {
    const parts = [];
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(line)) !== null) {
      let color = CODE.punct;
      if (m[1]) color = CODE.comment;
      else if (m[2]) color = HEX.accent1;
      else if (m[3]) color = CODE.builtin;
      else if (m[4]) color = CODE.domain;
      else if (m[5]) color = CODE.number;
      else if (m[6]) color = CODE.ident;
      parts.push({ text: m[0], options: { color, fontFace: MONO, fontSize: size } });
    }
    if (parts.length === 0) parts.push({ text: " ", options: { fontFace: MONO, fontSize: size } });
    if (li < lines.length - 1) parts[parts.length - 1].options.breakLine = true;
    runs.push(...parts);
  });
  return runs;
}

function run(s, o) { return { text: s, options: Object.assign({}, o) }; }

// Non-breaking hyphens, so that -ffast-math and low-rank never break across lines.
function NB(s) { return s.replace(/-(?=[A-Za-z])/g, "\u2011"); }

/* ---------------------------------------------------------------- slide 1: title */

const slides = [];

function slide1() {
  const si = 0;
  const s = pres.addSlide({ masterName: "MX_TITLE", sectionTitle: "Opening" });
  slides.push(s);
  kicker(s, si, "IMPLEMENTATION REVIEW  //  COMPILER DESIGN LAB");
  progress(s, si);

  s.addText(logoRuns(), { placeholder: "title", objectName: "!!logo" });
  reserve(si, 0.68, 1.42, 7.0, 1.45);
  text(s, si, [
    run("A dimension-aware compiler that "),
    run("proves", { color: P.green, bold: true }),
    run(" which floating-point guarantee every optimization keeps"),
  ], { x: 0.75, y: 2.95, w: 7.3, h: 0.95, fontSize: 20, color: P.ink });

  const legend = [[0.78, 1.45], [2.72, 1.8], [5.0, 1.0]];
  LEVEL.forEach((L, k) => {
    const [x, lw] = legend[k];
    actor(s, si, k, x, 4.315, 0.17, 0.17);
    text(s, si, L.name, { x: x + 0.27, y: 4.21, w: lw, h: 0.38, fontFace: MONO, fontSize: 12, color: P.ink, valign: "middle", objectName: `!!kl${k + 1}` });
  });

  // A 3x3 matrix whose meaning slide 3 reveals: the cost of R = A*B*C under
  // three input domains and three contracts.
  brackets(s, si, 8.45, 12.58, 1.42, 3.25);
  const cw = 1.03, ch = 0.89, x0 = 8.87, y0 = 1.59;
  const M = [["556", "556", "556"], ["11,120", "556", "556"], ["11,120", "11,120", "556"]];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const v = M[r][c], cheap = v === "556";
      cell(s, si, r * 3 + c + 1, x0 + c * (cw + 0.1), y0 + r * (ch + 0.12), cw, ch,
        [run(v, { fontFace: MONO, fontSize: 18, bold: cheap, color: cheap ? P.green : T.dim })],
        { fill: T.well, align: "center", valign: "middle", margin: 0 });
    }
  }
  text(s, si, "// remember this matrix", { x: 8.45, y: 4.8, w: 4.13, h: 0.3, fontFace: MONO, fontSize: 11, color: T.green3, align: "center" });

  const people = [
    { x: 0.75, label: "SUBMITTED BY", name: "A Aswanth Raj", sub: "24BAI0044" },
    { x: 4.75, label: "SUPERVISOR", name: "Dr. Ranjithkumar S", sub: "SCOPE, VIT Vellore" },
    { x: 8.75, label: "COURSE", name: "Compiler Design Lab", sub: "BCSE307P" },
  ];
  people.forEach((p) => {
    text(s, si, p.label, { x: p.x, y: 5.28, w: 3.7, h: 0.25, fontFace: MONO, fontSize: 10.5, color: P.green2, charSpacing: 2 });
    text(s, si, p.name, { x: p.x, y: 5.55, w: 3.8, h: 0.42, fontFace: SEMI, fontSize: 20, color: P.white });
    text(s, si, p.sub, { x: p.x, y: 5.98, w: 3.7, h: 0.28, fontFace: MONO, fontSize: 12, color: P.gray });
  });

  repoLink(s, si, { x: 0.75, y: 6.82, w: 4.6, h: 0.32, fontSize: 13 });
  text(s, si, "School of Computer Science and Engineering  ·  VIT Vellore", {
    x: 6.2, y: 6.82, w: 6.38, h: 0.32, fontSize: 11, color: P.gray, align: "right", valign: "middle",
  });
  s.addNotes(NOTES[0]);
}

/* ---------------------------------------------------------------- slide 2: the compiler */

function slide2() {
  const si = 1;
  const s = pres.addSlide({ masterName: "MX_CONTENT", sectionTitle: "Implementation" });
  slides.push(s);
  kicker(s, si, "01 // THE COMPILER");
  title(s, si, "Nine stages, from source text to certified C");
  progress(s, si);
  footer(s, si);

  brackets(s, si, 0.75, 12.58, 1.68, 1.5);
  const STAGES = [
    ["Scanner", "matrix.l", false], ["Parser", "matrix.y", false], ["Shape types", "types.c", false],
    ["Semantics", "semantic.c", false], ["Input domains", "domain.c", true], ["Three-address code", "tac.c", false],
    ["Facts and contracts", "facts.c", true], ["Stack VM", "vm.c", false], ["Certified C", "emit_c.c", true],
  ];
  const x0 = 1.12, cw = 1.152, gap = 0.09, y = 1.79, ch = 1.28;
  const cx = (i) => x0 + i * (cw + gap);
  STAGES.forEach(([name, file, fresh], i) => {
    cell(s, si, i + 1, cx(i), y, cw, ch, [
      run(String(i + 1).padStart(2, "0"), { fontFace: MONO, fontSize: 10, color: fresh ? P.green : P.gray, breakLine: true }),
      run(name, { fontFace: SEMI, fontSize: 13, color: P.white, breakLine: true, paraSpaceBefore: 3 }),
      run(file, { fontFace: MONO, fontSize: 10, color: fresh ? P.green2 : P.gray, paraSpaceBefore: 3 }),
    ], { fill: fresh ? T.newFill : T.panel, line: fresh ? P.green2 : T.line, lineWidth: fresh ? 1 : 0.75, margin: [7, 5, 6, 7] });
    if (fresh) {
      text(s, si, "NEW", { x: cx(i) + cw - 0.52, y: y + 0.08, w: 0.44, h: 0.2, fontFace: MONO, fontSize: 10, bold: true, color: P.green, align: "right", reserve: false });
    }
  });
  // The three guarantee levels live in the optimizer.
  for (let k = 0; k < 3; k++) actor(s, si, k, cx(6) + cw - 0.62 + k * 0.17, y + ch - 0.24, 0.12, 0.12);

  const groups = [["FRONT END", 0, 4], ["MIDDLE END", 5, 6], ["BACK ENDS", 7, 8]];
  groups.forEach(([label, a, b]) => {
    const gx = cx(a), gw = cx(b) + cw - cx(a);
    brace(s, si, gx, 3.28, gw);
    text(s, si, label, { x: gx, y: 3.4, w: gw, h: 0.24, fontFace: MONO, fontSize: 10.5, color: P.gray, align: "center", charSpacing: 2 });
  });

  panel(s, si, 0.75, 3.8, 4.95, 2.48);
  text(s, si, "source  ·  chain.ml", { x: 0.97, y: 3.92, w: 4.5, h: 0.26, fontFace: MONO, fontSize: 11, color: P.gray, reserve: false });
  text(s, si, mlRuns([
    "matrix A[40,2] = input(int8);",
    "matrix B[2,40] = input(int8);",
    "matrix C[40,2] = input(int8);",
    "matrix R = A * B * C;  // 40x2",
    "print(R);",
  ], 14), { x: 0.97, y: 4.3, w: 4.6, h: 1.8, lineSpacingMultiple: 1.12, reserve: false });

  panel(s, si, 5.95, 3.8, 6.63, 2.48);
  text(s, si, "$ matrixc --explain --certificate chain.ml", { x: 6.17, y: 3.92, w: 6.2, h: 0.26, fontFace: MONO, fontSize: 11, color: P.gray, reserve: false });
  const o = { fontFace: MONO, fontSize: 12.5 };
  const g = (s2, extra) => run(s2, Object.assign({}, o, { color: P.gray }, extra));
  const wv = (s2, extra) => run(s2, Object.assign({}, o, { color: P.white }, extra));
  const gr = (s2, extra) => run(s2, Object.assign({}, o, { color: P.green }, extra));
  text(s, si, [
    g("chain order  "), wv("A * B * C"), g("  ->  "), gr("A * (B * C)", { breakLine: true }),
    g("             "), g("11,120"), g(" -> "), gr("556", { bold: true }), g(" operations, "), wv("-95.0%", { breakLine: true }),
    g(" ", { breakLine: true }),
    g("Contract: strict", { breakLine: true }),
    g("  1. "), gr("bit-identical", { bold: true }), g("   "), wv("print(R)", { breakLine: true }),
    g("     every intermediate of every bracketing", { breakLine: true }),
    g("     needs at most "), wv("28"), g(" of "), wv("53"), g(" significand bits"),
  ], { x: 6.17, y: 4.3, w: 6.25, h: 1.85, lineSpacingMultiple: 1.08, reserve: false });

  text(s, si, "7,700 lines of C11, Flex and Bison  ·  34 flags expose every stage  ·  a browser workspace shows them side by side  ·  make test passes", {
    x: 0.75, y: 6.43, w: 11.83, h: 0.3, fontSize: 12, color: P.gray,
  });
  s.addNotes(NOTES[1]);
}

/* ---------------------------------------------------------------- slide 3: the idea */

function slide3() {
  const si = 2;
  const s = pres.addSlide({ masterName: "MX_CONTENT", sectionTitle: "Implementation" });
  slides.push(s);
  kicker(s, si, "02 // THE IDEA");
  title(s, si, "One fast-math switch hides three guarantees");
  progress(s, si);
  footer(s, si);

  text(s, si, [
    run("Floating-point addition is not associative, so reordering A·B·C can change its bits. Compilers offer one switch, strict IEEE or "),
    run(NB("-ffast-math"), { fontFace: MONO, color: P.white }),
    run(". "),
    run("A switch says what the compiler may do, never what the result is.", { color: P.white, bold: true }),
  ], { x: 0.75, y: 1.72, w: 4.45, h: 1.55, fontSize: 15, color: P.ink });

  text(s, si, "THREE GUARANTEES, WEAKEST LAST", { x: 0.75, y: 3.45, w: 4.4, h: 0.28, fontFace: MONO, fontSize: 11, color: P.green, charSpacing: 1.5 });
  const defs = [
    "Same bits as the unoptimized program, for every input in the declared domains.",
    "Within the source order's worst-case error bound; NaN and Inf unchanged.",
    "Equal only over the real numbers.",
  ];
  defs.forEach((d, k) => {
    const y = 3.84 + k * 0.9;
    s.addShape(pres.shapes.OVAL, { x: 0.78, y: y + 0.09, w: 0.15, h: 0.15, fill: { color: LEVEL[k].color }, line: { type: "none" } });
    reserve(si, 0.78, y + 0.09, 0.15, 0.15);
    text(s, si, LEVEL[k].name, { x: 1.06, y, w: 4.1, h: 0.32, fontFace: SEMI, fontSize: 15, color: LEVEL[k].color });
    text(s, si, d, { x: 1.06, y: y + 0.32, w: 4.1, h: 0.52, fontSize: 14, color: P.ink });
  });

  // The matrix from slide 1, now with its rows and columns named.
  const x0 = 7.33, cw = 1.55, gap = 0.1, cx = (c) => x0 + c * (cw + gap);
  const flags = ["--fp-strict", "--fp-bounded", "--fp-algebraic"];
  flags.forEach((f, k) => {
    actor(s, si, k, cx(k), 1.72, cw, 0.42, { radius: 0.21, fill: LEVEL[k].tint, line: LEVEL[k].color });
    text(s, si, f, { x: cx(k), y: 1.72, w: cw, h: 0.42, fontFace: MONO, fontSize: 12, bold: true, color: LEVEL[k].color, align: "center", valign: "middle", objectName: `!!kl${k + 1}` });
  });
  brackets(s, si, 6.95, 12.58, 2.28, 3.44);
  const rows = ["input(int8)", "input(real(1))", "input(real)"];
  const M = [
    [["556", 0], ["556", 0], ["556", 0]],
    [["11,120", -1], ["556", 1], ["556", 1]],
    [["11,120", -1], ["11,120", -1], ["556", 2]],
  ];
  rows.forEach((r, ri) => {
    const y = 2.4 + ri * 1.1;
    text(s, si, r, { x: 5.3, y, w: 1.52, h: 1.0, fontFace: MONO, fontSize: 12.5, color: P.ink, align: "right", valign: "middle" });
    M[ri].forEach(([v, lv], ci) => {
      const kept = lv < 0;
      const L = kept ? null : LEVEL[lv];
      cell(s, si, ri * 3 + ci + 1, cx(ci), y, cw, 1.0, [
        run(v, { fontFace: MONO, fontSize: 24, bold: true, color: kept ? P.gray : L.color, breakLine: true }),
        run(kept ? "kept order" : L.name, { fontFace: MONO, fontSize: 10.5, color: kept ? P.gray : P.ink, paraSpaceBefore: 2 }),
      ], { fill: kept ? T.keptTint : L.tint, line: kept ? T.faint : L.color, lineWidth: 0.75, align: "center", valign: "middle", margin: [3, 3, 3, 3] });
    });
  });
  text(s, si, "Operations left after optimization, and the certificate of print(R), as matrixc reports them for R = A·B·C with shapes 40×2, 2×40 and 40×2.", {
    x: 6.95, y: 5.86, w: 5.63, h: 0.55, fontSize: 12, color: P.gray,
  });
  s.addNotes(NOTES[2]);
}

/* ---------------------------------------------------------------- slide 4: the proofs */

function slide4() {
  const si = 3;
  const s = pres.addSlide({ masterName: "MX_CONTENT", sectionTitle: "Implementation" });
  slides.push(s);
  kicker(s, si, "03 // THE PROOFS");
  title(s, si, "Domains in, proofs through, certificates out");
  progress(s, si);
  footer(s, si);

  const step = (n, label) => run(`${n}  ${label}`, { fontFace: MONO, fontSize: 11, bold: true, color: P.green, charSpacing: 1.5, breakLine: true });
  const say = (t2, extra) => run(t2, Object.assign({ fontFace: SANS, fontSize: 12.5, color: P.gray, paraSpaceBefore: 4 }, extra));
  const cardOpts = { fill: T.panel, line: T.line, margin: [12, 10, 8, 9] };

  const decl = mlRuns(["matrix A[40,2] = input(int8);"], 13);
  decl[0].options.paraSpaceBefore = 4;
  decl[decl.length - 1].options.breakLine = true;
  cell(s, si, 1, 0.75, 1.72, 5.6, 0.95, [step(1, "DECLARE"), ...decl, say("Checked against its domain at load time, before execution.")], cardOpts);

  cell(s, si, 2, 0.75, 2.79, 5.6, 1.35, [
    step(2, "TRACK FACTS"),
    say("Each entry is a multiple of 2"), run("g", { fontFace: SANS, fontSize: 12.5, color: P.gray, superscript: true }),
    run(", at most m in size. For int8:", { fontFace: SANS, fontSize: 12.5, color: P.gray }),
  ], cardOpts);
  const facts = ["g = 0", "m = 128", "finite", "signed", "no -0"];
  facts.forEach((f, j) => {
    const neg = f === "signed";
    cell(s, si, 5 + j, 0.95 + j * 1.06, 3.62, 0.96, 0.38, [run(f, { fontFace: MONO, fontSize: 11, color: neg ? P.gray : P.green })],
      { fill: neg ? T.keptTint : T.greenTint, line: neg ? T.faint : T.green3, align: "center", valign: "middle", margin: 0, radius: 0.19 });
  });

  const rule = { fontFace: MONO, fontSize: 10.5, paraSpaceBefore: 5 };
  cell(s, si, 3, 0.75, 4.26, 5.6, 0.95, [
    step(3, "PROVE"), say("Two theorems give each value-changing rewrite its level:", { breakLine: true }),
    run("T1 ", Object.assign({ color: P.gray }, rule)), run("bit-identical", Object.assign({}, rule, { color: P.green, paraSpaceBefore: 0 })),
    run("   T2 ", Object.assign({}, rule, { color: P.gray, paraSpaceBefore: 0 })), run("bound-preserving", Object.assign({}, rule, { color: P.amber, paraSpaceBefore: 0 })),
    run("   else ", Object.assign({}, rule, { color: P.gray, paraSpaceBefore: 0 })), run("relaxed", Object.assign({}, rule, { color: P.red, paraSpaceBefore: 0 })),
  ], cardOpts);

  cell(s, si, 4, 0.75, 5.33, 5.6, 1.15, [
    step(4, "CERTIFY"),
    say("Each print gets the weakest level that reaches it. Emitted C licenses exactly the sums the facts free:", { breakLine: true }),
    run("#pragma omp simd reduction(+:acc)", { fontFace: MONO, fontSize: 12, color: P.green, paraSpaceBefore: 4 }),
  ], cardOpts);

  brackets(s, si, 6.75, 12.58, 1.72, 4.76);
  const ix = 7.17, iw = 4.99;
  text(s, si, "THEOREM 1  ·  CORRECTLY ROUNDED CHAINS", { x: ix, y: 1.9, w: iw, h: 0.28, fontFace: MONO, fontSize: 11, color: P.green, charSpacing: 1.5 });
  text(s, si, "If every proper sub-chain fits in 53 significand bits and the final sums round at most once, every bracketing and every order of summation returns the correctly rounded product.", {
    x: ix, y: 2.2, w: iw, h: 1.0, fontSize: 14, color: P.white,
  });
  const m = { fontFace: MATH, fontSize: 22, color: P.white };
  text(s, si, [
    run("198 · ", m), run("35,697", Object.assign({}, m, { color: P.green, bold: true })), run("3", Object.assign({}, m, { superscript: true })),
    run("  ≤  2", m), run("53", Object.assign({}, m, { superscript: true })),
    run("  <  198 · ", m), run("35,698", Object.assign({}, m, { color: P.red, bold: true })), run("3", Object.assign({}, m, { superscript: true })),
  ], { x: ix, y: 3.24, w: iw, h: 0.55, align: "center", valign: "middle" });
  text(s, si, "For int(0,m) chains 100×2 · 2×100 · 100×2, strict reorders up to m* = 35,697. At m* + 1 we build inputs on which the bracketings print different bits: the proved threshold is the true boundary.", {
    x: ix, y: 3.86, w: iw, h: 0.85, fontSize: 12, color: P.gray,
  });
  text(s, si, "THEOREM 2  ·  BRACKETING INVARIANCE", { x: ix, y: 4.84, w: iw, h: 0.28, fontFace: MONO, fontSize: 11, color: P.amber, charSpacing: 1.5 });
  text(s, si, "All bracketings share one worst-case error bound, so bounded reordering needs only a range check.", {
    x: ix, y: 5.12, w: iw, h: 0.62, fontSize: 13.5, color: P.white,
  });
  // The levels form a chain: each admits everything below it.
  const lat = [[7.17, 1.42], [8.9, 1.78], [10.99, 1.0]];
  lat.forEach(([x, w], k) => {
    actor(s, si, k, x, 5.95, w, 0.38, { radius: 0.19, fill: LEVEL[k].tint, line: LEVEL[k].color });
    text(s, si, LEVEL[k].name, { x, y: 5.95, w, h: 0.38, fontFace: MONO, fontSize: 11, bold: true, color: LEVEL[k].color, align: "center", valign: "middle", objectName: `!!kl${k + 1}` });
    if (k < 2) text(s, si, "<", { x: x + w + 0.02, y: 5.95, w: 0.25, h: 0.38, fontFace: MONO, fontSize: 14, color: P.gray, align: "center", valign: "middle" });
  });
  s.addNotes(NOTES[3]);
}

/* ---------------------------------------------------------------- slide 5: progress */

function slide5() {
  const si = 4;
  const s = pres.addSlide({ masterName: "MX_CONTENT", sectionTitle: "Progress" });
  slides.push(s);
  kicker(s, si, "04 // SINCE THE LAST REVIEW");
  title(s, si, "The optimizer now proves what it keeps");
  progress(s, si);
  footer(s, si);

  const tiles = [
    ["7,700", "lines of C11, Flex and Bison", "was 4,779"],
    ["3", "numerical contracts, proved per rewrite", "was one global switch"],
    ["2", "theorems behind the optimizer", "was none"],
    ["234", "acceptance checks, plus four verifiers", "was 157"],
  ];
  tiles.forEach(([big, label, was], i) => {
    const x = 0.75 + i * 3.01;
    cell(s, si, i + 1, x, 1.72, 2.8, 1.44, [
      run(big, { fontFace: HEAVY, fontSize: 34, color: P.white, breakLine: true }),
      run(label, { fontFace: SANS, fontSize: 12.5, color: P.ink, breakLine: true }),
      run(was, { fontFace: MONO, fontSize: 11, color: P.gray, paraSpaceBefore: 3 }),
    ], { fill: T.panel, line: T.line, margin: [12, 8, 6, 6] });
  });
  // Three contracts: the three levels sit beside the "3".
  for (let k = 0; k < 3; k++) actor(s, si, k, 3.76 + 0.78 + k * 0.25, 1.98, 0.16, 0.16);

  text(s, si, "AT THE LAST REVIEW", { x: 3.25, y: 3.38, w: 3.8, h: 0.28, fontFace: MONO, fontSize: 11, color: P.gray, charSpacing: 1.5 });
  text(s, si, "NOW", { x: 7.62, y: 3.38, w: 2.0, h: 0.28, fontFace: MONO, fontSize: 11, color: P.green, charSpacing: 1.5 });
  brackets(s, si, 7.22, 12.58, 3.32, 3.3);
  const rows = [
    ["Floating-point rewrites", "reorder with no guarantee, or never", "three contracts; every rewrite proves its level"],
    ["Program values", "literals only, no run-time inputs", "10 declared input domains, checked at load"],
    ["Code generation", "stack VM", "stack VM, and C11 with OpenMP reduction clauses"],
    ["Evidence", "modeled operation counts", "6 research questions, GCC runtimes, 57,600 runs"],
    ["Paper", "9-page teaching-compiler study", "10-page research paper with two theorems"],
  ];
  rows.forEach(([aspect, then, now], i) => {
    const y = 3.76 + i * 0.56;
    text(s, si, aspect, { x: 0.75, y, w: 2.35, h: 0.48, fontFace: SEMI, fontSize: 13, color: P.white, valign: "middle" });
    text(s, si, then, { x: 3.25, y, w: 3.75, h: 0.48, fontSize: 13, color: P.gray, valign: "middle" });
    cell(s, si, 5 + i, 7.6, y, 4.58, 0.48, [run(now, { fontFace: SANS, fontSize: 13, color: P.white })],
      { fill: T.rowFill, valign: "middle", margin: [8, 6, 2, 2], radius: 0.05 });
  });
  s.addNotes(NOTES[4]);
}

/* ---------------------------------------------------------------- slide 6: evidence */

// Shared chart styling: horizontal bars on a linear scale, no value axis or
// gridlines, each value written at the end of its bar. Categories read top
// down, and within each the baseline comes first.
function chartStyle(o) {
  return Object.assign({
    barDir: "bar", barGrouping: "clustered", barGapWidthPct: 55, catAxisOrientation: "maxMin",
    showLegend: false, showTitle: false, valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" },
    catAxisLabelColor: "A3AAA6", catAxisLabelFontSize: 11, catAxisLabelFontFace: "+mn-lt",
    catAxisLineShow: true, catAxisLineColor: "3A403D", catAxisLineSize: 1, catAxisMajorTickMark: "none",
    showValue: true, dataLabelPosition: "outEnd", dataLabelColor: "D5DAD7", dataLabelFontSize: 10, dataLabelFontFace: "+mn-lt", dataLabelFontBold: true,
  }, o);
}

function slide6() {
  const si = 5;
  const s = pres.addSlide({ masterName: "MX_CONTENT", sectionTitle: "Evidence" });
  slides.push(s);
  kicker(s, si, "05 // THE EVIDENCE");
  title(s, si, NB("Faster than -ffast-math, and with a guarantee"));
  progress(s, si);
  footer(s, si);

  // One legend for both charts: the two baselines, then the two proved contracts.
  const legend = [
    { k: 2, x: 0.78, w: 2.0, label: NB("-ffast-math (GCC)") },
    { k: -1, x: 2.98, w: 2.45, label: "no proofs (last review)" },
    { k: 0, x: 5.65, w: 1.75, label: "strict + proofs" },
    { k: 1, x: 7.62, w: 1.9, label: "bounded + proofs" },
  ];
  legend.forEach((L) => {
    if (L.k >= 0) actor(s, si, L.k, L.x, 1.705, 0.16, 0.16);
    else {
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: L.x, y: 1.705, w: 0.16, h: 0.16, rectRadius: 0.08, fill: { color: "6B716D" }, line: { type: "none" } });
      reserve(si, L.x, 1.705, 0.16, 0.16);
    }
    text(s, si, L.label, { x: L.x + 0.24, y: 1.62, w: L.w, h: 0.33, fontFace: MONO, fontSize: 11.5, color: P.ink, valign: "middle", objectName: L.k >= 0 ? `!!kl${L.k + 1}` : undefined });
  });
  text(s, si, "data: results/contracts", { x: 9.9, y: 1.62, w: 2.68, h: 0.33, fontFace: MONO, fontSize: 10.5, color: P.gray, align: "right", valign: "middle" });

  brackets(s, si, 0.75, 12.58, 2.07, 3.7);
  const head = (x, y, w, h1, h2) => {
    text(s, si, h1, { x, y, w, h: 0.26, fontFace: MONO, fontSize: 10.5, color: P.green, charSpacing: 1.5, reserve: false });
    text(s, si, h2, { x, y: y + 0.26, w, h: 0.26, fontSize: 11, color: P.gray, reserve: false });
  };

  cell(s, si, 1, 1.1, 2.17, 6.62, 3.5, "", { fill: T.panel, line: T.line, radius: 0.08 });
  head(1.32, 2.28, 6.2, "SPEEDUP OVER THE PROGRAM AS WRITTEN", "four kernels, GCC 15.2 -O3, median of 50 runs");
  const kernels = ["walks (bool)", "layers (int8)", "lowrank (real)", "diffusion (real)"];
  s.addChart(pres.charts.BAR, [
    { name: "-ffast-math (GCC)", labels: kernels, values: [1.12, 0.99, 1.01, 1.13] },
    { name: "strict + proofs", labels: kernels, values: [278, 4.98, 1.0, 1.06] },
    { name: "bounded + proofs", labels: kernels, values: [288, 5.44, 469, 277] },
  ], chartStyle({
    x: 1.2, y: 2.86, w: 6.42, h: 2.74, objectName: "chart-speedup",
    chartColors: [HEX.accent3, HEX.accent1, HEX.accent2],
    valAxisMinVal: 0, valAxisMaxVal: 560,
    dataLabelFormatCode: '[<10]0.00"×";#,##0"×"',
    altText: "Speedup over the program as written. walks: -ffast-math 1.12x, strict 278x, bounded 288x. layers: 0.99x, 4.98x, 5.44x. lowrank: 1.01x, 1.00x, 469x. diffusion: 1.13x, 1.06x, 277x.",
  }));

  cell(s, si, 2, 7.86, 2.17, 4.36, 3.5, "", { fill: T.panel, line: T.line, radius: 0.08 });
  head(8.06, 2.28, 4.0, "ARITHMETIC REMOVED", "15,000 generated programs, by input domain");
  const domains = ["int8", "int16", "real(1)"];
  s.addChart(pres.charts.BAR, [
    { name: "no proofs (last review)", labels: domains, values: [0.5, 0.3, 1.4] },
    { name: "strict + proofs", labels: domains, values: [16.5, 7.8, 7.5] },
    { name: "bounded + proofs", labels: domains, values: [19.6, 22.3, 25.1] },
  ], chartStyle({
    x: 7.96, y: 2.86, w: 4.16, h: 2.74, objectName: "chart-recovery",
    chartColors: ["6B716D", HEX.accent1, HEX.accent2],
    valAxisMinVal: 0, valAxisMaxVal: 32,
    dataLabelFormatCode: '0.0"%"',
    altText: "Modeled arithmetic removed. int8: no proofs 0.5%, strict 16.5%, bounded 19.6%. int16: 0.3%, 7.8%, 22.3%. real(1): 1.4%, 7.5%, 25.1%.",
  }));

  const chips = [
    ["0 of 57,600", P.green, "outputs certified bit-identical that changed"],
    ["m* + 1", P.green, "first breaking input on 3 of 4 chain families"],
    ["24 vs 0", P.white, "proof-built vs random tests that kill the 54-bit mutant"],
    ["p = 4.6×10⁻¹¹", P.white, "the cheaper bracketing is also more accurate"],
  ];
  chips.forEach(([big, color, small], j) => {
    cell(s, si, 3 + j, 0.75 + j * 3.0, 5.93, 2.83, 0.72, [
      run(big, { fontFace: SEMI, fontSize: 15, color, breakLine: true }),
      run(small, { fontFace: SANS, fontSize: 11, color: P.gray }),
    ], { fill: T.well, line: T.line, valign: "middle", margin: [10, 6, 3, 3] });
  });
  s.addNotes(NOTES[5]);
}

/* ---------------------------------------------------------------- slide 7: thank you */

function slide7(qr, pages) {
  const si = 6;
  const s = pres.addSlide({ masterName: "MX_CLOSE", sectionTitle: "Close" });
  slides.push(s);
  kicker(s, si, "$ matrixc --certificate implementation_review.ml");
  progress(s, si);

  // The two chart panels of slide 6 become the panels behind the paper and
  // the QR code, so they stay dark while they move.
  cell(s, si, 1, 0.75, 4.5, 8.2, 1.95, "", { fill: T.panel, line: T.line, radius: 0.08 });
  cell(s, si, 2, 9.45, 1.18, 3.13, 3.62, "", { fill: T.panel, line: T.line, radius: 0.08 });

  s.addText("Thank you", { placeholder: "title", objectName: "!!title" });
  reserve(si, 1.22, 1.36, 7.5, 1.5);
  brackets(s, si, 0.75, 8.95, 1.3, 3.0);
  const lines = ["print(thank_you)", "print(questions)", "print(feedback)"];
  lines.forEach((target, k) => {
    const y = 2.96 + k * 0.38;
    actor(s, si, k, 1.24, y + 0.095, 0.15, 0.15);
    text(s, si, LEVEL[k].name, { x: 1.52, y, w: 2.15, h: 0.34, fontFace: MONO, fontSize: 14, bold: true, color: LEVEL[k].color, valign: "middle", objectName: `!!kl${k + 1}` });
    text(s, si, target, { x: 3.75, y, w: 3.6, h: 0.34, fontFace: MONO, fontSize: 14, color: P.white, valign: "middle" });
  });

  // The paper, small enough to sit under the thanks.
  text(s, si, "THE PAPER", { x: 0.98, y: 4.6, w: 3.0, h: 0.26, fontFace: MONO, fontSize: 11, color: P.green, charSpacing: 1.5, reserve: false });
  const pw = 1.1, ph = pw * 11 / 8.5;
  const link = { hyperlink: { url: PAPER_URL, tooltip: "Open the paper (PDF)" } };
  [[pages[2], 2.42, 4.93, 7, "page 5 of the paper: the recovery figure"], [pages[1], 1.7, 4.91, 2, "page 3 of the paper: the theorems"], [pages[0], 0.98, 4.89, -3, "page 1 of the paper: title and abstract"]]
    .forEach(([data, x, y, rot, alt]) => s.addImage(Object.assign({ data, x, y, w: pw, h: ph, rotate: rot, altText: alt }, link)));
  const tx = 3.9, tw = 4.9;
  text(s, si, [run("Exact, Bounded, or Relaxed", Object.assign({ color: P.white }, link))], { x: tx, y: 4.72, w: tw, h: 0.4, fontFace: SEMI, fontSize: 20, color: P.white, reserve: false });
  text(s, si, [run("Proving Which Floating-Point Guarantee", { breakLine: true }), run("a Compiler Rewrite Keeps")], { x: tx, y: 5.14, w: tw, h: 0.5, fontSize: 13, color: P.ink, reserve: false });
  text(s, si, "A Aswanth Raj  ·  Dr. Ranjithkumar S", { x: tx, y: 5.69, w: tw, h: 0.26, fontSize: 12, color: P.gray, reserve: false });
  text(s, si, "ACM SIGPLAN format  ·  10 pages  ·  target CC 2027", { x: tx, y: 5.98, w: tw, h: 0.26, fontFace: MONO, fontSize: 10.5, color: P.green, reserve: false });

  const qx = 9.45 + (3.13 - 2.46) / 2;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: qx, y: 1.32, w: 2.46, h: 2.46, rectRadius: 0.12, fill: { color: "FFFFFF" }, line: { type: "none" }, objectName: "qr-tile" });
  s.addImage({ data: qr, x: qx + 0.08, y: 1.4, w: 2.3, h: 2.3, altText: "QR code linking to " + REPO, hyperlink: { url: REPO, tooltip: "Open the MatrixLang repository" } });
  repoLink(s, si, { x: 9.45, y: 3.95, w: 3.13, h: 0.32, fontSize: 11, align: "center", reserve: false });
  text(s, si, "code  ·  paper  ·  raw data  ·  workspace", { x: 9.45, y: 4.27, w: 3.13, h: 0.3, fontSize: 11, color: P.gray, align: "center", reserve: false });

  // Seven of the cells end in the 3x3 mark beside the wordmark, in the
  // pattern of the matrix that opened the deck.
  const cheap = [1, 1, 1, 0, 1, 1, 0, 0, 1];
  for (let i = 0; i < 9; i++) {
    const r = Math.floor(i / 3), c = i % 3, x = 0.75 + c * 0.135, y = 6.68 + r * 0.135;
    const fill = cheap[i] ? HEX.accent1 : T.dim;
    if (i < 7) cell(s, si, i + 3, x, y, 0.105, 0.105, "", { fill, radius: 0.015, margin: 0 });
    else s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 0.105, h: 0.105, rectRadius: 0.015, fill: { color: fill }, line: { type: "none" } });
  }
  text(s, si, logoRuns(), { x: 1.24, y: 6.62, w: 2.6, h: 0.48, fontFace: HEAVY, fontSize: 22, valign: "middle", objectName: "!!logo" });
  text(s, si, [
    run("A Aswanth Raj", { color: P.white }), run("  ·  24BAI0044        "),
    run("Supervisor  ", { color: P.green2 }), run("Dr. Ranjithkumar S", { color: P.white }),
    run("        BCSE307P  ·  Compiler Design Lab"),
  ], { x: 4.0, y: 6.7, w: 8.58, h: 0.34, fontSize: 12, color: P.gray, align: "right", valign: "middle" });
  s.addNotes(NOTES[6]);
}

/* ---------------------------------------------------------------- drifting tokens */

const TOKENS = [
  ["Matrix<40x2>", 11, "3A4A42"], ["A * (B * C)", 11, "34433B"], ["2^53", 12, "3A4A42"], ["fl(x)", 11, "34433B"],
  ["-0 != +0", 11, "3A403D"], ["inf * 0 = NaN", 11, "34433B"], ["{{1,0},{0,1}}", 11, "3A4A42"], ["0x1p+53", 11, "3A403D"],
  ["input(int8)", 11, "34433B"], ["(a+b)+c", 11, "3A4A42"], ["transpose(A)", 11, "3A403D"], ["print(R);", 11, "34433B"],
];

function tokenBox(t, size) {
  return { w: t.length * 0.62 * size / 72 + 0.08, h: size / 72 * 1.3 + 0.06 };
}

function overlaps(a, list, pad) {
  for (const b of list) {
    if (a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y) return true;
  }
  return false;
}

function addTokens() {
  const rng = mulberry32(2053);
  const prev = {};
  for (let si = 0; si < N; si++) {
    // Content slides keep their title band and footer clear.
    const content = si > 0 && si < N - 1;
    const keepOut = reserved[si].slice();
    if (content) keepOut.push({ x: 0, y: 0, w: W, h: 1.5 });
    const placed = [];
    const limit = content ? 3 : 5;
    // Rotate the order so that different tokens surface on different slides.
    const order = TOKENS.map((_, i) => (i + si * 5) % TOKENS.length);
    for (const i of order) {
      const [t, size, color] = TOKENS[i];
      const name = `!!p${String(i + 1).padStart(2, "0")}`;
      const { w, h } = tokenBox(t, size);
      let best = null, bestScore = -Infinity;
      if (placed.length < limit) {
        for (let x = 0.25; x + w <= W - 0.25; x += 0.1) {
          for (let y = 0.2; y + h <= H - 0.15; y += 0.08) {
            const r = { x, y, w, h };
            if (overlaps(r, keepOut, 0.2) || overlaps(r, placed, 0.9)) continue;
            if (placed.filter((q) => Math.abs(y - q.y) < 0.35).length >= 2) continue;  // no rows of tokens
            let score = rng() * 0.8 - (content && y > 6.7 ? 0.6 : 0);
            if (prev[name] && prev[name].onSlide) {
              const d = Math.hypot(x - prev[name].x, y - prev[name].y);
              score -= Math.abs(d - 0.9) * 1.2;
            }
            let near = 3;
            for (const q of placed) near = Math.min(near, Math.hypot(x - q.x, y - q.y));
            score += 0.5 * near;
            if (score > bestScore) { bestScore = score; best = r; }
          }
        }
      }
      const from = prev[name] || { x: rng() < 0.5 ? -1 : W, y: 0.5 + rng() * 6, w, h };
      if (best) {
        best.onSlide = true;
        placed.push(best);
      } else {
        // No room: wait just beyond the nearer side edge.
        const left = from.x + from.w / 2 < W / 2;
        best = { x: left ? -w - 0.4 : W + 0.4, y: Math.min(Math.max(from.y, 0.3), H - 0.6), w, h, onSlide: false };
      }
      prev[name] = best;
      slides[si].addText(t, {
        x: best.x, y: best.y, w, h, margin: 0, isTextBox: true, wrap: false, valign: "middle",
        fontFace: MONO, fontSize: size, color, objectName: name,
      });
    }
  }
}

/* ---------------------------------------------------------------- speaker notes */

const NOTES = [
  `About 45 seconds.

Good morning, sir. I am A Aswanth Raj, 24BAI0044, and this is the implementation review of MatrixLang, done under Dr. Ranjithkumar S for the Compiler Design Lab, BCSE307P.

In one sentence: MatrixLang is a complete compiler for a small matrix language, and its optimizer proves, for every floating-point rewrite, which guarantee it keeps: bit-identical, bound-preserving or relaxed. Those three levels are the green, amber and red you will see on every slide.

The matrix on the right is a teaser. It comes back on slide 3 with its meaning.

(Run this in Slide Show: every transition is Morph.)`,

  `About 90 seconds.

Everything on this slide is implemented and runs: nine stages, 7,700 lines of C11 with Flex and Bison.

Front end: a Flex scanner; a Bison LALR(1) parser with no conflicts; and a type system in which the type of a matrix is its shape, Matrix<40x2>, so a dimension mismatch is a compile-time error. New since the last review: input domains. A program declares run-time inputs such as input(int8), and every value is checked against its domain when it is loaded.

Middle end: three-address code, then the optimizer: constant folding, common subexpressions, copy propagation, dead code, algebraic identities, and matrix-chain reordering by dynamic programming over a cost model. New: a fact analysis and three numerical contracts decide which value-changing rewrites are legal.

Back ends: a typed stack VM, and, new, a C11 emitter that hands the optimized program to GCC.

Bottom: a real run. The chain A*B*C becomes A*(B*C), 11,120 operations down to 556, and the compiler certifies that print(R) is still bit-identical, because every intermediate of every bracketing needs at most 28 of the 53 significand bits.

34 command-line flags show each stage; the browser workspace shows them side by side. make test passes: 234 acceptance checks, numerical fixtures, front-end agreement, service tests and a GCC check of the emitted C.`,

  `About 75 seconds.

Reordering a product chain is the biggest saving available, but floating-point addition is not associative, so a reorder can change the bits. Production compilers offer one switch: strict IEEE, or -ffast-math. That switch says what the compiler may do. It never says what the result is.

I separate three guarantees. Bit-identical: the same bits as the unoptimized program for every input in the declared domains. Bound-preserving: within the source order's worst-case error bound, with NaN and infinity unchanged. Relaxed: equal only over the real numbers. A contract names the weakest level the optimizer may use: strict, bounded or algebraic.

This is the matrix from the title slide. One program, R = A*B*C. Rows are the declared input domain; columns are the contract. On int8 data every contract reorders, 556 operations, and the output stays bit-identical. On real(1) data strict refuses and keeps 11,120; bounded reorders and certifies the error bound. On unbounded reals only algebraic reorders, and the output is certified relaxed. The program text never changes; what decides is the values it will see.`,

  `About 90 seconds.

How the compiler proves it, in four steps.

One: inputs declare a domain, and the runtime checks it.

Two: a grid-magnitude analysis keeps five facts per value: every entry is a multiple of 2 to the g, its magnitude is at most m, and whether it is finite, whether it can be negative, and whether it can be minus zero. For int8 data: g = 0 and m = 128.

Three: two theorems. Theorem 1: if every proper sub-chain fits in 53 significand bits and the final sums round at most once, every bracketing and every order of summation returns the correctly rounded product, so the reorder is bit-identical. It is tight. For int(0,m) chains of shape 100x2, 2x100, 100x2 the compiler reorders up to m = 35,697, because 198 times 35,697 cubed is at most 2 to the 53 and 198 times 35,698 cubed is not; at 35,698 we construct inputs on which the two bracketings print different bits.

Theorem 2: the standard componentwise error bound of a chain is the same for every bracketing, so the bounded contract needs only a range check that rules out overflow.

Four: every print gets a certificate, the weakest level among the rewrites that reach it. The C backend turns certificates into code: only the sums the facts prove order-free get an OpenMP reduction clause, which licenses GCC to vectorise exactly those.`,

  `About 60 seconds.

Since the last review the code grew from 4,779 to 7,700 lines. The last review had one switch: reorder with no guarantee at all, or never reorder. Now there are three contracts, and every rewrite proves which one it satisfies. Two theorems stand behind the optimizer. The checks went from 157 to 234 acceptance checks, plus four independent verifiers: numerical fixtures, front-end agreement, the workspace service tests, and a GCC check of the emitted C.

Row by row: programs now take run-time inputs with declared domains; the back end emits C with OpenMP reduction clauses; the evidence is no longer modeled operation counts alone but six research questions with real GCC runtimes; and the nine-page teaching-compiler study became a ten-page research paper.`,

  `About 90 seconds. Two baselines, every number regenerated from raw data by make contracts.

Left: runtime against GCC's own baseline, -ffast-math, on four kernels compiled by GCC 15.2. The red bars are -ffast-math, so short you can barely see them: at most 1.13x, because GCC reassociates scalar sums but never reorders a matrix chain. Green is the strict contract: walk counts on a graph, 278x faster with identical bits, because the proof says every bracketing gives the same answer. It refuses the real-valued kernels, which is correct: there the bits would change. Amber is the bounded contract: it takes those too, 469x and 277x, within the source order's worst-case error bound.

Right: the other baseline is my own optimizer from the last review, which had no proofs. Grey: it could remove almost nothing safely, 0.5% of the arithmetic on int8 programs. With proofs, strict removes 16.5% with identical bits, and bounded removes all of the available saving on every bounded domain.

Bottom: 0 of 57,600 outputs certified bit-identical ever changed; the threshold is tight: the first breaking input is at m* + 1 on three chain families, and at m* + 2 on the four-operand chain, where a parity argument rules out m* + 1; a mutant that allows 54 bits is killed by 24 proof-built tests and by no random test at all; and in a preregistered study of 2,700 chains the cheaper bracketing is also more accurate, p = 4.6e-11.`,

  `Thank you. The QR code opens the repository: code, paper, raw data and the browser workspace.

The paper: "Exact, Bounded, or Relaxed: Proving Which Floating-Point Guarantee a Compiler Rewrite Keeps", ten pages in ACM SIGPLAN format, with you as co-author, sir, pending your review. Two theorems, an implementation, and six research questions. The target is CC 2027, ACM SIGPLAN Compiler Construction; its call is expected in November, following earlier years.

Likely questions:

Why not just use -ffast-math? It is a permission, not a guarantee: nobody can tell which outputs changed. And here it gains at most 1.13x, because GCC does not reorder matrix chains.

How do you know the certificates are sound? Theorem 1, plus 57,600 executions per contract with no violation. That check found, and I fixed, one real defect: the inheritance rule.

Is the threshold tight? Yes. A witness exists at m* + 1 on three chain families, and at m* + 2 on the four-operand chain, where a parity argument rules out m* + 1.

Limits? Straight-line, statically shaped programs. Bit-identity proofs cover integer and dyadic data. The bounded contract excludes gradual underflow. Runtimes come from one machine and one compiler.

What next? An LLVM prototype of the per-reduction license, loops through a fixed point over the same lattice, kernels from real applications, and submission to CC 2027.`,
];

/* ---------------------------------------------------------------- assets */

function renderPages() {
  const pdf = path.join(ROOT, "paper", "matrixlang.pdf");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mx-pages-"));
  const out = [];
  for (const p of [1, 3, 5]) {
    const stem = path.join(dir, `p${p}`);
    execFileSync("pdftoppm", ["-png", "-r", "110", "-f", String(p), "-l", String(p), "-singlefile", pdf, stem]);
    out.push("image/png;base64," + fs.readFileSync(stem + ".png").toString("base64"));
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

async function qrImage() {
  const buf = await QRCode.toBuffer(REPO, { errorCorrectionLevel: "M", margin: 2, scale: 14, color: { dark: "#000000", light: "#FFFFFF" } });
  return "image/png;base64," + buf.toString("base64");
}

/* ---------------------------------------------------------------- post-processing */

// The tokens carry no content: mark them decorative so that screen
// readers skip them.
function markDecorative(xml) {
  return xml.replace(/(<p:cNvPr id="\d+" name="!!p\d[^"]*")><\/p:cNvPr>/g, (_, head) => head + '><a:extLst><a:ext uri="{C183D7F6-B498-43B3-948B-1728B52AA6E4}">'
    + '<adec:decorative xmlns:adec="http://schemas.microsoft.com/office/drawing/2017/decorative" val="1"/></a:ext></a:extLst></p:cNvPr>');
}

// Morph on every slide; the fallback for PowerPoint 2016 and older is a fade.
const MORPH_MS = [1000, 1600, 1500, 1500, 1500, 1500, 1800];
function morph(ms) {
  return '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">'
    + '<mc:Choice xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" Requires="p159">'
    + `<p:transition spd="slow" p14:dur="${ms}"><p159:morph option="byObject"/></p:transition>`
    + '</mc:Choice><mc:Fallback><p:transition spd="slow"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>';
}

function themeXml(xml) {
  const slots = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"];
  const scheme = `<a:clrScheme name="${THEME.name}">` + slots.map((k) => `<a:${k}><a:srgbClr val="${THEME.colors[k]}"/></a:${k}>`).join("") + "</a:clrScheme>";
  return xml.replace(/<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/, () => scheme)
    .replace(/(<a:(?:theme|fontScheme)\b[^>]*?\bname=")[^"]*"/g, (_, head) => `${head}${THEME.name}"`);
}

async function postProcess(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const theme = "ppt/theme/theme1.xml";
  zip.file(theme, themeXml(await zip.file(theme).async("string")));
  for (let i = 1; i <= N; i++) {
    const part = `ppt/slides/slide${i}.xml`;
    let xml = markDecorative(await zip.file(part).async("string"));
    if (xml.includes("<p:transition") || xml.includes("mc:AlternateContent")) throw new Error(`${part} already has a transition`);
    const at = xml.indexOf("</p:clrMapOvr>");
    if (at < 0) throw new Error(`${part} has no <p:clrMapOvr>`);
    const cut = at + "</p:clrMapOvr>".length;
    xml = xml.slice(0, cut) + morph(MORPH_MS[i - 1]) + xml.slice(cut);
    zip.file(part, xml);
  }
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}

/* ---------------------------------------------------------------- build */

async function main() {
  const pages = renderPages();
  const qr = await qrImage();
  pres.addSection({ title: "Opening" });
  slide1();
  pres.addSection({ title: "Implementation" });
  slide2();
  slide3();
  slide4();
  pres.addSection({ title: "Progress" });
  slide5();
  pres.addSection({ title: "Evidence" });
  slide6();
  pres.addSection({ title: "Close" });
  slide7(qr, pages);
  addTokens();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await pres.writeFile({ fileName: OUT });
  await postProcess(OUT);
  console.log(`wrote ${path.relative(process.cwd(), OUT) || OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
