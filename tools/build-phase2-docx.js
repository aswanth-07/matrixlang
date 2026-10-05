const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  PageBreak, LevelFormat, ImageRun
} = require("docx");
const fs = require("fs");
const path = require("path");

/* ------------------------------------------------------------------ *
 * MatrixLang -- Phase 2 submission document.
 *
 * Same format as the Phase 1 document (tools/build-phase1-docx.js): a
 * cover carrying the title and the participant table, plain bold section
 * headings with no rules, justified body text, and italic captions below
 * each table. The cover adds the school and the supervisor, as the title
 * slide of the review deck gives them. Sections 3 to 9 are the seven
 * Phase 2 deliverables of section 10.3 of the manual, in the order the
 * manual lists them.
 *
 * Constraints: black text only, no page headers or footers, and no dash
 * characters of any kind in the prose.
 *
 * Every listing is real bin/matrixc output. Line counts in the module
 * table are read from the source files when the document is built, so
 * they cannot drift from the tree.
 *
 * Build:  node tools/build-phase2-docx.js docs/submission/MatrixLang-Phase2.docx
 * ------------------------------------------------------------------ */

const ROOT = path.join(__dirname, "..");

const BODY = "Times New Roman";
const MONO = "Consolas";
const BLACK = "000000";

const MARGIN = 1440;
const W = 11906 - 2 * MARGIN;         // 9026 usable on A4

const GREY_CODE = "F5F5F5";
const GREY_HEAD = "EAEAEA";
const RULE = "808080";

const SZ = 21;
const LINE = 259;

let tableNo = 0;
let figNo = 0;

/* Lines in a source file, counted as wc -l counts them. */
const lines = (f) => (fs.readFileSync(path.join(ROOT, f), "utf8").match(/\n/g) || []).length;

/* ---------- building blocks ---------- */

const P = (text, opts = {}) => new Paragraph({
  alignment: opts.align || AlignmentType.JUSTIFIED,
  spacing: { after: opts.after === undefined ? 130 : opts.after, line: LINE },
  keepNext: !!opts.keepNext,
  children: [new TextRun({ text, font: BODY, size: SZ, bold: !!opts.bold, italics: !!opts.italics, color: BLACK })],
});

const PR = (segments, opts = {}) => new Paragraph({
  alignment: opts.align || AlignmentType.JUSTIFIED,
  spacing: { after: opts.after === undefined ? 130 : opts.after, line: LINE },
  keepNext: !!opts.keepNext,
  children: segments.map(s => new TextRun({
    text: s.t, font: s.mono ? MONO : BODY, size: s.mono ? SZ - 3 : SZ,
    bold: !!s.b, italics: !!s.i, color: BLACK,
  })),
});

const H1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 320, after: 120 },
  keepNext: true, keepLines: true,
  children: [new TextRun({ text, font: BODY, size: 24, bold: true, color: BLACK })],
});

const H2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 220, after: 100 },
  keepNext: true, keepLines: true,
  children: [new TextRun({ text, font: BODY, size: 22, bold: true, color: BLACK })],
});

const Bullet = (text) => new Paragraph({
  numbering: { reference: "bullets", level: 0 },
  alignment: AlignmentType.JUSTIFIED,
  spacing: { after: 70, line: LINE },
  children: [new TextRun({ text, font: BODY, size: SZ, color: BLACK })],
});

const BulletB = (lead, rest) => new Paragraph({
  numbering: { reference: "bullets", level: 0 },
  alignment: AlignmentType.JUSTIFIED,
  spacing: { after: 70, line: LINE },
  children: [
    new TextRun({ text: lead, font: BODY, size: SZ, bold: true, color: BLACK }),
    new TextRun({ text: rest, font: BODY, size: SZ, color: BLACK }),
  ],
});

/* A listing is one paragraph, its lines joined by line breaks, and kept
 * whole. The Phase 1 builder gives each line its own paragraph chained with
 * keep-with-next; LibreOffice moved this document's longer listings to the
 * next page even where they fit, leaving a third of a page blank. A single
 * unsplittable paragraph paginates the same way in Word and LibreOffice. */
const Code = (lines) => [new Paragraph({
  spacing: { before: 90, after: 130, line: 205 },
  keepLines: true,
  indent: { left: 170 },
  shading: { type: ShadingType.CLEAR, fill: GREY_CODE, color: "auto" },
  children: lines.map((ln, i) => new TextRun({
    text: ln === "" ? " " : ln, break: i > 0 ? 1 : 0,
    font: MONO, size: 17, color: BLACK,
  })),
})];

const cell = (text, width, opts = {}) => new TableCell({
  width: { size: width, type: WidthType.DXA },
  shading: opts.head ? { type: ShadingType.CLEAR, fill: GREY_HEAD, color: "auto" } : undefined,
  margins: { top: 58, bottom: 58, left: 105, right: 105 },
  children: [new Paragraph({
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    keepNext: !!opts.keepNext,
    spacing: { after: 0, line: 232 },
    children: [new TextRun({
      text, font: opts.mono ? MONO : BODY,
      size: opts.mono ? 17 : 20,
      bold: !!(opts.head || opts.bold), color: BLACK,
    })],
  })],
});

/* A table plus its italic caption, in the department's convention. A short
 * table is glued together so it never splits from its caption; opts.glue
 * overrides that either way. opts.boldLast sets a totals row in bold. */
const Tbl = (headers, rows, widths, caption, opts = {}) => {
  tableNo += 1;
  const glue = opts.glue !== undefined ? opts.glue : rows.length <= 5;
  const t = new Table({
    columnWidths: widths,
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      left: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      right: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "BFBFBF" },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "BFBFBF" },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => cell(h, widths[i], {
          head: true, keepNext: glue, center: (opts.center || []).includes(i),
        })),
      }),
      ...rows.map((r, ri) => new TableRow({
        children: r.map((c, i) => cell(c, widths[i], {
          mono: (opts.mono || []).includes(i),
          keepNext: glue,
          center: (opts.center || []).includes(i),
          bold: opts.boldLast && ri === rows.length - 1,
        })),
      })),
    ],
  });
  const cap = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 70, after: 160, line: 225 },
    children: [new TextRun({
      text: "Table " + tableNo + ". " + caption,
      font: BODY, size: 18, italics: true, color: BLACK,
    })],
  });
  return [t, cap];
};

/* A figure plus its italic caption, matching the table convention. */
const Fig = (file, w, h, caption) => {
  figNo += 1;
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 90, after: 60 },
      keepNext: true,
      children: [new ImageRun({
        type: "png",
        data: fs.readFileSync(path.join(ROOT, "docs", "figures", file)),
        transformation: { width: w, height: h },
      })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 170, line: 225 },
      children: [new TextRun({
        text: "Figure " + figNo + ". " + caption,
        font: BODY, size: 18, italics: true, color: BLACK,
      })],
    }),
  ];
};

/* ================================================================== */

const children = [];

/* ---------- cover ---------- *
 *
 * The Phase 1 cover, with the review label changed and a second table under
 * the participant table naming the supervisor and the school. The second
 * table shares the first one's width and first column, so the two read as
 * one block rather than as a table with an afterthought beneath it.
 */

