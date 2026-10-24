// build-final-deck.js -- the presentation of the revised manuscript
// "Proof-Guided Floating-Point Optimization: Exact Reassociation, Error
// Bounds, and Compiler Certificates" (24 October 2026 revision).
// Eleven slides for a ten-minute review: black and gold, one idea per slide,
// details in the speaker notes.
//
//   cd <dir with pptxgenjs, react-icons, react, react-dom, sharp and qrcode> &&
//   node /path/to/tools/build-final-deck.js [OUT.pptx] [path/to/apply_theme.js]
//
// Numbers come from the paper's generated macros (generated/*.tex, with the
// post-repair overrides in generated-review/contracts.tex), from
// results/contracts/llvm_summary.json and from the certificate replay record.
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const QRCode = require("qrcode");
const fa = require("react-icons/fa");

const ROOT = path.resolve(__dirname, "..");
const OUT = process.argv[2] || path.join(ROOT, "paper", "presentation-updated", "MatrixLang-Presentation.pptx");
const APPLY = process.argv[3]; // path to the pptx skill's scripts/apply_theme.js (optional)
const REPO = "github.com/aswanth-07/matrixlang";
const REPO_URL = "https://" + REPO;
const SRC = (p) => "\n\nSource: " + REPO_URL + "/blob/main/" + p;

// ---- numbers ----------------------------------------------------------------------
function macros(file) {
  const m = {};
  const text = fs.readFileSync(path.join(ROOT, "paper", file), "utf8");
  for (const [, k, v] of text.matchAll(/\\(?:re)?newcommand\{\\([A-Za-z]+)\}\{([^}]*)\}/g)) m[k] = v;
  return m;
}
const M = {
  ...macros("generated/contracts.tex"), ...macros("generated/platforms.tex"),
  ...macros("generated/llvm.tex"), ...macros("generated/baselines.tex"),
  ...macros("generated-review/contracts.tex"), // post-repair RQ1/RQ2 replace the historical ones
};
const llvm = JSON.parse(fs.readFileSync(path.join(ROOT, "results", "contracts", "llvm_summary.json")));
const certs = JSON.parse(fs.readFileSync(path.join(ROOT, "results", "review-revision", "certificates", "verification.json")));

// ---- theme: gold on black ------------------------------------------------------------
// dk1 is the page and lt1 the text, so the scheme names read inverted; the
// aliases below say what each color is for.
const THEME = {
  name: "Gold on Black",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "0B0B0C", lt1: "FAFAFA", dk2: "17171A", lt2: "E8E1D3",
    accent1: "F5B83D", accent2: "E8E1D3", accent3: "E5484D", accent4: "8F8F8F",
    accent5: "2C2C31", accent6: "5C5C63", hlink: "F5B83D", folHlink: "E8E1D3",
  },
};
const HEX = THEME.colors;

async function icon(Comp, color, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: "#" + color, size }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}
async function qr() {
  const buf = await QRCode.toBuffer(REPO_URL, { margin: 1, width: 600,
    color: { dark: "#" + HEX.dk1, light: "#" + HEX.lt2 } });
  return "image/png;base64," + buf.toString("base64");
}

