"""Apply the review revision to the preserved manuscript source."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
p = ROOT / "paper/matrixlang.tex"
s = p.read_text(encoding="utf-8")

def replace(old, new):
    global s
    if old not in s:
        raise ValueError("missing passage: " + old[:100])
    s = s.replace(old, new, 1)

s = s.replace("[acmsmall,review,anonymous]", "[acmsmall,review,anonymous,nonacm]")
s = s.replace("[acmsmall,review]", "[acmsmall,review,nonacm]")
s = s.replace("RANJITHKUMAR S", "Ranjithkumar S")
replace(r"\title{Exact, Bounded, or Relaxed: Proving Which Floating-Point Guarantee a Compiler Rewrite Keeps}",
        r"\title[Proof-Guided Floating-Point Optimization]{Proof-Guided Floating-Point Optimization: Exact Reassociation, Error Bounds, and Compiler Certificates}")
a, b = s.index(r"\begin{abstract}"), s.index(r"\end{abstract}")
s = s[:a] + r"""\begin{abstract}
Strict floating-point compilation preserves evaluation order even when the
input values make reassociation exact. We use grid and magnitude facts to
identify these cases and distinguish bit-identical rewrites from those that
preserve a stated error bound or hold only over the reals. For matrix chains,
we give sufficient conditions under which every bracketing returns the same
correctly rounded result. A separate bound-preservation result applies when
overflow and inexact underflow are excluded; an upper magnitude bound alone
does not suffice. MatrixLang checks these obligations from declared input
domains and exports numerical certificates that a rational-arithmetic checker
can replay. ExactReduce derives related facts from integer conversions in
LLVM and uses them to guard reduction vectorization or replace floating-point
accumulation with integer accumulation. On nine integer-data kernels,
the tested Clang pipeline achieved
\LlvmBenchLicensedLo--\LlvmBenchLicensedHi$\times$ speedups over strict
Clang. Licensed and integer-accumulating builds matched strict results on
\LlvmStressCases{} adversarial cases in the local regression run.
The pass licensed \LlvmScanVersioned{} of \LlvmScanReductions{} reductions
in four selected code bases; CPython's \texttt{audioop} reached
\LlvmAudioopAvgEight$\times$ speedup. These gains concern integer-valued
data, and loop versioning increased compilation time by
\LlvmCompileOverheadPct\% and text size by \LlvmCompileTextGrowthPct\%
in the kernel-module study. The proof covers regrouping the same terms;
the LLVM integration remains a tested implementation rather than an
end-to-end verified compiler.
""" + s[b:]
replace("If the matrices hold real values in $[-1,1]$, the\nbits change, yet the textbook componentwise error bound of the chain is the same\nfor every bracketing: the rewrite is \\emph{bound-preserving}.",
        "With larger integer values, exactness may fail while the standard\ncomponentwise error bound remains valid under every bracketing: the rewrite\nis \\emph{bound-preserving}. A declaration of real values in $[-1,1]$ alone\nis insufficient, because it admits inexact underflow.")
replace("input domains: modeled arithmetic after optimization (11,120 in source order)",
        "input domains under the repaired admission rule: modeled arithmetic after optimization (11,120 in source order)")
replace("(\\texttt{input(int8)},\n\\texttt{input(real(1))})", "(\\texttt{input(int8)},\n\\texttt{input(int32)}, \\texttt{input(real(1))})")
replace("(Theorem~\\ref{thm:bound}), so bound-preserving reassociation reduces to a\nrange check; the bounded contract recovers the whole algebraic saving on every\ndomain with a magnitude bound (RQ1).",
        "(Theorem~\\ref{thm:bound}) under explicit range and underflow premises.\nA grid check discharges the underflow premise; magnitude bounds alone do not.\nRQ1 measures the opportunities retained by this conservative rule.")
replace("distinguishes every binary64 value including $-0$ and NaN.",
        "distinguishes finite binary64 values and signed zero, and records NaN\nclassification; it does not distinguish NaN payloads.")
replace("standard-model worst-case error bound of $P$'s evaluation order and NaN and\ninfinity occur in $P'$ exactly where they occur in $P$;",
        "stated standard-model worst-case error bound of $P$'s evaluation order,\nwith that model established for both evaluations, and NaN and infinity\noccur in $P'$ exactly where they occur in $P$;")
replace("      under every bracketing, and no intermediate can overflow", "      under every bracketing; overflow and inexact underflow are excluded")
replace("Under the bounded contract the compiler prints, for example:",
        "For exact and larger integer-domain chains, the bounded contract\nreports explanations of the following form:")
replace("The certificate is a claim over the whole declared domain; executing a program\nchecks it on drawn inputs only (Section~\\ref{sec:rq2}).", r"""The certificate is a claim over the whole declared domain; executing a program
checks it on drawn inputs only (Section~\ref{sec:rq2}). The proposition proves
composition of bit-identity. A weaker output label records the local obligations
that reached that output; the label alone is not a numerical error expression
for an arbitrary program containing several approximate rewrites.

