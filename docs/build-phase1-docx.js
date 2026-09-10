const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  PageBreak, LevelFormat, convertInchesToTwip
} = require("docx");
const fs = require("fs");

/* ------------------------------------------------------------------ *
 * MatrixLang -- Phase 1 deliverable document.
 *
 * Constraints from the brief: no coloured fonts, no page headers or
 * footers, professionally clean. Hierarchy is therefore carried by size,
 * weight and spacing alone; the only fills used are neutral greys behind
 * code blocks and table header rows, which leave every glyph black.
 * ------------------------------------------------------------------ */

const BODY = "Times New Roman";
const MONO = "Consolas";

const PAGE_W = 11906;                 // A4 in DXA
const MARGIN = 1440;                  // 1 inch
const W = PAGE_W - 2 * MARGIN;        // 9026 usable

const GREY_CODE = "F4F4F4";
const GREY_HEAD = "E9E9E9";
const RULE = "999999";
const BLACK = "000000";

/* ---------- building blocks ---------- */

const P = (text, opts = {}) => new Paragraph({
  alignment: opts.align || AlignmentType.JUSTIFIED,
  spacing: { after: opts.after === undefined ? 130 : opts.after, line: 280 },
  indent: opts.indent,
  children: [new TextRun({ text, font: BODY, size: 22, bold: !!opts.bold, italics: !!opts.italics })],
});

/* A paragraph built from alternating plain/bold segments. */
const PR = (segments, opts = {}) => new Paragraph({
  alignment: opts.align || AlignmentType.JUSTIFIED,
  spacing: { after: opts.after === undefined ? 130 : opts.after, line: 280 },
  children: segments.map(s =>
    new TextRun({
      text: s.t,
      font: s.mono ? MONO : BODY,
      size: s.mono ? 19 : 22,
      bold: !!s.b,
      italics: !!s.i,
    })),
});

const H1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 380, after: 170 },
  keepNext: true, keepLines: true,
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 6 } },
  children: [new TextRun({ text, font: BODY, size: 30, bold: true, color: BLACK })],
});

const H2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 280, after: 120 },
  keepNext: true, keepLines: true,
  children: [new TextRun({ text, font: BODY, size: 24, bold: true, color: BLACK })],
});

const H3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  spacing: { before: 220, after: 100 },
  keepNext: true, keepLines: true,
  children: [new TextRun({ text, font: BODY, size: 22, bold: true, italics: true, color: BLACK })],
});

const Bullet = (text, level = 0) => new Paragraph({
  numbering: { reference: "bullets", level },
  alignment: AlignmentType.JUSTIFIED,
  spacing: { after: 80, line: 280 },
  children: [new TextRun({ text, font: BODY, size: 22 })],
});

/* Bulleted item with a bold lead-in, e.g. "Control flow -- rest of sentence". */
const BulletB = (lead, rest, level = 0) => new Paragraph({
  numbering: { reference: "bullets", level },
  alignment: AlignmentType.JUSTIFIED,
  spacing: { after: 80, line: 280 },
  children: [
    new TextRun({ text: lead, font: BODY, size: 22, bold: true }),
    new TextRun({ text: rest, font: BODY, size: 22 }),
  ],
});

const Num = (text) => new Paragraph({
  numbering: { reference: "numbers", level: 0 },
  alignment: AlignmentType.JUSTIFIED,
  spacing: { after: 80, line: 280 },
  children: [new TextRun({ text, font: BODY, size: 22 })],
});

/* Monospace block. One paragraph per line; shading makes it read as a unit. */
const Code = (lines, opts = {}) => lines.map((ln, i) => new Paragraph({
  spacing: {
    before: i === 0 ? 100 : 0,
    after: i === lines.length - 1 ? (opts.after === undefined ? 160 : opts.after) : 0,
    line: 230,
  },
  /* Hold the block together: a listing broken across a page break is much
   * harder to read, and the architecture diagram is meaningless in halves. */
  keepLines: true,
  keepNext: i < lines.length - 1,
  indent: { left: 170 },
  shading: { type: ShadingType.CLEAR, fill: GREY_CODE, color: "auto" },
  children: [new TextRun({ text: ln === "" ? " " : ln, font: MONO, size: 18 })],
}));

const cell = (text, width, opts = {}) => new TableCell({
  width: { size: width, type: WidthType.DXA },
  shading: opts.head ? { type: ShadingType.CLEAR, fill: GREY_HEAD, color: "auto" } : undefined,
  margins: { top: 70, bottom: 70, left: 110, right: 110 },
  children: [new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { after: 0, line: 250 },
    children: [new TextRun({
      text,
      font: opts.mono ? MONO : BODY,
      size: opts.mono ? 18 : 20,
      bold: !!opts.head || !!opts.bold,
    })],
  })],
});

const Tbl = (headers, rows, widths, opts = {}) => new Table({
  columnWidths: widths,
  width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
  borders: {
    top: { style: BorderStyle.SINGLE, size: 4, color: RULE },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE },
    left: { style: BorderStyle.SINGLE, size: 4, color: RULE },
    right: { style: BorderStyle.SINGLE, size: 4, color: RULE },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "C4C4C4" },
    insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "C4C4C4" },
  },
  rows: [
    new TableRow({
      tableHeader: true,
      children: headers.map((h, i) => cell(h, widths[i], { head: true })),
    }),
    ...rows.map(r => new TableRow({
      children: r.map((c, i) => cell(c, widths[i], {
        mono: (opts.mono || []).includes(i),
      })),
    })),
  ],
});

