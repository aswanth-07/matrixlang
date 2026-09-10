const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  PageBreak, LevelFormat, ImageRun
} = require("docx");
const fs = require("fs");
const path = require("path");

/* ------------------------------------------------------------------ *
 * MatrixLang -- Phase 1 submission document.
 *
 * Format follows the department's project-review convention: a cover
 * carrying the title and the participant table, plain bold section
 * headings with no rules, justified body text, and italic table
 * captions below each table. Section 1 to 12 are the twelve Phase 1
 * deliverables of section 8.3, in the order the manual lists them.
 *
 * Constraints: black text only, no page headers or footers, and no dash
 * characters of any kind in the prose.
 *
 * Build:  node docs/build-phase1-docx.js docs/MatrixLang-Phase1.docx
 * ------------------------------------------------------------------ */

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

/* ---------- building blocks ---------- */

const P = (text, opts = {}) => new Paragraph({
  alignment: opts.align || AlignmentType.JUSTIFIED,
  spacing: { after: opts.after === undefined ? 130 : opts.after, line: LINE },
  children: [new TextRun({ text, font: BODY, size: SZ, bold: !!opts.bold, italics: !!opts.italics, color: BLACK })],
});

const PR = (segments, opts = {}) => new Paragraph({
  alignment: opts.align || AlignmentType.JUSTIFIED,
  spacing: { after: opts.after === undefined ? 130 : opts.after, line: LINE },
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

const Num = (text) => new Paragraph({
  numbering: { reference: "numbers", level: 0 },
  alignment: AlignmentType.JUSTIFIED,
  spacing: { after: 60, line: LINE },
  children: [new TextRun({ text, font: BODY, size: SZ, color: BLACK })],
});

const Code = (lines) => lines.map((ln, i) => new Paragraph({
  spacing: {
    before: i === 0 ? 90 : 0,
    after: i === lines.length - 1 ? 130 : 0,
    line: 205,
  },
  keepLines: true,
  keepNext: i < lines.length - 1,
  indent: { left: 170 },
  shading: { type: ShadingType.CLEAR, fill: GREY_CODE, color: "auto" },
  children: [new TextRun({ text: ln === "" ? " " : ln, font: MONO, size: 17, color: BLACK })],
}));

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
      bold: !!opts.head, color: BLACK,
    })],
  })],
});

/* A table plus its italic caption, in the department's convention. */
const Tbl = (headers, rows, widths, caption, opts = {}) => {
  tableNo += 1;
  /* A short table split across a page break, or parted from its caption,
   * reads as two fragments. Bind the rows of a small one together; a long
   * table is left to break, since forcing it whole would strand a page. */
  const glue = rows.length <= 5;
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
      ...rows.map(r => new TableRow({
        children: r.map((c, i) => cell(c, widths[i], {
          mono: (opts.mono || []).includes(i),
          keepNext: glue,
          center: (opts.center || []).includes(i),
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
        data: fs.readFileSync(path.join(__dirname, file)),
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
 * Proportions follow the department's review documents: the title block
 * sits in the upper third, the review label and course sit below it, and
 * the participant table is centred beneath both. Nothing is coloured and
 * nothing is ruled.
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
    text: "Project Review 1: Problem Definition and Design",
    font: BODY, size: 24, bold: true, color: BLACK,
  })],
}));

children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 700 },
  children: [new TextRun({
    text: "BCSE307P  Compiler Design Lab",
    font: BODY, size: 23, color: BLACK,
  })],
}));

/* Participant table: centred, a little narrower than the text column, with
 * taller rows than a body table so it reads as part of the title block. */
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