\paragraph{Replayable numerical obligations.}
Setting \texttt{MATRIXC\_CERTIFICATE\_JSONL} exports a record for each applied
certified chain segment: its dimensions, operand grids, hexadecimal magnitude
bounds, finiteness, arithmetic model, guarantee and upward-rounded error
coefficient. The separate checker \texttt{tools/check\_chain\_certificate.py}
reconstructs the bounds with exact rational arithmetic. It checks every proper
sub-chain, every possible root split, the finite-range cap, the underflow
condition and the coefficient. Tests reject altered grids, enlarged magnitudes
and understated coefficients. This removes the compiler's floating-point bound
arithmetic from the numerical replay, but still trusts fact extraction, input
admission and the connection from a record to emitted code. It is not a proof
assistant, a checker for all identity rewrites, or an LLVM translation validator.

\begin{figure}[t]
\centering\footnotesize
\begin{tabular}{c@{\;$\longrightarrow$\;}c@{\;$\longrightarrow$\;}c}
\fbox{\parbox[c][2.8em][c]{.25\linewidth}{\centering Checked domains\\or integer conversions}} &
\fbox{\parbox[c][2.8em][c]{.25\linewidth}{\centering Grid and magnitude\\facts}} &
\fbox{\parbox[c][2.8em][c]{.25\linewidth}{\centering Exactness, range\\and underflow obligations}}\\[1.1em]
\fbox{\parbox[c][2.8em][c]{.25\linewidth}{\centering Contract admits\\or declines the rewrite}} &
\fbox{\parbox[c][2.8em][c]{.25\linewidth}{\centering Chain ordering or\\guarded reduction}} &
\fbox{\parbox[c][2.8em][c]{.25\linewidth}{\centering Output explanation;\\chain obligation record}}
\end{tabular}
\caption{From value facts to an optimization decision. The obligations in the
top row determine admission in the bottom row. MatrixLang exports chain
records for independent numerical replay; ExactReduce reports LLVM decisions.
Neither report verifies all downstream machine-code transformations.}
\Description{Two rows show input facts, numerical analysis and proof obligations,
followed by contract admission, optimization and a certificate report.}
\label{fig:overview}
\end{figure}
""")
replace("u=2^{-53}$, absent underflow and overflow,", "u=2^{-53}$, absent inexact underflow and overflow,")
replace("For every bracketing $T$ of $A_1\\cdots A_k$ evaluated without underflow or\noverflow,",
        "For every bracketing $T$ of $A_1\\cdots A_k$ for which each contracted\ndimension satisfies $d_lu<1$ and every operation obeys the standard model\n(no overflow or inexact underflow),")
a = s.index("The bound coefficient depends neither on the bracketing")
b = s.index(r"\section{Segmented chain ordering}", a)
s = s[:a] + r"""The coefficient is independent of bracketing and summation order, conditional
on the arithmetic model. The compiler must establish that condition before
using the theorem as a rewrite license.

\paragraph{Why an upper bound is insufficient.}
Let $q=2^{-1074}$, $a=3q$, $b=1/2$ and $c=3/4$. Round-to-nearest gives
\[
 \fl(\fl(ab)c)=2q,\qquad \fl(a\fl(bc))=q,\qquad abc=9q/8.
\]
The relative errors are $7/9$ and $1/9$, far above the standard-model bound.
All inputs satisfy \texttt{real(1)}. Embedding them in
$A=(a,0)^{\mathsf T}$, $B=(b,0)$ and $C=(c,0)^{\mathsf T}$ gives a
$2\times1$, $1\times2$, $2\times1$ chain: the cheaper bracketing costs five
modeled operations instead of ten and changes the first output from $2q$ to
$q$. The earlier range-only bounded policy admitted this rewrite. That was a
soundness defect, not a case covered by the theorem.