const Gap = (after = 200) => new Paragraph({ spacing: { after }, children: [] });

/* ================================================================== */

const children = [];

/* ---------- title block ---------- */

children.push(new Paragraph({ spacing: { after: 900 }, children: [] }));

children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 140 },
  children: [new TextRun({ text: "MATRIXLANG", font: BODY, size: 52, bold: true, characterSpacing: 60 })],
}));

children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 320 },
  children: [new TextRun({
    text: "A Dimension-Aware Optimizing Compiler for a Matrix Language",
    font: BODY, size: 26,
  })],
}));

children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 300 },
  border: { top: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 10 } },
  children: [],
}));

[
  ["Compiler Design Laboratory", true],
  ["Phase 1 — Problem Definition and Design", true],
  ["Individual Project", false],
].forEach(([t, b]) => children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 110 },
  children: [new TextRun({ text: t, font: BODY, size: 24, bold: b })],
})));

children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 260, after: 700 },
  border: { top: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 10 } },
  children: [],
}));

children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 200 },
  children: [new TextRun({
    text: "Document prepared against section 8.3 of the laboratory manual.",
    font: BODY, size: 21, italics: true,
  })],
}));

children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 300 },
  children: [new TextRun({
    text: "Every deliverable listed there appears below as a numbered section.",
    font: BODY, size: 21, italics: true,
  })],
}));

/* deliverable checklist */
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1("Contents"));
children.push(P(
  "The laboratory manual lists twelve deliverables for Phase 1. Each is a numbered " +
  "section of this document, in the order the manual gives them. Two supporting " +
  "sections follow: the expected outcomes that define completion, and an appendix " +
  "carrying the full language specification produced during the design activity."));

children.push(Gap(120));
children.push(Tbl(
  ["Section", "Deliverable (manual §8.3)", "Page content"],
  [
    ["1", "Project Title", "Name, descriptor and artefacts"],
    ["2", "Abstract", "The project in one page"],
    ["3", "Problem Statement", "The gap in existing languages"],
    ["4", "Motivation", "Why the problem is worth solving here"],
    ["5", "Objectives", "Eleven numbered, verifiable goals"],
    ["6", "Scope", "What is included, and what is excluded and why"],
    ["7", "Background Study", "Theory studied and systems examined"],
    ["8", "Compiler Design Concepts Involved", "Concept-to-implementation mapping"],
    ["9", "Proposed Methodology", "Compilation pipeline and development plan"],
    ["10", "System Architecture", "Modules, data flow and boundaries"],
    ["11", "Technology Stack", "Tools chosen and the reason for each"],
    ["12", "Initial Prototype", "The working Phase 1 demonstration"],
    ["13", "Expected Outcomes", "Definition of done"],
    ["A", "Appendix — Language Specification", "Tokens, keywords, operators, grammar"],
  ],
  [1000, 4700, 3326]
));

/* ---------- 1. Project title ---------- */
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1("1.  Project Title"));

children.push(PR([
  { t: "MatrixLang — a dimension-aware optimizing compiler for a matrix language.", b: true },
]));

children.push(P(
  "The name identifies both halves of the work. MatrixLang is the source language " +
  "designed for this project; the compiler for it is a complete implementation " +
  "carried through every phase of translation, from lexical analysis to the " +
  "execution of generated target code."));

children.push(P(
  "“Dimension-aware” is the distinguishing property rather than a decorative " +
  "adjective. In MatrixLang a value's type is not matrix but Matrix<2x3>: the number " +
  "of rows and columns is part of the type, and the compiler reasons about shapes " +
  "throughout translation. That single design decision is what makes both the " +
  "semantic analysis and the optimizer substantially different from a conventional " +
  "scalar compiler."));

children.push(Gap(120));
children.push(Tbl(
  ["Artefact", "Name"],
  [
    ["Source language", "MatrixLang"],
    ["Compiler executable", "bin/matrixc"],
    ["Source file extension", ".ml"],
    ["Target machine", "MatrixLang Virtual Machine (MVM), a stack machine"],
    ["Build command", "make"],
    ["Phase 1 demonstration", "make demo1"],
  ],
  [2700, 6326], { mono: [1] }
));

/* ---------- 2. Abstract ---------- */
children.push(H1("2.  Abstract"));

children.push(P(
  "MatrixLang is a small programming language for matrix computation, together with " +
  "a complete compiler for it. Its distinguishing feature is that matrix dimensions " +
  "form part of the type system. A value's type is not matrix but Matrix<2x3>, and " +
  "every operation is checked against the shape rules of linear algebra during " +
  "compilation. A program that attempts to multiply a 2x3 matrix by a 5x4 matrix is " +
  "rejected with a diagnostic naming both operand shapes and the rule violated, " +
  "before a single element has been computed."));

children.push(P(
  "The compiler implements the full translation pipeline: lexical analysis with " +
  "Flex, parsing with Bison into an abstract syntax tree, a symbol table that stores " +
  "each name's shape, semantic analysis that infers and checks dimensions, " +
  "three-address code as an intermediate representation, four optimization passes " +
  "applied to a fixed point, target code generation for a stack-based virtual " +
  "machine, and execution of that code."));

