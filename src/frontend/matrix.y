/* matrix.y -- the MatrixLang grammar.
 *
 * Builds an AST and nothing else: no name resolution, no dimension checking.
 * Those belong to semantic.c, because the parser cannot know the shape of an
 * identifier and forcing it to would tangle two passes together.
 *
 * Statement-level error recovery ("stmt: error ';'") means a file with three
 * syntax errors reports three of them rather than stopping at the first.
 */

%{
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "ast.h"
#include "diag.h"
#include "util.h"

int  yylex(void);
void yyerror(const char *msg);

Node *parse_root = NULL;
%}

%locations
%define parse.error verbose

%union {
    struct Node *node;
    char        *str;
    double       dval;
}

%token <str>  IDENT
%token <dval> NUMBER

/* Error recovery discards symbols without running the action that would have
 * consumed them, which leaks the string IDENT carries.
 *
 * There is deliberately no %destructor for <node>: bison pops and destroys the
 * whole remaining parse stack on the way out of yyparse, including after a
 * *successful* parse, so a <node> destructor frees the finished AST and leaves
 * parse_root dangling. Subtrees dropped by recovery are leaked on purpose --
 * the process is about to exit, and the alternative corrupts every good run. */
%destructor { free($$); } <str>

%token KW_MATRIX KW_SCALAR KW_PRINT KW_TRANSPOSE KW_IDENTITY KW_ZEROS KW_ONES

%type <node> program stmt_list stmt decl assign print_stmt
%type <node> expr matrix_literal row_list row num_list

%left  '+' '-'
%left  '*'
%right UMINUS

%start program

%%

program
    : stmt_list                 { parse_root = $1; $$ = $1; }
    ;

stmt_list
    : /* empty */               { $$ = node_new(N_PROGRAM, 1, 1); }
    | stmt_list stmt            { $$ = node_add($1, $2); }
    ;

stmt
    : decl                      { $$ = $1; }
    | assign                    { $$ = $1; }
    | print_stmt                { $$ = $1; }
    | ';'                       { $$ = node_new(N_EMPTY, @1.first_line, @1.first_column); }
    | error ';'                 { $$ = node_new(N_EMPTY, @1.first_line, @1.first_column);
                                  yyerrok; }
    ;

decl
      /* matrix A[2,3];  -- shape declared, no initialiser */
    : KW_MATRIX IDENT '[' NUMBER ',' NUMBER ']' ';'
                                { $$ = node_named(N_DECL, @2.first_line,
                                                  @2.first_column, $2);
                                  $$->decl_type = type_matrix((int)$4, (int)$6);
                                  $$->has_dims  = 1;
                                  free($2); }

      /* matrix A[2,3] = <expr>;  -- shape declared and checked against it */
    | KW_MATRIX IDENT '[' NUMBER ',' NUMBER ']' '=' expr ';'
                                { $$ = node_named(N_DECL, @2.first_line,
                                                  @2.first_column, $2);
                                  $$->decl_type = type_matrix((int)$4, (int)$6);
                                  $$->has_dims  = 1;
                                  node_add($$, $9);
                                  free($2); }

      /* matrix C = A * B;  -- shape inferred from the initialiser */
    | KW_MATRIX IDENT '=' expr ';'
                                { $$ = node_named(N_DECL, @2.first_line,
                                                  @2.first_column, $2);
                                  $$->decl_type = type_matrix(-1, -1);
                                  $$->has_dims  = 0;
                                  node_add($$, $4);
                                  free($2); }

    | KW_SCALAR IDENT ';'       { $$ = node_named(N_DECL, @2.first_line,
                                                  @2.first_column, $2);
                                  $$->decl_type = type_scalar();
                                  $$->has_dims  = 1;
                                  free($2); }

    | KW_SCALAR IDENT '=' expr ';'
                                { $$ = node_named(N_DECL, @2.first_line,
                                                  @2.first_column, $2);
                                  $$->decl_type = type_scalar();
                                  $$->has_dims  = 1;
                                  node_add($$, $4);
                                  free($2); }
    ;

assign
    : IDENT '=' expr ';'        { $$ = node_named(N_ASSIGN, @1.first_line,
                                                  @1.first_column, $1);
                                  node_add($$, $3);
                                  free($1); }
    ;

print_stmt
    : KW_PRINT '(' expr ')' ';' { $$ = node_new(N_PRINT, @1.first_line, @1.first_column);
                                  node_add($$, $3); }
    ;

expr
    : expr '+' expr             { $$ = node_named(N_BINOP, @2.first_line,
                                                  @2.first_column, "+");
                                  node_add($$, $1); node_add($$, $3); }
    | expr '-' expr             { $$ = node_named(N_BINOP, @2.first_line,
                                                  @2.first_column, "-");
                                  node_add($$, $1); node_add($$, $3); }
    | expr '*' expr             { $$ = node_named(N_BINOP, @2.first_line,
                                                  @2.first_column, "*");
                                  node_add($$, $1); node_add($$, $3); }
    | '-' expr %prec UMINUS     { $$ = node_new(N_NEG, @1.first_line, @1.first_column);
                                  node_add($$, $2); }
    | KW_TRANSPOSE '(' expr ')' { $$ = node_new(N_TRANSPOSE, @1.first_line,
                                                @1.first_column);
                                  node_add($$, $3); }
    | KW_IDENTITY '(' expr ')'  { $$ = node_new(N_IDENTITY, @1.first_line,
                                                @1.first_column);
                                  node_add($$, $3); }
    | KW_ZEROS '(' expr ',' expr ')'
                                { $$ = node_new(N_ZEROS, @1.first_line,
                                                @1.first_column);
                                  node_add($$, $3); node_add($$, $5); }
    | KW_ONES '(' expr ',' expr ')'
                                { $$ = node_new(N_ONES, @1.first_line,
                                                @1.first_column);
                                  node_add($$, $3); node_add($$, $5); }
    | '(' expr ')'              { $$ = $2; }
    | matrix_literal            { $$ = $1; }
    | NUMBER                    { $$ = node_new(N_NUMBER, @1.first_line, @1.first_column);
                                  $$->dval = $1; }
    | IDENT                     { $$ = node_named(N_IDENT, @1.first_line,
                                                  @1.first_column, $1);
                                  free($1); }
    ;

/* A literal keeps its row structure in the tree rather than being flattened
 * here, so the semantic pass can say "row 2 has 2 entries, expected 3" and
 * point at the offending row. */
matrix_literal
    : '{' row_list '}'          { $2->line = @1.first_line;
                                  $2->col  = @1.first_column;
                                  $$ = $2; }
    ;

row_list
    : row                       { $$ = node_new(N_MATLIT, @1.first_line, @1.first_column);
                                  node_add($$, $1); }
    | row_list ',' row          { $$ = node_add($1, $3); }
    ;

row
    : '{' num_list '}'          { $2->line = @1.first_line;
                                  $2->col  = @1.first_column;
                                  $$ = $2; }
    ;

num_list
    : expr                      { $$ = node_new(N_MATROW, @1.first_line, @1.first_column);
                                  node_add($$, $1); }
    | num_list ',' expr         { $$ = node_add($1, $3); }
    ;

%%

void yyerror(const char *msg)
{
    diag_report(DIAG_ERROR, DIAG_SYNTAX,
                yylloc.first_line, yylloc.first_column, "%s", msg);
}
