// Commerce rules in one place. DECIDED items cite ADR 0002; TBC items are proposed defaults awaiting the
// owner's confirmation. Changing a TBC value is a configuration change, not a code change.
export type CommerceSettings = {
  /** Seller's GST registration state: decides CGST+SGST (same state) vs IGST. TBC (the client's GSTIN state). */
  sellerStateCode: string;
  /** DECIDED (ADR 0002 D2): 30% paid online, the rest collected as COD. */
  partialCodDepositBasisPoints: number;
  /** TBC: the largest COD balance accepted per order. */
  maxCodBalancePaise: number;
  /** TBC: full COD (0% online) is not offered; only prepaid or partial COD. */
  fullCodEnabled: boolean;
  /** TBC: shipping price shown to customers (GST-inclusive). Flat fee, optionally free above a threshold. */
  shipping: { flatPaise: number; freeAbovePaise: number | null };
  /** TBC: weight assumed for SKUs without a weight when asking the courier. */
  defaultWeightGrams: number;
  /** TBC: the standard shipping box, used when staff don't enter dimensions. */
  defaultParcelCm: { length: number; breadth: number; height: number };
  /** TBC: days after delivery within which customers can ask for a return. */
  returnWindowDays: number;
  /** How long a checkout quote can be turned into an order. */
  quoteTtlMs: number;
};

export const DEFAULT_COMMERCE_SETTINGS: CommerceSettings = {
  sellerStateCode: "MH",
  partialCodDepositBasisPoints: 3000,
  maxCodBalancePaise: 5_000_000,
  fullCodEnabled: false,
  shipping: { flatPaise: 0, freeAbovePaise: null },
  defaultWeightGrams: 500,
  defaultParcelCm: { length: 30, breadth: 25, height: 10 },
  returnWindowDays: 7,
  quoteTtlMs: 15 * 60 * 1000,
};

export function shippingChargePaise(settings: CommerceSettings, merchandisePaise: number) {
  const { flatPaise, freeAbovePaise } = settings.shipping;
  return freeAbovePaise !== null && merchandisePaise >= freeAbovePaise ? 0 : flatPaise;
}