children.push(new Paragraph({ spacing: { after: 1900 }, children: [] }));

children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 220 },
  children: [new TextRun({
    text: "MatrixLang",
    font: BODY, size: 44, bold: true, characterSpacing: 20, color: BLACK,
  })],
}));

children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 160 },
  children: [new TextRun({
    text: "Checking Matrix Shapes Before They Are Computed",
    font: BODY, size: 26, bold: true, color: BLACK,
  })],
}));

children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 1250, line: 280 },
  indent: { left: 900, right: 900 },
  children: [new TextRun({
    text: "A Dimension-Aware Optimizing Compiler for a Matrix Language",
    font: BODY, size: 24, color: BLACK,
  })],
}));

children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 200 },
  children: [new TextRun({
    text: "Project Review 2: Core Implementation",
    font: BODY, size: 24, bold: true, color: BLACK,
  })],
}));

children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 110 },
  children: [new TextRun({
    text: "BCSE307P  Compiler Design Lab",
    font: BODY, size: 23, color: BLACK,
  })],
}));

children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 700 },
  children: [new TextRun({
    text: "School of Computer Science and Engineering, VIT Vellore",
    font: BODY, size: 23, color: BLACK,
  })],
}));

const coverCell = (text, width, opts = {}) => new TableCell({
  width: { size: width, type: WidthType.DXA },
  shading: opts.head ? { type: ShadingType.CLEAR, fill: GREY_HEAD, color: "auto" } : undefined,
  margins: { top: 110, bottom: 110, left: 140, right: 140 },
  children: [new Paragraph({
    alignment: opts.left ? AlignmentType.LEFT : AlignmentType.CENTER,
    spacing: { after: 0, line: 240 },
    children: [new TextRun({ text, font: BODY, size: 21, bold: !!opts.head, color: BLACK })],
  })],
});

const coverBorders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: RULE },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE },
  left: { style: BorderStyle.SINGLE, size: 4, color: RULE },
  right: { style: BorderStyle.SINGLE, size: 4, color: RULE },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "BFBFBF" },
  insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "BFBFBF" },
};

children.push(new Table({
  columnWidths: [2900, 2500, 2700],
  width: { size: 8100, type: WidthType.DXA },
  alignment: AlignmentType.CENTER,
  borders: coverBorders,
  rows: [
    new TableRow({
      tableHeader: true,
      children: [
        coverCell("Name", 2900, { head: true, left: true }),
        coverCell("Registration Number", 2500, { head: true }),
        coverCell("Programme", 2700, { head: true }),
      ],
    }),
    new TableRow({
      children: [
        coverCell("A Aswanth Raj", 2900, { left: true }),
        coverCell("24BAI0044", 2500),
        coverCell("B.Tech CSE (AI & ML)", 2700),
      ],
    }),
  ],
}));

children.push(new Paragraph({ spacing: { after: 300 }, children: [] }));

/* The supervisor, as the deck's title slide names them: one labelled row
 * whose label cell lines up with the Name column above. */
children.push(new Table({
  columnWidths: [2900, 5200],
  width: { size: 8100, type: WidthType.DXA },
  alignment: AlignmentType.CENTER,
  borders: coverBorders,
  rows: [
    new TableRow({
      children: [
        coverCell("Supervisor", 2900, { head: true, left: true }),
        coverCell("Dr. Ranjithkumar S", 5200, { left: true }),
      ],
    }),
  ],
}));

/* ---------- 1. Project Title ---------- */
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1("1. Project Title"));

children.push(PR([{
  t: "MatrixLang: A Dimension-Aware Optimizing Compiler for a Matrix Language",
  b: true,
}], { align: AlignmentType.CENTER, after: 60 }));

/* ---------- 2. Abstract ---------- */
children.push(H1("2. Abstract"));

children.push(P(
  "MatrixLang is a small language for matrix computation. Its type system carries " +
  "matrix dimensions: a 2 by 3 matrix has the type Matrix<2x3>, so the compiler " +
  "rejects a product with mismatched inner dimensions before it computes any element. " +
  "In Phase 1 I specified the language, designed the compiler and built a front end " +
  "prototype that classified tokens and reported a syntax verdict."));

children.push(P(
  "Phase 2 builds the core of the compiler. A Flex scanner recognises each token class " +
  "and reports lexical errors at their line and column. A Bison LALR(1) parser builds " +
  "an abstract syntax tree and recovers at statement boundaries, so one run reports all " +
  "the syntax errors in a file. The symbol table, a hash table, records the rows and " +
  "columns of each name. The semantic analyser infers the shape of each expression and " +
  "checks it against the rules of matrix algebra; when it rejects one, it names both " +
  "operands, their shapes and the broken rule. A generator then lowers the checked tree " +
  "to three-address code in which each temporary carries its shape. One collector " +
  "prints the diagnostics of all phases in source order, and each stage prints its " +
  "output on request."));

children.push(P(
  "The six components the Phase 1 plan assigned to this phase all work, and the command " +
  "make demo2 demonstrates them. The build produces no warnings under -Wall -Wextra, " +
  "Bison reports no unresolved conflicts, and the 49 checks on these components pass, " +
  "along with the other 96 checks in the suite."));

children.push(PR([
  { t: "Keywords: ", b: true },
  { t: "lexical analysis, LALR(1) parsing, abstract syntax trees, symbol tables, " +
       "semantic analysis, shape inference, three-address code, error recovery." },
]));

/* ---------- 3. Core Implementation Modules ---------- */
children.push(H1("3. Core Implementation Modules"));

children.push(P(
  "Section 9.3 of the Phase 1 document assigned six components to Phase 2: the Flex " +
  "lexer, the Bison parser, the syntax tree, the symbol table with shapes, dimension " +
  "checking and three-address code. Each is a module with its own header, and each " +
  "consumes the output of the stage before it."));

children.push(...Code([
  "source  ->  tokens  ->  syntax tree  ->  symbol table + shape checking  ->  three-address code",
  "            matrix.l    matrix.y         symtab.c   semantic.c               tac.c",
  "            tokens.c    ast.c            types.c",
]));

/* Each responsibility is kept to one line so the table fits beneath the
 * section's opening on the same page; with two-line rows it carried the
 * figure with it to the next page and left a third of this one blank. */
const MODS = [
  ["Scanner", "frontend/matrix.l", "Keywords, names, numbers, lexical errors"],
  ["Token recorder", "frontend/tokens.c", "Keeps each token for the token table"],
  ["Parser", "frontend/matrix.y", "LALR(1) grammar; builds the tree; recovery"],
  ["Syntax tree", "frontend/ast.c", "Nodes, tree printer, expression renderer"],
  ["Shape rules", "analysis/types.c", "The types and all shape rules"],
  ["Symbol table", "analysis/symtab.c", "Names with shapes, positions, usage"],
  ["Semantic analyser", "analysis/semantic.c", "Resolution, shape inference, checking"],
  ["Intermediate code", "ir/tac.c", "Three-address code, typed temporaries"],
  ["Diagnostics", "support/diag.c", "One collector for all errors, sorted"],
  ["Driver", "main.c", "Options, stage selection, exit status"],
];
const modTotal = MODS.reduce((a, m) => a + lines("src/" + m[1]), 0);