children.push(P(
  "Alongside the standard optimizations — common subexpression elimination, copy " +
  "propagation and dead code elimination — the compiler implements a set of " +
  "matrix-specific algebraic simplifications that a general-purpose optimizer cannot " +
  "perform. Rewriting A * I to A, or transpose(transpose(A)) to A, requires the " +
  "compiler to know that a particular value is an identity matrix or a repeated " +
  "transpose. That knowledge is available only because shapes and constructors are " +
  "tracked in the type system, which is what connects the language design to the " +
  "optimizer and makes the two halves of the project a single idea rather than two."));

children.push(P(
  "Phase 1 delivers the language specification, the system design and a working " +
  "prototype of the compiler front end that classifies a token stream and reports a " +
  "syntax verdict, establishing that the design is implementable before the full " +
  "semantic and optimization work of the later phases begins."));

/* ---------- 3. Problem statement ---------- */
children.push(H1("3.  Problem Statement"));

children.push(P(
  "Shape errors are the characteristic defect of matrix code. A matrix addition " +
  "whose operands differ in shape, or a product whose inner dimensions do not agree, " +
  "is not an unusual mistake but the ordinary one. In the languages actually used " +
  "for matrix work, these errors are found late."));

children.push(BulletB("In C or Java, ",
  "a matrix is an array and its dimensions are ordinary integers. Nothing checks " +
  "them. A wrong shape becomes an out-of-bounds access, a silently incorrect result, " +
  "or a crash at a point far removed from the mistake that caused it."));

children.push(BulletB("In Python with NumPy, ",
  "the check does happen, but at runtime — after the data has been loaded, after " +
  "earlier stages of the computation have run, and possibly a long way into a job " +
  "that must then be restarted."));

children.push(P(
  "In both cases the information needed to catch the error is already present in the " +
  "source text. If A is declared 2x3 and B is declared 5x4, then the fact that A * B " +
  "is impossible is a property of the program, not of its input. It can be decided " +
  "by reading the program. No mainstream language decides it."));

children.push(Gap(60));
children.push(PR([
  { t: "Problem statement. ", b: true },
  { t: "Matrix dimension errors are detectable at compile time from information " +
       "the source already contains, and are not detected at compile time. This " +
       "project builds a language and compiler that detect them." },
]));

children.push(P(
  "A second, narrower problem follows from the first. Because conventional compilers " +
  "do not track shapes, they cannot exploit the algebraic identities that shapes " +
  "make available. An optimizer that knew a value were an identity matrix could " +
  "delete the multiplication entirely; lacking that knowledge, it must emit the full " +
  "triple loop. The information that would enable the optimization is discarded by " +
  "the type system before the optimizer ever runs."));

/* ---------- 4. Motivation ---------- */
children.push(H1("4.  Motivation"));

children.push(P(
  "Three considerations motivate building this particular system as a compiler " +
  "design project."));

children.push(H2("4.1  It places real work in the semantic analyser"));
children.push(P(
  "In a typical teaching language, semantic analysis amounts to checking that an " +
  "int is not assigned to a bool — a comparison of two enumeration values. In " +
  "MatrixLang, type checking means propagating shapes through arbitrary expressions, " +
  "inferring the result shape of a product from the shapes of its operands, deciding " +
  "whether an assignment is shape-compatible, and producing a diagnostic that " +
  "explains which rule of linear algebra was broken. The phase carries genuine " +
  "analytical weight instead of being a formality between parsing and code " +
  "generation."));

children.push(H2("4.2  It gives the optimizer work a general optimizer cannot do"));
children.push(P(
  "Constant folding and dead code elimination are substantially the same in every " +
  "compiler, and implementing them again demonstrates competence rather than " +
  "insight. The identity A * I = A, by contrast, is a fact about matrices. " +
  "Exploiting it requires the compiler to track which values are identity matrices, " +
  "zero matrices or repeated transposes — an analysis with no counterpart in a " +
  "scalar language. This is where the project's originality lies, and it is a direct " +
  "consequence of the language design rather than an addition to it."));

children.push(H2("4.3  The resulting diagnostics are genuinely useful"));
children.push(P(
  "When shapes are known during compilation, the compiler can state exactly which " +
  "rule was violated, what it expected and what it found. That is a substantial " +
  "usability improvement over a runtime exception raised minutes into a computation, " +
  "and it is achievable only because of the decision to carry dimensions in the type."));

children.push(H2("4.4  It exercises every phase of the syllabus honestly"));
children.push(P(
  "The project requires a lexer, a parser, a symbol table, a semantic analyser, an " +
  "intermediate representation, an optimizer, a code generator and an execution " +
  "engine — not as separate exercises, but as stages of one program in which the " +
  "output of each is consumed by the next. A defect in any stage is visible in the " +
  "final result, which is a stronger form of verification than inspecting each stage " +
  "in isolation."));

/* ---------- 5. Objectives ---------- */
children.push(H1("5.  Objectives"));

children.push(P(
  "The objectives below are stated so that each can be demonstrated or measured. " +
  "They are the criteria against which the finished project should be judged."));

[
  "Design a language whose type system carries matrix dimensions, and specify its tokens, grammar and semantics completely.",
  "Implement lexical analysis using Flex, recognising every token class and reporting lexical errors with line and column positions.",
  "Implement syntax analysis using Bison, constructing an abstract syntax tree, with error recovery sufficient to report several syntax errors in a single run.",
  "Implement a symbol table that records each name's kind, shape, declaration position and usage counts.",
  "Implement semantic analysis that infers the shape of every expression and rejects every operation whose shapes do not combine, with a diagnostic naming both operands and the rule violated.",
  "Generate three-address code as an intermediate representation.",
  "Implement common subexpression elimination and dead code elimination.",
  "Implement matrix-specific algebraic simplification covering A*I, I*A, A+0, A-0, A*1, A*0 and transpose(transpose(A)).",
  "Generate target code for a matrix virtual machine and execute it, producing correct numerical results.",
  "Produce an optimization report quantifying the improvement, itemised by the transformation responsible.",
  "Validate the compiler with a test suite covering valid programs, every error class, and the equivalence of optimized and unoptimized execution.",
].forEach(o => children.push(Num(o)));