async function main() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pres.title = "Proof-Guided Floating-Point Optimization";
  pres.subject = "Exact Reassociation, Error Bounds, and Compiler Certificates";
  pres.author = "A Aswanth Raj, Dr. Ranjithkumar S";
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  const C = pres.SchemeColor;
  const BG = C.text1, SURF = C.text2, FG = C.background1, IVORY = C.background2;
  const GOLD = C.accent1, RED = C.accent3, MUTED = C.accent4, LINE = C.accent5, DIM = C.accent6;

  // ---- layouts ----
  pres.defineSlideMaster({
    title: "COVER",
    background: { color: BG },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 1.6, w: 8.6, h: 2.4,
        fontSize: 44, bold: true, color: FG, valign: "bottom", align: "left", margin: 0 }, text: "" } },
    ],
  });
  pres.defineSlideMaster({
    title: "CONTENT",
    background: { color: BG },
    margin: [0.5, 0.7, 0.5, 0.7],
    objects: [
      { placeholder: { options: { name: "kicker", type: "body", x: 0.7, y: 0.45, w: 11.9, h: 0.35,
        fontSize: 12, bold: true, color: GOLD, charSpacing: 4, align: "left", valign: "middle" }, text: "" } },
      { placeholder: { options: { name: "title", type: "title", x: 0.7, y: 0.8, w: 11.9, h: 0.9,
        fontSize: 34, bold: true, color: FG, align: "left", valign: "middle" }, text: "" } },
      { text: { text: REPO, options: { x: 0.7, y: 6.95, w: 5, h: 0.3, fontSize: 10, color: DIM, margin: 0 } } },
    ],
    slideNumber: { x: 12.1, y: 6.95, w: 0.55, h: 0.3, fontSize: 10, color: DIM, align: "right" },
  });

  const txt = (s, text, o) => s.addText(text, { isTextBox: true, margin: 0, valign: "top", color: FG, ...o });
  const box = (s, x, y, w, h, o = {}) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.1, fill: { color: o.fill || SURF }, line: { color: o.line || o.fill || SURF, width: o.lw || 1 },
    objectName: o.name });
  const arrow = (s, x1, y1, x2, y2, color = DIM) => s.addShape(pres.shapes.LINE, {
    x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.001, h: Math.abs(y2 - y1) || 0.001,
    flipH: x2 < x1, flipV: y2 < y1, line: { color, width: 1.5, endArrowType: "triangle" } });
  const head = (s, kicker, title) => {
    s.addText(kicker, { placeholder: "kicker" });
    s.addText(title, { placeholder: "title" });
  };
  const chartLook = { // one look for both charts
    catAxisLabelFontSize: 12, valAxisLabelFontSize: 11, catAxisLabelFontFace: "+mn-lt",
    valAxisLabelFontFace: "+mn-lt", catAxisLabelColor: HEX.accent4, valAxisLabelColor: HEX.accent6,
    catAxisLineShow: false, valAxisLineShow: false,
    legendFontSize: 12, legendFontFace: "+mn-lt", legendColor: HEX.lt2,
    dataLabelFontSize: 10, dataLabelFontFace: "+mn-lt", dataLabelColor: HEX.lt2,
    valGridLine: { color: "232327", size: 0.75 }, catGridLine: { style: "none" },
    showLegend: true, legendPos: "t", showValue: true, dataLabelPosition: "outEnd",
    barDir: "col", barGrouping: "clustered", barGapWidthPct: 55,
  };
  let n = 0;
  const content = (section) => pres.addSlide({ masterName: "CONTENT", sectionTitle: section });
  const K = (label) => String(++n).padStart(2, "0") + "  ·  " + label.toUpperCase();

  // ---- 1. cover ----
  pres.addSection({ title: "Introduction" });
  let s = pres.addSlide({ masterName: "COVER", sectionTitle: "Introduction" });
  txt(s, "MATRIXLANG  ·  EXACTREDUCE", { x: 0.8, y: 1.15, w: 8, h: 0.4, fontSize: 13, bold: true,
    color: GOLD, charSpacing: 5 });
  s.addText("Proof-Guided Floating\u2011Point Optimization", { placeholder: "title" });
  txt(s, "Exact Reassociation, Error Bounds, and Compiler Certificates",
    { x: 0.8, y: 4.15, w: 8.0, h: 0.5, fontSize: 20, italic: true, color: IVORY });
  txt(s, [
    { text: "A Aswanth Raj   ·   Dr. Ranjithkumar S", options: { bold: true, color: FG, breakLine: true } },
    { text: "School of Computer Science and Engineering, VIT Vellore", options: { color: MUTED } },
  ], { x: 0.8, y: 5.35, w: 8.0, h: 0.8, fontSize: 16, paraSpaceAfter: 4 });
  box(s, 9.7, 1.7, 2.85, 3.75, { fill: BG, line: GOLD, lw: 1.25, name: "repo card" });
  s.addImage({ data: await qr(), x: 10.1, y: 2.05, w: 2.05, h: 2.05, hyperlink: { url: REPO_URL },
    altText: "QR code linking to " + REPO_URL });
  s.addImage({ data: await icon(fa.FaGithub, HEX.accent1), x: 10.1, y: 4.35, w: 0.3, h: 0.3 });
  txt(s, "Code · data · paper", { x: 10.5, y: 4.35, w: 1.9, h: 0.3, fontSize: 12, bold: true, color: GOLD, valign: "middle" });
  txt(s, [{ text: REPO, options: { hyperlink: { url: REPO_URL } } }],
    { x: 9.8, y: 4.8, w: 2.65, h: 0.3, fontSize: 10.5, color: IVORY, align: "center" });
  s.addNotes("Compilers either keep floating-point evaluation order exactly (strict) or drop it wholesale " +
    "(fast-math). We show that facts about the input values let a compiler prove, rewrite by rewrite, which " +
    "guarantee is kept, and label every output with it. Two implementations: the MatrixLang compiler and the " +
    "ExactReduce LLVM pass. Revised manuscript, October 2026." + SRC("paper/matrixlang.tex"));

  // ---- 2. the problem ----
  s = content("Introduction");
  head(s, K("The problem"), "Compilers make you choose: safe or fast");
  const sides = [
    [0.7, fa.FaLock, "STRICT", "1×", "Same bits as the source,\nbut sums stay sequential", MUTED],
    [8.13, fa.FaBolt, "FAST-MATH", "5–10×", "Vectorized, but no one knows\nwhich results changed", RED],
  ];
  for (const [x, Ic, name, big, sub, col] of sides) {
    box(s, x, 2.05, 4.5, 4.4, { name });
    s.addImage({ data: await icon(Ic, col === RED ? HEX.accent3 : HEX.accent4), x: x + 0.45, y: 2.45, w: 0.45, h: 0.45 });
    txt(s, name, { x: x + 1.05, y: 2.45, w: 3.2, h: 0.45, fontSize: 14, bold: true, color: col, charSpacing: 4, valign: "middle" });
    txt(s, big, { x: x + 0.45, y: 3.1, w: 3.7, h: 1.6, fontSize: 72, bold: true, fontFace: "Cambria", color: FG });
    txt(s, sub, { x: x + 0.45, y: 4.95, w: 3.8, h: 1.1, fontSize: 18, color: MUTED });
  }
  txt(s, "We want", { x: 5.4, y: 3.0, w: 2.53, h: 0.45, fontSize: 18, color: MUTED, align: "center" });
  txt(s, "both", { x: 5.4, y: 3.4, w: 2.53, h: 1.0, fontSize: 54, bold: true, fontFace: "Cambria", color: GOLD, align: "center" });
  txt(s, "and to know which\nguarantee each output keeps", { x: 5.4, y: 4.5, w: 2.53, h: 1.0, fontSize: 14,
    color: IVORY, align: "center" });
  s.addNotes("Every floating-point operation rounds, so (0.1 + 0.2) + 0.3 = 0.6000000000000001 while " +
    "0.1 + (0.2 + 0.3) = 0.6. Strict IEEE compilation therefore never reorders, even when the input values " +
    "would make reordering exact. -ffast-math grants permissions, but a permission says what the compiler may " +
    "do, not what the result is. 5-10x is the measured fast-math speedup range over strict Clang 18 on our nine " +
    "integer-data kernels." + SRC("paper/matrixlang.tex"));

  // ---- 3. one chain, two orders ----
  s = content("Introduction");
  head(s, K("The opportunity"), "One matrix chain, two orders");
  const orders = [
    [0.7, "(A · B) · C", "A·B is 100 × 100", 1.75, RED, "69,800", "scalar operations"],
    [7.0, "A · (B · C)", "B·C is 2 × 2", 0.22, GOLD, "1,396", "scalar operations"],
  ];
  for (const [x, f, inter, sq, col, big, unit] of orders) {
    box(s, x, 1.95, 5.63, 4.05, { name: f });
    txt(s, f, { x: x + 0.45, y: 2.25, w: 4.8, h: 0.7, fontSize: 32, bold: true, fontFace: "Cambria", color: FG });
    txt(s, "intermediate", { x: x + 0.45, y: 3.1, w: 2.2, h: 0.3, fontSize: 12, color: MUTED, charSpacing: 2 });
    s.addShape(pres.shapes.RECTANGLE, { x: x + 0.45, y: 3.5, w: sq, h: sq,
      fill: { color: col, transparency: 15 }, line: { color: col } });
    txt(s, inter, { x: x + 0.45 + Math.max(sq, 0.3) + 0.25, y: 3.5, w: 2.5, h: 0.4, fontSize: 15, color: IVORY });
    txt(s, big, { x: x + 2.6, y: 4.2, w: 2.8, h: 0.95, fontSize: 48, bold: true, color: col, align: "right" });
    txt(s, unit, { x: x + 2.6, y: 5.15, w: 2.8, h: 0.35, fontSize: 14, color: MUTED, align: "right" });
  }
  txt(s, [
    { text: "A, C are 100 × 2, B is 2 × 100.  ", options: { color: MUTED } },
    { text: "The reorder is 50× cheaper. Is it allowed? That depends on the values, not the program text.",
      options: { color: IVORY, bold: true } },
  ], { x: 0.7, y: 6.3, w: 11.9, h: 0.4, fontSize: 15 });
  s.addNotes("The motivating example of the paper. Source order builds a 100x100 intermediate; A(BC) builds " +
    "a 2x2 one. Strict compilers may not reorder because rounding can change the result. But if A, B and C hold " +
    "8-bit integers, every product and partial sum is an integer of at most 29 bits, so both orders give the " +
    "same bits and even a strict compiler may reorder." + SRC("paper/matrixlang.tex"));

  // ---- 4. levels x contracts staircase ----
  pres.addSection({ title: "Approach" });
  s = content("Approach");
  head(s, K("The idea"), "Three guarantees, three contracts");
  const lv = [
    ["Bit-identical", "same bits", "e.g. 8-bit integers", GOLD],
    ["Bound-preserving", "same error bound", "e.g. larger integers", IVORY],
    ["Relaxed", "true over the reals only", "e.g. unbounded reals", RED],
  ];
  const ct = [["Strict", "default"], ["Bounded", ""], ["Algebraic", "≈ fast-math"]];
  const gx = 3.2, gy = 3.05, cw = 3.1, ch = 0.95, gap = 0.12;
  lv.forEach(([name, what, eg, col], j) => {
    const x = gx + j * (cw + gap);
    txt(s, name, { x, y: 1.95, w: cw, h: 0.4, fontSize: 20, bold: true, color: col, align: "center" });
    txt(s, what, { x, y: 2.35, w: cw, h: 0.3, fontSize: 14, color: FG, align: "center" });
    txt(s, eg, { x, y: 2.65, w: cw, h: 0.3, fontSize: 12, italic: true, color: MUTED, align: "center" });
  });
  ct.forEach(([name, tag], i) => {
    const y = gy + i * (ch + gap);
    txt(s, name, { x: 0.7, y: y + 0.12, w: 2.3, h: 0.45, fontSize: 22, bold: true, fontFace: "Cambria", color: FG });
    if (tag) txt(s, tag, { x: 0.7, y: y + 0.55, w: 2.3, h: 0.3, fontSize: 12, color: MUTED });
    lv.forEach(([, , , col], j) => {
      const on = j <= i, x = gx + j * (cw + gap);
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: cw, h: ch, rectRadius: 0.08,
        fill: on ? { color: col, transparency: 82 } : { color: BG },
        line: { color: on ? col : LINE, width: on ? 1.25 : 1, dashType: on ? "solid" : "dash" } });
      txt(s, on ? "admitted" : "—", { x, y, w: cw, h: ch, fontSize: on ? 16 : 18, bold: on,
        color: on ? col : DIM, align: "center", valign: "middle" });
    });
  });
  txt(s, "Each output is labelled with the weakest guarantee among the rewrites that reach it.",
    { x: 0.7, y: 6.35, w: 11.9, h: 0.4, fontSize: 16, italic: true, color: IVORY });
  s.addNotes("Every rewrite is classified as bit-identical, bound-preserving or relaxed, from facts about the " +
    "values. The contract decides which levels may be applied: strict only bit-identical, bounded also " +
    "bound-preserving, algebraic everything. A declaration of reals in [-1, 1] alone is not enough for " +
    "bound-preserving, because it admits inexact underflow." + SRC("paper/matrixlang.tex"));

  // ---- 5. pipeline diagram ----
  s = content("Approach");
  head(s, K("How it works"), "From value facts to certified outputs");
  const src = [
    ["MatrixLang", "declared input domains", "input(int8), input(real(1))", 2.05],
    ["ExactReduce", "LLVM 18 pass on plain C", "integer → double conversions", 4.6],
  ];
  for (const [name, a, b, y] of src) {
    box(s, 0.7, y, 2.9, 1.65, { name });
    txt(s, name, { x: 0.95, y: y + 0.2, w: 2.5, h: 0.4, fontSize: 18, bold: true, color: GOLD });
    txt(s, a, { x: 0.95, y: y + 0.65, w: 2.5, h: 0.3, fontSize: 13, color: FG });
    txt(s, b, { x: 0.95, y: y + 1.0, w: 2.5, h: 0.5, fontSize: 12, color: MUTED, fontFace: "Courier New" });
  }
  const mid = 4.15; // vertical centre of the chain of stages
  arrow(s, 3.6, 2.88, 4.3, mid - 0.15);
  arrow(s, 3.6, 5.42, 4.3, mid + 0.15);
  const stages = [
    ["Facts", "grid + magnitude\nof every value"],
    ["Obligations", "exact in 53 bits?\nbound still holds?"],
    ["Contract", "is this level\nadmitted?"],
  ];
  stages.forEach(([name, sub], i) => {
    const x = 4.0 + i * 2.15;
    s.addShape(pres.shapes.OVAL, { x: x + 0.35, y: mid - 0.68, w: 1.36, h: 1.36,
      fill: { color: SURF }, line: { color: GOLD, width: 1.5 } });
    txt(s, String(i + 1), { x: x + 0.35, y: mid - 0.68, w: 1.36, h: 1.36, fontSize: 30, bold: true,
      fontFace: "Cambria", color: GOLD, align: "center", valign: "middle" });
    txt(s, name, { x, y: mid + 0.8, w: 2.06, h: 0.4, fontSize: 17, bold: true, align: "center" });
    txt(s, sub, { x, y: mid + 1.2, w: 2.06, h: 0.7, fontSize: 12.5, color: MUTED, align: "center" });
    if (i < 2) arrow(s, x + 1.78, mid, x + 2.28, mid);
  });
  const outs = [
    ["yes", "Rewrite + certificate", "reorder, vectorize, label output", GOLD, 2.05],
    ["no", "Keep source order", "strict fallback, nothing lost", MUTED, 4.6],
  ];
  arrow(s, 10.1, mid - 0.15, 10.5, 2.88, GOLD);
  arrow(s, 10.1, mid + 0.15, 10.5, 5.42, DIM);
  for (const [, name, sub, col, y] of outs) {
    box(s, 10.5, y, 2.15, 1.65, { fill: SURF, line: col === GOLD ? GOLD : LINE, name });
    txt(s, name, { x: 10.7, y: y + 0.2, w: 1.8, h: 0.75, fontSize: 16, bold: true, color: col });
    txt(s, sub, { x: 10.7, y: y + 0.95, w: 1.8, h: 0.6, fontSize: 12, color: MUTED });
  }
  s.addNotes("Two front ends feed the same reasoning. MatrixLang reads declared input domains and checks each " +
    "input against its domain at load time. ExactReduce derives the facts from integer conversions in ordinary " +
    "C and, when the length is only known at run time, checks the condition once on loop entry with a strict " +
    "fallback loop. Facts are a grid (every value a multiple of 2^G) and a magnitude. The obligations come from " +
    "three results: correctly rounded chains, guarded reductions and bracketing invariance of the error bound. " +
    "Certificates can be exported and replayed independently in exact arithmetic." + SRC("paper/matrixlang.tex"));

  // ---- 6. the revision: underflow ----
  s = content("Approach");
  head(s, K("What the revision fixed"), "A magnitude bound alone is not enough");
  box(s, 0.7, 1.95, 6.1, 3.85, { name: "counterexample" });
  txt(s, "COUNTEREXAMPLE", { x: 1.1, y: 2.25, w: 5, h: 0.3, fontSize: 12, bold: true, color: RED, charSpacing: 4 });
  txt(s, [
    { text: "q = 2^-1074  a = 3q  b = ½  c = ¾", options: { color: MUTED, fontSize: 16, breakLine: true } },
    { text: " ", options: { fontSize: 8, breakLine: true } },
    { text: "(a·b)·c  →  2q", options: { color: FG, breakLine: true } },
    { text: "a·(b·c)  →   q", options: { color: FG, breakLine: true } },
    { text: "exact    =  9q/8", options: { color: GOLD } },
  ], { x: 1.1, y: 2.75, w: 5.4, h: 2.2, fontSize: 20, fontFace: "Courier New" });
  txt(s, "Values inside [−1, 1], yet both orders break the claimed error bound: they underflow inexactly.",
    { x: 1.1, y: 4.95, w: 5.4, h: 0.7, fontSize: 13, italic: true, color: MUTED });
  txt(s, "FIX", { x: 7.3, y: 2.0, w: 5, h: 0.3, fontSize: 12, bold: true, color: GOLD, charSpacing: 4 });
  txt(s, "Also require a representable product grid", { x: 7.3, y: 2.35, w: 5.3, h: 1.0, fontSize: 24,
    bold: true, fontFace: "Cambria" });
  const after = [
    [`${+M.RqOneRecoveryIntEightBounded}%`, "of the optimization kept on integer data: unchanged", GOLD],
    [`${M.RqOneRecoveryRealBounded}%`, "kept on real(1) data: the conservative price", RED],
  ];
  after.forEach(([big, sub, col], i) => {
    const y = 3.65 + i * 1.1;
    txt(s, big, { x: 7.3, y, w: 2.0, h: 0.8, fontSize: 36, bold: true, color: col, valign: "middle" });
    txt(s, sub, { x: 9.4, y, w: 3.2, h: 0.8, fontSize: 14, color: IVORY, valign: "middle" });
  });
  txt(s, "All 15,000 + 4,800 study programs replayed after the fix: zero failures.",
    { x: 0.7, y: 6.25, w: 11.9, h: 0.4, fontSize: 15, color: IVORY });
  s.addNotes("A reviewer's counterexample, reproduced through MatrixLang. The bounded check now requires a " +
    "representable product grid in addition to a magnitude ceiling and slack for accumulated error. This excludes " +
    "inexact underflow but still allows exact subnormal results. A general real(1) chain is now refused. RQ1 " +
    "(15,000 programs, 60,000 compilations) and RQ2 (4,800 programs, 57,600 executions) were replayed on a " +
    "separately built compiler with zero errors. Four regression tests were added." + SRC("paper/review-response.md"));

  // ---- 7. LLVM speed ----
  pres.addSection({ title: "Results" });
  s = content("Results");
  head(s, K("Speed"), "Fast-math speed, strict results");
  const order = ["sum_u8", "sumsq_u8", "gram_u8", "qlinear_i8", "degree_u8", "walks2_u8", "gemm_i8", "energy_i16", "sum_i32"];
  const labels = ["Pixel sum", "Sum sq.", "Gram", "int8 model", "Degrees", "2-walks", "GEMM", "Energy", "int32 sum"];
  s.addChart(pres.charts.BAR, [
    { name: "ExactReduce (strict bits)", labels, values: order.map(k => +llvm.bench[k].configs["clang-licensed"].speedup.toFixed(2)) },
    { name: "-ffast-math", labels, values: order.map(k => +llvm.bench[k].configs["clang-fast-math"].speedup.toFixed(2)) },
  ], { x: 0.5, y: 1.85, w: 8.3, h: 4.95, chartColors: [HEX.accent1, HEX.accent6], valAxisMinVal: 0,
    valAxisMaxVal: 12, valAxisMajorUnit: 3, dataLabelFormatCode: "0.0", ...chartLook });
  txt(s, `${M.LlvmBenchLicensedHi}×`, { x: 9.3, y: 2.0, w: 3.3, h: 1.3, fontSize: 72, bold: true, fontFace: "Cambria", color: GOLD });
  txt(s, `up to, over strict Clang (${M.LlvmBenchLicensedLo}× at least) on nine integer-data kernels`,
    { x: 9.3, y: 3.35, w: 3.3, h: 0.9, fontSize: 15, color: IVORY });
  txt(s, `${M.LlvmBenchOfFastMathLo}–${M.LlvmBenchOfFastMathHi}%`, { x: 9.3, y: 4.5, w: 3.3, h: 0.8, fontSize: 40, bold: true, color: FG });
  txt(s, "of fast-math's speedup, with exactly the strict result bits", { x: 9.3, y: 5.3, w: 3.3, h: 0.7, fontSize: 15, color: IVORY });
  s.addNotes("ExactReduce in the tested Clang 18 pipeline on real MNIST and Cora data plus generated data; " +
    "medians of five processes with eleven runs each. Every licensed build printed the strict bits. Real-valued " +
    "sums (a dot product, a binary32 sum) are declined by design. The integer-accumulation route runs at a median " +
    M.BaseRewriteOfIntMedian + "% of hand-written integer code." + SRC("paper/generated/tab-llvm-bench.tex"));

  // ---- 8. recovery chart ----
  s = content("Results");
  head(s, K("Optimization kept"), "Bounded mode keeps what strict must skip");
  const doms = [["Bool", "bool"], ["UintEight", "uint8"], ["IntEight", "int8"], ["IntOneSix", "int16"],
    ["IntThreeTwo", "int32"], ["Dyadic", "dyadic"], ["Mixed", "mixed"], ["Real", "real(1)"], ["Realx", "real"]];
  const rec = (d, c) => +M[`RqOneRecovery${d}${c}`];
  s.addChart(pres.charts.BAR, [
    { name: "strict", labels: doms.map(d => d[1]), values: doms.map(d => rec(d[0], "Strict")) },
    { name: "bounded", labels: doms.map(d => d[1]), values: doms.map(d => rec(d[0], "Bounded")) },
  ], { x: 0.5, y: 1.85, w: 8.3, h: 4.95, chartColors: [HEX.accent6, HEX.accent1], valAxisMinVal: 0,
    valAxisMaxVal: 100, valAxisMajorUnit: 25, dataLabelFormatCode: "0", ...chartLook });
  txt(s, "100%", { x: 9.3, y: 2.0, w: 3.3, h: 1.3, fontSize: 72, bold: true, fontFace: "Cambria", color: GOLD });
  txt(s, "of the full algebraic saving, kept by bounded mode on every integer domain",
    { x: 9.3, y: 3.35, w: 3.3, h: 0.9, fontSize: 15, color: IVORY });
  txt(s, M.RqOnePrograms, { x: 9.3, y: 4.5, w: 3.3, h: 0.8, fontSize: 40, bold: true, color: FG });
  txt(s, `generated programs, ${M.RqOneCompiles} compilations, none failing`, { x: 9.3, y: 5.3, w: 3.3, h: 0.7, fontSize: 15, color: IVORY });
  s.addNotes("RQ1, post-repair replay. Recovery is the share of the algebraic contract's modeled arithmetic saving " +
    "that a contract keeps. Strict already keeps most on small integers because those rewrites are bit-identical. " +
    "Real-valued domains keep less after the underflow repair; that is deliberate." +
    SRC("paper/generated-review/tab-recovery.tex"));

  // ---- 9. checked ----
  s = content("Results");
  head(s, K("Correctness"), "Checked, not assumed");
  const checks = [
    ["0", `wrong outputs in ${M.RqTwoRuns} runs`, "every output certified bit-identical matched the unoptimized program"],
    ["0", `changes in ${M.LlvmStressCases} attack cases`, `inputs built to break the proof; fast\u2011math changed ${M.LlvmStressFastMathInt}`],
    [String(certs.checked_certificates), "certificates replayed", `in exact rational arithmetic by a separate checker, ${certs.failures} failures`],
  ];
  checks.forEach(([big, what, why], i) => {
    const x = 0.7 + i * 4.05;
    box(s, x, 1.95, 3.8, 4.55, { name: "check " + i });
    txt(s, big, { x: x + 0.4, y: 2.25, w: 3.0, h: 2.1, fontSize: 130, bold: true, fontFace: "Cambria", color: GOLD });
    txt(s, what, { x: x + 0.4, y: 4.6, w: 3.0, h: 0.75, fontSize: 20, bold: true });
    txt(s, why, { x: x + 0.4, y: 5.45, w: 3.0, h: 0.9, fontSize: 14, color: MUTED });
  });
  s.addNotes("RQ2: 4,800 programs x 3 input seeds x 4 arms, post-repair. RQ8: 784 adversarial cases for each " +
    "licensed and integer-accumulating build: all-maximum, cancelling and odd-maximum inputs at each guard's limit, " +
    "one past it and twice it. A mutant that admits one extra bit is caught on " + M.LlvmStressMutantBitInt +
    " cases, so the condition cannot be relaxed. Certificates: " + certs.programs + " programs, " +
    certs.accepted_compilations + " accepted compilations, " + certs.levels["bit-identical"] + " bit-identical and " +
    certs.levels["bound-preserving"] + " bound-preserving records; conditional on the supplied facts." +
    SRC("results/review-revision/certificates/verification.json"));

  // ---- 10. real code + honest scope ----
  pres.addSection({ title: "Conclusion" });
  s = content("Conclusion");
  head(s, K("Real code, honest scope"), "Where it helps, and what it costs");
  const real = [
    [`${M.LlvmScanVersioned} / ${M.LlvmScanReductions}`, "reductions sped up in four real code bases (CPython audioop, Pillow)"],
    [`${M.LlvmAudioopIdentical} / ${M.LlvmAudioopResults}`, "identical audioop results with and without the pass"],
    [`${M.LlvmAudioopAvgEight}×`, "faster average of 8-bit audio samples"],
  ];
  real.forEach(([big, sub], i) => {
    const y = 2.0 + i * 1.5;
    txt(s, big, { x: 0.7, y, w: 3.2, h: 1.0, fontSize: 44, bold: true, fontFace: "Cambria", color: GOLD, valign: "middle" });
    txt(s, sub, { x: 4.0, y, w: 3.1, h: 1.0, fontSize: 15, color: IVORY, valign: "middle" });
  });
  box(s, 7.6, 1.95, 5.05, 4.6, { name: "limits" });
  txt(s, "LIMITS", { x: 8.0, y: 2.25, w: 4, h: 0.3, fontSize: 12, bold: true, color: RED, charSpacing: 4 });
  const lim = [
    [`+${M.LlvmCompileOverheadPct}% compile time, +${M.LlvmCompileTextGrowthPct}% code size`, "from loop versioning"],
    ["Bit-identical speedups need integer data", "real-valued sums are declined"],
    ["The proof covers regrouping only", "the LLVM pass is tested, not verified"],
  ];
  lim.forEach(([a, b], i) => {
    const y = 2.8 + i * 1.2;
    txt(s, a, { x: 8.0, y, w: 4.4, h: 0.45, fontSize: 17, bold: true });
    txt(s, b, { x: 8.0, y: y + 0.45, w: 4.4, h: 0.4, fontSize: 14, color: MUTED });
  });
  s.addNotes("RQ9: the pass licensed 23 of 109 floating-point add reductions in audioop, Pillow, SciPy ndimage " +
    "and PolyBench/C, all behind a guard (16 in audioop, 7 in Pillow; ndimage and PolyBench sum real data and are " +
    "correctly declined). These are selected code bases, not a general coverage claim. Compile time " +
    M.LlvmCompileStrictMs + " to " + M.LlvmCompileLicensedMs + " ms; text 4,149 to 5,801 bytes. LLVM's reassoc " +
    "flag permits more than regrouping the same terms, so the theorem is not a proof of the whole pipeline." +
    SRC("paper/generated/tab-llvm-scan.tex"));

  // ---- 11. close ----
  s = pres.addSlide({ masterName: "COVER", sectionTitle: "Conclusion" });
  txt(s, "TAKEAWAY", { x: 0.8, y: 1.15, w: 8, h: 0.4, fontSize: 13, bold: true, color: GOLD, charSpacing: 5 });
  s.addText("Fast exactly where it is provably safe", { placeholder: "title" });
  txt(s, "A guarantee for every rewrite, a certificate for every output.",
    { x: 0.8, y: 4.15, w: 8.0, h: 0.5, fontSize: 20, italic: true, color: IVORY });
  txt(s, "Thank you  ·  Questions?", { x: 0.8, y: 5.35, w: 8.0, h: 0.6, fontSize: 24, bold: true, color: GOLD });
  box(s, 9.7, 1.7, 2.85, 3.75, { fill: BG, line: GOLD, lw: 1.25, name: "repo card" });
  s.addImage({ data: await qr(), x: 10.1, y: 2.05, w: 2.05, h: 2.05, hyperlink: { url: REPO_URL },
    altText: "QR code linking to " + REPO_URL });
  s.addImage({ data: await icon(fa.FaGithub, HEX.accent1), x: 10.1, y: 4.35, w: 0.3, h: 0.3 });
  txt(s, "Try it yourself", { x: 10.5, y: 4.35, w: 1.9, h: 0.3, fontSize: 12, bold: true, color: GOLD, valign: "middle" });
  txt(s, [{ text: REPO, options: { hyperlink: { url: REPO_URL } } }],
    { x: 9.8, y: 4.8, w: 2.65, h: 0.3, fontSize: 10.5, color: IVORY, align: "center" });
  txt(s, "make && make test", { x: 9.7, y: 5.7, w: 2.85, h: 0.35, fontSize: 13, fontFace: "Courier New",
    color: MUTED, align: "center" });
  s.addNotes("Close: instead of an on/off switch, the compiler proves which guarantee each rewrite keeps and " +
    "labels every output. Build and test: make && make test; the LLVM pass needs LLVM/Clang 18: " +
    "make -C llvm && make -C llvm test. Repository: " + REPO_URL + SRC("paper/README.md"));

  await pres.writeFile({ fileName: OUT });
  if (APPLY) await require(APPLY).applyTheme(OUT, THEME);
  console.log("wrote " + OUT);
}

main().catch(e => { console.error(e); process.exit(1); });
