// GST maths for GST-inclusive prices (ADR 0002 D1). All amounts are integer paise; rates are basis points.

/** GST contained in a GST-inclusive amount: amount × rate / (100% + rate), rounded half-up to the paisa. */
export function gstIncluded(inclusivePaise: number, rateBasisPoints: number): number {
  if (rateBasisPoints === 0) return 0;
  return Math.round((inclusivePaise * rateBasisPoints) / (10000 + rateBasisPoints));
}

export type GstSplit = { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number };

/**
 * Splits the GST inside an inclusive amount. Intra-state supply (seller and delivery state equal) is
 * CGST + SGST in equal halves (any odd paisa goes to SGST); inter-state supply is IGST.
 */
export function splitGst(inclusivePaise: number, rateBasisPoints: number, intraState: boolean): GstSplit {
  const gst = gstIncluded(inclusivePaise, rateBasisPoints);
  const taxablePaise = inclusivePaise - gst;
  if (!intraState) return { taxablePaise, cgstPaise: 0, sgstPaise: 0, igstPaise: gst };
  const cgstPaise = Math.floor(gst / 2);
  return { taxablePaise, cgstPaise, sgstPaise: gst - cgstPaise, igstPaise: 0 };
}

/**
 * Partial COD (ADR 0002 D2): the online deposit is a percentage of the order total, rounded UP to the whole
 * rupee; the COD balance is the exact remainder, so deposit + balance always equals the total.
 */
export function partialCodSplit(totalPaise: number, depositBasisPoints: number) {
  const depositPaise = Math.min(totalPaise, Math.ceil((totalPaise * depositBasisPoints) / 10000 / 100) * 100);
  return { depositPaise, codBalancePaise: totalPaise - depositPaise };
}