children.push(P(
  "Objective 11 deserves emphasis. An optimizer that produces fewer instructions has " +
  "not been shown to be correct; it has been shown to be smaller. Demonstrating that " +
  "optimized and unoptimized programs produce identical output is what distinguishes " +
  "an optimization from a transformation that merely happens to shorten the code.", { after: 160 }));

/* ---------- 6. Scope ---------- */
children.push(H1("6.  Scope"));

children.push(H2("6.1  Within scope"));
children.push(Tbl(
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
  [2200, 6826]
));

children.push(H2("6.2  Deliberately outside scope"));
children.push(P(
  "The exclusions below are design decisions with stated reasons, not work left " +
  "undone. Each was considered and rejected."));

children.push(BulletB("Control flow. ",
  "There is no conditional and no loop. With straight-line code the entire program " +
  "forms a single basic block, which makes common subexpression elimination and " +
  "liveness analysis exact without a control-flow graph or iterative dataflow. The " +
  "analytical interest of this project lies in dimension-aware semantics and matrix " +
  "optimization; control flow would add considerable bulk without contributing to " +
  "either."));

children.push(BulletB("Functions. ",
  "Excluded for the same reason, with the additional consideration that shape " +
  "polymorphism across function boundaries is a substantially harder problem than " +
  "the rest of the project combined."));

children.push(BulletB("Runtime-sized matrices. ",
  "Compile-time shapes are the premise of the entire design. A dimension read from " +
  "input could not be checked during compilation, which would defeat the purpose of " +
  "the language."));

children.push(BulletB("Strings, booleans and an integer/float distinction. ",
  "Each would propagate through the type rules, the intermediate representation, the " +
  "instruction set and the virtual machine, in exchange for no additional " +
  "compiler-design content. Scalars are double precision throughout."));

children.push(BulletB("Numerical performance. ",
  "Matrix multiplication is implemented as the textbook triple loop. This is a " +
  "compiler project, not a numerical linear algebra library, and an optimised kernel " +
  "would demonstrate nothing about compilation."));

/* ---------- 7. Background study ---------- */
children.push(H1("7.  Background Study"));

children.push(H2("7.1  Theory studied and where it is applied"));
children.push(Tbl(
  ["Area studied", "Application in this project"],
  [
    ["Regular expressions and finite automata", "Token specification in the Flex scanner"],
    ["Context-free grammars, LALR(1) parsing", "Grammar design and conflict resolution in Bison"],
    ["Syntax-directed translation", "AST construction inside grammar semantic actions"],
    ["Symbol table organisation", "Hash table with insertion-ordered storage for printing"],
    ["Type systems and type inference", "Shapes as types; inference through expressions"],
    ["Intermediate representations", "Three-address code with compiler-generated temporaries"],
    ["Local optimization", "Available expressions, liveness, algebraic identities"],
    ["Code generation for stack machines", "Instruction selection driven by inferred types"],
    ["Error recovery", "Statement-level recovery at the semicolon"],
  ],
  [3700, 5326]
));

children.push(H2("7.2  Existing systems examined"));

children.push(P(
  "Three families of existing system informed the design. Each treats matrix shapes " +
  "differently, and the differences determined where this project positions itself."));

children.push(Gap(60));
children.push(Tbl(
  ["System", "How shapes are handled", "Consequence"],
  [
    ["NumPy (Python)",
     "Checked at runtime, when the operation executes",
     "Errors surface late, after data loading and partial computation"],
    ["C, Java",
     "Not checked; dimensions are ordinary integers",
     "Errors become memory faults or silently wrong results"],
    ["Idris, Agda",
     "Dimensions in dependent types, checked statically",
     "Fully general, but the languages are inaccessible to most programmers"],
    ["TVM and similar ML compilers",
     "Shape inference over computation graphs",
     "Operates on graphs rather than on source text; not a general-purpose language"],
  ],
  [2000, 3400, 3626]
));

children.push(P(
  "MatrixLang adopts the idea these systems share — that dimensions belong in the " +
  "type — and applies it within a small imperative language where it can be " +
  "implemented completely and demonstrated end to end. It is deliberately less " +
  "general than dependent typing and deliberately more static than NumPy; that " +
  "position is what makes it tractable as a single-semester compiler project while " +
  "still producing a result neither of those systems provides.", { after: 160 }));

/* ---------- 8. Concepts ---------- */
children.push(H1("8.  Compiler Design Concepts Involved"));

children.push(P(
  "The table below maps each concept from the syllabus onto its concrete appearance " +
  "in the implementation. Every concept listed is exercised by working code rather " +
  "than described in documentation only."));

