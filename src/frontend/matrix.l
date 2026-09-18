/* matrix.l -- the MatrixLang lexical analyser.
 *
 * Recognises keywords, identifiers, numeric literals, operators, brackets,
 * separators and both comment forms, and reports illegal characters. Every
 * token is recorded into tokens.c on its way to the parser with an exact
 * line:column, which is what lets a dimension error later point at the precise
 * operator that failed.
 */

%option noyywrap
%option noinput nounput
%option nounistd
%option never-interactive

%{
#include <stdlib.h>
#include <string.h>

#include "ast.h"
#include "diag.h"
#include "tokens.h"
#include "util.h"
#include "matrix.tab.h"

int lex_line = 1;
int lex_col  = 1;

/* Advances the cursor over the text just matched. Keeping this in one place is
 * what makes a multi-line block comment update the position correctly without
 * needing a start condition. */
static void lex_advance(const char *text, int len)
{
    int i;
    for (i = 0; i < len; i++) {
        if (text[i] == '\n')      { lex_line++; lex_col = 1; }
        else if (text[i] == '\t') { lex_col += 4; }
        else                      { lex_col++; }
    }
}

/* Runs before every action: stamp where this token starts, then move the
 * cursor past it so the next one starts in the right place. */
#define YY_USER_ACTION                        \
    yylloc.first_line   = lex_line;           \
    yylloc.first_column = lex_col;            \
    lex_advance(yytext, yyleng);              \
    yylloc.last_line    = lex_line;           \
    yylloc.last_column  = lex_col - 1;

static int tok(int code, const char *category)
{
    token_record(code, category, yytext, yylloc.first_line, yylloc.first_column);
    return code;
}
%}

DIGIT     [0-9]
LETTER    [A-Za-z_]
IDENT     {LETTER}({LETTER}|{DIGIT})*
INTLIT    {DIGIT}+
REALLIT   ({DIGIT}+"."{DIGIT}*|"."{DIGIT}+)([eE][+-]?{DIGIT}+)?|{DIGIT}+[eE][+-]?{DIGIT}+

%%

[ \t\r\n]+                   { /* whitespace: the cursor already moved */ }

"//"[^\n]*                   { /* line comment */ }
"/*"([^*]|\*+[^*/])*\*+"/"   { /* block comment, possibly multi-line */ }

"/*"([^*]|\*+[^*/])*         {
                               diag_report(DIAG_ERROR, DIAG_LEXICAL,
                                           yylloc.first_line, yylloc.first_column,
                                           "unterminated block comment");
                             }

"matrix"                     { return tok(KW_MATRIX,    "MATRIX");    }
"scalar"                     { return tok(KW_SCALAR,    "SCALAR");    }
"print"                      { return tok(KW_PRINT,     "PRINT");     }
"transpose"                  { return tok(KW_TRANSPOSE, "TRANSPOSE"); }
"identity"                   { return tok(KW_IDENTITY,  "IDENTITY");  }
"zeros"                      { return tok(KW_ZEROS,     "ZEROS");     }
"ones"                       { return tok(KW_ONES,      "ONES");      }

{REALLIT}                    { yylval.dval = atof(yytext);
                               return tok(NUMBER, "NUMBER"); }
{INTLIT}                     { yylval.dval = atof(yytext);
                               return tok(NUMBER, "NUMBER"); }

{IDENT}                      { yylval.str = xstrdup(yytext);
                               return tok(IDENT, "IDENTIFIER"); }

"+"                          { return tok('+', "PLUS");      }
"-"                          { return tok('-', "MINUS");     }
"*"                          { return tok('*', "MULTIPLY");  }
"="                          { return tok('=', "ASSIGN");    }
"["                          { return tok('[', "LBRACKET");  }
"]"                          { return tok(']', "RBRACKET");  }
"("                          { return tok('(', "LPAREN");    }
")"                          { return tok(')', "RPAREN");    }
"{"                          { return tok('{', "LBRACE");    }
"}"                          { return tok('}', "RBRACE");    }
","                          { return tok(',', "COMMA");     }
";"                          { return tok(';', "SEMICOLON"); }

{DIGIT}+{LETTER}({LETTER}|{DIGIT})*  {
                               diag_report(DIAG_ERROR, DIAG_LEXICAL,
                                           yylloc.first_line, yylloc.first_column,
                                           "malformed number or identifier '%s'"
                                           " (an identifier may not begin with a digit)",
                                           yytext);
                             }

.                            {
                               diag_report(DIAG_ERROR, DIAG_LEXICAL,
                                           yylloc.first_line, yylloc.first_column,
                                           "illegal character '%s'", yytext);
                             }

%%
