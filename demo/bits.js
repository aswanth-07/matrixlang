"use strict";
/* IEEE 754 binary64 as the workspace draws it: one cell per bit, grouped as
 * sign (1), exponent (11) and fraction (52). Parsing is exact: a hexadecimal
 * float from matrixc (C's %a) or Python (float.hex) becomes its 64-bit pattern
 * through integer arithmetic, never through a lossy decimal round trip. */
(function (root) {
  const MASK = (1n << 64n) - 1n;
  const view = new DataView(new ArrayBuffer(8));

  function fromHex(text) {
    const t = String(text).trim().toLowerCase();
    const negative = t.startsWith("-");
    const body = t.replace(/^[-+]/, "");
    const sign = negative ? 1n << 63n : 0n;
    if (body === "inf" || body === "infinity") return sign | (0x7ffn << 52n);
    if (body === "nan") return sign | (0x7ffn << 52n) | (1n << 51n);
    const m = body.match(/^0x([0-9a-f]+)(?:\.([0-9a-f]*))?p([-+]?\d+)$/);
    if (!m) throw new Error(`not a hexadecimal float: ${text}`);
    const digits = m[1] + (m[2] || "");
    let mant = BigInt("0x" + digits);
    if (mant === 0n) return sign;
    let exp = BigInt(m[3]) - 4n * BigInt((m[2] || "").length);   // value = mant * 2^exp
    const length = BigInt(mant.toString(2).length);
    const lead = exp + length - 1n;                                 // exponent of the leading bit
    if (lead >= -1022n) {
      const shift = 52n - (length - 1n);
      const frac = (shift >= 0n ? mant << shift : mant >> -shift) & ((1n << 52n) - 1n);
      return sign | ((lead + 1023n) << 52n) | frac;
    }
    const shift = exp + 1074n;                                      // subnormal: multiples of 2^-1074
    return sign | (shift >= 0n ? mant << shift : mant >> -shift);
  }

  function fromPattern(hex16) { return BigInt("0x" + hex16) & MASK; }

  function toNumber(pattern) {
    view.setBigUint64(0, pattern);
    return view.getFloat64(0);
  }

  function describe(pattern) {
    const x = toNumber(pattern);
    if (Number.isNaN(x)) return "NaN";
    if (x === 0) return Object.is(x, -0) ? "−0" : "+0";
    if (!Number.isFinite(x)) return x > 0 ? "+∞" : "−∞";
    const abs = Math.abs(x);
    if (abs >= 1e6 || abs < 1e-4) {
      const [m, e] = x.toExponential().split("e");
      return `${m.replace("-", "−")} × 10^${e.replace("+", "").replace("-", "−")}`;
    }
    return String(x).replace("-", "−");
  }

  function fields(pattern) {
    const b = pattern.toString(2).padStart(64, "0");
    return {sign: b.slice(0, 1), exponent: b.slice(1, 12), fraction: b.slice(12)};
  }

  /* Returns the strip as HTML. `other`, when given, is compared bit by bit
   * and every differing bit is drawn inverted (white). */
  function strip(pattern, other, opts) {
    const o = opts || {};
    const b = pattern.toString(2).padStart(64, "0");
    const c = other == null ? null : other.toString(2).padStart(64, "0");
    let differ = 0;
    const group = (from, to, cls) => {
      let cells = "";
      for (let i = from; i < to; i++) {
        const d = c !== null && b[i] !== c[i];
        if (d) differ++;
        cells += `<i class="bit ${cls}${b[i] === "1" ? " on" : ""}${d ? " diff" : ""}"></i>`;
      }
      return `<span class="bit-group ${cls}">${cells}</span>`;
    };
    const html = group(0, 1, "f-sign") + group(1, 12, "f-exp") + group(12, 64, "f-frac");
    const f = fields(pattern);
    const label = `binary64 ${describe(pattern)}: sign ${f.sign}, exponent ${f.exponent}, fraction ${f.fraction}` +
      (c !== null ? `; ${differ} of 64 bits differ from the reference` : "");
    /* Brackets sized to their cell groups in CSS (var(--cell)); the sign's
     * label sits one row lower, so no label overlaps another at any size. */
    const legend = o.legend === false ? "" :
      `<span class="bit-legend" aria-hidden="true"><i class="br f-sign"></i><i class="br f-exp"></i><i class="br f-frac"></i>` +
      `<b class="lb f-exp">exponent 11</b><b class="lb f-frac">fraction 52</b><b class="lb lb-sign f-sign">sign 1</b></span>`;
    return `<span class="bits${o.size ? " bits-" + o.size : ""}" role="img" aria-label="${label}"><span class="bit-row">${html}</span>${legend}</span>`;
  }

  /* Units in the last place between two finite values: the count of binary64
   * values from one to the other, from their bit patterns. */
  function ulps(a, b) {
    const order = (p) => (p >> 63n) ? -(p & ((1n << 63n) - 1n)) : p;
    const fin = (p) => ((p >> 52n) & 0x7ffn) !== 0x7ffn;
    if (!fin(a) || !fin(b)) return null;
    const d = order(a) - order(b);
    return d < 0n ? -d : d;
  }

  function exponentOf(pattern) {
    const e = Number((pattern >> 52n) & 0x7ffn);
    return e === 0 ? "subnormal or zero" : e === 0x7ff ? "all ones: infinity or NaN" : `${e} − 1023 = ${e - 1023}`;
  }

  function differing(a, b) {
    let x = (a ^ b) & MASK, n = 0;
    while (x) { n += Number(x & 1n); x >>= 1n; }
    return n;
  }

  /* exact-output text -> [{label, rows, cols, values: [BigInt]}] */
  function parseOutputs(text) {
    const blocks = [];
    let current = null;
    for (const line of String(text || "").split("\n")) {
      const m = line.match(/^(\S.*?) = Matrix<(\d+)x(\d+)>$/);
      const s = line.match(/^(\S.*?) = (\S+)$/);
      if (m) { current = {label: m[1], rows: +m[2], cols: +m[3], values: []}; blocks.push(current); }
      else if (s && !line.startsWith(" ")) { blocks.push({label: s[1], rows: 1, cols: 1, values: [fromHex(s[2])]}); current = null; }
      else if (current && line.trim().startsWith("[")) {
        for (const tok of line.trim().slice(1, -1).trim().split(/\s+/)) if (tok) current.values.push(fromHex(tok));
      }
    }
    return blocks;
  }

  function ulpText(a, b) {
    const u = ulps(a, b);
    if (u === null) return "not finite";
    if (u === 0n) return a === b ? "identical" : "equal value, different sign of zero";
    return `${u.toLocaleString("en-US")} ulp${u === 1n ? "" : "s"} apart`;
  }

  root.Bits = {fromHex, fromPattern, toNumber, describe, strip, differing, parseOutputs, ulps, ulpText, exponentOf};
}(typeof globalThis !== "undefined" ? globalThis : this));