children.push(...Tbl(
  ["Module", "File, under src/", "Lines", "Responsibility"],
  [
    ...MODS.map(m => [m[0], m[1], String(lines("src/" + m[1])), m[2]]),
    ["Total", "", String(modTotal), "Headers and generated C excluded"],
  ],
  [1750, 2250, 700, 4326],
  "The Phase 2 modules, their sources and what each is responsible for.",
  { mono: [1], center: [2], glue: true, boldLast: true }
));

children.push(P(
  "Figure 1 repeats the architecture from the Phase 1 design. Phase 2 covers the first " +
  "four stages of the central column, from lexical analysis to intermediate code, plus " +
  "the token table, syntax tree and symbol table on the right and the diagnostics " +
  "collector and driver on the left."));

children.push(...Fig("architecture.png", 596, 388,
  "Architecture of the MatrixLang compiler. Phase 2 implements the stages from " +
  "lexical analysis to intermediate code and the components beside them."));

/* ---------- 4. Working Source Code ---------- */
children.push(H1("4. Working Source Code"));

children.push(H2("4.1 Repository and organisation"));
children.push(PR([
  { t: "I keep the source under Git and publish it at " },
  { t: "github.com/aswanth-07/matrixlang", mono: true },
  { t: ". The directories follow the phases of the compiler, so a file's directory " +
       "names the part of the course it belongs to." },
]));

children.push(...Code([
  "src/",
  "  main.c              driver: options, stage selection, exit status",
  "  frontend/           matrix.l, matrix.y, ast.c, tokens.c",
  "  analysis/           types.c (the shape rules), symtab.c, semantic.c",
  "  ir/                 tac.c, and the Phase 3 optimizer",
  "  backend/            Phase 3: code generation and the virtual machine",
  "  support/            diag.c, util.c",
  "examples/valid/       programs that must be accepted",
  "examples/errors/      programs that must be rejected, each saying why",
  "demos/phase2.sh       the Review 2 demonstration",
  "tests/run_tests.sh    the acceptance suite",
]));

children.push(H2("4.2 Building and running"));
children.push(P(
  "One command builds the compiler from a clean tree. Bison and Flex generate the parser " +
  "and scanner into build/, and gcc compiles the hand-written sources as C11 [5]."));

children.push(...Code([
  "$ make              # bin/matrixc",
  "$ make test         # the acceptance suite",
  "$ make demo2        # the Review 2 demonstration",
  "",
  "$ ./bin/matrixc --phase2 examples/valid/multiply.ml",
]));

children.push(P(
  "The compiler selects its stages by option, so a reviewer can stop it after any stage " +
  "and read that stage's output. Table 2 lists the options for this phase."));

children.push(...Tbl(
  ["Option", "Shows"],
  [
    ["--phase2", "Each Phase 2 stage in order: tokens, tree, symbols, diagnostics, TAC"],
    ["--tokens", "The token stream, classified and located by line and column"],
    ["--ast", "The syntax tree, each node annotated with its inferred shape"],
    ["--symbols", "The symbol table, with rows and columns"],
    ["--check", "All diagnostics and the accept or reject verdict"],
    ["--tac", "Three-address code, each instruction with the shape it produces"],
    ["--stats", "Counts of tokens, tree nodes, symbols and instructions"],
  ],
  [1700, 7326],
  "Command-line options that expose the Phase 2 stages.",
  { mono: [0], glue: true }
));

children.push(H2("4.3 Code quality"));
children.push(BulletB("Warning free. ",
  "The hand-written sources compile under -std=c11 -Wall -Wextra with no warnings. " +
  "The Makefile compiles the generated scanner and parser without -Wextra, because Flex " +
  "and Bison emit code that trips warnings this project cannot fix."));
children.push(BulletB("Modular structure. ",
  "Each module keeps its tables private to its own file and exposes an interface " +
  "through its header. The symbol table, the instruction array and the diagnostic list " +
  "each belong to one module."));
children.push(BulletB("Comments record decisions. ",
  "Each file opens with a comment stating its purpose. Comments inside the code give " +
  "the reason for a choice, such as the rejection of scalar plus matrix, and leave the " +
  "mechanics to the code."));
children.push(BulletB("No third-party libraries. ",
  "I wrote everything beyond Flex, Bison and the C standard library for this project."));

/* ---------- 5. Functional Demonstration ---------- */
children.push(H1("5. Functional Demonstration"));

children.push(P(
  "The manual requires a working demonstration for Review 2. The command make demo2 " +
  "runs the modules on two programs that differ in one dimension: the compiler accepts " +
  "the first and lowers it to three-address code, and refuses the second. The listings " +
  "below omit the banner rules; the remaining text is the compiler's output."));

children.push(H2("5.1 An accepted program"));
children.push(...Code([
  "$ cat examples/valid/multiply.ml",
  "/* multiply.ml -- the headline example.",
  "   A is 2x3 and B is 3x4, so A * B is 2x4 and the compiler works that out",
  "   rather than being told. */",
  "",
  "matrix A[2,3] = {{1, 2, 3},",
  "                 {4, 5, 6}};",
  "",
  "matrix B[3,4] = {{1, 0, 0, 1},",
  "                 {0, 1, 0, 2},",
  "                 {0, 0, 1, 3}};",
  "",
  "matrix C = A * B;      // shape inferred: Matrix<2x4>",
  "",
  "print(C);",
]));

children.push(...Code([
  "$ ./bin/matrixc --phase2 examples/valid/multiply.ml",
  "",
  "  PHASE 1  --  LEXICAL ANALYSIS (token stream)",
  "  ... 78 token(s), shown in Section 7.1 ...",
  "  PHASE 1/2  --  SYNTAX ANALYSIS (abstract syntax tree)",
  "  ... shown in Section 7.2 ...",
  "  PHASE 2  --  SYMBOL TABLE",
  "  ... 3 symbol(s), shown in Section 7.3 ...",
  "  PHASE 2  --  SEMANTIC ANALYSIS (dimension checking)",
  "No diagnostics. The program is valid MatrixLang.",
  "  PHASE 2  --  INTERMEDIATE CODE (three-address code)",
  "  ... 5 instruction(s), shown in Section 7.4 ...",
  "",
  "examples/valid/multiply.ml: ACCEPTED (0 error(s), 0 warning(s))",
]));

children.push(P(
  "The declaration of C gives no dimensions. The compiler infers from the shapes of A " +
  "and B that C is a 2 by 4 matrix, records that shape in the symbol table and carries " +
  "it into the intermediate code. Section 7 prints each of these artefacts in full."));

children.push(H2("5.2 The same program with one dimension changed"));
children.push(P(
  "The second program changes the shape of B to 5 by 4. A stays 2 by 3, so the columns " +
  "of A no longer match the rows of B and the product has no definition."));

