// Checkout quote: the exact, server-calculated amounts for this cart, address and payment method.
// Order creation must reproduce the same numbers, so customers always confirm what they are charged.
import type { CheckoutQuote } from "@kleawip/contract";
import { asc, eq } from "drizzle-orm";
import { priceLines } from "../cart/service";
import { addressFor } from "../customers/profile";
import type { Database } from "../db/client";
import { cartLines, carts, checkoutQuotes } from "../db/schema";
import { partialCodSplit, splitGst } from "../domain/tax";
import { ApiError } from "../errors";
import { ShippingUnavailableError, type ShippingProvider } from "../shipping/provider";
import { shippingChargePaise, type CommerceSettings } from "./settings";

const inr = (amount: number) => ({ amount, currency: "INR" as const });
const blocked = (code: string, message: string, path = "cart") =>
  new ApiError(422, "VALIDATION_FAILED", "Checkout unavailable", message, [{ path, code, message }]);

/** Public pincode check for the product page and address form. Never guesses when the courier can't answer. */
export async function checkServiceability(shipping: ShippingProvider | null, settings: CommerceSettings, pincode: string) {
  if (!shipping) return { pincode, status: "unavailable" as const, partialCodAvailable: false, estimatedDeliveryDays: null };
  try {
    const result = await shipping.checkServiceability({ deliveryPincode: pincode, weightGrams: settings.defaultWeightGrams, cod: true, declaredValuePaise: 100_000 });
    if (!result.serviceable) return { pincode, status: "not_serviceable" as const, partialCodAvailable: false, estimatedDeliveryDays: null };
    return { pincode, status: "serviceable" as const, partialCodAvailable: result.codAvailable, estimatedDeliveryDays: result.estimatedDays };
  } catch (error) {
    if (error instanceof ShippingUnavailableError) return { pincode, status: "unavailable" as const, partialCodAvailable: false, estimatedDeliveryDays: null };
    throw error;
  }
}

export type QuoteSnapshot = {
  lines: { variantId: string; sku: string; productTitle: string; optionsLabel: string; quantity: number; unitPricePaise: number; taxRateBasisPoints: number; hsnCode?: string; weightGrams?: number; inventoryItemId: string; inventoryUnitsPerSale: number }[];
  merchandisePaise: number;
  shippingPaise: number;
  gst: { intraState: boolean; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number };
  deliveryPincode: string;
  deliveryStateCode: string;
};