children.push(Gap(120));
children.push(Tbl(
  ["Concept", "Realisation in MatrixLang"],
  [
    ["Lexical analysis",
     "Flex scanner; token classes; line and column tracking; lexical error reporting"],
    ["Syntax analysis",
     "Bison LALR(1) grammar; operator precedence and associativity; error recovery at ';'"],
    ["Abstract syntax tree",
     "Uniform node type with a child vector; every node annotated with its inferred type"],
    ["Symbol table",
     "Hash table with djb2 hashing; insertion, lookup, duplicate detection, shape storage"],
    ["Semantic analysis",
     "Shape inference through expressions; dimension checking; poison typing to suppress cascades"],
    ["Intermediate code generation",
     "Three-address code with compiler-generated temporaries and interned operands"],
    ["Code optimization",
     "Algebraic simplification, CSE, copy propagation, dead code elimination, iterated to a fixed point"],
    ["Target code generation",
     "Instruction selection for a stack machine, driven by the shapes inferred earlier"],
    ["Runtime and interpretation",
     "A virtual machine that executes the generated instruction stream"],
    ["Error handling",
     "One diagnostic collector for all four error classes, emitting messages in source order"],
  ],
  [2700, 6326]
));

children.push(P(
  "Two of these deserve a note. Poison typing means that once a subexpression has " +
  "been reported as ill-shaped, its type becomes an error type that propagates " +
  "outward, so a single mistake produces one diagnostic rather than one at every " +
  "enclosing operator. Emitting diagnostics in source order matters because the " +
  "passes do not run in source order: a lexical error on line 6 and a syntax error " +
  "on line 7 are discovered by different passes, and a reader expects to see them " +
  "in the order they appear in the file.", { after: 160 }));

/* ---------- 9. Methodology ---------- */
children.push(H1("9.  Proposed Methodology"));

children.push(H2("9.1  The compilation pipeline"));
children.push(P(
  "Translation proceeds through the stages below. Each stage consumes the output of " +
  "the previous one, and each can be inspected individually from the command line, " +
  "which is what makes the compiler demonstrable phase by phase."));

children.push(Gap(60));
children.push(Tbl(
  ["Stage", "Technique or tool", "Produces"],
  [
    ["Lexical analysis", "Flex", "Token stream; lexical diagnostics"],
    ["Syntax analysis", "Bison, LALR(1)", "Abstract syntax tree; syntax diagnostics"],
    ["Semantic analysis", "Symbol table, shape inference", "Typed AST; dimension diagnostics"],
    ["Intermediate code", "Three-address code", "Linear IR with temporaries"],
    ["Optimization", "Four passes to a fixed point", "Reduced IR; optimization report"],
    ["Target code generation", "Instruction selection", "MVM instruction stream"],
    ["Execution", "Stack-machine interpreter", "Numerical output"],
  ],
  [2200, 3100, 3726]
));

children.push(P(
  "The optimizer applies its passes in a fixed order — algebraic simplification, " +
  "then common subexpression elimination, then copy propagation, then dead code " +
  "elimination — and repeats the sequence until no further change occurs. The " +
  "order is not arbitrary: simplification turns operations into copies, CSE turns " +
  "repeated expressions into copies, copy propagation makes those copies unused, and " +
  "dead code elimination removes them. A single pass is insufficient because " +
  "deleting one instruction can expose another as dead."));

children.push(H2("9.2  Development methodology: three phases"));
children.push(P(
  "Development follows the three phases defined by the laboratory manual. Each phase " +
  "ends at something that runs and can be demonstrated on its own, rather than at a " +
  "partially built pipeline awaiting the next phase."));

children.push(Gap(60));
children.push(Tbl(
  ["Phase", "Content", "Demonstration"],
  [
    ["Phase 1",
     "Problem definition, language specification, system design, front-end prototype",
     "make demo1"],
    ["Phase 2",
     "Flex lexer, Bison parser, AST, symbol table with shapes, dimension checking, three-address code",
     "make demo2"],
    ["Phase 3",
     "CSE, dead code elimination, matrix algebra, target code, execution, optimization report, testing",
     "make demo3"],
  ],
  [1100, 5426, 2500], { mono: [2] }
));

children.push(P(
  "The compiler additionally accepts --phase1, --phase2 and --phase3 as command-line " +
  "presets, each selecting exactly the stages that phase is responsible for. This is " +
  "a presentation convenience rather than three separate builds: one executable is " +
  "produced, and the phase flags choose how much of its work to display."));

/* ---------- 10. Architecture ---------- */
children.push(H1("10.  System Architecture"));

children.push(H2("10.1  Data flow between modules"));

children.push(...Code([
  "  source.ml",
  "      |",
  "      v",
  "  matrix.l  --tokens-->  matrix.y  --AST-->  semantic.c",
  "      |                      |                    |",
  "      v                      v                    v",
  "  tokens.c                ast.c              symtab.c",
  "  (token table          (nodes, printer,    (names, shapes,",
  "   for display)          shape annotation)   usage counts)",
  "                                                  |",
  "                                                  v",
  "                                              types.c",
  "                                     (the shape rules, in one place)",
  "                                                  |",
  "                                                  v",
  "                                               tac.c",
  "                                     (three-address code)",
  "                                                  |",
  "                                                  v",
  "                                            optimize.c",
  "                                   (four passes to a fixed point)",
  "                                                  |",
  "                                                  v",
  "                                             codegen.c",
  "                                      (MVM instruction selection)",
  "                                                  |",
  "                                                  v",
  "                                    vm.c  <-->  value.c",
  "                                 (execution)  (matrix arithmetic)",
  "",
  "  diag.c   every phase reports here; messages emerge in source order",
  "  main.c   the driver: flag parsing, stage selection, exit status",
]));