children.push(...Code([
  "$ cat examples/errors/mul_mismatch.ml",
  "/* mul_mismatch.ml -- the Review 2 rejection demo.",
  "   B was 3x4 in multiply.ml. Making it 5x4 breaks columns(A) == rows(B),",
  "   and the compiler must say so before any element is multiplied. */",
  "",
  "matrix A[2,3];",
  "matrix B[5,4];",
  "matrix C[2,4];",
  "",
  "C = A * B;",
  "",
  "print(C);",
]));

children.push(...Code([
  "$ ./bin/matrixc --check examples/errors/mul_mismatch.ml",
  "",
  "9:7: error [semantic] cannot multiply Matrix<2x3> by Matrix<5x4>",
  "        left   : A -> Matrix<2x3>",
  "        right  : B -> Matrix<5x4>",
  "        rule   : columns(left) must equal rows(right)",
  "        found  : 3 != 5",
  "",
  "1 error(s), 0 warning(s).",
  "",
  "examples/errors/mul_mismatch.ml: REJECTED (1 error(s), 0 warning(s))",
  "$ echo $?",
  "1",
]));

children.push(P(
  "The error points at line 9, column 7, the position of the multiplication operator. " +
  "The compiler exits with status 1 and produces no intermediate code. The driver skips " +
  "code generation for any program with errors, since code for this one would contain " +
  "a multiplication no machine can perform."));

/* ---------- 6. Test Cases ---------- */
children.push(H1("6. Test Cases"));

children.push(H2("6.1 Method"));
children.push(P(
  "The acceptance suite, tests/run_tests.sh, runs the compiler on the example programs " +
  "and checks two things per case: the exit status and specific text in the output. A " +
  "check on the exit status alone would pass a compiler that rejected a program for the " +
  "wrong reason. A check on the text alone would pass one that printed the right " +
  "message and exited with status 0."));

children.push(H2("6.2 The Phase 2 test cases"));
children.push(...Tbl(
  ["Test section", "What it asserts", "Checks"],
  [
    ["Syntax tree carries shapes", "BinaryOp * : Matrix<2x4>; Transpose : Matrix<3x2>", "6"],
    ["Symbol table rows and columns", "Rows and Cols present; symbol count; both kinds", "7"],
    ["Multiplication rule", "Exit 1; the message, the rule and 3 != 5", "4"],
    ["Addition rule", "Exit 1; the message and 2x3 against 3x2", "3"],
    ["Remaining shape rules", "Scalar transpose, A + s, two bad dimensions", "5"],
    ["Matrix literals", "Ragged row; literal shape against declaration", "3"],
    ["Declaration and name errors", "Undeclared, duplicate; syntax and lexical errors", "13"],
    ["Three-address code", "Temporaries, copies, print; shapes in the IR", "8"],
    ["Total", "", "49"],
  ],
  [3000, 5026, 1000],
  "The sections of the suite that test Phase 2, and how many checks each makes.",
  { center: [2], glue: true, boldLast: true }
));

children.push(H2("6.3 Invalid inputs"));
children.push(P(
  "Each program in examples/errors/ exercises one family of error and opens with a " +
  "comment naming the error it should trigger. The compiler rejects all eight with exit " +
  "status 1 and accepts the four programs in examples/valid/ with exit status 0."));

children.push(...Tbl(
  ["Program", "Class", "First diagnostic reported", "Errors"],
  [
    ["lexical.ml", "lexical", "5:7 illegal character '$'", "4"],
    ["syntax.ml", "syntax", "6:1 unexpected IDENT, expecting ';' or '='", "3"],
    ["undeclared.ml", "semantic", "5:1 assignment to undeclared variable 'B'", "2"],
    ["duplicate.ml", "semantic", "4:8 duplicate declaration of 'A'", "2"],
    ["mul_mismatch.ml", "semantic", "9:7 cannot multiply Matrix<2x3> by Matrix<5x4>", "1"],
    ["add_mismatch.ml", "semantic", "6:14 matrix addition requires identical dimensions", "1"],
    ["bad_shape.ml", "semantic", "9:15 transpose() expects a matrix, got Scalar", "4"],
    ["bad_literal.ml", "semantic", "5:18 row 2 of this matrix literal has 2 entries, expected 3", "2"],
  ],
  [1800, 1100, 5226, 900],
  "The invalid test programs and what the compiler reports for each.",
  { mono: [0], center: [3], glue: true }
));

children.push(P(
  "The file lexical.ml also produces two syntax errors: each illegal lexeme leaves a gap " +
  "that the parser trips over. The compiler reports all four in one run, in line order; " +
  "Section 8.7 explains the ordering."));

children.push(H2("6.4 Results"));
children.push(...Code([
  "$ make test",
  "",
  "--- Phase 2 -- the AST carries inferred shapes",
  "  PASS multiply.ml --ast (exit 0)",
  "  PASS   ...contains: BinaryOp * : Matrix<2x4>",
  "  PASS   ...contains: Identifier A : Matrix<2x3>",
  "  PASS   ...contains: Identifier B : Matrix<3x4>",
  "  PASS transpose.ml --ast (exit 0)",
  "  PASS   ...contains: Transpose : Matrix<3x2>",
  "",
  "  ... the remaining sections elided ...",
  "",
  "================================================",
  "  145 passed, 0 failed",
  "================================================",
]));

children.push(P(
  "Of the 145 checks, 27 cover the Phase 1 front end, 49 the Phase 2 components above, " +
  "64 the Phase 3 stages and 5 the driver's option handling. All 145 pass on the " +
  "current tree."));

/* ---------- 7. Intermediate Results ---------- */
children.push(H1("7. Intermediate Results"));

children.push(P(
  "Sections 7.1 to 7.4 trace multiply.ml from Section 5.1 through each stage, with the " +
  "artefact each stage hands to the next. Section 7.5 traces shape inference through " +
  "longer expressions."));

children.push(H2("7.1 Token stream"));
children.push(...Code([
  "$ ./bin/matrixc --tokens examples/valid/multiply.ml",
  "",
  "#     TOKEN         LEXEME            LINE:COL",
  "----  ------------  ----------------  --------",
  "1     MATRIX        matrix            5:1",
  "2     IDENTIFIER    A                 5:8",
  "3     LBRACKET      [                 5:9",
  "4     NUMBER        2                 5:10",
  "5     COMMA         ,                 5:11",
  "6     NUMBER        3                 5:12",
  "7     RBRACKET      ]                 5:13",
  "  ... tokens 8 to 66 elided ...",
  "67    MATRIX        matrix            12:1",
  "68    IDENTIFIER    C                 12:8",
  "69    ASSIGN        =                 12:10",
  "70    IDENTIFIER    A                 12:12",
  "71    MULTIPLY      *                 12:14",
  "72    IDENTIFIER    B                 12:16",
  "73    SEMICOLON     ;                 12:17",
  "  ... tokens 74 to 78 elided ...",
  "78 token(s).",
]));

children.push(P(
  "The header comment on lines 1 to 3 and the comment at the end of line 12 produce no " +
  "tokens, and positions count from the first line of the file. A dimension error on " +
  "the multiplication operator would report its recorded position, 12:14."));

