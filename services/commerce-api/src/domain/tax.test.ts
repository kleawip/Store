import { describe, expect, it } from "vitest";
import { gstIncluded, partialCodSplit, splitGst } from "./tax";

describe("gstIncluded", () => {
  it("extracts GST from inclusive prices", () => {
    expect(gstIncluded(11200, 1200)).toBe(1200); // ₹112 incl. 12% → ₹12 GST
    expect(gstIncluded(94900, 1800)).toBe(14476); // ₹949 incl. 18% → ₹144.76
    expect(gstIncluded(49900, 500)).toBe(2376); // ₹499 incl. 5% → ₹23.76
    expect(gstIncluded(49900, 0)).toBe(0);
  });
});

describe("splitGst", () => {
  it("splits intra-state GST into equal CGST and SGST, odd paisa to SGST", () => {
    expect(splitGst(94900, 1800, true)).toEqual({ taxablePaise: 80424, cgstPaise: 7238, sgstPaise: 7238, igstPaise: 0 });
    const odd = splitGst(10100, 1800, true);
    expect(odd.cgstPaise + odd.sgstPaise + odd.taxablePaise).toBe(10100);
    expect(odd.sgstPaise - odd.cgstPaise).toBeLessThanOrEqual(1);
  });

  it("uses IGST for inter-state supply", () => {
    expect(splitGst(94900, 1800, false)).toEqual({ taxablePaise: 80424, cgstPaise: 0, sgstPaise: 0, igstPaise: 14476 });
  });
});

describe("partialCodSplit (30% online, rest COD)", () => {
  it("rounds the deposit up to the rupee and keeps the exact remainder as COD", () => {
    expect(partialCodSplit(100000, 3000)).toEqual({ depositPaise: 30000, codBalancePaise: 70000 });
    expect(partialCodSplit(94900, 3000)).toEqual({ depositPaise: 28500, codBalancePaise: 66400 }); // 284.70 → 285
    expect(partialCodSplit(99, 3000)).toEqual({ depositPaise: 99, codBalancePaise: 0 }); // never more than the total
  });

  it("always adds back up to the total", () => {
    for (const total of [1, 999, 12345, 49900, 1234567]) {
      const { depositPaise, codBalancePaise } = partialCodSplit(total, 3000);
      expect(depositPaise + codBalancePaise).toBe(total);
      expect(depositPaise % 100 === 0 || depositPaise === total).toBe(true);
    }
  });
});