\paragraph{Repaired admission rule.}
For every nonzero contiguous sub-chain the bounded check now requires
$G_{ij}\ge-1074$ and an upward bound $M_{ij}\le2^{1020}$, together with
$d_lu<1/2$ and $\prod_l(1+\gamma_{d_l})<2$. The latter inequalities reserve
finite-range slack for rounded intermediate values. By induction, rounded
children retain their stated grids (Lemma~\ref{lem:grid}); their products and
partial sums lie on a representable grid. If a result is subnormal it is
therefore exact, and otherwise the relative model applies. The inflated
magnitude bounds keep all intermediate products and partial sums finite.
Both source and selected trees consequently satisfy Theorem~\ref{thm:bound}.
Zero sub-chains are exempt from the grid check, but every nonzero proper
sub-chain is still checked, including one later multiplied by zero.

This rule is sufficient, not necessary. It retains bounded reassociation for
large integer and suitable dyadic domains, while refusing a general
\texttt{real(1)} chain. The C emitter applies the same product-grid condition
before adding a bounded reduction clause. We do not implement an
underflow-aware absolute-error contract. All guarantees assume round-to-nearest
with gradual underflow, with flush-to-zero and denormals-are-zero disabled.
The counterexample and the distinction between exact subnormal products and
inexact underflow are executable regressions in the artifact.

""" + s[b:]
replace("Theorem~\\ref{thm:exact} for strict, bit-identical or range-safe for bounded,",
        "Theorem~\\ref{thm:exact} for strict, or the repaired range-and-grid test\nof Section~\\ref{sec:bound} for bounded,")
replace("partial sum can overflow, since every order keeps the bound", "partial sum can overflow and no product can incur inexact underflow,\nsince every order keeps the bound")
replace("proves that every order returns the same bits. It runs at the start of the vectorizer\npipeline, after the loop and scalar optimizations, so that the loop vectorizer,\nwhich runs next, reads its decisions.",
        "proves that every addition tree over the same terms returns the same bits.\nThe plugin registers at LLVM's \\texttt{VectorizerStart} extension point in\nthe \\texttt{-O3} pipeline, after the preceding scalar and loop passes, so\nthat subsequent vectorization reads its decisions.")
a = s.index(r"\paragraph{What the pass changes.}")
b = s.index(r"\paragraph{The integer rewrite.}", a)
s = s[:a] + r"""\paragraph{Permission and proof boundary.}
The pass adds \texttt{reassoc} to the recognized recurrence instructions,
including supported \texttt{fsub} and \texttt{llvm.fmuladd} forms; it does not
add \texttt{nsz}, \texttt{nnan} or \texttt{ninf}. The proposition covers
partitioning the same terms among vector lanes and interleaved accumulators,
then combining their exact partial sums with $-0$ identities. It also covers
the integer route when the separate accumulator-width checks hold.
It does not justify distribution, replacing terms, dropping a signed zero,
or other algebraic rewrites merely because they are permitted by
\texttt{reassoc}. LLVM's flag is a permission, not an enforceable encoding of
this proof boundary~\cite{llvm-fmf}.

The implementation claim is therefore specific to the tested LLVM~18
\texttt{clang -O3 -march=native -fpass-plugin=ExactReduce.so} pipeline and its
baseline x86-64 variant, using the stated contraction settings. IR regressions
check that declined functions acquire no reassociation permission, standalone
products acquire none, broader fast-math flags are absent, and guarded
functions retain strict fallbacks. Execution tests check the final code.
These checks do not prove all LLVM transformations or future releases sound;
changing the version, pass order, contraction mode or target requires renewed
validation. An end-to-end proof would need translation validation or an
explicitly restricted downstream lowering. A versionable loop is innermost,
has one exit and has a trip count computable on entry; an unsupported loop
keeps its original reduction.

