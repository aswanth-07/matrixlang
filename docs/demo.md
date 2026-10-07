# MatrixLang demonstration

Build and start the workspace:

```bash
make serve
```

Open <http://127.0.0.1:8731/>. The page reports **Local compiler ready**. Python 3.10 or newer is required; the server uses only the standard library. On Windows, run Make from MSYS2 with MinGW first on PATH as described in the main README. If the compiler is already built, `python tools/demo_service.py` starts it directly. `--port 8732` selects another port.

## Demonstration flow

Allow about seven minutes. Use **Presentation** for larger source and output text.

1. **Matrix product**: inspect shape checking, symbols and execution. C has inferred shape `Matrix<2x4>`. Inspect tokens, the syntax tree, TAC and typed VM instructions to connect the phases.
2. **Shape mismatch**: read the rejected product's two shapes and inner-dimension rule. Use the diagnostic line link. Change B's declaration to `matrix B[3,4];` and compile; the new program is accepted.
3. **Chain ordering**: strict mode retains source association, costing 69,800 modeled operations. Algebraic mode permits `A * (B * C)`, costing 1,396. Both produce four TAC instructions. Explain `m*p*(2*n-1)` and the intermediate dimensions. Modeled arithmetic is not a runtime measurement.
4. **Expression reuse**: compare original TAC with optimization. X and Y share one computed `A * B`. Execution displays both values.
5. **Signed zero**: select **Compare modes**. Strict matches negative zero from source execution; algebraic zero multiplication changes it to positive zero. Hexadecimal output exposes the difference.
6. **Front end**: open the linked walkthrough for scanner rules, Bison states, shifts, reductions and error recovery.

Ctrl+Enter compiles. Ctrl+Shift+Enter compares modes. Stage tabs support arrow keys, Home and End. Tab leaves the editor; Ctrl+] inserts two spaces. Source can be copied, downloaded or reset. The browser retains the current draft locally; choosing an example or Reset replaces it. The source remains on the local machine when using the local service.

## Results and provenance

The workspace starts with **Recorded C compiler output**, even when the local compiler is available. Press **Compile & run** to obtain **Local C compiler** results. Each selected numerical contract has a separate result. Source edits hide older evidence; a successful compilation updates it.

**Compare modes** compiles both contracts and displays optimized hexadecimal output. Each side also compares its exact output with an unoptimized execution. Equality applies to the demonstrated program and current floating-point environment. It does not cover exception flags, NaN payloads or all possible inputs.

Shape diagnostics prevent TAC generation and execution. Runtime errors and execution limits have their own stage states. Matrix dimensions may be valid for compilation yet too large for this interactive service to execute.

## Static use

`make web` regenerates `workspace-data.js`, the walkthrough captures, Bison tables and agreement data. Do not hand-edit generated files.

`make serve-static` serves the demo without the compiler API. A static host or local `demo/index.html` can inspect the five unchanged examples in either contract, including their recorded output comparison. Edited source uses the browser scanner/parser and explicitly reports **Browser scanner / parser only**. Syntax acceptance does not imply shape validity. No arbitrary edited source is sent to a remote compiler.

`demo/walkthrough.html` preserves the earlier detailed demonstration, and `demo/guide.html` provides the presentation flow inside the demo. The workspace needs no external fonts, JavaScript packages or network assets.

## Service limits

`tools/demo_service.py` binds only to `127.0.0.1`. Requests must use the local Host and, when supplied, a local Origin. The adapter accepts source and a fixed strict/algebraic choice; it passes fixed arguments to the compiler without a shell. Temporary source and output files are removed after each request. Raw source is not logged.

Interactive limits: 16,000 source bytes, 1,200 syntax tokens, 64 bracket nesting levels, six seconds and one megabyte of captured output per compiler process, and two concurrent compilation requests. Execution additionally requires at most 2,000,000 source-order modeled operations and 100,000 matrix cells across original TAC shape annotations. Programs above those execution limits still receive compiler stages and a cost report. These bounds keep a local demonstration manageable; this server is not a sandbox for untrusted public workloads and should remain local.

## Verification

```bash
make test-demo
make test
make web
```

Service tests exercise inferred shapes, compiler diagnostics, exact signed-zero comparison, contract-dependent costs, execution limits, request boundaries, process timeout/output bounds and replay of all ten recorded example/contract pairs. Existing acceptance and numerical tests continue to verify compiler behavior. The browser front-end agreement check covers example sources independently of the service adapter.