children.push(H2("10.2  Module responsibilities"));
children.push(Tbl(
  ["Module", "Responsibility"],
  [
    ["matrix.l", "Flex scanner; also records each token for the displayed token table"],
    ["matrix.y", "Bison grammar; builds the AST and does nothing else"],
    ["types.c", "The type lattice and every shape rule"],
    ["ast.c", "Node representation, tree printing, expression rendering"],
    ["symtab.c", "Symbol storage: names, shapes, declaration positions, usage counts"],
    ["semantic.c", "Name resolution, shape inference, dimension checking, diagnostics"],
    ["tac.c", "Three-address code generation"],
    ["optimize.c", "The four optimization passes, the report and the explanation"],
    ["codegen.c", "Instruction selection for the MatrixLang VM"],
    ["vm.c", "The stack machine that executes the generated code"],
    ["value.c", "Runtime matrices and scalars, and the arithmetic performed on them"],
    ["tokens.c", "The recorded token stream"],
    ["diag.c", "A single collection point for all diagnostics, sorted by source position"],
    ["util.c", "Allocation helpers that fail loudly rather than returning null"],
    ["main.c", "Command-line interface and pipeline orchestration"],
  ],
  [1900, 7126], { mono: [0] }
));

children.push(H2("10.3  The principal design decision"));
children.push(P(
  "Every shape rule is isolated in types.c rather than distributed through the " +
  "analyser. There is exactly one place in the compiler that decides whether A * B " +
  "is legal and what shape it produces, and the semantic analyser, the optimizer and " +
  "the code generator all consult it rather than deriving shapes independently."));

children.push(P(
  "This has a practical consequence for review. The question “does this compiler " +
  "implement the dimension rules of linear algebra correctly?” is answered by " +
  "reading a single short file, rather than by checking three modules for agreement. " +
  "It also removes an entire class of defect: the analyser and the code generator " +
  "cannot disagree about whether a given multiplication is a matrix product or a " +
  "scalar scaling, because both ask the same function."));

children.push(P(
  "A second decision follows from the language design. Because MatrixLang has no " +
  "control flow, a program compiles to a single basic block. There is therefore no " +
  "control-flow graph anywhere in the compiler and no iterative dataflow analysis: " +
  "local common subexpression elimination and a single backward liveness sweep are " +
  "exact rather than conservative approximations. A reader who expects to find the " +
  "usual dataflow machinery should read its absence as a consequence of the language " +
  "specification, not as an unfinished optimizer."));

/* ---------- 11. Technology stack ---------- */
children.push(H1("11.  Technology Stack"));

children.push(Tbl(
  ["Component", "Choice", "Reason"],
  [
    ["Implementation language", "C (C11)",
     "The manual's first recommendation; integrates directly with Flex and Bison"],
    ["Lexical analyser generator", "Flex 2.6.4",
     "The standard tool named in the syllabus"],
    ["Parser generator", "Bison 3.8.2",
     "LALR(1) handles the grammar as written, with no restructuring required"],
    ["Build system", "GNU Make",
     "One command from a clean tree to a working binary"],
    ["Host compiler", "gcc 15.2 (mingw64)",
     "Built with -Wall -Wextra; a warning-free build is a standing requirement"],
    ["Testing", "Shell script, 139 assertions",
     "Asserts exit status and output text together, so neither can pass alone"],
    ["Version control", "Git",
     "One commit per phase, with the phase's deliverable complete at that commit"],
  ],
  [2400, 2200, 4426]
));

children.push(P(
  "No third-party libraries are used. Everything beyond Flex, Bison and the C " +
  "standard library is written for this project, including the symbol table, the " +
  "intermediate representation, the optimizer, the code generator, the virtual " +
  "machine and the matrix arithmetic."));

children.push(P(
  "The development environment is Windows with MSYS2, using mingw64 gcc together " +
  "with MSYS2 builds of Flex, Bison and Make. The build has not been exercised on " +
  "Linux or macOS; portability is expected but is deliberately recorded as unverified " +
  "rather than claimed."));

/* ---------- 12. Prototype ---------- */
children.push(H1("12.  Initial Prototype"));

children.push(P(
  "The Phase 1 prototype implements the front of the pipeline: source text in, a " +
  "classified token stream and a syntax verdict out. It establishes that the token " +
  "specification and the grammar are implementable as designed, which is what Phase " +
  "1 exists to demonstrate."));

children.push(H2("12.1  Accepting a valid program"));
children.push(P(
  "Section banners are elided below; everything else is the compiler's actual " +
  "output."));
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
  "6     NUMBER        3                 4:12",
  "7     RBRACKET      ]                 4:13",
  "8     SEMICOLON     ;                 4:14",
  "",
  "9     MATRIX        matrix            5:1",
  "10    IDENTIFIER    B                 5:8",
  "11    LBRACKET      [                 5:9",
  "12    NUMBER        3                 5:10",
  "13    COMMA         ,                 5:11",
  "14    NUMBER        4                 5:12",
  "15    RBRACKET      ]                 5:13",
  "16    SEMICOLON     ;                 5:14",
  "",
  "16 token(s).",
  "",
  "4:8: warning [semantic] 'A' is declared but never read",
  "5:8: warning [semantic] 'B' is declared but never read",
  "0 error(s), 2 warning(s).",
  "",
  "Syntax: VALID",
  "",
  "examples/phase1/declare.ml: ACCEPTED (0 error(s), 2 warning(s))",
]));

children.push(P(
  "The token stream is grouped by source line, which makes the position column " +
  "easy to follow. The two warnings illustrate a distinction the compiler " +
  "maintains throughout: a warning describes something suspicious but legal, and " +
  "never changes the exit status. This program is accepted."));