children.push(H2("7.2 Annotated syntax tree"));
children.push(...Code([
  "$ ./bin/matrixc --ast examples/valid/multiply.ml",
  "",
  "Program  (line 1)",
  "|-- Declare A : Matrix<2x3>  (line 5)",
  "|   `-- MatrixLiteral : Matrix<2x3>  (line 5)",
  "|       |-- Row : Matrix<1x3>  (line 5)",
  "|       |   |-- Number 1 : Scalar  (line 5)",
  "|       |   |-- Number 2 : Scalar  (line 5)",
  "|       |   `-- Number 3 : Scalar  (line 5)",
  "|       `-- Row : Matrix<1x3>  (line 6)",
  "|           ... three entries elided ...",
  "|-- Declare B : Matrix<3x4>  (line 8)",
  "|   `-- MatrixLiteral : Matrix<3x4>  (line 8)",
  "|       ... three rows elided ...",
  "|-- Declare C : Matrix<2x4>  (line 12)",
  "|   `-- BinaryOp * : Matrix<2x4>  (line 12)",
  "|       |-- Identifier A : Matrix<2x3>  (line 12)",
  "|       `-- Identifier B : Matrix<3x4>  (line 12)",
  "`-- Print : Matrix<2x4>  (line 14)",
  "    `-- Identifier C : Matrix<2x4>  (line 14)",
]));

children.push(P(
  "The type Matrix<2x4> on the multiplication node and on the declaration of C appears " +
  "nowhere in the source. The parser built the tree without types, and the semantic " +
  "analyser attached a type to each node afterwards, so those two annotations show " +
  "shape inference at work. The full tree has 34 nodes and a height of 5."));

children.push(H2("7.3 Symbol table"));
children.push(...Code([
  "$ ./bin/matrixc --symbols examples/valid/multiply.ml",
  "",
  "+----------------+--------+------+------+----------+---------+--------+-------+",
  "| Name           | Kind   | Rows | Cols | Scope    | Decl@Ln | Writes | Reads |",
  "+----------------+--------+------+------+----------+---------+--------+-------+",
  "| A              | Matrix |    2 |    3 | global   |       5 |      1 |     1 |",
  "| B              | Matrix |    3 |    4 | global   |       8 |      1 |     1 |",
  "| C              | Matrix |    2 |    4 | global   |      12 |      1 |     1 |",
  "+----------------+--------+------+------+----------+---------+--------+-------+",
  "3 symbol(s).",
]));

children.push(P(
  "The Rows and Cols columns hold the shape information. Each later check on an " +
  "identifier reads its shape from this table, the inferred shape of C included."));

children.push(H2("7.4 Three-address code"));
children.push(...Code([
  "$ ./bin/matrixc --tac examples/valid/multiply.ml",
  "",
  "    1  A = #0                              Matrix<2x3>",
  "    2  B = #1                              Matrix<3x4>",
  "    3  t1 = A * B                          Matrix<2x4>",
  "    4  C = t1                              Matrix<2x4>",
  "    5  print C                             Matrix<2x4>",
  "",
  "5 instruction(s).",
]));

children.push(P(
  "The operands #0 and #1 name the two matrix literals, which the analyser stored in a " +
  "literal pool while checking them. The temporary t1 holds the product, and the " +
  "right-hand column gives the shape each instruction produces."));

children.push(H2("7.5 Shapes through longer expressions"));
children.push(PR([
  { t: "In chain.ml, A is 2 by 3, B is 3 by 2 and C is 2 by 2, and the program computes " },
  { t: "R = A * B + C - C", mono: true },
  { t: ". Each operator becomes one instruction with a new temporary, and the compiler " +
       "infers the shape of each temporary from its operands." },
]));

children.push(...Code([
  "$ ./bin/matrixc --tac examples/valid/chain.ml",
  "",
  "    1  A = #0                              Matrix<2x3>",
  "    2  B = #1                              Matrix<3x2>",
  "    3  C = #2                              Matrix<2x2>",
  "    4  t1 = A * B                          Matrix<2x2>",
  "    5  t2 = t1 + C                         Matrix<2x2>",
  "    6  t3 = t2 - C                         Matrix<2x2>",
  "    7  R = t3                              Matrix<2x2>",
  "    8  print R                             Matrix<2x2>",
  "",
  "8 instruction(s).",
]));

children.push(P(
  "The operator * denotes three operations, and the operand types decide which one " +
  "applies. Table 5 lists the types the compiler infers across the valid examples."));

children.push(...Tbl(
  ["Expression", "Operand types", "Inferred type", "Meaning"],
  [
    ["A * B", "Matrix<2x3>, Matrix<3x4>", "Matrix<2x4>", "matrix product"],
    ["k * M", "Scalar, Matrix<2x2>", "Matrix<2x2>", "scaling"],
    ["M * half", "Matrix<2x2>, Scalar", "Matrix<2x2>", "scaling"],
    ["k * half", "Scalar, Scalar", "Scalar", "scalar product"],
    ["transpose(A)", "Matrix<2x3>", "Matrix<3x2>", "rows and columns exchanged"],
    ["A * transpose(A)", "Matrix<2x3>, Matrix<3x2>", "Matrix<2x2>", "matrix product"],
  ],
  [2000, 2800, 1800, 2426],
  "Types inferred for expressions in multiply.ml, scalars.ml and transpose.ml.",
  { mono: [0, 1, 2], glue: true }
));

children.push(P(
  "Each instruction keeps its type, so the Phase 3 code generator can pick a different " +
  "machine instruction for each meaning of * without recomputing a shape."));

/* ---------- 8. Module-wise Explanation ---------- */
children.push(H1("8. Module-wise Explanation"));

/* 8.1 lexical */
children.push(H2("8.1 Lexical analysis: matrix.l and tokens.c"));
children.push(P(
  "Flex [4] generates the scanner from regular definitions and a list of rules, each a " +
  "regular expression paired with an action [1], [2]. The definitions below describe " +
  "identifiers and the two forms of numeric literal; a real literal may carry a " +
  "fractional part, an exponent or both."));

children.push(...Code([
  "DIGIT     [0-9]",
  "LETTER    [A-Za-z_]",
  "IDENT     {LETTER}({LETTER}|{DIGIT})*",
  "INTLIT    {DIGIT}+",
  "REALLIT   ({DIGIT}+\".\"{DIGIT}*|\".\"{DIGIT}+)([eE][+-]?{DIGIT}+)?|{DIGIT}+[eE][+-]?{DIGIT}+",
]));

children.push(...Tbl(
  ["Class", "Members", "Token names"],
  [
    ["Keywords", "matrix scalar print transpose identity zeros ones", "MATRIX, SCALAR, PRINT, ..."],
    ["Identifiers", "a letter or underscore, then letters, digits, underscores", "IDENTIFIER"],
    ["Numbers", "2   0.5   .5   1e3   2.5E-2", "NUMBER"],
    ["Operators", "+   -   *   =", "PLUS, MINUS, MULTIPLY, ASSIGN"],
    ["Delimiters", "[ ]  ( )  { }  ,  ;", "LBRACKET, RBRACKET, ..., SEMICOLON"],
    ["Skipped", "whitespace, // line comments, /* block comments */", "none"],
  ],
  [1500, 4326, 3200],
  "The token classes the scanner recognises.",
  { glue: true }
));

