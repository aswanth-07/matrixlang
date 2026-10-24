// build-final-deck.js -- the presentation of the revised manuscript
// "Proof-Guided Floating-Point Optimization: Exact Reassociation, Error
// Bounds, and Compiler Certificates" (24 October 2026 revision).
//
//   cd <dir with pptxgenjs, react-icons, react, react-dom, sharp and qrcode> &&
//   node /path/to/tools/build-final-deck.js [OUT.pptx] [path/to/apply_theme.js]
//
// Numbers come from the paper's generated macros (generated/*.tex, with the
// post-repair overrides in generated-review/contracts.tex) and from
// results/contracts/llvm_summary.json, so the deck says what the paper says.
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

// ---- numbers from the paper's generated macros ---------------------------------
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

// ---- theme ----------------------------------------------------------------------
const THEME = {
  name: "Proof-Guided FP",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "16233A", lt1: "FFFFFF", dk2: "44546A", lt2: "EEF2F7",
    accent1: "E9A23B", accent2: "1F9D74", accent3: "D1495B", accent4: "3E6FA3",
    accent5: "8A9BB0", accent6: "6B5B95", hlink: "3E6FA3", folHlink: "6B5B95",
  },
};
const HEX = THEME.colors;

async function icon(Comp, color, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: "#" + color, size }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}
async function qr(dark, light) {
  const buf = await QRCode.toBuffer(REPO_URL, { margin: 1, width: 600, color: { dark: "#" + dark, light: "#" + light } });
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

  // ---- layouts ----
  pres.defineSlideMaster({
    title: "TITLE_DARK",
    background: { color: C.text1 },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 1.55, w: 8.2, h: 2.0,
        fontSize: 40, bold: true, color: C.background1, valign: "bottom", align: "left" }, text: "" } },
      { placeholder: { options: { name: "body", type: "body", x: 0.8, y: 3.75, w: 8.2, h: 2.9,
        fontSize: 18, color: C.background2, valign: "top" }, text: "" } },
    ],
  });
  pres.defineSlideMaster({
    title: "CONTENT",
    background: { color: C.background1 },
    margin: [0.5, 0.6, 0.5, 0.6],
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.35, w: 12.1, h: 0.85,
        fontSize: 30, bold: true, color: C.text1, valign: "middle" }, text: "" } },
      { text: { text: REPO, options: { x: 0.6, y: 7.0, w: 5, h: 0.3, fontSize: 10, color: C.accent5,
        margin: 0 } } },
    ],
    slideNumber: { x: 12.4, y: 7.0, w: 0.6, h: 0.3, fontSize: 10, color: C.accent5 },
  });

  const card = (s, x, y, w, h, fill, name) =>
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: fill },
      line: { color: fill }, objectName: name,
      shadow: { type: "outer", color: "000000", opacity: 0.10, blur: 6, offset: 2, angle: 90 } });
  const txt = (s, text, o) => s.addText(text, { isTextBox: true, margin: 0, valign: "top", ...o });
  const disc = async (s, Comp, x, y, d, fill) => {
    s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill } });
    s.addImage({ data: await icon(Comp, "FFFFFF"), x: x + d * 0.24, y: y + d * 0.24, w: d * 0.52, h: d * 0.52 });
  };
  const pill = (s, text, x, y, w, fill, color) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.36, rectRadius: 0.18,
      fill: { color: fill }, line: { color: fill } });
    txt(s, text, { x, y, w, h: 0.36, fontSize: 12, bold: true, color, align: "center", valign: "middle" });
  };
  const bullets = (items) => items.map((t, i) =>
    ({ text: t, options: { bullet: true, breakLine: i < items.length - 1 } }));
  const chartText = { // one look for every chart in the deck
    catAxisLabelFontSize: 12, valAxisLabelFontSize: 11, catAxisLabelFontFace: "+mn-lt",
    valAxisLabelFontFace: "+mn-lt", catAxisLabelColor: HEX.dk2, valAxisLabelColor: HEX.dk2,
    legendFontSize: 12, legendFontFace: "+mn-lt", legendColor: HEX.dk2, titleFontSize: 14,
    titleColor: HEX.dk1, titleFontFace: "+mn-lt", dataLabelFontSize: 10, dataLabelColor: HEX.dk2,
    dataLabelFontFace: "+mn-lt",
  };
  const SRC = "\n\nSource: " + REPO_URL + "/blob/main/paper/matrixlang.tex";

  // ---- 1. title ----
  pres.addSection({ title: "Introduction" });
  let s = pres.addSlide({ masterName: "TITLE_DARK", sectionTitle: "Introduction" });
  txt(s, "MATRIXLANG  ·  EXACTREDUCE", { x: 0.8, y: 0.9, w: 8, h: 0.4, fontSize: 14, bold: true,
    color: C.accent1, charSpacing: 3 });
  s.addText("Proof-Guided Floating-Point Optimization", { placeholder: "title" });
  s.addText([
    { text: "Exact Reassociation, Error Bounds, and Compiler Certificates",
      options: { fontSize: 22, italic: true, breakLine: true } },
    { text: " ", options: { fontSize: 12, breakLine: true } },
    { text: "A Aswanth Raj  ·  Dr. Ranjithkumar S", options: { bold: true, color: C.background1, breakLine: true } },
    { text: "School of Computer Science and Engineering, VIT Vellore", options: { breakLine: true } },
    { text: "Revised manuscript, October 2026", options: { color: C.accent5 } },
  ], { placeholder: "body" });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 9.75, y: 1.75, w: 2.8, h: 3.55, rectRadius: 0.15,
    fill: { color: C.background1 }, line: { color: C.background1 }, objectName: "GitHub card" });
  s.addImage({ data: await qr(HEX.dk1, "FFFFFF"), x: 10.05, y: 2.0, w: 2.2, h: 2.2,
    hyperlink: { url: REPO_URL }, altText: "QR code linking to " + REPO_URL });
  s.addImage({ data: await icon(fa.FaGithub, HEX.dk1), x: 10.05, y: 4.38, w: 0.32, h: 0.32 });
  txt(s, "Code, data and paper", { x: 10.45, y: 4.38, w: 1.95, h: 0.32, fontSize: 12, bold: true,
    color: C.text1, valign: "middle" });
  txt(s, [{ text: REPO, options: { hyperlink: { url: REPO_URL } } }],
    { x: 9.85, y: 4.8, w: 2.6, h: 0.3, fontSize: 11, color: C.accent4, align: "center" });
  s.addNotes("Compilers either keep floating-point evaluation order (strict) or drop it wholesale " +
    "(fast-math). We show that facts about the input values let a compiler prove, rewrite by rewrite, " +
    "which guarantee is kept, and attach that guarantee to every output. Two implementations: the " +
    "MatrixLang compiler and the ExactReduce LLVM pass. Code, data and paper: " + REPO_URL + SRC);

  // ---- 2. problem ----
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Introduction" });
  s.addText("Compilers offer a switch: strict or fast", { placeholder: "title" });
  card(s, 0.6, 1.45, 5.9, 2.55, C.background2, "strict card");
  await disc(s, fa.FaShieldAlt, 0.9, 1.75, 0.8, C.accent4);
  txt(s, "Strict IEEE 754", { x: 1.95, y: 1.85, w: 4.3, h: 0.5, fontSize: 22, bold: true, color: C.text1 });
  txt(s, "Keeps the evaluation order of the source, even when the values make reordering exact. " +
    "Sums stay sequential, so loops do not vectorize.",
    { x: 1.95, y: 2.45, w: 4.3, h: 1.4, fontSize: 16, color: C.text2 });
  card(s, 6.85, 1.45, 5.9, 2.55, C.background2, "fast-math card");
  await disc(s, fa.FaBolt, 7.15, 1.75, 0.8, C.accent3);
  txt(s, "-ffast-math", { x: 8.2, y: 1.85, w: 4.3, h: 0.5, fontSize: 22, bold: true, color: C.text1 });
  txt(s, "Reorders and vectorizes freely. It says what the compiler may do, not what the result is: " +
    "nobody knows which outputs changed, or by how much.",
    { x: 8.2, y: 2.45, w: 4.3, h: 1.4, fontSize: 16, color: C.text2 });
  txt(s, "Why order matters", { x: 0.6, y: 4.35, w: 6, h: 0.45, fontSize: 20, bold: true, color: C.text1 });
  txt(s, "Every floating-point operation rounds, so addition is not associative. Signed zeros, NaN and " +
    "infinities also break x·0 = 0 and x + 0 = x.", { x: 0.6, y: 4.9, w: 5.9, h: 1.3, fontSize: 16, color: C.text2 });
  card(s, 6.85, 4.35, 5.9, 2.2, C.text1, "order example");
  txt(s, [
    { text: "(0.1 + 0.2) + 0.3  =  0.6000000000000001", options: { breakLine: true } },
    { text: "0.1 + (0.2 + 0.3)  =  0.6", options: {} },
  ], { x: 7.2, y: 4.75, w: 5.3, h: 1.0, fontSize: 15, fontFace: "Courier New", color: C.background1,
    paraSpaceAfter: 8 });
  txt(s, "Same terms, different grouping, different bits", { x: 7.2, y: 5.9, w: 5.3, h: 0.4,
    fontSize: 14, italic: true, color: C.accent1 });
  s.addNotes("Strict compilation keeps order even when the input values would make reordering exact. " +
    "Fast-math grants permissions, but a permission does not state what the result is: after " +
    "-fassociative-math a programmer cannot tell which outputs still equal the strict program." + SRC);

  // ---- 3. the values decide ----
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Introduction" });
  s.addText("The input values decide which guarantee holds", { placeholder: "title" });
  card(s, 0.6, 1.45, 5.0, 5.15, C.background2, "chain example");
  txt(s, "One chain, two bracketings", { x: 0.95, y: 1.7, w: 4.4, h: 0.45, fontSize: 18, bold: true, color: C.text1 });
  txt(s, "R = A · B · C", { x: 0.95, y: 2.25, w: 4.4, h: 0.55, fontSize: 26, bold: true,
    fontFace: "Cambria", color: C.text1 });
  txt(s, "A, C: 100 × 2      B: 2 × 100", { x: 0.95, y: 2.85, w: 4.4, h: 0.4, fontSize: 15, color: C.text2 });
  txt(s, "69,800", { x: 0.95, y: 3.55, w: 2.1, h: 0.7, fontSize: 32, bold: true, color: C.accent3 });
  txt(s, "operations in source order (AB)C", { x: 0.95, y: 4.25, w: 2.1, h: 0.7, fontSize: 13, color: C.text2 });
  s.addShape(pres.shapes.RIGHT_ARROW, { x: 3.0, y: 3.75, w: 0.4, h: 0.32, fill: { color: C.accent5 }, line: { color: C.accent5 } });
  txt(s, "1,396", { x: 3.55, y: 3.55, w: 1.9, h: 0.7, fontSize: 32, bold: true, color: C.accent2 });
  txt(s, "operations as A(BC)", { x: 3.55, y: 4.25, w: 1.9, h: 0.7, fontSize: 13, color: C.text2 });
  txt(s, "The reordering is 50× cheaper. Is it allowed? That depends on the data, not the program text.",
    { x: 0.95, y: 5.25, w: 4.4, h: 1.1, fontSize: 15, italic: true, color: C.text1 });
  const cases = [
    [fa.FaCheckCircle, C.accent2, "8-bit integers", "Bit-identical",
      "Every product and partial sum is an integer of at most 29 bits: both bracketings return the same bits."],
    [fa.FaRulerHorizontal, C.accent1, "Larger integers", "Bound-preserving",
      "Exactness can fail, but the componentwise error bound is the same for every bracketing."],
    [fa.FaQuestionCircle, C.accent5, "Reals in [−1, 1] alone", "Not enough",
      "A magnitude bound admits inexact underflow; a representable grid is also needed."],
    [fa.FaExclamationTriangle, C.accent3, "Unbounded values", "Relaxed",
      "One bracketing may overflow where the other does not: valid only over the reals."],
  ];
  for (let i = 0; i < cases.length; i++) {
    const [Ic, col, dom, lvl, why] = cases[i];
    const y = 1.45 + i * 1.32;
    await disc(s, Ic, 6.0, y + 0.12, 0.7, col);
    txt(s, [{ text: dom + "  ", options: { color: C.text1 } }, { text: "→ " + lvl, options: { color: col } }],
      { x: 6.9, y: y + 0.05, w: 5.85, h: 0.42, fontSize: 18, bold: true });
    txt(s, why, { x: 6.9, y: y + 0.5, w: 5.85, h: 0.75, fontSize: 14, color: C.text2 });
  }
  s.addNotes("The paper's motivating example. Source order costs 69,800 scalar operations, A(BC) 1,396. " +
    "With 8-bit integers both bracketings compute the same bits, so even a strict compiler may reorder. " +
    "With larger integers exactness may fail but the error bound is unchanged. A declaration of reals " +
    "in [-1, 1] alone is insufficient because it admits inexact underflow. Unbounded values: relaxed." + SRC);

  // ---- 4. levels and contracts ----
  pres.addSection({ title: "Approach" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Approach" });
  s.addText("Three guarantee levels, three contracts", { placeholder: "title" });
  const levels = [
    [fa.FaCheckCircle, C.accent2, "Bit-identical", "Same bits as the program as written, for every admitted input.",
      ["Strict", "Bounded", "Algebraic"]],
    [fa.FaRulerHorizontal, C.accent1, "Bound-preserving", "Bits may change; the stated worst-case error bound still holds.",
      ["Bounded", "Algebraic"]],
    [fa.FaExclamationTriangle, C.accent3, "Relaxed", "Holds over the real numbers only, as fast-math assumes.",
      ["Algebraic"]],
  ];
  for (let i = 0; i < 3; i++) {
    const [Ic, col, head, body, by] = levels[i];
    const x = 0.6 + i * 4.13;
    card(s, x, 1.45, 3.85, 4.15, C.background2, head + " card");
    await disc(s, Ic, x + 0.3, 1.75, 0.85, col);
    txt(s, head, { x: x + 0.3, y: 2.8, w: 3.3, h: 0.5, fontSize: 22, bold: true, color: C.text1 });
    txt(s, body, { x: x + 0.3, y: 3.35, w: 3.3, h: 1.1, fontSize: 16, color: C.text2 });
    txt(s, "Admitted under", { x: x + 0.3, y: 4.55, w: 3.3, h: 0.3, fontSize: 12, bold: true, color: C.accent5 });
    by.forEach((c, j) => pill(s, c, x + 0.3 + j * 1.1, 4.95, 1.0, col, C.background1));
  }
  card(s, 0.6, 5.85, 12.1, 0.85, C.text1, "certificate rule");
  await disc(s, fa.FaCertificate, 0.85, 5.97, 0.6, C.accent1);
  txt(s, "Every output is certified with the weakest level among the rewrites that reach it. Strict is the default.",
    { x: 1.65, y: 5.85, w: 10.8, h: 0.85, fontSize: 17, bold: true, color: C.background1, valign: "middle" });
  s.addNotes("Each rewrite is classified as bit-identical, bound-preserving or relaxed. The contract selects " +
    "which levels may be applied: strict only bit-identical, bounded also bound-preserving, algebraic all. " +
    "A rewrite inherits the level of the facts its proof read, and each output's certificate is the " +
    "weakest level along its path. RQ2 found the case that makes this inheritance rule necessary." + SRC);

  // ---- 5. same program, four domains ----
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Approach" });
  s.addText("Same program, four input domains", { placeholder: "title" });
  txt(s, "R = ABC with shapes 40×2, 2×40, 40×2: modeled arithmetic after optimization (11,120 in source order) " +
    "and the certificate of print(R), as the compiler reports them.",
    { x: 0.6, y: 1.35, w: 12.1, h: 0.65, fontSize: 15, color: C.text2 });
  const LV = { "bit-identical": C.accent2, "bound-pres.": C.accent1, relaxed: C.accent3 };
  const hdr = (t) => ({ text: t, options: { bold: true, color: C.background1, fill: { color: C.text1 }, fontSize: 16, align: "center" } });
  const intro = [
    ["input(int8)", "556 bit-identical", "556 bit-identical", "556 bit-identical"],
    ["input(int32)", "11,120 bit-identical", "556 bound-pres.", "556 bound-pres."],
    ["input(real(1))", "11,120 bit-identical", "11,120 bit-identical", "556 relaxed"],
    ["input(real)", "11,120 bit-identical", "11,120 bit-identical", "556 relaxed"],
  ];
  const rows = [[hdr("Input domain"), hdr("strict"), hdr("bounded"), hdr("algebraic")]];
  for (const r of intro) {
    rows.push([{ text: r[0], options: { fontFace: "Courier New", fontSize: 16, color: C.text1, bold: true } },
      ...r.slice(1).map(c => {
        const [ops, ...lv] = c.split(" ");
        const level = lv.join(" ");
        return { text: [
          { text: ops + "  ", options: { bold: true, color: C.text1 } },
          { text: level, options: { color: LV[level] } },
        ], options: { fontSize: 16, align: "center" } };
      })]);
  }
  s.addTable(rows, { x: 0.6, y: 2.15, w: 12.1, colW: [3.1, 3.0, 3.0, 3.0], rowH: 0.62, valign: "middle",
    border: { type: "solid", pt: 0.75, color: "D5DCE4" }, fill: { color: C.background1 } });
  txt(s, [
    { text: "Read the rows: ", options: { bold: true, color: C.text1 } },
    { text: "8-bit data is reordered even under strict. 32-bit data needs the bounded contract. Real data in [−1, 1] " +
      "keeps the source order until algebraic, because a magnitude bound alone cannot exclude inexact underflow.",
      options: { color: C.text2 } },
  ], { x: 0.6, y: 5.55, w: 12.1, h: 1.1, fontSize: 16 });
  s.addNotes("Table 1 of the revised paper, under the repaired admission rule. The program text is the same " +
    "in every row; only the declared input domain changes. Note the real(1) row: before the underflow repair, " +
    "bounded mode reordered it; now it is refused." +
    "\n\nSource: " + REPO_URL + "/blob/main/paper/generated/tab-intro.tex");

  // ---- 6. pipeline ----
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Approach" });
  s.addText("From input facts to certified outputs", { placeholder: "title" });
  const steps = [
    [fa.FaDatabase, "Input facts", "Grid and magnitude of every value: declared domains or LLVM integer conversions"],
    [fa.FaBalanceScale, "Obligations", "Do sub-chains fit in 53 bits? Is the product grid representable? Does the bound hold?"],
    [fa.FaGavel, "Admission", "The contract accepts or refuses each rewrite by its level"],
    [fa.FaCogs, "Optimize", "Chain reordering, identity rewrites, OpenMP reductions, LLVM reassoc"],
    [fa.FaCertificate, "Certify", "Guarantee label per output; obligations exported for exact replay"],
  ];
  for (let i = 0; i < steps.length; i++) {
    const [Ic, head, body] = steps[i];
    const x = 0.6 + i * 2.5, last = i === steps.length - 1;
    card(s, x, 1.5, 2.2, 4.0, last ? C.text1 : C.background2, "step " + (i + 1));
    await disc(s, Ic, x + 0.7, 1.8, 0.8, last ? C.accent1 : C.accent4);
    txt(s, head, { x: x + 0.15, y: 2.8, w: 1.9, h: 0.5, fontSize: 18, bold: true, align: "center",
      color: last ? C.background1 : C.text1 });
    txt(s, body, { x: x + 0.2, y: 3.4, w: 1.8, h: 2.0, fontSize: 14, color: last ? C.background2 : C.text2 });
    if (!last)
      s.addShape(pres.shapes.RIGHT_ARROW, { x: x + 2.24, y: 3.35, w: 0.22, h: 0.3,
        fill: { color: C.accent5 }, line: { color: C.accent5 } });
  }
  txt(s, [
    { text: "Checked at run time: ", options: { bold: true, color: C.text1 } },
    { text: "MatrixLang validates each input against its declared domain once at load; ExactReduce checks the " +
      "start value and trip count on loop entry and falls back to the strict loop.", options: { color: C.text2 } },
  ], { x: 0.6, y: 5.85, w: 12.1, h: 0.9, fontSize: 16 });
  s.addNotes("The overview added in the revision. Facts are grid (every value is a multiple of 2^G) and " +
    "magnitude. Obligations follow from the theorems on the next slide. The contract admits a rewrite " +
    "only if its level is allowed. MATRIXC_CERTIFICATE_JSONL exports applied chain obligations for an " +
    "independent rational checker." + SRC);

  // ---- 7. theory ----
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Approach" });
  s.addText("Three results behind the decisions", { placeholder: "title" });
  const thms = [
    ["Theorem 1", "Correctly rounded chains", C.accent2,
      "If every proper sub-chain fits in the significand and the final sums round at most once, every " +
      "bracketing and summation order returns fl(A₁⋯Aₖ): bit-identical."],
    ["Proposition 2", "Guarded reductions", C.accent4,
      "Terms on a grid 2ᴳ with |s₀|/2ᴳ + N·K ≤ 2ᵖ: every summation tree returns the exact sum. " +
      "The condition is checked once on loop entry."],
    ["Theorem 3", "Bracketing invariance", C.accent1,
      "Without overflow or inexact underflow, the componentwise error bound of a matrix chain is the " +
      "same for every bracketing."],
  ];
  for (let i = 0; i < 3; i++) {
    const [tag, head, col, body] = thms[i];
    const x = 0.6 + i * 4.13;
    card(s, x, 1.45, 3.85, 3.6, C.background2, tag);
    pill(s, tag, x + 0.3, 1.75, 1.6, col, C.background1);
    txt(s, head, { x: x + 0.3, y: 2.3, w: 3.3, h: 0.5, fontSize: 20, bold: true, color: C.text1 });
    txt(s, body, { x: x + 0.3, y: 2.85, w: 3.3, h: 2.1, fontSize: 15, color: C.text2 });
  }
  card(s, 0.6, 5.35, 12.1, 1.3, C.text1, "tightness");
  txt(s, "m* = 35,697", { x: 0.9, y: 5.35, w: 3.0, h: 1.3, fontSize: 30, bold: true, color: C.accent1, valign: "middle" });
  txt(s, "Largest admissible bound for int(0, m) chains 100×2 · 2×100 · 100×2, since 198·35,697³ ≤ 2⁵³. " +
    "The threshold is the true boundary on three of four measured families and one step from it on the fourth.",
    { x: 4.0, y: 5.35, w: 8.5, h: 1.3, fontSize: 15, color: C.background2, valign: "middle" });
  s.addNotes("Theorem 1 needs proper sub-chains exact because any bracketing can use them as operands; " +
    "checking only the whole chain is unsound (zero last operand, overflow to infinity, NaN). " +
    "Proposition 2 covers non-zero start values and run-time lengths. Theorem 3 is the bound-preserving " +
    "result; its premises now explicitly exclude overflow and inexact underflow. RQ3 measures tightness." + SRC);

  // ---- 8. underflow repair ----
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Approach" });
  s.addText("Revision: a magnitude bound is not enough", { placeholder: "title" });
  card(s, 0.6, 1.45, 5.9, 3.85, C.text1, "counterexample");
  await disc(s, fa.FaBug, 0.9, 1.7, 0.7, C.accent3);
  txt(s, "Counterexample (reproduced)", { x: 1.8, y: 1.78, w: 4.5, h: 0.5, fontSize: 20, bold: true, color: C.background1 });
  txt(s, [
    { text: "q = 2⁻¹⁰⁷⁴,  a = 3q,  b = 1/2,  c = 3/4", options: { breakLine: true } },
    { text: "(ab)c  →  2q", options: { breakLine: true } },
    { text: "a(bc)  →  q", options: { breakLine: true } },
    { text: "exact  =  9q/8", options: {} },
  ], { x: 0.9, y: 2.55, w: 5.3, h: 1.75, fontSize: 16, fontFace: "Courier New", color: C.background2, paraSpaceAfter: 6 });
  txt(s, "Both results violate the previously claimed relative-error bound: the values sit inside [−1, 1] " +
    "but underflow inexactly.", { x: 0.9, y: 4.35, w: 5.3, h: 0.85, fontSize: 14, italic: true, color: C.accent1 });
  card(s, 6.85, 1.45, 5.9, 3.85, C.background2, "repair");
  await disc(s, fa.FaTools, 7.15, 1.7, 0.7, C.accent2);
  txt(s, "Repair", { x: 8.05, y: 1.78, w: 4.5, h: 0.5, fontSize: 20, bold: true, color: C.text1 });
  txt(s, bullets([
    "Bounded admission now requires a representable product grid, a magnitude ceiling and slack for accumulated error",
    "Excludes inexact underflow; exact subnormal results stay allowed",
    "Deliberately conservative: a general real(1) chain is refused",
    "Four new regression tests, including certificate falsification",
  ]), { x: 7.15, y: 2.5, w: 5.3, h: 2.7, fontSize: 15, color: C.text2, paraSpaceAfter: 6 });
  const rep = [
    [`${+M.RqOneRecoveryIntEightBounded}%`, "integer domains, unchanged", C.accent2],
    [`${M.RqOneRecoveryMixedBounded}%`, "mixed domains", C.accent1],
    [`${M.RqOneRecoveryRealBounded}%`, "real(1)", C.accent3],
  ];
  txt(s, "Bounded recovery after the repair (RQ1 replay)", { x: 0.6, y: 5.55, w: 4.0, h: 0.9, fontSize: 15,
    bold: true, color: C.text1, valign: "middle" });
  rep.forEach(([big, small, col], i) => {
    txt(s, big, { x: 4.7 + i * 2.7, y: 5.45, w: 2.6, h: 0.65, fontSize: 30, bold: true, color: col });
    txt(s, small, { x: 4.7 + i * 2.7, y: 6.1, w: 2.6, h: 0.4, fontSize: 13, color: C.text2 });
  });
  s.addNotes("The reviewer's counterexample is valid and runs through MatrixLang in a 2x1, 1x2, 2x1 embedding. " +
    "The repaired check requires a representable product grid in addition to a magnitude ceiling and " +
    "explicit slack. RQ1 and RQ2 were replayed in full on a separately built compiler: 15,000 programs " +
    "and 60,000 compilations; 57,600 arm executions; zero errors and zero bit-identical mismatches. " +
    "Historical real-domain bounded timings are kept with their interpretation withdrawn." +
    "\n\nSource: " + REPO_URL + "/blob/main/paper/review-response.md");

  // ---- 9. two implementations ----
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Approach" });
  s.addText("Two implementations", { placeholder: "title" });
  card(s, 0.6, 1.45, 5.9, 4.7, C.background2, "MatrixLang card");
  await disc(s, fa.FaProjectDiagram, 0.9, 1.75, 0.8, C.accent4);
  txt(s, "MatrixLang compiler", { x: 1.95, y: 1.8, w: 4.3, h: 0.45, fontSize: 22, bold: true, color: C.text1 });
  txt(s, "Flex, Bison and C11", { x: 1.95, y: 2.25, w: 4.3, h: 0.35, fontSize: 14, italic: true, color: C.accent5 });
  txt(s, bullets([
    "Straight-line matrix language; inputs declare domains such as input(int8) or input(real(1))",
    "Shape checking, three-address code, typed stack VM",
    "Reorders matrix chains under the selected contract",
    "C backend with OpenMP reduction clauses",
    "Certificate for every output, exportable as JSON Lines",
  ]), { x: 0.9, y: 2.9, w: 5.3, h: 3.6, fontSize: 16, color: C.text2, paraSpaceAfter: 8 });
  card(s, 6.85, 1.45, 5.9, 4.7, C.background2, "ExactReduce card");
  await disc(s, fa.FaMicrochip, 7.15, 1.75, 0.8, C.accent2);
  txt(s, "ExactReduce LLVM pass", { x: 8.2, y: 1.8, w: 4.3, h: 0.45, fontSize: 22, bold: true, color: C.text1 });
  txt(s, "LLVM 18, VectorizerStart, clang -fpass-plugin", { x: 8.2, y: 2.25, w: 4.3, h: 0.35, fontSize: 14, italic: true, color: C.accent5 });
  txt(s, bullets([
    "Derives grid facts from integer conversions in ordinary C",
    "Proves a reduction exact statically, or guards it with a strict fallback loop",
    "Sets reassoc only on supported add, sub and fmuladd recurrences; no broader flags",
    "Or replaces floating-point accumulation with integer accumulation",
  ]), { x: 7.15, y: 2.9, w: 5.3, h: 3.6, fontSize: 16, color: C.text2, paraSpaceAfter: 8 });
  s.addNotes("MatrixLang demonstrates the full idea with declared domains and per-output certificates. " +
    "ExactReduce brings related checks to ordinary C in a production compiler. Standalone products do " +
    "not acquire reassoc. New structural IR checks on nine smoke functions confirm declined reductions " +
    "and products acquire no reassoc, broader fast-math flags are absent and guarded functions keep " +
    "strict fallbacks." + "\n\nSource: " + REPO_URL + "/blob/main/llvm/README.md");

  // ---- 10. RQ1 recovery chart ----
  pres.addSection({ title: "Results" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Results" });
  s.addText("RQ1: how much optimization each contract keeps", { placeholder: "title" });
  const doms = [["Bool", "bool"], ["UintEight", "uint8"], ["IntEight", "int8"], ["IntOneSix", "int16"],
    ["IntThreeTwo", "int32"], ["Dyadic", "dyadic"], ["Broad", "broad lit."], ["Mixed", "mixed"],
    ["Real", "real(1)"], ["Realx", "real"]];
  const rec = (d, c) => +M[`RqOneRecovery${d}${c}`];
  s.addChart(pres.charts.BAR, [
    { name: "strict", labels: doms.map(d => d[1]), values: doms.map(d => rec(d[0], "Strict")) },
    { name: "bounded", labels: doms.map(d => d[1]), values: doms.map(d => rec(d[0], "Bounded")) },
  ], { x: 0.6, y: 1.35, w: 8.4, h: 5.4, barDir: "col", barGrouping: "clustered", barGapWidthPct: 60,
    chartColors: [HEX.accent4, HEX.accent1], showTitle: true,
    title: "Share of the algebraic saving recovered (%), post-repair replay", showLegend: true, legendPos: "b",
    valAxisMaxVal: 100, valAxisMinVal: 0, valAxisMajorUnit: 25,
    valGridLine: { color: "DDE3EA", size: 0.5 }, catGridLine: { style: "none" },
    showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "0", ...chartText });
  const side = (big, small, y, col) => {
    txt(s, big, { x: 9.4, y, w: 3.3, h: 0.75, fontSize: 36, bold: true, color: col });
    txt(s, small, { x: 9.4, y: y + 0.75, w: 3.3, h: 0.7, fontSize: 14, color: C.text2 });
  };
  side(M.RqOnePrograms, `programs, ${M.RqOneCompiles} compilations, none failing`, 1.5, C.text1);
  side("100%", "bounded recovery on every integer and literal domain", 3.2, C.accent1);
  side(`${M.RqOneRecoveryRealBounded}%`, "on real(1): the conservative price of excluding underflow", 4.9, C.accent3);
  s.addNotes("Recovery is the share of the algebraic contract's modeled saving that a contract keeps. Strict " +
    "already recovers most on small integers (bool 98.8%, int8 83.6%) because those rewrites are bit-identical. " +
    "Bounded recovers everything on integer and literal domains. Real-valued domains lose recovery after the " +
    "underflow repair; this is the deliberate, conservative trade." +
    "\n\nSource: " + REPO_URL + "/blob/main/paper/generated-review/tab-recovery.tex");

  // ---- 11. LLVM speed chart ----
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Results" });
  s.addText("RQ7: fast-math speed with strict bits in LLVM", { placeholder: "title" });
  const order = ["sum_u8", "sumsq_u8", "gram_u8", "qlinear_i8", "degree_u8", "walks2_u8", "gemm_i8", "energy_i16", "sum_i32"];
  const labels = ["Pixel sum", "Sum sq.", "Gram", "int8 model", "Degrees", "2-walks", "GEMM", "Energy", "int32 sum"];
  s.addChart(pres.charts.BAR, [
    { name: "ExactReduce (strict bits)", labels, values: order.map(k => +llvm.bench[k].configs["clang-licensed"].speedup.toFixed(2)) },
    { name: "-ffast-math", labels, values: order.map(k => +llvm.bench[k].configs["clang-fast-math"].speedup.toFixed(2)) },
  ], { x: 0.6, y: 1.35, w: 8.4, h: 5.4, barDir: "col", barGrouping: "clustered", barGapWidthPct: 60,
    chartColors: [HEX.accent2, HEX.accent5], showTitle: true,
    title: "Speedup over strict Clang (×), MNIST, Cora and generated data", showLegend: true, legendPos: "b",
    valAxisMinVal: 0, valGridLine: { color: "DDE3EA", size: 0.5 }, catGridLine: { style: "none" },
    showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "0.0", ...chartText });
  side(`${M.LlvmBenchLicensedLo}–${M.LlvmBenchLicensedHi}×`, "faster than strict Clang on nine integer-data kernels", 1.5, C.accent2);
  side(`${M.LlvmBenchOfFastMathLo}–${M.LlvmBenchOfFastMathHi}%`, "of -ffast-math's speedup, with the strict result bits", 3.2, C.text1);
  side(`${M.BaseRewriteOfIntMedian}%`, "median speed of the integer rewrite vs. hand-written integer code", 4.9, C.accent4);
  s.addNotes("Tested Clang 18 pipeline on the M2 Xeon, medians of five processes with eleven runs each. " +
    "Licensed builds printed the strict result bits. A declined real-valued dot product and the binary32 " +
    "sum are not sped up, by design. The integer-accumulation route was measured on M1 under WSL." +
    "\n\nSource: " + REPO_URL + "/blob/main/paper/generated/tab-llvm-bench.tex");

  // ---- 12. soundness ----
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Results" });
  s.addText("Checked, not assumed", { placeholder: "title" });
  const checks = [
    [fa.FaCheckDouble, `0 / ${M.RqTwoRuns}`, "RQ2 arm executions where an output certified bit-identical differed (post-repair replay)", C.accent2],
    [fa.FaShieldAlt, `0 / ${M.LlvmStressCases}`, `adversarial cases changed by the licensed or integer build; ‑ffast‑math changed ${M.LlvmStressFastMathInt} integer cases`, C.accent2],
    [fa.FaCertificate, `${certs.checked_certificates}`, `chain certificates replayed in exact rational arithmetic: ${certs.levels["bit-identical"]} bit-identical, ${certs.levels["bound-preserving"]} bound-preserving, ${certs.failures} failures`, C.accent4],
    [fa.FaBug, M.LlvmStressMutantBitInt, "cases that caught a mutant admitting one extra bit: the guard cannot be relaxed by a bit", C.accent3],
  ];
  for (let i = 0; i < 4; i++) {
    const [Ic, big, small, col] = checks[i];
    const x = 0.6 + (i % 2) * 6.2, y = 1.45 + Math.floor(i / 2) * 2.55;
    card(s, x, y, 5.9, 2.3, C.background2, "check " + i);
    await disc(s, Ic, x + 0.3, y + 0.3, 0.75, col);
    txt(s, big, { x: x + 1.3, y: y + 0.25, w: 4.4, h: 0.85, fontSize: 36, bold: true, color: col, valign: "middle" });
    txt(s, small, { x: x + 0.3, y: y + 1.25, w: 5.3, h: 0.95, fontSize: 15, color: C.text2 });
  }
  txt(s, "Inputs are built from the proof obligations: all-maximum, cancelling and odd-maximum families at each " +
    "guard's limit, one past it and twice it. Every number is generated by scripts from raw measurements.",
    { x: 0.6, y: 6.5, w: 12.1, h: 0.45, fontSize: 12, italic: true, color: C.text2 });
  s.addNotes("RQ2: 4,800 programs, three input seeds, four arms. RQ8: 784 stress cases for each licensed and " +
    "integer-accumulating build, plus 20 integer-width boundary cases. Certificate replay: 221 programs, " +
    "660 accepted compilations, 262 records; conditional on the supplied operand facts. Random inputs rarely " +
    "break an unsound reassociation, which is why the tests are built from the obligations (RQ5)." +
    "\n\nSource: " + REPO_URL + "/blob/main/results/review-revision/certificates/verification.json");

  // ---- 13. existing code ----
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Results" });
  s.addText("RQ9: existing code bases", { placeholder: "title" });
  const real = [
    [fa.FaCode, C.accent4, `${M.LlvmScanVersioned} of ${M.LlvmScanReductions}`,
      `reductions licensed, all behind a guard: ${M.LlvmScanAudioopVersioned} in CPython's audioop and 7 in Pillow`],
    [fa.FaWaveSquare, C.accent2, `${M.LlvmAudioopIdentical} / ${M.LlvmAudioopResults}`,
      "identical audioop results, built with and without the pass, on both sides of every guard limit"],
    [fa.FaTachometerAlt, C.accent1, `${M.LlvmAudioopAvgEight}×`,
      `avg of 8-bit samples (rms ${M.LlvmAudioopRmsEight}×, findfit ${M.LlvmAudioopFindfitSixteen}×); 16-bit samples gain nothing`],
    [fa.FaBan, C.accent3, "0",
      "licensed in SciPy ndimage and PolyBench/C: their sums are real-valued, and are correctly declined"],
  ];
  for (let i = 0; i < real.length; i++) {
    const [Ic, col, big, small] = real[i];
    const y = 1.45 + i * 1.3;
    await disc(s, Ic, 0.7, y + 0.1, 0.8, col);
    txt(s, big, { x: 1.8, y, w: 2.9, h: 1.0, fontSize: 32, bold: true, color: C.text1, valign: "middle" });
    txt(s, small, { x: 4.8, y, w: 7.9, h: 1.0, fontSize: 17, color: C.text2, valign: "middle" });
  }
  txt(s, "Selected code bases: the result shows the license helps real integer sums, not general coverage.",
    { x: 0.6, y: 6.5, w: 12.1, h: 0.4, fontSize: 13, italic: true, color: C.text2 });
  s.addNotes("Four selected code bases: audioop, Pillow's imaging core, SciPy ndimage and the 30 PolyBench/C kernels. " +
    "16-bit samples gain nothing because the vectorizer speculates a one-byte stride. Most scientific " +
    "reductions sum real data and are declined; the 23/109 denominator and selection bias are kept." +
    "\n\nSource: " + REPO_URL + "/blob/main/paper/generated/tab-llvm-scan.tex");

  // ---- 14. costs and limits ----
  pres.addSection({ title: "Conclusion" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Conclusion" });
  s.addText("Costs and scope", { placeholder: "title" });
  card(s, 0.6, 1.45, 4.6, 5.2, C.background2, "costs card");
  txt(s, "Measured costs", { x: 0.95, y: 1.7, w: 4.0, h: 0.5, fontSize: 20, bold: true, color: C.text1 });
  txt(s, `+${M.LlvmCompileOverheadPct}%`, { x: 0.95, y: 2.35, w: 4.0, h: 0.8, fontSize: 40, bold: true, color: C.accent3 });
  txt(s, `compilation time of the kernel module (${M.LlvmCompileStrictMs} → ${M.LlvmCompileLicensedMs} ms)`,
    { x: 0.95, y: 3.15, w: 4.0, h: 0.7, fontSize: 15, color: C.text2 });
  txt(s, `+${M.LlvmCompileTextGrowthPct}%`, { x: 0.95, y: 4.15, w: 4.0, h: 0.8, fontSize: 40, bold: true, color: C.accent3 });
  txt(s, "text size from loop versioning (4,149 → 5,801 bytes)", { x: 0.95, y: 4.95, w: 4.0, h: 0.7, fontSize: 15, color: C.text2 });
  card(s, 5.5, 1.45, 7.2, 5.2, C.background2, "scope card");
  txt(s, "What is and is not claimed", { x: 5.85, y: 1.7, w: 6.5, h: 0.5, fontSize: 20, bold: true, color: C.text1 });
  txt(s, bullets([
    "The proof covers regrouping the same terms; LLVM's reassoc flag permits more",
    "ExactReduce is a tested implementation, not an end-to-end verified compiler",
    "The certificate checker trusts the supplied facts: not fact extraction or machine code",
    "Bit-identical speedups in LLVM concern integer-valued data only",
    "Bounded mode is conservative on real-valued domains after the underflow repair",
  ]), { x: 5.85, y: 2.35, w: 6.5, h: 4.1, fontSize: 16, color: C.text2, paraSpaceAfter: 9 });
  s.addNotes("Promoted in the revision: 29% more compilation time (138 vs 178 ms over ten compilations) and " +
    "40% larger text. Per-function compile attribution was not collected. The paper is a revised local " +
    "author-review manuscript; nothing has been submitted." + SRC);

  // ---- 15. conclusion + GitHub ----
  s = pres.addSlide({ masterName: "TITLE_DARK", sectionTitle: "Conclusion" });
  s.addText("Fast where it is provably safe", { placeholder: "title" });
  s.addText([
    { text: "Guarantee levels per rewrite instead of one on/off switch", options: { bullet: true, breakLine: true } },
    { text: "Grid and magnitude facts prove exactness or a preserved bound", options: { bullet: true, breakLine: true } },
    { text: "Certificates replayable with exact arithmetic", options: { bullet: true, breakLine: true } },
    { text: "Fast-math speed with strict bits on integer data in LLVM", options: { bullet: true, breakLine: true } },
    { text: " ", options: { fontSize: 10, breakLine: true } },
    { text: "Thank you. Questions?", options: { bold: true, color: C.accent1, fontSize: 22 } },
  ], { placeholder: "body", paraSpaceAfter: 6 });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 9.75, y: 1.75, w: 2.8, h: 4.9, rectRadius: 0.15,
    fill: { color: C.background1 }, line: { color: C.background1 }, objectName: "GitHub card" });
  s.addImage({ data: await qr(HEX.dk1, "FFFFFF"), x: 10.05, y: 2.0, w: 2.2, h: 2.2,
    hyperlink: { url: REPO_URL }, altText: "QR code linking to " + REPO_URL });
  s.addImage({ data: await icon(fa.FaGithub, HEX.dk1), x: 10.05, y: 4.38, w: 0.32, h: 0.32 });
  txt(s, "Try it", { x: 10.45, y: 4.38, w: 1.9, h: 0.32, fontSize: 13, bold: true, color: C.text1, valign: "middle" });
  txt(s, [{ text: REPO, options: { hyperlink: { url: REPO_URL } } }],
    { x: 9.85, y: 4.8, w: 2.6, h: 0.3, fontSize: 11, color: C.accent4, align: "center" });
  txt(s, [
    { text: "make && make test", options: { breakLine: true } },
    { text: "make -C llvm", options: { breakLine: true } },
    { text: "make -C llvm test", options: {} },
  ], { x: 10.05, y: 5.3, w: 2.2, h: 1.1, fontSize: 12, fontFace: "Courier New", color: C.text2, paraSpaceAfter: 2 });
  s.addNotes("Close with the message: compilers can be fast exactly where it is provably safe, and say which " +
    "guarantee each output keeps. Build the compiler with make && make test; the LLVM pass needs LLVM/Clang 18 " +
    "and libomp: make -C llvm && make -C llvm test. Repository: " + REPO_URL +
    "\n\nSource: " + REPO_URL + "/blob/main/paper/README.md");

  await pres.writeFile({ fileName: OUT });
  if (APPLY) await require(APPLY).applyTheme(OUT, THEME);
  console.log("wrote " + OUT);
}

main().catch(e => { console.error(e); process.exit(1); });