children.push(new Table({
  columnWidths: [2900, 2500, 2700],
  width: { size: 8100, type: WidthType.DXA },
  alignment: AlignmentType.CENTER,
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

/* ---------- 1. Project Title ---------- */
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1("1. Project Title"));

children.push(PR([{ t: "MatrixLang: a dimension-aware optimizing compiler for a matrix language.", b: true }]));

children.push(P(
  "The title names both halves of the work. MatrixLang is the source language " +
  "designed for this project, and the compiler for it is a complete implementation " +
  "carried through every phase of translation, from lexical analysis to the " +
  "execution of generated target code."));

children.push(P(
  "The qualifier dimension-aware identifies the distinguishing property. In " +
  "MatrixLang a value's type is not matrix but Matrix<2x3>: the number of rows and " +
  "columns forms part of the type, and the compiler reasons about shapes throughout " +
  "translation. That decision is what separates both the semantic analysis and the " +
  "optimizer from those of a conventional scalar compiler."));

/* ---------- 2. Abstract ---------- */
children.push(H1("2. Abstract"));

children.push(P(
  "MatrixLang is a programming language for matrix computation together with a " +
  "complete compiler for it. Its distinguishing feature is that matrix dimensions " +
  "form part of the type system. A value's type is not matrix but Matrix<2x3>, and " +
  "every operation is checked against the shape rules of linear algebra during " +
  "compilation. A program that attempts to multiply a 2x3 matrix by a 5x4 matrix is " +
  "rejected with a diagnostic naming both operand shapes and the rule violated, " +
  "before any element has been computed."));

children.push(P(
  "The compiler implements the full translation pipeline: lexical analysis with " +
  "Flex, parsing with Bison into an abstract syntax tree, a symbol table storing " +
  "each name's shape, semantic analysis that infers and checks dimensions, " +
  "three-address code as an intermediate representation, four optimization passes " +
  "applied to a fixed point, target code generation for a stack-based virtual " +
  "machine, and execution of that code. Alongside common subexpression elimination, " +
  "copy propagation and dead code elimination, it implements matrix-specific " +
  "algebraic simplifications that a general-purpose optimizer cannot perform. " +
  "Rewriting A * I to A, or transpose(transpose(A)) to A, requires the compiler to " +
  "know that a value is an identity matrix or a repeated transpose, and that " +
  "knowledge exists only because shapes and constructors are tracked in the type " +
  "system."));

children.push(P(
  "Phase 1 delivers the language specification, the system design and a working " +
  "prototype of the compiler front end that classifies a token stream and reports a " +
  "syntax verdict, establishing that the design is implementable before the full " +
  "semantic analysis and optimization stages planned for the later phases are " +
  "implemented."));

children.push(PR([
  { t: "Keywords: ", b: true },
  { t: "compiler design, type systems, shape inference, static analysis, code " +
       "optimization, algebraic simplification, intermediate representation, " +
       "virtual machines, matrix computation." },
]));

/* ---------- 3. Problem Statement ---------- */
children.push(H1("3. Problem Statement"));

children.push(P(
  "Shape errors are the characteristic defect of matrix code. A matrix addition " +
  "whose operands differ in shape, or a product whose inner dimensions do not agree, " +
  "is the ordinary mistake rather than an unusual one. In the languages actually " +
  "used for matrix work, these errors are found late. In C and Java a matrix is an " +
  "array and its dimensions are ordinary integers, so nothing checks them and a " +
  "wrong shape becomes an out-of-bounds access, a silently incorrect result, or a " +
  "crash far removed from its cause. In Python with NumPy the check does occur, but " +
  "at runtime, after the data has been loaded and earlier stages of the computation " +
  "have run."));

children.push(P(
  "In both cases the information needed to catch the error is already present in the " +
  "source text. If A is declared 2x3 and B is declared 5x4, the impossibility of " +
  "A * B is a property of the program rather than of its input, and can be decided " +
  "by reading the program. Most mainstream general-purpose languages do not " +
  "represent matrix dimensions as part of the type system, so shape compatibility is " +
  "generally checked by libraries or at runtime rather than by the language's own " +
  "compiler."));

children.push(PR([
  { t: "Problem statement. ", b: true },
  { t: "Matrix dimension errors are detectable at compile time from information the " +
       "source already contains, and are not detected at compile time. This project " +
       "designs a language and builds a compiler that detect them, and that use the " +
       "same shape information to perform optimizations unavailable to a compiler " +
       "without it." },
]));

children.push(P("Two connected difficulties sit inside that problem."));

children.push(BulletB("Inference. ",
  "A shape is declared only where a variable is introduced. Every intermediate " +
  "result in an expression has a shape that must be derived, and a diagnostic is " +
  "useful only if it can name the shapes of both operands and the rule they violate."));

children.push(BulletB("Exploitation. ",
  "Because conventional compilers discard shape information, they cannot use the " +
  "algebraic identities it makes available. An optimizer that knew a value were an " +
  "identity matrix could remove the multiplication entirely; lacking that knowledge " +
  "it must emit the full triple loop."));

/* ---------- 4. Motivation ---------- */
children.push(H1("4. Motivation"));

children.push(P(
  "Three considerations motivate building this system as a compiler design project."));

children.push(P(
  "The first is that it places substantial work in the semantic analyser. In a " +
  "typical teaching language, semantic analysis reduces to checking that an integer " +
  "is not assigned to a boolean, which is a comparison of two enumeration values. " +
  "Here, type checking means propagating shapes through arbitrary expressions, " +
  "inferring the result shape of a product from its operands, deciding whether an " +
  "assignment is shape-compatible, and producing a diagnostic that identifies the " +
  "rule of linear algebra that was broken."));

children.push(P(
  "The second is that it gives the optimizer work that a general optimizer cannot " +
  "do. Constant folding and dead code elimination are substantially the same in " +
  "every compiler. The identity A * I = A is a fact about matrices, and exploiting " +
  "it requires the compiler to track which values are identity matrices, zero " +
  "matrices or repeated transposes. That analysis has no counterpart in a scalar " +
  "language, and it follows from the language design rather than being added to it."));

children.push(P(
  "The third is that the project exercises every phase of the syllabus as stages of " +
  "one program rather than as separate exercises. A lexer, a parser, a symbol table, " +
  "a semantic analyser, an intermediate representation, an optimizer, a code " +
  "generator and an execution engine each consume the output of the last, so a " +
  "defect at any stage becomes visible in the final result."));

/* ---------- 5. Objectives ---------- */
children.push(H1("5. Objectives"));

children.push(P(
  "Each objective is stated so that it can be demonstrated or measured, and together " +
  "they form the criteria against which the finished project is to be judged."));

[
  "Design a language whose type system carries matrix dimensions, and specify its tokens, grammar and semantics completely.",
  "Implement lexical analysis using Flex, recognising every token class and reporting lexical errors with line and column positions.",
  "Implement syntax analysis using Bison, constructing an abstract syntax tree, with error recovery sufficient to report several syntax errors in a single run.",
  "Implement a symbol table recording each name's kind, shape, declaration position and usage counts.",
  "Implement semantic analysis that infers the shape of every expression and rejects every operation whose shapes do not combine, with a diagnostic naming both operands and the rule violated.",
  "Generate three-address code as an intermediate representation.",
  "Implement common subexpression elimination, copy propagation and dead code elimination.",
  "Implement matrix-specific algebraic simplification covering A*I, I*A, A+0, A-0, A*1, A*0 and transpose(transpose(A)).",
  "Generate target code for a matrix virtual machine and execute it, producing correct numerical results.",
  "Produce an optimization report quantifying the improvement, itemised by the transformation responsible.",
  "Validate the compiler with a test suite covering valid programs, every error class, and the equivalence of optimized and unoptimized execution.",
].forEach(o => children.push(Num(o)));

children.push(new Paragraph({ spacing: { after: 70 }, children: [] }));
children.push(P(
  "The final objective carries particular weight. An optimizer that produces fewer " +
  "instructions has been shown to be smaller rather than correct. Demonstrating that " +
  "optimized and unoptimized programs produce identical output is what distinguishes " +
  "an optimization from a transformation that merely shortens the code."));

/* ---------- 6. Scope ---------- */
children.push(H1("6. Scope"));

children.push(H2("6.1 Within scope"));
children.push(...Tbl(
  ["Area", "Included"],
  [
    ["Types", "scalar; matrix with dimensions fixed at compile time"],
    ["Operations", "addition, subtraction, multiplication, unary negation, transpose"],
    ["Constructors", "matrix literals, identity(n), zeros(r,c), ones(r,c)"],
    ["Statements", "declaration, assignment, print"],
    ["Compiler phases", "all phases, through to execution of generated code"],
    ["Diagnostics", "lexical, syntax, semantic and runtime errors, reported in source order"],
    ["Optimizations", "algebraic simplification, CSE, copy propagation, dead code elimination"],
  ],
  [2100, 6926],
  "The functionality MatrixLang provides."
));

children.push(H2("6.2 Outside scope"));
children.push(P(
  "The exclusions below are design decisions with stated reasons rather than work " +
  "left undone."));

children.push(BulletB("Control flow. ",
  "There is no conditional and no loop. With straight-line code the entire program " +
  "forms a single basic block, which makes common subexpression elimination and " +
  "liveness analysis exact without a control-flow graph or iterative dataflow " +
  "analysis. The analytical interest of the project lies in dimension-aware " +
  "semantics and matrix optimization, to neither of which control flow contributes."));

children.push(BulletB("Functions. ",
  "Excluded for the same reason, and because shape polymorphism across function " +
  "boundaries is a harder problem than the remainder of the project combined."));

children.push(BulletB("Runtime-sized matrices. ",
  "Compile-time shapes are the premise of the design. A dimension read from input " +
  "could not be checked during compilation."));

children.push(BulletB("Strings, booleans and an integer to floating-point distinction. ",
  "Each would propagate through the type rules, the intermediate representation, the " +
  "instruction set and the virtual machine without adding compiler-design content. " +
  "Scalars are double precision throughout."));

children.push(BulletB("Numerical performance. ",
  "Matrix multiplication uses the textbook triple loop. The project is a compiler, " +
  "not a numerical linear algebra library."));

/* ---------- 7. Background Study ---------- */
children.push(H1("7. Background Study"));

children.push(H2("7.1 Theory studied and its application"));
children.push(...Tbl(
  ["Area studied", "Application in this project"],
  [
    ["Regular expressions, finite automata [1]", "Token specification in the Flex scanner"],
    ["Context-free grammars, LALR(1) parsing [1]", "Grammar design and conflict resolution in Bison"],
    ["Syntax-directed translation", "Tree construction inside grammar semantic actions"],
    ["Symbol table organisation", "Hash table with insertion-ordered storage for printing"],
    ["Type systems and type inference", "Shapes as types, inference through expressions"],
    ["Intermediate representations", "Three-address code with generated temporaries"],
    ["Local optimization [1], [2]", "Available expressions, liveness, algebraic identities"],
    ["Code generation for stack machines [2]", "Instruction selection driven by inferred types"],
    ["Error recovery", "Statement-level recovery at the semicolon"],
  ],
  [3500, 5526],
  "Syllabus topics and the components in which each is exercised."
));

children.push(H2("7.2 Existing systems examined"));
children.push(...Tbl(
  ["System", "Treatment of shapes", "Consequence"],
  [
    ["NumPy (Python) [6]", "Checked at runtime, when the operation executes",
     "Errors surface late, after loading and partial computation"],
    ["C, Java [9]", "Not checked; dimensions are ordinary integers",
     "Errors become memory faults or silently wrong results"],
    ["Idris, Agda [7]", "Dimensions in dependent types, checked statically",
     "Fully general, but inaccessible to most programmers"],
    ["TVM and similar [8]", "Shape inference over computation graphs",
     "Operates on graphs rather than source text"],
  ],
  [1800, 3500, 3726],
  "Where existing systems place the dimension check, and what it costs them."
));

children.push(P(
  "MatrixLang adopts the principle these systems share [6], [7], [8], that dimensions belong in " +
  "the type, and applies it within a small imperative language where it can be " +
  "implemented completely and demonstrated end to end. It is deliberately less " +
  "general than dependent typing and more static than NumPy, and that position is " +
  "what makes it tractable within a single semester while still producing a result " +
  "neither approach provides."));

/* ---------- 8. Concepts ---------- */
children.push(H1("8. Compiler Design Concepts Involved"));

children.push(P(
  "Every concept listed below is exercised by working code rather than described in " +
  "documentation alone."));

children.push(...Tbl(
  ["Concept", "Realisation in MatrixLang"],
  [
    ["Lexical analysis", "Flex scanner; token classes; position tracking; lexical errors"],
    ["Syntax analysis", "Bison LALR(1) grammar; precedence and associativity; recovery at ';'"],
    ["Abstract syntax tree", "Uniform node type with a child vector; every node carries its type"],
    ["Symbol table", "Hash table with djb2 hashing; insertion, lookup, duplicate detection"],
    ["Semantic analysis", "Shape inference; dimension checking; poison typing to contain cascades"],
    ["Intermediate code", "Three-address code with generated temporaries and interned operands"],
    ["Code optimization", "Algebraic simplification, CSE, copy propagation and dead code elimination"],
    ["Target code generation", "Instruction selection for a stack machine, driven by inferred shapes"],
    ["Interpretation", "A virtual machine that executes the generated instruction stream"],
    ["Error handling", "One collector for all four error classes, emitting in source order"],
  ],
  [2300, 6726],
  "Each syllabus concept and the component that implements it."
));

children.push(P(
  "Two entries require explanation. Poison typing means that once a subexpression " +
  "has been reported as ill-shaped, its type becomes an error type that propagates " +
  "outward, so a single mistake produces one diagnostic rather than one at every " +
  "enclosing operator. Emitting diagnostics in source order matters because the " +
  "passes do not run in source order: a lexical error on line 6 and a syntax error " +
  "on line 7 are found by different passes, and a reader expects them in file order."));

/* ---------- 9. Proposed Methodology ---------- */
children.push(H1("9. Proposed Methodology"));

children.push(H2("9.1 Language specification"));
children.push(P(
  "The language was specified before any code was written, and the scanner and " +
  "parser were implemented against that specification. Seven keywords are reserved: " +
  "matrix, scalar, print, transpose, identity, zeros and ones. Identifiers are case " +
  "sensitive and may not begin with a digit. Numeric literals admit an optional " +
  "fractional part and exponent, and there is one numeric kind, double precision. " +
  "Comments follow both C conventions and do not nest."));

children.push(...Code([
  "program         -> stmt_list",
  "stmt_list       -> stmt_list stmt | eps",
  "stmt            -> declaration | assignment | print_statement | ';'",
  "",
  "declaration     -> 'matrix' IDENT '[' NUMBER ',' NUMBER ']' ';'",
  "                 | 'matrix' IDENT '[' NUMBER ',' NUMBER ']' '=' expression ';'",
  "                 | 'matrix' IDENT '=' expression ';'",
  "                 | 'scalar' IDENT ';'  |  'scalar' IDENT '=' expression ';'",
  "",
  "assignment      -> IDENT '=' expression ';'",
  "print_statement -> 'print' '(' expression ')' ';'",
  "",
  "expression      -> expression ('+' | '-' | '*') expression",
  "                 | '-' expression",
  "                 | ('transpose' | 'identity') '(' expression ')'",
  "                 | ('zeros' | 'ones') '(' expression ',' expression ')'",
  "                 | '(' expression ')'",
  "                 | matrix_literal | NUMBER | IDENT",
  "",
  "matrix_literal  -> '{' row_list '}'      row_list -> row | row_list ',' row",
  "row             -> '{' num_list '}'      num_list -> expression",
  "                                                   | num_list ',' expression",
]));

children.push(P(
  "The grammar is LALR(1) as written and is accepted by Bison with no shift/reduce " +
  "or reduce/reduce conflicts. Ambiguity in the expression rules is resolved by " +
  "declared precedence and associativity rather than by restructuring the grammar: " +
  "addition and subtraction are left associative and bind least tightly, " +
  "multiplication is left associative and binds more tightly, and unary negation is " +
  "right associative and binds most tightly."));

children.push(P(
  "The shape rules the semantic analyser enforces follow from the grammar. Addition " +
  "and subtraction require identical shapes and yield that shape. Multiplication " +
  "requires that the columns of the left operand equal the rows of the right, and " +
  "yields the rows of the left by the columns of the right; where either operand is " +
  "a scalar it denotes scaling and preserves the other shape. Transpose exchanges " +
  "rows and columns. The constructors take compile-time constants and yield the " +
  "shape those constants name."));

children.push(H2("9.2 The compilation pipeline"));
children.push(...Tbl(
  ["Stage", "Technique or tool", "Produces"],
  [
    ["Lexical analysis", "Flex", "Token stream; lexical diagnostics"],
    ["Syntax analysis", "Bison, LALR(1)", "Abstract syntax tree; syntax diagnostics"],
    ["Semantic analysis", "Symbol table, shape inference", "Typed tree; dimension diagnostics"],
    ["Intermediate code", "Three-address code", "Linear representation with temporaries"],
    ["Optimization", "Four passes to a fixed point", "Reduced code; optimization report"],
    ["Target code generation", "Instruction selection", "Virtual machine instruction stream"],
    ["Execution", "Stack-machine interpreter", "Numerical output"],
  ],
  [2100, 3100, 3826],
  "The seven stages of translation and the artefact each produces."
));

children.push(P(
  "The optimizer applies its passes in a fixed order, namely algebraic " +
  "simplification, then common subexpression elimination, then copy propagation, " +
  "then dead code elimination, and repeats the sequence until nothing changes. The " +
  "order is not arbitrary. Simplification turns operations into copies, common " +
  "subexpression elimination turns repeated expressions into copies, copy " +
  "propagation renders those copies unused, and dead code elimination removes them. " +
  "A single pass is insufficient because deleting one instruction can expose " +
  "another as dead."));

children.push(H2("9.3 Development plan"));
children.push(P(
  "Development follows the three phases the laboratory manual defines. Each ends at " +
  "an artefact that runs and can be demonstrated on its own rather than at a " +
  "partially built pipeline awaiting the next phase."));

children.push(...Tbl(
  ["Phase", "Content", "Demonstration"],
  [
    ["Phase 1", "Problem definition, language specification, system design, front-end prototype", "make demo1"],
    ["Phase 2", "Flex lexer, Bison parser, syntax tree, symbol table with shapes, dimension checking, three-address code", "make demo2"],
    ["Phase 3", "Optimization passes, target code generation, execution, optimization report, testing", "make demo3"],
  ],
  [1000, 5926, 2100],
  "The three review phases and the command that demonstrates each.",
  { mono: [2] }
));

/* ---------- 10. System Architecture ---------- */
children.push(H1("10. System Architecture"));

children.push(H2("10.1 Data flow between modules"));

children.push(P(
  "The compilation spine runs down the centre of Figure 1. What the compiler " +
  "produces at each stage appears on the right, and the two components that observe " +
  "or drive the whole pipeline appear on the left."));

children.push(...Fig("architecture.png", 596, 388,
  "Architecture of the MatrixLang compiler. The shape rules are drawn heavier " +
  "because three separate stages consult them."));

children.push(H2("10.2 Module responsibilities"));
children.push(...Tbl(
  ["Module", "Responsibility"],
  [
    ["matrix.l", "Flex scanner; also records each token for the displayed table"],
    ["matrix.y", "Bison grammar; constructs the syntax tree"],
    ["types.c", "The type lattice and every shape rule"],
    ["ast.c", "Node representation, tree printing, expression rendering"],
    ["symtab.c", "Names, shapes, declaration positions, usage counts"],
    ["semantic.c", "Name resolution, shape inference, dimension checking, diagnostics"],
    ["tac.c", "Three-address code generation"],
    ["optimize.c", "The four optimization passes, the report and the explanation"],
    ["codegen.c", "Instruction selection for the virtual machine"],
    ["vm.c, value.c", "The stack machine, and the matrix arithmetic it performs"],
    ["tokens.c, diag.c", "The recorded token stream; the sorted diagnostic collector"],
    ["util.c, main.c", "Allocation helpers; command-line interface and orchestration"],
  ],
  [2000, 7026],
  "The compiler's modules and the responsibility of each.",
  { mono: [0] }
));

children.push(H2("10.3 Principal design decisions"));
children.push(P(
  "Every shape rule is isolated in a single module rather than distributed through " +
  "the analyser. Exactly one place in the compiler decides whether A * B is legal " +
  "and what shape it produces, and the semantic analyser, the optimizer and the code " +
  "generator all consult it rather than deriving shapes independently. The question " +
  "of whether the compiler implements the dimension rules correctly is therefore " +
  "answered by reading one short file, and the analyser and the code generator " +
  "cannot disagree about whether a multiplication denotes a matrix product or a " +
  "scalar scaling, since both consult the same function."));

children.push(P(
  "A second decision follows from the language design. Because MatrixLang has no " +
  "control flow, a program compiles to a single basic block, so there is no " +
  "control-flow graph and no iterative dataflow analysis anywhere in the compiler. " +
  "Local common subexpression elimination and a single backward liveness sweep are " +
  "exact rather than conservative approximations, and the absence of the usual " +
  "dataflow machinery is a consequence of the language specification."));

/* ---------- 11. Technology Stack ---------- */
children.push(H1("11. Technology Stack"));

children.push(...Tbl(
  ["Component", "Choice", "Justification"],
  [
    ["Implementation language", "C (C11) [9]", "The manual's first recommendation; integrates directly with Flex and Bison"],
    ["Lexical analyser generator", "Flex 2.6.4 [5]", "The standard tool named in the syllabus"],
    ["Parser generator", "Bison 3.8.2 [4]", "LALR(1) handles the grammar as written, without restructuring"],
    ["Build system", "GNU Make", "One command from a clean tree to a working binary"],
    ["Host compiler", "gcc 15.2 (mingw64)", "Compiled with -Wall -Wextra; a warning-free build is a standing requirement"],
    ["Testing", "Shell script, 139 assertions", "Asserts exit status and output text together"],
    ["Version control", "Git", "Each phase's deliverable is complete at its commit"],
  ],
  [2400, 2200, 4426],
  "Tools selected for the project and the reason for each selection."
));

children.push(P(
  "No third-party libraries are used. Everything beyond Flex, Bison and the C " +
  "standard library is written for this project, including the symbol table, the " +
  "intermediate representation, the optimizer, the code generator, the virtual " +
  "machine and the matrix arithmetic. Development is on Windows with MSYS2, using " +
  "mingw64 gcc together with MSYS2 builds of Flex, Bison and Make. The build has not " +
  "been exercised on Linux or macOS, so portability is expected but is recorded as " +
  "unverified rather than claimed."));

/* ---------- 12. Initial Prototype ---------- */
children.push(H1("12. Initial Prototype"));

children.push(P(
  "The Phase 1 prototype implements the front of the pipeline: source text in, a " +
  "classified token stream and a syntax verdict out. It establishes that the token " +
  "specification and the grammar are implementable as designed. Section banners are " +
  "elided in the listings below; the remaining text is the compiler's actual output."));

children.push(H2("12.1 A valid program"));
children.push(...Code([
  "$ ./bin/matrixc --phase1 examples/phase1/declare.ml",
  "",
  "#     TOKEN         LEXEME            LINE:COL",
  "----  ------------  ----------------  --------",
  "1     MATRIX        matrix            4:1",
  "2     IDENTIFIER    A                 4:8",
  "3     LBRACKET      [                 4:9",
  "4     NUMBER        2                 4:10",
  "5     COMMA         ,                 4:11",
  "",
  "  ... tokens 6 to 16 elided ...",
  "",
  "16 token(s).",
  "",
  "4:8: warning [semantic] 'A' is declared but never read",
  "5:8: warning [semantic] 'B' is declared but never read",
  "0 error(s), 2 warning(s).",
  "",
  "Syntax: VALID",
]));

children.push(P(
  "The token stream is grouped by source line, which keeps the position column " +
  "readable. The two warnings illustrate a distinction the compiler maintains " +
  "throughout: a warning describes something suspicious but legal and never alters " +
  "the exit status, so this program is accepted."));

children.push(H2("12.2 A malformed program"));
children.push(P(
  "The input contains two mistakes: a missing closing bracket on the first line, and " +
  "an identifier beginning with a digit on the second."));

children.push(...Code([
  "$ cat examples/phase1/bad.ml",
  "matrix A[2,3;",
  "matrix 4B[2,2];",
  "",
  "$ ./bin/matrixc --phase1 examples/phase1/bad.ml",
  "",
  "  ... token table elided ...",
  "",
  "(skipping semantic analysis: the source did not parse)",
  "",
  "1:13: error [syntax] syntax error, unexpected ';', expecting ']'",
  "2:8: error [lexical] malformed number or identifier '4B'",
  "     (an identifier may not begin with a digit)",
  "2:10: error [syntax] syntax error, unexpected '[', expecting IDENT",
  "3 error(s), 0 warning(s).",
  "",
  "Syntax: INVALID",
]));

children.push(P(
  "All three diagnostics arise from a single run, because the parser recovers at the " +
  "statement level. They appear in source order despite coming from different " +
  "passes, the lexical error from the scanner and the other two from the parser, " +
  "because every diagnostic is routed through one collector that sorts by position. " +
  "Semantic analysis is skipped, and reported as skipped, since analysing a tree " +
  "that failed to parse would report errors caused by recovery rather than by the " +
  "source."));

children.push(H2("12.3 Exit status"));
children.push(P(
  "The driver reports its verdict through the exit status as well as through printed " +
  "output, so the prototype composes with scripts and with the test suite, which " +
  "branches on the status as well as inspecting the text. Both demonstrations above " +
  "are run together by the command make demo1."));

children.push(...Tbl(
  ["Status", "Meaning"],
  [
    ["0", "The program is valid"],
    ["1", "At least one lexical, syntax or semantic error was reported"],
    ["2", "Usage error: no input file, unknown option, or unreadable file"],
  ],
  [1100, 7926],
  "Exit status of the compiler driver.",
  { mono: [0], center: [0] }
));

/* ---------- References ---------- */
children.push(H1("References"));

const REFS = [
  "Aho, A. V., Lam, M. S., Sethi, R., and Ullman, J. D. Compilers: Principles, " +
  "Techniques, and Tools. 2nd edition, Pearson Addison Wesley, 2006.",

  "Muchnick, S. S. Advanced Compiler Design and Implementation. Morgan Kaufmann, 1997.",

  "Levine, J. flex & bison: Text Processing Tools. O'Reilly Media, 2009.",

  "Free Software Foundation. Bison: The Yacc-compatible Parser Generator, version " +
  "3.8.2. https://www.gnu.org/software/bison/manual/",

  "The Flex Project. Lexical Analysis with Flex, version 2.6.4. " +
  "https://westes.github.io/flex/manual/",

  "Harris, C. R., Millman, K. J., van der Walt, S. J., et al. Array programming with " +
  "NumPy. Nature, volume 585, pages 357 to 362, 2020.",

  "Brady, E. Idris, a general-purpose dependently typed programming language: design " +
  "and implementation. Journal of Functional Programming, volume 23, issue 5, pages " +
  "552 to 593, 2013.",

  "Chen, T., Moreau, T., Jiang, Z., et al. TVM: an automated end-to-end optimizing " +
  "compiler for deep learning. Proceedings of the 13th USENIX Symposium on Operating " +
  "Systems Design and Implementation (OSDI), pages 578 to 594, 2018.",

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
  title: "MatrixLang - Project Review 1: Problem Definition and Design",
  description: "Phase 1 submission for the Compiler Design Laboratory.",
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
          level: 0, format: LevelFormat.BULLET, text: "•",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 480, hanging: 250 } } },
        }],
      },
      {
        reference: "numbers",
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: "%1.",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 520, hanging: 290 } } },
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