/** Builds the quote from the customer's live cart. Lines that can't be ordered are left out and listed. */
export async function createQuote(
  db: Database,
  shipping: ShippingProvider | null,
  settings: CommerceSettings,
  customerId: string,
  input: { addressId: string; paymentMethod: "prepaid" | "partial_cod" },
  now = new Date(),
): Promise<CheckoutQuote> {
  const address = await addressFor(db, customerId, input.addressId).catch(() => {
    throw blocked("unknown_address", "Choose a saved delivery address.", "addressId");
  });
  const [cart] = await db.select().from(carts).where(eq(carts.customerId, customerId));
  const stored = cart ? await db.select().from(cartLines).where(eq(cartLines.cartId, cart.id)).orderBy(asc(cartLines.createdAt)) : [];
  const priced = await priceLines(db, stored);

  const excluded = priced.filter((line) => line.orderableQuantity === 0).map((line) => ({ sku: line.sku, reason: line.warnings[0]?.message ?? "Not available." }));
  const lines = priced.filter((line) => line.orderableQuantity > 0);
  if (!lines.length) throw blocked("empty_cart", "Your bag has nothing that can be ordered right now.");
  const untaxed = lines.find((line) => line.taxRateBasisPoints === null);
  if (untaxed) throw blocked("tax_missing", `${untaxed.productTitle} can't be ordered yet (tax details missing).`);

  const merchandisePaise = lines.reduce((sum, line) => sum + line.lineTotal.amount, 0);
  const weightGrams = lines.reduce((sum, line) => sum + (line.weightGrams ?? settings.defaultWeightGrams) * line.orderableQuantity, 0);
  const shippingPaise = shippingChargePaise(settings, merchandisePaise);
  const totalPaise = merchandisePaise + shippingPaise;

  // Courier check for the actual parcel.
  if (!shipping) throw blocked("delivery_unavailable", "Delivery checks aren't available right now. Please try again shortly.", "addressId");
  let delivery;
  try {
    delivery = await shipping.checkServiceability({ deliveryPincode: address.pincode, weightGrams, cod: input.paymentMethod === "partial_cod", declaredValuePaise: totalPaise });
  } catch (error) {
    if (error instanceof ShippingUnavailableError) throw blocked("delivery_unavailable", "We couldn't check delivery to this pincode right now. Please try again shortly.", "addressId");
    throw error;
  }
  if (!delivery.serviceable) throw blocked("not_serviceable", `We can't deliver to ${address.pincode} yet.`, "addressId");

  let payNowPaise = totalPaise;
  let codBalancePaise = 0;
  if (input.paymentMethod === "partial_cod") {
    if (!delivery.codAvailable) throw blocked("cod_unavailable", `Cash on delivery isn't available for ${address.pincode}. Please pay online.`, "paymentMethod");
    ({ depositPaise: payNowPaise, codBalancePaise } = partialCodSplit(totalPaise, settings.partialCodDepositBasisPoints));
    if (codBalancePaise > settings.maxCodBalancePaise) {
      throw blocked("cod_limit", `Cash on delivery is available for balances up to ₹${settings.maxCodBalancePaise / 100}. Please pay online.`, "paymentMethod");
    }
  }

  // GST inside the goods, split by rate; shipping-charge GST treatment is TBC with the client's accountant.
  const intraState = address.stateCode === settings.sellerStateCode;
  const gst = lines.reduce(
    (sum, line) => {
      const split = splitGst(line.lineTotal.amount, line.taxRateBasisPoints!, intraState);
      return { taxablePaise: sum.taxablePaise + split.taxablePaise, cgstPaise: sum.cgstPaise + split.cgstPaise, sgstPaise: sum.sgstPaise + split.sgstPaise, igstPaise: sum.igstPaise + split.igstPaise };
    },
    { taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 },
  );

  const snapshot: QuoteSnapshot = {
    lines: lines.map((line) => ({
      variantId: line.variantId,
      sku: line.sku,
      productTitle: line.productTitle,
      optionsLabel: line.optionsLabel,
      quantity: line.orderableQuantity,
      unitPricePaise: line.unitPrice!.amount,
      taxRateBasisPoints: line.taxRateBasisPoints!,
      hsnCode: line.hsnCode ?? undefined,
      weightGrams: line.weightGrams ?? undefined,
      inventoryItemId: line.inventoryItemId,
      inventoryUnitsPerSale: line.inventoryUnitsPerSale,
    })),
    merchandisePaise,
    shippingPaise,
    gst: { intraState, ...gst },
    deliveryPincode: address.pincode,
    deliveryStateCode: address.stateCode,
  };
  const expiresAt = new Date(now.getTime() + settings.quoteTtlMs);
  const [quote] = await db
    .insert(checkoutQuotes)
    .values({ customerId, addressId: address.id, paymentMethod: input.paymentMethod, snapshot, totalPaise, payNowPaise, codBalancePaise, expiresAt })
    .returning({ id: checkoutQuotes.id });

  return {
    quoteId: quote!.id,
    expiresAt: expiresAt.toISOString(),
    lines: snapshot.lines.map((line) => ({
      sku: line.sku,
      productTitle: line.productTitle,
      optionsLabel: line.optionsLabel,
      quantity: line.quantity,
      unitPrice: inr(line.unitPricePaise),
      lineTotal: inr(line.unitPricePaise * line.quantity),
      gstRatePercent: line.taxRateBasisPoints / 100,
    })),
    merchandiseTotal: inr(merchandisePaise),
    shipping: inr(shippingPaise),
    total: inr(totalPaise),
    gst: { intraState, taxable: inr(gst.taxablePaise), cgst: inr(gst.cgstPaise), sgst: inr(gst.sgstPaise), igst: inr(gst.igstPaise) },
    payment: {
      method: input.paymentMethod,
      payNow: inr(payNowPaise),
      codBalance: inr(codBalancePaise),
      depositPercent: input.paymentMethod === "partial_cod" ? settings.partialCodDepositBasisPoints / 100 : null,
    },
    delivery: { pincode: address.pincode, estimatedDeliveryDays: delivery.estimatedDays },
    excluded,
    warnings: lines.flatMap((line) => line.warnings.map((warning) => ({ sku: line.sku, code: warning.code, message: warning.message }))),
  };
}