children.push(PR([
  { t: "Keyword recognition. ", b: true },
  { t: "Flex settles competing rules by longest match and breaks ties by rule order. " +
       "For the input matrix, the keyword rule and the identifier rule both match six " +
       "characters; the keyword rule comes first and wins. For matrixx, the identifier " +
       "rule matches seven characters against the keyword's six, so the scanner returns " +
       "an identifier. The scanner needs no keyword lookup table." },
]));

children.push(PR([
  { t: "Lexical errors. ", b: true },
  { t: "Three rules report errors: one for an unterminated block comment, one for an " +
       "identifier that begins with a digit, and a final catch-all for any character the " +
       "other rules reject. Longest match motivates the second rule. Without it, Flex " +
       "would scan 12abc as the number 12 followed by the identifier abc, and the parser " +
       "would report a confusing syntax error. With it, the whole lexeme forms one match " +
       "and the scanner reports the real mistake. After an error the scanner continues, " +
       "so it finds later errors too." },
]));

children.push(PR([
  { t: "Position tracking. ", b: true },
  { t: "The macro YY_USER_ACTION runs before each rule's action. It writes the start " +
       "line and column into the location Bison reads, then calls lex_advance, which " +
       "walks the matched text: a newline moves to the next line, a tab advances four " +
       "columns and any other character one. All matches pass through this one function, " +
       "so a block comment that spans several lines leaves the position correct without " +
       "a separate start condition." },
]));

children.push(PR([
  { t: "Token recording. ", b: true },
  { t: "Bison pulls tokens one at a time and discards each after shifting it, so no " +
       "stream remains to display after the parse. A second scan of the file would report " +
       "each lexical error twice. The scanner appends each token to the list in tokens.c " +
       "as it returns it, and the token table comes out of the parse at no extra cost." },
]));

/* 8.2 syntax */
children.push(H2("8.2 Syntax analysis: matrix.y"));
children.push(P(
  "Bison [3] generates an LALR(1) parser [1] from the grammar in the Phase 1 document. " +
  "The expression rules keep their natural, ambiguous form, and precedence and " +
  "associativity declarations make them deterministic, so the grammar needs no " +
  "separate term and factor levels."));

children.push(...Code([
  "%left  '+' '-'",
  "%left  '*'",
  "%right UMINUS",
  "",
  "expr : expr '+' expr  |  expr '-' expr  |  expr '*' expr",
  "     | '-' expr %prec UMINUS",
  "     | ...",
]));

children.push(P(
  "Bison builds 86 LALR(1) states for this grammar. Its report lists twelve " +
  "shift/reduce conflicts in the expression rules and resolves all twelve with these " +
  "declarations. For A + B * C, the parser reaches a state holding expr + expr with * " +
  "as lookahead. The * operator has higher precedence, so the parser shifts and groups " +
  "B * C first. With + as lookahead the two operators tie and associate to the left, so " +
  "the parser reduces. The build passes -Wcounterexamples to Bison, which makes any " +
  "future conflict arrive with an example input."));

children.push(P(
  "The semantic actions build the tree and nothing more. The parser cannot know the " +
  "shape of an identifier, and giving it that job would tangle two phases. Each " +
  "declaration form records the shape written in the source or, for matrix C = A * B, " +
  "marks the shape for inference."));

children.push(PR([
  { t: "Error recovery. ", b: true },
  { t: "One production gives statement-level recovery. On a syntax error the parser " +
       "pops states until one can shift the special error token, discards input up to " +
       "the next semicolon and resumes. The call to yyerrok tells Bison that recovery has " +
       "finished, so Bison reports the next error it meets." },
]));

children.push(...Code([
  "stmt : decl | assign | print_stmt | ';'",
  "     | error ';'      { $$ = node_new(N_EMPTY, ...); yyerrok; }",
]));

children.push(P(
  "The directive parse.error verbose makes each message list the tokens the parser would " +
  "have accepted; syntax.ml shows this as expecting ';' or '='. Recovery needs care with " +
  "memory, because discarded symbols do not reach the action that would free them. A " +
  "destructor frees discarded identifier strings. The grammar declares no destructor " +
  "for tree nodes: Bison destroys whatever remains on its stack after a successful parse " +
  "too, and a node destructor would free the finished tree."));

/* 8.3 AST */
children.push(H2("8.3 Abstract syntax tree: ast.c"));
children.push(P(
  "All nodes share one structure: a kind tag, a source position and a growable vector " +
  "of children. Four traversals walk the tree: semantic analysis, the printer, code " +
  "generation and the expression renderer. With a uniform node, each traversal is a " +
  "single switch over the kind."));

children.push(...Tbl(
  ["Field", "Purpose"],
  [
    ["kind", "One of 15 node kinds, from N_PROGRAM and N_DECL to N_NUMBER and N_IDENT"],
    ["line, col", "Source position, reported by each diagnostic about the node"],
    ["name, dval", "Identifier or operator spelling; the value of a number"],
    ["decl_type, has_dims", "Declarations only: the shape written in the source, or a mark for inference"],
    ["type", "The shape inferred by semantic analysis"],
    ["lit_id, d1, d2", "Literal pool index; folded dimensions of identity, zeros and ones"],
    ["kids, nkids", "The children, in source order"],
  ],
  [2300, 6726],
  "Fields of the syntax tree node.",
  { mono: [0], glue: true }
));

children.push(P(
  "I added two features for the diagnostics. A matrix literal keeps its row structure " +
  "in the tree, so the analyser can say which row is short. The function ast_expr_text " +
  "renders any expression back into source text, so a dimension error names an operand " +
  "as left : A * B. Error recovery leaves an empty node in place of a discarded " +
  "statement, and the tree stays well formed after an error."));

/* 8.4 symbol table */
children.push(H2("8.4 Symbol table: symtab.c"));
children.push(P(
  "The symbol table is a hash table of 211 buckets (a prime) that uses the djb2 string " +
  "hash and separate chaining. Insertion and lookup take constant time on average. A " +
  "second list links the symbols in insertion order, because the table prints in " +
  "declaration order and hashing scrambles that order."));

children.push(...Code([
  "static unsigned hash(const char *s)          /* djb2: h = h * 33 + c */",
  "{",
  "    unsigned h = 5381u;",
  "    while (*s) h = ((h << 5) + h) + (unsigned char)*s++;",
  "    return h % NBUCKETS;",
  "}",
]));

children.push(P(
  "Each entry records the name, its type (for a matrix, the rows and columns), the line " +
  "and column of its declaration, whether any statement reads it, and counts of reads " +
  "and writes. Insertion refuses a duplicate name and returns no symbol; the " +
  "caller looks up the earlier entry to report its line. The check spans kinds, so " +
  "scalar x followed by matrix x counts as a duplicate."));