children.push(H2("12.2  Rejecting a malformed program"));
children.push(P(
  "The input contains two mistakes: a missing closing bracket on line 1, and an " +
  "identifier beginning with a digit on line 2."));

children.push(...Code([
  "$ cat examples/phase1/bad.ml",
  "matrix A[2,3;",
  "matrix 4B[2,2];",
]));

children.push(...Code([
  "$ ./bin/matrixc --phase1 examples/phase1/bad.ml",
  "",
  "... token table elided ...",
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
  "",
  "examples/phase1/bad.ml: REJECTED (3 error(s), 0 warning(s))",
]));

children.push(P(
  "Three properties of the prototype are visible here. All three diagnostics come " +
  "from a single run: the parser recovers at the statement level, so a file " +
  "containing several mistakes yields several messages rather than only the first. " +
  "They appear in source order despite having been produced by different passes — " +
  "the lexical error on line 2 was found by the scanner, the other two by the " +
  "parser — because every diagnostic is routed through one collector that sorts by " +
  "position before printing."));

children.push(P(
  "Third, semantic analysis is skipped and the compiler says so. Analysing a tree " +
  "that failed to parse would report errors caused by the statements error recovery " +
  "discarded rather than by the source, so the pass is not attempted and the reader " +
  "is told why. The third error is a genuine consequence of the second: once 4B has " +
  "been rejected as a name, the declaration it belonged to cannot be parsed either."));

children.push(H2("12.3  Exit status"));
children.push(Tbl(
  ["Status", "Meaning"],
  [
    ["0", "The program is valid"],
    ["1", "At least one lexical, syntax or semantic error was reported"],
    ["2", "Usage error: no input file, unknown option, or unreadable file"],
  ],
  [1200, 7826], { mono: [0] }
));

children.push(P(
  "The prototype therefore composes with scripts and with the test suite, which " +
  "branches on exit status as well as inspecting output text. Both demonstrations " +
  "above are run together by make demo1."));

/* ---------- 13. Expected outcomes ---------- */
children.push(H1("13.  Expected Outcomes"));

children.push(P(
  "The project is complete when the following hold. Each is stated so that it can be " +
  "checked rather than asserted."));

children.push(Bullet("A working compiler for MatrixLang that carries a program from source text through to executed numerical output."));
children.push(Bullet("Compile-time rejection of every dimension error, with diagnostics naming both operand shapes and the rule violated."));
children.push(Bullet("Correct shape inference, including the swapped shape produced by transpose."));
children.push(Bullet("A measurable optimization result: a reduction in instruction count, itemised by the transformation that produced it and expressed as a percentage."));
children.push(Bullet("Evidence that the optimizer preserves meaning and not merely size, by showing identical output with and without optimization."));
children.push(Bullet("A test suite covering valid programs, every error class and the optimizer equivalence property, runnable by a single command."));
children.push(Bullet("A build that is free of compiler warnings and free of grammar conflicts."));
children.push(Bullet("Documentation covering each phase's deliverables as the manual defines them."));

children.push(P(
  "The fifth of these is the one that matters most and is the easiest to omit. " +
  "Instruction counts falling is evidence that the optimizer did something; it is " +
  "not evidence that what it did was correct. Comparing the output of every example " +
  "program with and without optimization, and requiring the results to be identical, " +
  "is what turns the optimizer from a plausible transformation into a verified one.",
  { after: 160 }));

/* ---------- Appendix A ---------- */
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1("Appendix A.  Language Specification"));

children.push(P(
  "The specification produced during the design activity is reproduced here in full. " +
  "It defines the tokens, keywords, operators, literals and grammar of MatrixLang, " +
  "and is the document the lexer and parser were written against."));

children.push(H2("A.1  Keywords"));
children.push(P("All keywords are reserved and may not be used as identifiers."));
children.push(...Code([
  "matrix   scalar   print   transpose   identity   zeros   ones",
]));

children.push(H2("A.2  Identifiers"));
children.push(...Code([
  "IDENT -> (letter | '_') (letter | digit | '_')*",
]));
children.push(P(
  "Identifiers are case sensitive. An identifier may not begin with a digit: 12abc " +
  "is a lexical error rather than a number followed by a name, which is a deliberate " +
  "choice so that the mistake is reported where it occurs."));

children.push(H2("A.3  Numeric literals"));
children.push(...Code([
  "NUMBER   -> digit+",
  "          | digit+ '.' digit*   [exponent]",
  "          | '.' digit+          [exponent]",
  "          | digit+ exponent",
  "",
  "exponent -> ('e' | 'E') ['+' | '-'] digit+",
]));
children.push(P(
  "So 3, 2.5, .5, 4., 1e3 and 1.5E-2 are all valid numbers. There is a single " +
  "numeric kind; scalars are double precision."));

children.push(H2("A.4  Operators and punctuation"));
children.push(Tbl(
  ["Symbol", "Token", "Meaning"],
  [
    ["+", "PLUS", "Matrix or scalar addition"],
    ["-", "MINUS", "Subtraction; also unary negation"],
    ["*", "MULTIPLY", "Matrix product or scalar scaling, decided by the operand shapes"],
    ["=", "ASSIGN", "Assignment and initialisation"],
    ["[ ]", "LBRACKET RBRACKET", "Dimension specification in a declaration"],
    ["( )", "LPAREN RPAREN", "Grouping and function-style constructors"],
    ["{ }", "LBRACE RBRACE", "Matrix literals and their rows"],
    [", ;", "COMMA SEMICOLON", "Separator and statement terminator"],
  ],
  [1100, 2600, 5326], { mono: [0, 1] }
));

