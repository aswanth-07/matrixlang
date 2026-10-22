// build-final-deck.js -- the final presentation of the TACO paper.
//
//   cd <dir with pptxgenjs, react-icons, react, react-dom and sharp> &&
//   node /path/to/tools/build-final-deck.js OUT.pptx
//
// Numbers come from results/contracts/*_summary.json and the generated
// macro files, so the deck says what the paper says.
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa");

const ROOT = path.resolve(__dirname, "..");
const OUT = process.argv[2] || path.join(ROOT, "paper", "final-presentation.pptx");
const APPLY = process.argv[3]; // path to the pptx skill's scripts/apply_theme.js (optional)

// ---- numbers from the paper's generated macros ---------------------------------
function macros(file) {
  const m = {};
  const text = fs.readFileSync(path.join(ROOT, "paper", "generated", file), "utf8");
  for (const [, k, v] of text.matchAll(/\\newcommand\{\\([A-Za-z]+)\}\{([^}]*)\}/g)) m[k] = v;
  return m;
}
const M = { ...macros("contracts.tex"), ...macros("platforms.tex"), ...macros("llvm.tex") };
const llvm = JSON.parse(fs.readFileSync(path.join(ROOT, "results", "contracts", "llvm_summary.json")));

// ---- theme ----------------------------------------------------------------------
const THEME = {
  name: "Exact Bounded Relaxed",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "1B2A41", lt1: "FFFFFF", dk2: "3C506B", lt2: "EEF2F6",
    accent1: "F2A541", accent2: "2E9E6B", accent3: "D1495B", accent4: "4C7DA8",
    accent5: "8A9BB0", accent6: "6B5B95", hlink: "4C7DA8", folHlink: "6B5B95",
  },
};
const HEX = THEME.colors;

async function icon(Comp, color, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: "#" + color, size }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}