children.push(P(
  "The table has one scope. MatrixLang has no blocks and no functions, a decision " +
  "recorded in Section 6.3 of the Phase 1 document, so a scope stack would hold a " +
  "single entry. The Scope column reads global on each row for that reason."));

/* 8.5 semantic */
children.push(H2("8.5 Semantic analysis: semantic.c and types.c"));
children.push(P(
  "The analyser makes one pass over the tree. It checks statements in order; for each " +
  "expression, a recursive function computes the type from the children's types and " +
  "stores it on the node. The type is a synthesized attribute in the sense of " +
  "syntax-directed definitions [1], evaluated bottom-up."));

children.push(...Tbl(
  ["Operation", "Operand shapes", "Result", "Rejected when"],
  [
    ["A + B, A - B", "r x c and r x c", "r x c", "shapes differ, or one operand is a scalar and the other a matrix"],
    ["s + t, s - t", "scalar and scalar", "scalar", "no restriction"],
    ["A * B", "r x n and n x c", "r x c", "columns of A differ from rows of B"],
    ["s * A, A * s", "scalar and r x c", "r x c", "no restriction (scaling)"],
    ["s * t", "scalar and scalar", "scalar", "no restriction"],
    ["transpose(A)", "r x c", "c x r", "the operand is a scalar"],
    ["-A", "any", "unchanged", "no restriction"],
    ["identity(n)", "constant n", "n x n", "n is not a constant positive whole number"],
    ["zeros(r,c), ones(r,c)", "constants r, c", "r x c", "r or c is not a constant positive whole number"],
  ],
  [2100, 2000, 1300, 3626],
  "The shape rules, all implemented in types.c.",
  { mono: [0], glue: true }
));

children.push(P(
  "The file types.c holds these rules as functions such as type_mul, which returns the " +
  "product's type or the error type. The analyser calls these functions and the later " +
  "phases consult the same file, so one place in the compiler decides whether A * B is " +
  "legal and what shape it produces. I made the language reject scalar plus matrix on " +
  "purpose. That addition would have to add the scalar to each element, an operation " +
  "outside matrix algebra, and accepting it would let shape mistakes survive to run " +
  "time."));

children.push(PR([
  { t: "Declarations. ", b: true },
  { t: "A declaration that gives a shape and an initialiser needs an initialiser of that " +
       "shape, and an assignment must match its variable's shape too. A declaration " +
       "without a shape, as in matrix C = A * B, takes its shape from the initialiser; " +
       "an inferred shape reaches the symbol table by this path. The analyser checks the " +
       "initialiser before it inserts the name, so matrix A = A reports A as undeclared. " +
       "Declared dimensions must be at least 1." },
]));

children.push(PR([
  { t: "Compile-time constants. ", b: true },
  { t: "The compiler must know each shape during compilation. A small evaluator folds " +
       "numbers under negation, addition, subtraction and multiplication. Identifiers do " +
       "not fold, because the language has no named constants. The arguments of " +
       "identity, zeros and ones must fold, as must the entries of a matrix literal, and " +
       "a dimension must be a positive whole number as well. For that reason bad_shape.ml " +
       "fails on zeros(s, 2) and on identity(2.5)." },
]));

children.push(PR([
  { t: "Matrix literals. ", b: true },
  { t: "The analyser checks a literal's shape before its entries. The first row sets the " +
       "width, and the analyser reports any later row of a different length by its " +
       "number. It folds the entries into the literal pool once the literal proves " +
       "rectangular; entry errors on a literal with no shape would add noise." },
]));

children.push(PR([
  { t: "Error containment. ", b: true },
  { t: "The analyser gives an expression that fails a rule the error type, and each " +
       "rule accepts an operand of that type without comment, since the analyser has " +
       "reported it. Without this, one undeclared name deep in an expression would " +
       "trigger a further error at each operator above it. The program below has one " +
       "mistake under two more operators and produces one diagnostic." },
]));

children.push(...Code([
  "matrix A[2,2];",
  "matrix R = transpose(Q) * A + A;",
  "print(R);",
  "",
  "2:22: error [semantic] use of undeclared variable 'Q'",
  "1 error(s), 0 warning(s).",
]));

children.push(P(
  "After the walk, the analyser warns about each name that no statement reads. " +
  "Warnings leave the exit status unchanged. The driver skips semantic analysis for a " +
  "program with lexical or syntax errors, because a tree with statements removed by " +
  "recovery would yield errors that the recovery caused. The driver's output reports " +
  "a skipped pass."));

/* 8.6 TAC */
children.push(H2("8.6 Intermediate code: tac.c"));
children.push(P(
  "The intermediate representation is three-address code [1]: each instruction applies " +
  "at most one operator to at most two operands and writes at most one destination. " +
  "Ten instruction forms cover the language."));

children.push(...Tbl(
  ["Form", "Opcodes"],
  [
    ["x = y + z,  x = y - z,  x = y * z", "TAC_ADD, TAC_SUB, TAC_MUL"],
    ["x = -y,  x = transpose(y)", "TAC_NEG, TAC_TRANS"],
    ["x = y", "TAC_COPY"],
    ["x = identity(n),  x = zeros(r,c),  x = ones(r,c)", "TAC_IDENTITY, TAC_ZEROS, TAC_ONES"],
    ["print y", "TAC_PRINT"],
  ],
  [4700, 4326],
  "The instruction forms of the three-address code.",
  { mono: [0, 1] }
));

children.push(P(
  "Generation is a postorder walk. For each expression, the generator returns the name " +
  "of the operand holding its value: a number becomes a constant operand, an " +
  "identifier names itself, a matrix literal becomes its index in the literal pool, and " +
  "each operator writes a new temporary. A declaration without an initialiser emits " +
  "nothing, because each declared variable starts at zero with its declared shape. " +
  "Operands are strings, and the spelling of each one tells its kind."));

children.push(...Code([
  "A, C        a program variable  (an identifier never starts with a digit)",
  "t1, t7      a compiler temporary",
  "3, 2.5      a scalar constant",
  "#0, #4      a matrix literal, by index into the literal pool",
]));

children.push(P(
  "The generator interns each operand string, storing it once and sharing it. Two " +
  "operands are equal when their strings match, and no instruction owns an operand it " +
  "must free, so later passes can copy operands between instructions. Each instruction " +
  "records the type it produces, and the generator types each temporary as it creates " +
  "it. A MatrixLang program has no control flow and forms a single basic block, so one " +
  "flat array of instructions represents it."));

/* 8.7 errors */
children.push(H2("8.7 Error handling: diag.c"));
children.push(P(
  "The phases print no messages of their own. Each reports through one function that " +
  "records the level, phase, position and text, and may attach a detail block of " +
  "several lines. Four phases can report, and each message is an error or a warning."));

children.push(...Tbl(
  ["Class", "Detected by", "Example"],
  [
    ["Lexical", "Scanner", "illegal character '$'"],
    ["Syntax", "Parser", "unexpected ';', expecting ']'"],
    ["Semantic", "Semantic analyser", "cannot multiply Matrix<2x3> by Matrix<5x4>"],
    ["Runtime", "Virtual machine (Phase 3)", "virtual machine stack overflow"],
  ],
  [1500, 2600, 4926],
  "Error classes and the component that detects each.",
  { mono: [2] }
));

