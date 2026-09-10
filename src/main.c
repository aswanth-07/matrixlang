/* main.c -- the matrixc driver.
 *
 * Runs the pipeline and prints whichever stages were asked for:
 *
 *   source -> tokens -> AST -> symbol table -> semantic check
 *          -> TAC -> optimized TAC -> MVM code -> execution
 *
 * The --phase presets exist because the project is demonstrated in three
 * reviews, and a demonstration should not depend on remembering which
 * combination of flags corresponds to which phase.
 *
 * Exit status: 0 when the program is valid MatrixLang, 1 when any error was
 * reported, 2 for a usage problem.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "ast.h"
#include "codegen.h"
#include "diag.h"
#include "optimize.h"
#include "semantic.h"
#include "symtab.h"
#include "tac.h"
#include "tokens.h"
#include "value.h"
#include "vm.h"

extern FILE *yyin;
extern int   yyparse(void);
extern Node *parse_root;

static void banner(const char *title)
{
    printf("\n===============================================================\n");
    printf("  %s\n", title);
    printf("===============================================================\n\n");
}

static void usage(FILE *out, const char *prog)
{
    fprintf(out,
        "MatrixLang -- a dimension-aware optimizing compiler\n"
        "\n"
        "Usage: %s [options] <source.ml>\n"
        "\n"
        "Phase presets:\n"
        "  --phase1        tokens and syntax validation\n"
        "  --phase2        tokens, AST, symbol table, semantic check, TAC\n"
        "  --phase3        everything, including optimization and execution\n"
        "\n"
        "Individual stages:\n"
        "  --tokens        token stream\n"
        "  --ast           abstract syntax tree, annotated with shapes\n"
        "  --symbols       symbol table\n"
        "  --check         diagnostics and the accept/reject verdict\n"
        "  --tac           three-address code\n"
        "  --optimize      run the optimizer and show the optimized TAC\n"
        "  --explain       list every transformation the optimizer applied\n"
        "  --report        optimization statistics\n"
        "  --target        MatrixLang VM target code\n"
        "  --run           execute the target code\n"
        "  --trace         trace execution instruction by instruction\n"
        "\n"
        "Optimizer selection (default: all four, with --optimize):\n"
        "  --opt-algebraic --opt-cse --opt-copyprop --opt-dce\n"
        "\n"
        "Other:\n"
        "  --stats         counts for tokens, AST, symbols and instructions\n"
        "  -q, --quiet     no stage output; exit status only\n"
        "  -h, --help      this message\n"
        "\n"
        "With no options at all, every stage runs.\n",
        prog);
}

int main(int argc, char **argv)
{
    const char *path = NULL;

    int want_tokens = 0, want_ast = 0, want_symbols = 0, want_check = 0;
    int want_tac = 0, want_opt = 0, want_explain = 0, want_report = 0;
    int want_target = 0, want_run = 0, want_trace = 0, want_stats = 0;
    int quiet = 0, chose = 0, phase1_only = 0;
    int passes = 0;
    int i, status;

    for (i = 1; i < argc; i++) {
        const char *a = argv[i];

        if      (!strcmp(a, "-h") || !strcmp(a, "--help")) { usage(stdout, argv[0]); return 0; }

        else if (!strcmp(a, "--phase1")) {
            want_tokens = want_check = 1; chose = phase1_only = 1;
        } else if (!strcmp(a, "--phase2")) {
            want_tokens = want_ast = want_symbols = want_check = want_tac = 1;
            chose = 1;
        } else if (!strcmp(a, "--phase3")) {
            want_tokens = want_ast = want_symbols = want_check = want_tac = 1;
            want_opt = want_explain = want_report = want_target = want_run = 1;
            chose = 1;
        }

        else if (!strcmp(a, "--tokens"))   { want_tokens = chose = 1; }
        else if (!strcmp(a, "--ast"))      { want_ast = chose = 1; }
        else if (!strcmp(a, "--symbols"))  { want_symbols = chose = 1; }
        else if (!strcmp(a, "--check"))    { want_check = chose = 1; }
        else if (!strcmp(a, "--tac"))      { want_tac = chose = 1; }
        else if (!strcmp(a, "--optimize")) { want_opt = chose = 1; }
        else if (!strcmp(a, "--explain"))  { want_explain = want_opt = chose = 1; }
        else if (!strcmp(a, "--report"))   { want_report = want_opt = chose = 1; }
        else if (!strcmp(a, "--target"))   { want_target = chose = 1; }
        else if (!strcmp(a, "--run"))      { want_run = chose = 1; }
        else if (!strcmp(a, "--trace"))    { want_trace = want_run = chose = 1; }
        else if (!strcmp(a, "--stats"))    { want_stats = 1; }

        else if (!strcmp(a, "--opt-algebraic")) { passes |= OPT_ALGEBRAIC; want_opt = chose = 1; }
        else if (!strcmp(a, "--opt-cse"))       { passes |= OPT_CSE;       want_opt = chose = 1; }
        else if (!strcmp(a, "--opt-copyprop"))  { passes |= OPT_COPYPROP;  want_opt = chose = 1; }
        else if (!strcmp(a, "--opt-dce"))       { passes |= OPT_DCE;       want_opt = chose = 1; }

        else if (!strcmp(a, "-q") || !strcmp(a, "--quiet")) quiet = 1;

        else if (a[0] == '-' && a[1] != '\0') {
            fprintf(stderr, "matrixc: unknown option '%s'\n\n", a);
            usage(stderr, argv[0]);
            return 2;
        } else if (!path) {
            path = a;
        } else {
            fprintf(stderr, "matrixc: more than one input file given\n");
            return 2;
        }
    }

    if (!path) {
        fprintf(stderr, "matrixc: no input file\n\n");
        usage(stderr, argv[0]);
        return 2;
    }

    if (!chose) {
        want_tokens = want_ast = want_symbols = want_check = want_tac = 1;
        want_opt = want_explain = want_report = want_target = want_run = 1;
    }
    if (passes == 0) passes = OPT_ALL;

    yyin = fopen(path, "r");
    if (!yyin) {
        fprintf(stderr, "matrixc: cannot open '%s'\n", path);
        return 2;
    }

    if (!quiet) {
        printf("MatrixLang compiler\n");
        printf("Source: %s\n", path);
    }

    tac_init();

    /* Lexing happens inside the parse: bison pulls tokens and the scanner
     * records each one for the token table. */
    yyparse();
    fclose(yyin);

    if (!quiet && want_tokens) {
        banner("PHASE 1  --  LEXICAL ANALYSIS (token stream)");
        token_print_table(stdout);
    }

    /* Semantic analysis on a tree that failed to parse would report errors
     * caused by the statements recovery discarded rather than by the source. */
    if (diag_error_count() == 0 && parse_root) {
        semantic_check(parse_root);
    } else if (!quiet) {
        printf("\n(skipping semantic analysis: the source did not parse)\n");
    }

    if (!quiet && want_ast) {
        banner("PHASE 1/2  --  SYNTAX ANALYSIS (abstract syntax tree)");
        ast_print(stdout, parse_root);
    }

    if (!quiet && want_symbols) {
        banner("PHASE 2  --  SYMBOL TABLE");
        sym_print_table(stdout);
    }

    if (!quiet && want_check) {
        /* Phase 1 is a syntax prototype; the dimension checking that Phase 2
         * adds is not what is being demonstrated, so the heading says which
         * question is being answered. */
        banner(phase1_only ? "PHASE 1  --  SYNTAX VALIDATION"
                           : "PHASE 2  --  SEMANTIC ANALYSIS (dimension checking)");
        diag_print_all(stdout);

        if (phase1_only) {
            int syntax_bad = 0, k;
            for (k = 0; k < diag_count(); k++) {
                const Diag *d = diag_at(k);
                if (d->level == DIAG_ERROR &&
                    (d->phase == DIAG_LEXICAL || d->phase == DIAG_SYNTAX))
                    syntax_bad++;
            }
            printf("\nSyntax: %s\n", syntax_bad ? "INVALID" : "VALID");
        }
    }

    status = diag_error_count() > 0 ? 1 : 0;

    /* Everything from here on assumes a correct program. Generating code for a
     * program with a dimension error would mean generating an operation the
     * machine cannot perform. */
    if (status == 0 && parse_root) {
        tac_generate(parse_root);

        if (!quiet && want_tac)
            banner(want_opt ? "PHASE 2  --  INTERMEDIATE CODE (TAC, before optimization)"
                            : "PHASE 2  --  INTERMEDIATE CODE (three-address code)"),
            tac_print(stdout, NULL);

        if (want_opt) {
            optimize_run(passes);

            if (!quiet) {
                banner("PHASE 3  --  OPTIMIZED INTERMEDIATE CODE");
                tac_print(stdout, NULL);
            }
            if (!quiet && want_explain) {
                banner("PHASE 3  --  WHAT THE OPTIMIZER DID");
                optimize_explain(stdout);
            }
            if (!quiet && want_report) {
                printf("\n");
                optimize_report(stdout);
            }
        }

        if (want_target || want_run) {
            codegen_run();

            if (!quiet && want_target) {
                banner("PHASE 3  --  TARGET CODE (MatrixLang VM)");
                codegen_print(stdout, NULL);
            }

            if (want_run) {
                if (!quiet) banner("PHASE 3  --  EXECUTION");
                if (vm_run(stdout, want_trace && !quiet) != 0) status = 1;
                if (!quiet && diag_error_count() > 0) {
                    printf("\n");
                    diag_print_all(stdout);
                }
            }
        }
    }

    if (!quiet && want_stats) {
        banner("STATISTICS");
        printf("Tokens scanned        : %d\n", token_count());
        printf("AST nodes             : %d\n", ast_node_count(parse_root));
        printf("AST height            : %d\n", ast_height(parse_root));
        printf("Symbols declared      : %d\n", sym_count());
        printf("Matrix literals       : %d\n", litpool_count());
        printf("TAC instructions      : %d\n", tac_live_count());
        printf("Target instructions   : %d\n", codegen_count());
        printf("Errors                : %d\n", diag_error_count());
        printf("Warnings              : %d\n", diag_warning_count());
    }

    status = diag_error_count() > 0 ? 1 : status;

    if (!quiet)
        printf("\n%s: %s (%d error(s), %d warning(s))\n",
               path,
               status == 0 ? "ACCEPTED" : "REJECTED",
               diag_error_count(), diag_warning_count());

    node_free(parse_root);
    sym_free();
    token_free();
    tac_free();
    optimize_free();
    codegen_free();
    litpool_free();
    diag_free();

    return status;
}