""" + s[b:]
replace("The MatrixLang compiler is \\RqImplLoc{} lines", "The evaluated MatrixLang snapshot contained \\RqImplLoc{} lines")
replace("LLVM~18 pass plugin of \\LlvmPassLoc{} lines of C++", "LLVM~18 pass plugin")
replace("scripts, seeds and raw observations are in the artifact; every number below is\ngenerated from them.",
        "scripts, seeds and raw observations are in the artifact. RQ1 and RQ2 are\nreplayed after the underflow repair; the remaining performance and accuracy\nmeasurements retain their original snapshots. Their bounded real-domain arms\nmeasure the former policy and do not establish a valid bounded guarantee.\nThe strict and LLVM measurements concern the unchanged exactness rules.")
replace("The bounded contract recovers the whole saving on every domain with a\nmagnitude bound and \\RqOneRecoveryRealxBounded\\% on unbounded \\texttt{real},\nwhere it cannot exclude overflow; strict recovers",
        "The repaired bounded contract retains opportunities where both range\nand grid obligations hold. The previous claim of complete recovery for all\nmagnitude-bounded domains is withdrawn: \\texttt{real(1)} alone does not\nexclude inexact underflow. Table~\\ref{tab:recovery} reports the repaired\npolicy; strict recovers")
replace("Compilation took a median \\LlvmCompileLicensedMs~ms with the pass and",
        "\\paragraph{Compilation and code-size costs.}\nFor the kernel translation unit, compilation took a median \\LlvmCompileLicensedMs~ms with the pass and")
replace("versioning grew the code by \\LlvmCompileTextGrowthPct\\%.",
        "versioning grew text size from 4,149 to 5,801 bytes\n(\\LlvmCompileTextGrowthPct\\%). These are module-level measurements over ten\ncompilations; the artifact does not retain per-function compile-time attribution.\nThe existing-code build totals in RQ9 describe a different workload and should\nnot be read as contradicting this kernel-module overhead.")
replace("reproducibility across threads, vector widths, compilers and machines costs\nnothing (RQ4, RQ8).", "the tested thread counts, vector widths, compilers and machines produce\nthe same results without a reproducible-summation algorithm (RQ4, RQ8).\nThe guards and code growth still have the costs reported in RQ7.")
replace("None of these tracks the grid of\na value, proves a reassociation bit-identical, or certifies outputs.",
        "These facilities supply useful local facts. Our contribution combines\ngrid and magnitude reasoning with chain obligations, guarded reduction\npermissions and per-output explanations; it is not a new theory of rounding.")
replace("bounded contract promises the standard-model bound; with gradual underflow both\norders need an absolute error term, which we do not show to be invariant.",
        "bounded admission rule now excludes inexact underflow. It declines\ngeneral bounded-real chains unless stronger grid facts are available, and\nprovides no absolute-error guarantee for underflowing executions.")
replace("The proofs are on paper and\nthe bound arithmetic is checked on finite oracle cases; neither is mechanised.",
        "The proofs are on paper. The independent rational checker validates\nexported chain obligations conditional on supplied facts; neither the fact\nanalysis nor the complete LLVM pipeline is mechanically verified.")
replace("Generative AI tools assisted with implementation, literature search, evaluation\nscripts, analysis and drafting; the authors reviewed all text, code and results\nand take responsibility for them.",
        "Generative AI tools assisted with implementation, literature search,\nevaluation scripts, analysis and drafting, including this revision. Scientific\nclaims, artifact validation and final submission approval remain the authors'\nresponsibility.")
# Keep the exploratory accuracy study intact, but move it out of the main evaluation.
a = s.index(r"\subsection{RQ6:")
b = s.index(r"\subsection{RQ7:", a)
accuracy = s[a:b].replace(r"\subsection{RQ6:", r"\section{RQ6:", 1)
s = s[:a] + "The exploratory accuracy analysis is reported in Appendix~\\ref{sec:rq6}.\nIt measures an association between cost and error, not a causal mechanism.\n\n" + s[b:]
pos = s.index(r"\begin{thebibliography}")
s = s[:pos] + "\\appendix\n" + accuracy + s[pos:]
# Mark historical bounded timing arms where the reader encounters them.
replace("\\label{tab:e2e}", "\\label{tab:e2e}") if r"\label{tab:e2e}" in s else None
needle = r"\input{generated/tab-e2e.tex}"
if needle in s:
    s = s.replace(needle, needle + r"""
\par\smallskip\parbox{\linewidth}{\footnotesize Historical bounded timings for
\texttt{lowrank} and \texttt{diffusion} used the former range-only policy;
they are not speedups licensed by the repaired bounded contract.}
""", 1)
# Explain the estimands before presenting extreme matrix-chain speedups.
needle = r"\subsection{RQ4:"
pos = s.find(needle)
if pos >= 0:
    end = s.index("\n", pos)
    s = s[:end+1] + r"""Matrix-chain speedups combine fewer scalar operations with changes in the
generated loops and parallel execution. They are not vectorization-only gains.
RQ7 instead holds each C reduction's input and mathematical sum fixed and
measures the effect of the reduction implementation.
""" + s[end+1:]
p.write_text(s, encoding="utf-8", newline="\n")
print("Revised manuscript; exploratory RQ6 retained in appendix.")
