/* emit_c.h -- the optimized program as a C translation unit.
 *
 * The virtual machine is the reference; this backend hands the same program
 * to a production C compiler, and carries the numerical contract across.
 *
 * Every instruction becomes a loop that performs exactly the arithmetic the
 * machine performs. A matrix product entry is summed from +0 over k in
 * ascending order, so the emitted program prints the machine's bits when it
 * is compiled without fused multiply-add (-ffp-contract=off). The product is
 * written i-k-j, which a vectorizer can still widen across j without changing
 * any entry's order of summation.
 *
 * Some products may be summed in any order. The fact analysis decides which,
 * per product, and the contract decides which of those may be used:
 *
 *   bit-identical     every term and every partial sum short of the whole is
 *                     exact (facts_product_reassociable): any order returns
 *                     the correctly rounded sum. Admitted under every contract.
 *   bound-preserving  no partial sum can overflow: any order keeps the
 *                     standard bound gamma_n |a|^T |b| of the inner product.
 *                     Admitted under --fp-bounded and --fp-algebraic.
 *   relaxed           anything else. Admitted under --fp-algebraic only.
 *
 * An admitted product with a narrow output and a long sum is emitted as dot
 * products under an OpenMP reduction clause (`#pragma omp simd
 * reduction(+:acc)`), which permits the C compiler to split and recombine the
 * sum; a product whose output is a single entry is also offered a parallel
 * reduction. A wide output stays in i-k-j form, which vectorizes across columns
 * without reassociation. Rows of any product may run on separate threads: that
 * changes no entry's order. Compiled without OpenMP the pragmas are ignored and
 * every sum keeps the machine's order.
 *
 * The emitted program reads its inputs from a binary file of doubles written
 * by --dump-inputs, checks each value against its declared domain as the
 * machine does, runs the program a given number of times, prints every output
 * as the machine's --exact-output does, and reports each run's time on stderr.
 */
#ifndef MATRIXLANG_EMIT_C_H
#define MATRIXLANG_EMIT_C_H

#include <stdio.h>

/* `max_level` is the weakest NumGuarantee a reduction may keep (the contract);
 * -1 emits every product in the machine's order. `use_proofs` is 0 when the
 * fact analysis is disabled, which leaves only relaxed reductions. */
int emit_c(FILE *out, const char *source_name, int max_level, int use_proofs);

/* Writes every input value, after loading and checking, as raw binary64 in
 * declaration order, row-major. Returns 0 on success. */
int emit_c_dump_inputs(const char *path);

#endif /* MATRIXLANG_EMIT_C_H */