async function main() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pres.title = "Exact, Bounded, or Relaxed";
  pres.author = "A Aswanth Raj, Dr. RANJITHKUMAR S";
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  const C = pres.SchemeColor;

  // ---- layouts ----
  pres.defineSlideMaster({
    title: "TITLE_DARK",
    background: { color: C.text1 },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 1.9, w: 11.7, h: 1.9,
        fontSize: 40, bold: true, color: C.background1, valign: "bottom" }, text: "" } },
      { placeholder: { options: { name: "body", type: "body", x: 0.8, y: 4.0, w: 11.7, h: 2.2,
        fontSize: 18, color: C.background2, valign: "top" }, text: "" } },
    ],
  });
  pres.defineSlideMaster({
    title: "CONTENT",
    background: { color: C.background1 },
    margin: [0.5, 0.6, 0.5, 0.6],
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.35, w: 12.1, h: 0.9,
        fontSize: 32, bold: true, color: C.text1, valign: "middle" }, text: "" } },
    ],
    slideNumber: { x: 12.4, y: 7.0, w: 0.6, h: 0.3, fontSize: 10, color: C.accent5 },
  });

  const card = (s, x, y, w, h, fill, name) =>
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: fill },
      line: { color: fill }, objectName: name,
      shadow: { type: "outer", color: "000000", opacity: 0.12, blur: 6, offset: 2, angle: 90 } });
  const txt = (s, text, o) => s.addText(text, { isTextBox: true, margin: 0, valign: "top", ...o });
  const disc = async (s, Comp, x, y, d, fill) => {
    s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill } });
    s.addImage({ data: await icon(Comp, "FFFFFF"), x: x + d * 0.22, y: y + d * 0.22, w: d * 0.56, h: d * 0.56 });
  };

  // ---- 1. title ----
  pres.addSection({ title: "Introduction" });
  let s = pres.addSlide({ masterName: "TITLE_DARK", sectionTitle: "Introduction" });
  s.addText("Exact, Bounded, or Relaxed: Proving Which Floating-Point Guarantee a Compiler Rewrite Keeps",
    { placeholder: "title" });
  s.addText([
    { text: "A Aswanth Raj  ·  Dr. RANJITHKUMAR S", options: { bold: true, breakLine: true } },
    { text: "School of Computer Science and Engineering, VIT Vellore", options: { breakLine: true } },
    { text: "Manuscript prepared for ACM Transactions on Architecture and Code Optimization (TACO)",
      options: { italic: true, color: C.accent1 } },
  ], { placeholder: "body" });
  s.addNotes("Introduce the project: compilers make floating-point code fast by reordering arithmetic, " +
    "but today that is all-or-nothing. We show a compiler can prove which guarantee each shortcut keeps.");

  // ---- 2. problem ----
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Introduction" });
  s.addText("Compilers force a choice: fast or correct", { placeholder: "title" });
  card(s, 0.6, 1.5, 5.9, 2.6, C.background2, "strict card");
  await disc(s, fa.FaShieldAlt, 0.9, 1.8, 0.8, C.accent4);
  txt(s, "Strict IEEE mode", { x: 1.9, y: 1.85, w: 4.4, h: 0.5, fontSize: 22, bold: true, color: C.text1 });
  txt(s, "Never reorders arithmetic. Every result is exact to the program as written, but sums stay " +
    "one-at-a-time and slow.", { x: 1.9, y: 2.4, w: 4.4, h: 1.5, fontSize: 16, color: C.text2 });
  card(s, 6.85, 1.5, 5.9, 2.6, C.background2, "fast-math card");
  await disc(s, fa.FaBolt, 7.15, 1.8, 0.8, C.accent3);
  txt(s, "-ffast-math", { x: 8.15, y: 1.85, w: 4.4, h: 0.5, fontSize: 22, bold: true, color: C.text1 });
  txt(s, "Reorders freely and vectorizes: much faster. But nobody knows which results changed, " +
    "or by how much.", { x: 8.15, y: 2.4, w: 4.4, h: 1.5, fontSize: 16, color: C.text2 });
  txt(s, "Why order matters", { x: 0.6, y: 4.5, w: 12, h: 0.5, fontSize: 20, bold: true, color: C.text1 });
  txt(s, [
    { text: "Computers round after almost every operation, so (a + b) + c can differ from a + (b + c).",
      options: { breakLine: true } },
    { text: "A CPU adds 8–16 numbers at once only if it may split a sum into lanes, which is a reordering.",
      options: {} },
  ], { x: 0.6, y: 5.05, w: 12, h: 1.3, fontSize: 16, color: C.text2, paraSpaceAfter: 6 });
  s.addNotes("The problem: strict mode is safe but slow; fast-math is fast but gives no guarantee.");

  // ---- 3. idea ----
  pres.addSection({ title: "Approach" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Approach" });
  s.addText("Our idea: three guarantees, proved per rewrite", { placeholder: "title" });
  const levels = [
    [fa.FaCheckCircle, C.accent2, "Bit-identical", "Same bits as the program as written, for every input.",
      "Integer-valued data: pixels, audio samples, int8 weights, counts"],
    [fa.FaRulerHorizontal, C.accent1, "Bound-preserving", "Bits may change, but the worst-case error bound stays the same.",
      "Real data with a known range, e.g. values in [−1, 1]"],
    [fa.FaExclamationTriangle, C.accent3, "Relaxed", "Correct only over the real numbers, as fast-math assumes.",
      "Unbounded data: used only if the programmer allows it"],
  ];
  for (let i = 0; i < 3; i++) {
    const [Ic, col, head, body, ex] = levels[i];
    const x = 0.6 + i * 4.13;
    card(s, x, 1.5, 3.85, 4.2, C.background2, head + " card");
    await disc(s, Ic, x + 0.3, 1.8, 0.85, col);
    txt(s, head, { x: x + 0.3, y: 2.85, w: 3.3, h: 0.55, fontSize: 22, bold: true, color: C.text1 });
    txt(s, body, { x: x + 0.3, y: 3.45, w: 3.3, h: 1.1, fontSize: 16, color: C.text2 });
    txt(s, ex, { x: x + 0.3, y: 4.6, w: 3.3, h: 0.9, fontSize: 14, italic: true, color: C.text2 });
  }
  txt(s, "The compiler takes a shortcut only if the contract allows its level, and labels every output with its guarantee.",
    { x: 0.6, y: 6.05, w: 12.1, h: 0.6, fontSize: 16, bold: true, color: C.text1 });
  s.addNotes("Every rewrite falls into one of three levels. Which one depends on the data, so the compiler proves it from facts about the values.");

  // ---- 4. how it works (flow) ----
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Approach" });
  s.addText("How the compiler decides", { placeholder: "title" });
  const steps = [
    ["1", "Facts about values", "Declared input domains (MatrixLang) or integer ranges LLVM already knows"],
    ["2", "Proof per rewrite", "Do all partial sums stay exact (below 2^53)? Does the error bound hold?"],
    ["3", "Level", "Bit-identical, bound-preserving or relaxed"],
    ["4", "Contract decides", "Strict takes only bit-identical rewrites; bounded also takes bound-preserving ones"],
    ["5", "Act on it", "Certificate per output; OpenMP reduction clauses in C; reassoc flags in LLVM"],
  ];
  for (let i = 0; i < steps.length; i++) {
    const [n, head, body] = steps[i];
    const x = 0.6 + i * 2.5;
    card(s, x, 1.7, 2.25, 3.9, i === 4 ? C.text1 : C.background2, "step " + n);
    s.addShape(pres.shapes.OVAL, { x: x + 0.75, y: 1.95, w: 0.75, h: 0.75, fill: { color: C.accent1 }, line: { color: C.accent1 } });
    txt(s, n, { x: x + 0.75, y: 1.95, w: 0.75, h: 0.75, fontSize: 22, bold: true, align: "center", valign: "middle", color: C.text1 });
    txt(s, head, { x: x + 0.15, y: 2.9, w: 1.95, h: 0.8, fontSize: 18, bold: true, align: "center",
      color: i === 4 ? C.background1 : C.text1 });
    txt(s, body, { x: x + 0.15, y: 3.75, w: 1.95, h: 1.7, fontSize: 14,
      color: i === 4 ? C.background2 : C.text2 });
    if (i < steps.length - 1)
      s.addShape(pres.shapes.RIGHT_ARROW, { x: x + 2.26, y: 3.5, w: 0.22, h: 0.3,
        fill: { color: C.accent5 }, line: { color: C.accent5 } });
  }
  txt(s, `Theorem: a matrix chain whose sub-chains fit in 53 bits returns the correctly rounded product under every ` +
    `bracketing. The threshold is tight: one step above it, inputs exist where bracketings differ.`,
    { x: 0.6, y: 5.9, w: 12.1, h: 0.9, fontSize: 16, italic: true, color: C.text2 });
  s.addNotes("Explain the pipeline. Key fact: integers below 2^53 add exactly in a double, so if every partial sum stays below that, any order gives the same bits.");

  // ---- 5. two implementations ----
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Approach" });
  s.addText("Two implementations", { placeholder: "title" });
  card(s, 0.6, 1.5, 5.9, 4.9, C.background2, "MatrixLang card");
  await disc(s, fa.FaProjectDiagram, 0.9, 1.8, 0.8, C.accent4);
  txt(s, "MatrixLang compiler", { x: 1.9, y: 1.9, w: 4.4, h: 0.6, fontSize: 22, bold: true, color: C.text1 });
  txt(s, [
    { text: `${M.RqImplLoc} lines of C11, flex and bison`, options: { bullet: true, breakLine: true } },
    { text: "Inputs declare domains: input(int8), input(real(1))", options: { bullet: true, breakLine: true } },
    { text: "Reorders matrix chains under each contract", options: { bullet: true, breakLine: true } },
    { text: "Prints a certificate for every output", options: { bullet: true, breakLine: true } },
    { text: "Emits C with OpenMP reduction clauses", options: { bullet: true } },
  ], { x: 0.9, y: 2.8, w: 5.3, h: 3.4, fontSize: 16, color: C.text2, paraSpaceAfter: 8 });
  card(s, 6.85, 1.5, 5.9, 4.9, C.background2, "ExactReduce card");
  await disc(s, fa.FaMicrochip, 7.15, 1.8, 0.8, C.accent2);
  txt(s, "ExactReduce LLVM plugin", { x: 8.15, y: 1.9, w: 4.4, h: 0.6, fontSize: 22, bold: true, color: C.text1 });
  txt(s, [
    { text: `${M.LlvmPassLoc} lines of C++, loaded with clang -fpass-plugin`, options: { bullet: true, breakLine: true } },
    { text: "Reads integer ranges in ordinary C code", options: { bullet: true, breakLine: true } },
    { text: "Proves sums exact statically, or adds a cheap run-time guard", options: { bullet: true, breakLine: true } },
    { text: "Sets reassoc only on proven sums; never nsz", options: { bullet: true, breakLine: true } },
    { text: "Clang's vectorizer then does the rest", options: { bullet: true } },
  ], { x: 7.15, y: 2.8, w: 5.3, h: 3.4, fontSize: 16, color: C.text2, paraSpaceAfter: 8 });
  s.addNotes("MatrixLang shows the full idea with declared domains. The LLVM plugin shows it works in a production compiler on ordinary C.");

  // ---- 6. demo ----
  pres.addSection({ title: "Results" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Results" });
  s.addText("Demo: fast-math gets it wrong, we stay correct", { placeholder: "title" });
  const G = C.accent2, R = C.accent3;
  const hdr = { bold: true, color: C.background1, fill: { color: C.text1 }, fontSize: 16 };
  const cell = (t, col) => ({ text: t, options: { color: col || C.text1, fontSize: 16 } });
  s.addTable([
    [{ text: "Test", options: hdr }, { text: "Strict", options: hdr },
     { text: "-ffast-math", options: hdr }, { text: "Ours", options: hdr }],
    [cell("Kahan sum of 0.1, ten million times (true: 1,000,000)"), cell("1000000.0000000000", G),
     cell("999999.9999899360  ✗", R), cell("1000000.0000000000  ✓", G)],
    [cell("float sum of 10M pixels (order matters)"), cell("2559933952"),
     cell("2557894400  (changed)", R), cell("2559933952  (kept)", G)],
    [cell("double sum of 10M pixels (exact in any order)"), cell("12.4 ms"),
     cell("1.6 ms"), cell("1.5 ms, same bits", G)],
  ], { x: 0.6, y: 1.6, w: 12.1, colW: [4.6, 2.3, 2.6, 2.6], border: { type: "solid", pt: 0.5, color: "C9D2DC" },
    rowH: 0.75, valign: "middle", fill: { color: C.background1 } });
  txt(s, "Fast-math cannot tell safe shortcuts from unsafe ones. Ours takes the safe ones and leaves the rest alone.",
    { x: 0.6, y: 5.3, w: 12.1, h: 0.7, fontSize: 18, bold: true, color: C.text1 });
  s.addNotes("Live run on the LLVM plugin. Kahan summation is a careful technique; fast-math rearranges away its correction.");

  // ---- 7. speed chart ----
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Results" });
  s.addText("LLVM: fast-math speed, strict bits", { placeholder: "title" });
  const order = ["sum_u8", "sumsq_u8", "gram_u8", "qlinear_i8", "degree_u8", "walks2_u8", "gemm_i8", "energy_i16", "sum_i32"];
  const labels = ["Pixel sum", "Sum sq.", "Gram", "int8 model", "Degrees", "2-walks", "GEMM", "Energy", "int32 sum"];
  s.addChart(pres.charts.BAR, [
    { name: "ExactReduce (identical bits)", labels, values: order.map(k => +llvm.bench[k].configs["clang-licensed"].speedup.toFixed(2)) },
    { name: "-ffast-math", labels, values: order.map(k => +llvm.bench[k].configs["clang-fast-math"].speedup.toFixed(2)) },
  ], { x: 0.6, y: 1.4, w: 8.4, h: 5.3, barDir: "col", barGrouping: "clustered", chartColors: [HEX.accent2, HEX.accent5],
    showTitle: true, title: "Speedup over strict Clang (×), MNIST, Cora and generated data", titleFontSize: 14,
    titleColor: HEX.dk1, titleFontFace: "+mn-lt", showLegend: true, legendPos: "b", legendFontSize: 12,
    legendFontFace: "+mn-lt", catAxisLabelFontSize: 11, valAxisLabelFontSize: 11, catAxisLabelFontFace: "+mn-lt",
    valAxisLabelFontFace: "+mn-lt", catAxisLabelColor: HEX.dk2, valAxisLabelColor: HEX.dk2,
    valGridLine: { color: "DDE3EA", size: 0.5 }, catGridLine: { style: "none" },
    showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 9, dataLabelColor: HEX.dk2, dataLabelFormatCode: "0.0" });
  const stat = (big, small, y, col) => {
    txt(s, big, { x: 9.4, y, w: 3.3, h: 0.8, fontSize: 40, bold: true, color: col });
    txt(s, small, { x: 9.4, y: y + 0.8, w: 3.3, h: 0.6, fontSize: 14, color: C.text2 });
  };
  stat(`${M.LlvmBenchLicensedLo}–${M.LlvmBenchLicensedHi}×`, "faster than strict, nine integer kernels", 1.6, C.accent2);
  stat(`${M.LlvmBenchOfFastMathLo}–${M.LlvmBenchOfFastMathHi}%`, "of -ffast-math's speedup", 3.3, C.text1);
  stat(`${M.LlvmKernelSumUEightShortLicensed}×`, "even on 16-element loops: the guard is cheap", 5.0, C.accent4);
  s.addNotes("Nine integer reductions on real MNIST and Cora data plus generated data. Same speed as fast-math, strict bits every time.");

  // ---- 8. soundness ----
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Results" });
  s.addText("Verified, not assumed", { placeholder: "title" });
  const checks = [
    [M.RqTwoRuns, "executions: no output certified bit-identical ever differed (MatrixLang)", C.accent2],
    [`${M.LlvmStressLicensedInt} / ${M.LlvmStressCases}`, `adversarial inputs changed by our plugin; fast-math changed ${M.LlvmStressFastMathInt}`, C.accent2],
    [M.LlvmStressMutantBitInt, "failures from a mutant allowing one extra bit: the check is necessary, not conservative", C.accent3],
    ["m*+1", "the theorem's threshold is the true boundary: inputs one step above it differ", C.accent1],
  ];
  for (let i = 0; i < 4; i++) {
    const [big, small, col] = checks[i];
    const x = 0.6 + (i % 2) * 6.2, y = 1.55 + Math.floor(i / 2) * 2.6;
    card(s, x, y, 5.9, 2.3, C.background2, "check " + i);
    txt(s, big, { x: x + 0.35, y: y + 0.25, w: 5.2, h: 0.9, fontSize: 40, bold: true, color: col });
    txt(s, small, { x: x + 0.35, y: y + 1.2, w: 5.2, h: 0.9, fontSize: 16, color: C.text2 });
  }
  txt(s, "Every number in the paper is generated by scripts from raw measurements; datasets are checked by SHA-256.",
    { x: 0.6, y: 6.75, w: 12.1, h: 0.45, fontSize: 14, italic: true, color: C.text2 });
  s.addNotes("Soundness: bit-for-bit checks, inputs built to break the proof, deliberately broken mutants, and the threshold shown tight.");

  // ---- 9. real data + real code ----
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Results" });
  s.addText("Real data, real code, two machines", { placeholder: "title" });
  const real = [
    [fa.FaProjectDiagram, `${M.RealCoraWalksStrictGcc}×`, "faster walk counts on the Cora citation graph, identical bits"],
    [fa.FaWaveSquare, `${M.LlvmAudioopIdentical} / ${M.LlvmAudioopResults}`, `identical results in CPython's audioop, up to ${M.LlvmAudioopAvgEight}× faster`],
    [fa.FaCode, `${M.LlvmScanVersioned} of ${M.LlvmScanReductions}`, "reductions licensed in audioop, Pillow, SciPy and PolyBench"],
    [fa.FaSync, "1 result", "per certified kernel across 2 machines, GCC and Clang, every build"],
  ];
  for (let i = 0; i < 4; i++) {
    const [Ic, big, small] = real[i];
    const y = 1.45 + i * 1.35;
    await disc(s, Ic, 0.7, y + 0.1, 0.85, [C.accent4, C.accent2, C.accent1, C.accent6][i]);
    txt(s, big, { x: 1.85, y, w: 3.0, h: 1.05, fontSize: 34, bold: true, color: C.text1, valign: "middle" });
    txt(s, small, { x: 4.95, y, w: 7.7, h: 1.05, fontSize: 18, color: C.text2, valign: "middle" });
  }
  s.addNotes("Real datasets (Cora, MNIST), existing code bases, and a second machine and compiler. Honest: most scientific code sums real data and is correctly declined.");

  // ---- 10. uses + limits ----
  pres.addSection({ title: "Conclusion" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Conclusion" });
  s.addText("Where it helps, and its limits", { placeholder: "title" });
  card(s, 0.6, 1.5, 5.9, 4.9, C.background2, "uses card");
  txt(s, "Uses", { x: 0.95, y: 1.75, w: 5.2, h: 0.55, fontSize: 22, bold: true, color: C.accent2 });
  txt(s, [
    { text: "Image and audio statistics, histograms, correlation", options: { bullet: true, breakLine: true } },
    { text: "Graph analytics and counting", options: { bullet: true, breakLine: true } },
    { text: "Reproducible results across threads, CPUs and compilers", options: { bullet: true, breakLine: true } },
    { text: "Safer speed for code that would otherwise need fast-math", options: { bullet: true } },
  ], { x: 0.95, y: 2.45, w: 5.2, h: 3.7, fontSize: 16, color: C.text2, paraSpaceAfter: 10 });
  card(s, 6.85, 1.5, 5.9, 4.9, C.background2, "limits card");
  txt(s, "Limits and next steps", { x: 7.2, y: 1.75, w: 5.2, h: 0.55, fontSize: 22, bold: true, color: C.accent3 });
  txt(s, [
    { text: "Bit-identical only for integer-valued data; true decimals get the bounded level", options: { bullet: true, breakLine: true } },
    { text: "MatrixLang has no loops; the LLVM plugin covers loops", options: { bullet: true, breakLine: true } },
    { text: "Next: bounded level in LLVM via range annotations", options: { bullet: true, breakLine: true } },
    { text: "Next: an RFC to bring the license into LLVM's vectorizer", options: { bullet: true } },
  ], { x: 7.2, y: 2.45, w: 5.2, h: 3.7, fontSize: 16, color: C.text2, paraSpaceAfter: 10 });
  s.addNotes("Be honest about scope: integer-valued data for bit identity; bounded guarantees for real data in MatrixLang.");

  // ---- 11. conclusion ----
  s = pres.addSlide({ masterName: "TITLE_DARK", sectionTitle: "Conclusion" });
  s.addText("Fast wherever it is provably correct", { placeholder: "title" });
  s.addText([
    { text: "Three guarantees instead of an on/off switch, with a certificate for every output.", options: { breakLine: true } },
    { text: "Proved from the data, checked by execution, and working inside LLVM today.", options: { breakLine: true } },
    { text: "Thank you. Questions?", options: { bold: true, color: C.accent1 } },
  ], { placeholder: "body" });
  s.addNotes("Close with the one-line message and take questions.");

  await pres.writeFile({ fileName: OUT });
  if (APPLY) await require(APPLY).applyTheme(OUT, THEME);
  console.log("wrote " + OUT);
}

main().catch(e => { console.error(e); process.exit(1); });
