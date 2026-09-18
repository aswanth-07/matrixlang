/* vm.h -- the MatrixLang Virtual Machine.
 *
 * Executes the target code. It performs no dimension checking, and that is a
 * deliberate statement about the compiler rather than an oversight: every
 * operation it will ever execute was proved shape-correct by the semantic pass
 * before the code was generated. If a shape error could reach here, the
 * compiler would be broken.
 */
#ifndef MATRIXLANG_VM_H
#define MATRIXLANG_VM_H

#include <stdio.h>

/* Runs the generated program. `trace` prints each instruction and the stack
 * depth as it executes. Returns 0 on success. */
int vm_run(FILE *out, int trace);

#endif /* MATRIXLANG_VM_H */
