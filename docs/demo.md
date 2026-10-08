# MatrixLang demonstration

Build and start the workspace:

```bash
make serve
```

Open <http://127.0.0.1:8731/>. The page reports **Local compiler ready**. Python 3.10 or newer is required; the server uses only the standard library. On Windows, run Make from MSYS2 with MinGW first on PATH as described in the main README. If the compiler is already built, `python tools/demo_service.py` starts it directly. `--port 8732` selects another port.

## Demonstration flow

Allow about ten minutes. Use **Presentation** for larger source and output text.

The workspace offers three numerical contracts. Each names the weakest guarantee a value-changing rewrite may have and still be applied:

- **Strict** (default) applies a rewrite only when facts derived from the declared input domains prove it bit-identical to the source program.
- **Bounded** also applies rewrites that keep the source order's standard-model worst-case error bound and its NaN and infinity behaviour; signed zeros and low-order bits may differ.
- **Algebraic** applies any rewrite valid over the real numbers.

The **Guarantees** stage lists every `print` with the level it was certified at (bit-identical, bound-preserving or relaxed), the reasons the compiler gave, and whether an unoptimized run on the same seeded inputs printed the same bits.

1. **Matrix product**: inspect shape checking, symbols and execution. C has inferred shape `Matrix<2x4>`. Inspect tokens, the syntax tree, TAC and typed VM instructions to connect the phases.
2. **Exact integer chain**: A, B and C are `input(int8)`. Under **Strict**, the certificate states that every intermediate of every bracketing needs at most 28 of 53 significand bits, so the cheaper order is bit-identical; modeled arithmetic falls from 11,120 to 556 operations.
3. **Real-valued chain**: the same shapes over `input(real(1))`. Strict keeps the source order; **Bounded** applies the cheaper order and certifies `|error| <= 4.66e-15 |A1|...|Ak|`. **Compare contracts** shows bounded output differing from the unoptimized run in low-order bits, as its certificate permits.
4. **Unbounded reals**: with `input(real)` an intermediate may overflow, so strict and bounded both keep the source order; only algebraic reorders, and it certifies the output as relaxed.
5. **Per-output guarantees**: under **Bounded**, the `int16` chain `R` is certified bit-identical and the real-valued chain `S` bound-preserving, within one program.
6. **Signed zero**: select **Compare contracts**. `-2 * 0` is `-0`; strict keeps it, bounded and algebraic print `+0` and certify the output as bound-preserving. Hexadecimal output exposes the difference.
7. **Shape mismatch**: read the rejected product's two shapes and inner-dimension rule. Use the diagnostic line link. Change B's declaration to `matrix B[3,4];` and compile; the new program is accepted.
8. **Expression reuse**: compare original TAC with optimization. X and Y share one computed `A * B`; the rewrite is exact and needs no proof.
9. **Front end**: open the linked walkthrough for scanner rules, Bison states, shifts, reductions and error recovery.

Ctrl+Enter compiles. Ctrl+Shift+Enter compiles under all three contracts and compares them. Stage tabs support arrow keys, Home and End. Tab leaves the editor; Ctrl+] inserts two spaces. Source can be copied, downloaded or reset. The browser retains the current draft and input seed locally; choosing an example or Reset replaces them. The source remains on the local machine when using the local service.

## Results and provenance

The workspace starts with **Recorded C compiler output**, even when the local compiler is available. Press **Compile & run** to obtain **Local C compiler** results. Each selected numerical contract has a separate result. Source edits hide older evidence; a successful compilation updates it.

**Input seed** chooses the values drawn for every `input(...)` declaration (`--random-inputs SEED`); recorded examples use seed 1. **Compare contracts** compiles all three contracts and displays optimized hexadecimal output. Each column also compares its exact output, print by print, with an unoptimized execution on the same inputs. That run checks a certificate for one input draw; the certificate itself is a static claim over every input in the declared domains. Neither covers exception flags or NaN payloads.

Shape diagnostics prevent TAC generation and execution. Runtime errors and execution limits have their own stage states. Matrix dimensions may be valid for compilation yet too large for this interactive service to execute.

## Static use

`make web` regenerates `workspace-data.js`, the walkthrough captures, Bison tables and agreement data. Do not hand-edit generated files.

`make serve-static` serves the demo without the compiler API. A static host or local `demo/index.html` can inspect the eight unchanged examples under every contract, including their recorded guarantees and output comparison. Edited source uses the browser scanner/parser and explicitly reports **Browser scanner / parser only**. Syntax acceptance does not imply shape validity. No arbitrary edited source is sent to a remote compiler.

`demo/walkthrough.html` preserves the earlier detailed demonstration, and `demo/guide.html` provides the presentation flow inside the demo. The workspace needs no external fonts, JavaScript packages or network assets.

## Service limits

`tools/demo_service.py` binds only to `127.0.0.1`. Requests must use the local Host and, when supplied, a local Origin. The adapter accepts source, one of the three contract names and an integer input seed; it passes fixed arguments to the compiler without a shell. Temporary source and output files are removed after each request. Raw source is not logged.

Interactive limits: 16,000 source bytes, 1,200 syntax tokens, 64 bracket nesting levels, six seconds and one megabyte of captured output per compiler process, and two concurrent compilation requests. Execution additionally requires at most 2,000,000 source-order modeled operations and 100,000 matrix cells across original TAC shape annotations. Programs above those execution limits still receive compiler stages and a cost report. These bounds keep a local demonstration manageable; this server is not a sandbox for untrusted public workloads and should remain local.

## Verification

```bash
make test-demo
make test
make web
```

Service tests exercise inferred shapes, compiler diagnostics, exact signed-zero comparison, contract-dependent costs, strict reordering of a chain proved exact, relaxed-only reordering of unbounded reals, a check of every certificate against execution for three seeds, seed validation, execution limits, request boundaries, process timeout/output bounds and replay of all 24 recorded example/contract pairs. Existing acceptance and numerical tests continue to verify compiler behavior. The browser front-end agreement check covers example sources independently of the service adapter.