children.push(P(
  "The collector sorts the messages by line and column before printing them, because " +
  "the phases do not run in source order. In lexical.ml the scanner's errors and the " +
  "parser's errors interleave, and the sort prints them in file order."));

children.push(...Code([
  "5:7: error [lexical] illegal character '$'",
  "5:9: error [syntax] syntax error, unexpected IDENT, expecting '+' or '-' or '*' or ';'",
  "6:5: error [lexical] malformed number or identifier '12abc' (an identifier may not begin with a digit)",
  "6:11: error [syntax] syntax error, unexpected '*'",
  "4 error(s), 0 warning(s).",
]));

children.push(P(
  "The error count sets the exit status: 0 for a valid program, 1 when the compiler " +
  "reported an error, and 2 for a usage problem such as a missing file. A dimension " +
  "error carries a detail block with both operands as written, their shapes, the rule " +
  "and the values found, as in Section 5.2."));

/* ---------- 9. Implementation Progress Report ---------- */
children.push(H1("9. Implementation Progress Report"));

children.push(H2("9.1 Status against the plan"));
children.push(...Tbl(
  ["Planned component", "Status", "Shown by", "Tested by"],
  [
    ["Flex lexer", "Complete", "--tokens", "token class checks; lexical.ml"],
    ["Bison parser, error recovery", "Complete", "--ast", "syntax.ml: three errors in one run"],
    ["Syntax tree with shapes", "Complete", "--ast", "6 checks"],
    ["Symbol table with shapes", "Complete", "--symbols", "7 checks"],
    ["Dimension checking", "Complete", "--check", "28 checks over eight invalid programs"],
    ["Three-address code", "Complete", "--tac", "8 checks"],
    ["Review 2 demonstration", "Complete", "make demo2", "the runs of Section 5"],
  ],
  [2900, 1100, 1500, 3526],
  "The Phase 2 plan from the Phase 1 document, and the state of each item.",
  { mono: [2], glue: true }
));

children.push(H2("9.2 Technical challenges addressed"));
children.push(BulletB("A token table from a pull parser. ",
  "Bison consumes tokens as it parses, which leaves nothing to print afterwards. The " +
  "scanner records each token as it returns it, which gives the table without a second " +
  "scan or duplicated lexical errors."));
children.push(BulletB("Error containment. ",
  "Left alone, a bad operand deep in an expression produces an error at each operator " +
  "above it. The error type, which each rule accepts without comment, cuts that down to " +
  "one message."));
children.push(BulletB("Messages in file order. ",
  "Different phases find errors, and they do not run in file order. A single collector " +
  "that sorts by position fixes the order for all phases at once."));
children.push(BulletB("Memory during error recovery. ",
  "Symbols that recovery discards do not reach the action that frees them. A destructor " +
  "frees discarded identifier strings. A destructor for tree nodes would free the " +
  "finished tree after a successful parse, so the grammar omits it and records the " +
  "reason beside the declaration."));
children.push(BulletB("A silent build failure on Windows. ",
  "With a conflicting runtime library earlier on PATH, gcc exits with status 1 and " +
  "prints nothing. The build instructions put the mingw64 tools first, and make " +
  "toolchain prints the tools the build resolves. gcc also falls back to C:\\Windows " +
  "for temporary files, a directory it cannot write to, so the Makefile points it at " +
  "build/."));

children.push(H2("9.3 Distinctive features"));
children.push(BulletB("Shapes are types. ",
  "Matrix<2x3> and Matrix<3x2> are different types, and a declaration may leave its " +
  "shape to the compiler."));
children.push(BulletB("Diagnostics that state the rule. ",
  "A rejection names the operands as written, their shapes, the broken rule of matrix " +
  "algebra and the numbers that broke it."));
children.push(BulletB("A typed intermediate representation. ",
  "Each instruction and temporary carries its shape, ready for the instruction " +
  "selection and cost model of Phase 3."));
children.push(BulletB("Visible stages. ",
  "Each stage prints its artefact on request, so a reviewer can stop the compiler after " +
  "any stage and read its output."));
children.push(BulletB("A visual demonstration of the front end. ",
  "A web page steps through the scanner and the LALR(1) parse of any program you type " +
  "into it. It shows the competing scanner rules, the parser's stack and lookahead, " +
  "each action, and the tree as it forms, using the state table from Bison's own " +
  "report. A check that runs with the tests compares the page's scanner and parser " +
  "with the compiler over the 21 example programs, and the two agree on all 1,179 " +
  "tokens and 10 front end diagnostics."));

children.push(H2("9.4 Work for Review 3"));
children.push(P(
  "Phase 3 covers the optimizer (algebraic simplification over matrix properties, " +
  "common subexpression elimination, copy propagation, dead code elimination, and " +
  "ordering of matrix chains by arithmetic cost), target code generation for a stack " +
  "machine, execution with runtime errors, and a measured evaluation. The current " +
  "source tree contains these stages, and they pass the suite's 64 Phase 3 checks. " +
  "Review 3 will present them with the evaluation."));

/* ---------- References ---------- */
children.push(H1("References"));

const REFS = [
  "Aho, A. V., Lam, M. S., Sethi, R., and Ullman, J. D. Compilers: Principles, " +
  "Techniques, and Tools. 2nd edition, Pearson Addison Wesley, 2006.",

  "Levine, J. flex & bison: Text Processing Tools. O'Reilly Media, 2009.",

  "Free Software Foundation. Bison: The Yacc-compatible Parser Generator, version " +
  "3.8.2. https://www.gnu.org/software/bison/manual/",

  "The Flex Project. Lexical Analysis with Flex, version 2.6.4. " +
  "https://westes.github.io/flex/manual/",

  "ISO/IEC 9899:2011. Information technology, programming languages, C. " +
  "International Organization for Standardization, 2011.",
];

REFS.forEach((r, i) => children.push(new Paragraph({
  alignment: AlignmentType.LEFT,
  spacing: { after: 85, line: LINE },
  indent: { left: 520, hanging: 520 },
  children: [new TextRun({ text: "[" + (i + 1) + "]   " + r, font: BODY, size: SZ, color: BLACK })],
})));

/* ================================================================== */

const doc = new Document({
  creator: "A Aswanth Raj (24BAI0044)",
  title: "MatrixLang - Project Review 2: Core Implementation",
  description: "Phase 2 submission for the Compiler Design Laboratory.",
  styles: {
    default: {
      document: { run: { font: BODY, size: SZ, color: BLACK } },
      heading1: { run: { font: BODY, color: BLACK, bold: true } },
      heading2: { run: { font: BODY, color: BLACK, bold: true } },
    },
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "\u2022",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 480, hanging: 250 } } },
        }],
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      },
    },
    children,
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(process.argv[2], buf);
  console.log("wrote", process.argv[2], buf.length, "bytes");
});