children.push(P(
  "Multiplication is the only operator whose meaning depends on the shapes of its " +
  "operands. Whether a given * denotes a matrix product or a scalar scaling is " +
  "decided during semantic analysis and recorded for the code generator, which is " +
  "why instruction selection can distinguish MATMUL from MATSCALE without " +
  "re-deriving the types."));

children.push(H2("A.5  Comments"));
children.push(...Code([
  "// to the end of the line",
  "",
  "/* possibly spanning",
  "   several lines     */",
]));
children.push(P("Block comments do not nest, and an unterminated block comment is a lexical error."));

children.push(H2("A.6  Grammar"));
children.push(P(
  "The grammar is LALR(1) as written and is accepted by Bison with no shift/reduce " +
  "or reduce/reduce conflicts. Ambiguity in the expression rules is resolved by " +
  "declared precedence and associativity rather than by restructuring the grammar."));

children.push(...Code([
  "program         -> stmt_list",
  "",
  "stmt_list       -> stmt_list stmt",
  "                 | eps",
  "",
  "stmt            -> declaration",
  "                 | assignment",
  "                 | print_statement",
  "                 | ';'",
  "",
  "declaration     -> 'matrix' IDENT '[' NUMBER ',' NUMBER ']' ';'",
  "                 | 'matrix' IDENT '[' NUMBER ',' NUMBER ']' '=' expression ';'",
  "                 | 'matrix' IDENT '=' expression ';'",
  "                 | 'scalar' IDENT ';'",
  "                 | 'scalar' IDENT '=' expression ';'",
  "",
  "assignment      -> IDENT '=' expression ';'",
  "",
  "print_statement -> 'print' '(' expression ')' ';'",
  "",
  "expression      -> expression '+' expression",
  "                 | expression '-' expression",
  "                 | expression '*' expression",
  "                 | '-' expression",
  "                 | 'transpose' '(' expression ')'",
  "                 | 'identity'  '(' expression ')'",
  "                 | 'zeros'     '(' expression ',' expression ')'",
  "                 | 'ones'      '(' expression ',' expression ')'",
  "                 | '(' expression ')'",
  "                 | matrix_literal",
  "                 | NUMBER",
  "                 | IDENT",
  "",
  "matrix_literal  -> '{' row_list '}'",
  "row_list        -> row | row_list ',' row",
  "row             -> '{' num_list '}'",
  "num_list        -> expression | num_list ',' expression",
]));

children.push(H2("A.7  Precedence and associativity"));
children.push(Tbl(
  ["Level", "Operators", "Associativity"],
  [
    ["Lowest", "+  -", "Left"],
    ["", "*", "Left"],
    ["Highest", "unary -", "Right"],
  ],
  [1600, 3200, 4226], { mono: [1] }
));

children.push(H2("A.8  Shape rules"));
children.push(P(
  "These are the rules the semantic analyser enforces, and they are the substance of " +
  "the language. Each is stated as the result shape of an operation, or as the " +
  "condition under which the operation has no result."));

children.push(Gap(60));
children.push(Tbl(
  ["Operation", "Condition", "Result shape"],
  [
    ["A + B, A - B", "A and B have identical shapes", "The shape of A"],
    ["A * B", "columns(A) = rows(B)", "rows(A) x columns(B)"],
    ["s * A, A * s", "s is a scalar", "The shape of A"],
    ["s * t", "both are scalars", "Scalar"],
    ["-A", "always", "The shape of A"],
    ["transpose(A)", "always", "columns(A) x rows(A)"],
    ["identity(n)", "n is a compile-time constant", "n x n"],
    ["zeros(r,c), ones(r,c)", "r and c are compile-time constants", "r x c"],
  ],
  [2200, 3400, 3426], { mono: [0] }
));

children.push(P(
  "A declaration is also an initialisation: matrix A[2,3]; declares A as a 2x3 " +
  "matrix whose elements are zero. The language has no uninitialised state, which is " +
  "why the compiler issues no use-before-initialisation warning — such a warning " +
  "could never be correct.", { after: 200 }));

/* ================================================================== */

/* Word puts no space after a table, so a following paragraph sits flush
 * against the border. Insert a thin spacer after each one. */
for (let i = children.length - 1; i >= 0; i--) {
  if (children[i] instanceof Table) {
    children.splice(i + 1, 0, new Paragraph({ spacing: { after: 0, line: 120 }, children: [] }));
  }
}

const doc = new Document({
  creator: "MatrixLang",
  title: "MatrixLang — Phase 1: Problem Definition and Design",
  description: "Phase 1 deliverables for the Compiler Design Laboratory project.",
  styles: {
    default: {
      document: { run: { font: BODY, size: 22, color: BLACK } },
      heading1: { run: { font: BODY, color: BLACK, bold: true } },
      heading2: { run: { font: BODY, color: BLACK, bold: true } },
      heading3: { run: { font: BODY, color: BLACK, bold: true } },
    },
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0, format: LevelFormat.BULLET, text: "•",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 520, hanging: 260 } } },
          },
          {
            level: 1, format: LevelFormat.BULLET, text: "–",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1000, hanging: 260 } } },
          },
        ],
      },
      {
        reference: "numbers",
        levels: [
          {
            level: 0, format: LevelFormat.DECIMAL, text: "%1.",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 560, hanging: 300 } } },
          },
        ],
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
