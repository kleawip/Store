// Pure stock and purchasability rules. No database access, so every rule is unit-tested directly.
import type { z } from "zod";
import type { Availability } from "@kleawip/contract";

export type AvailabilityState = z.infer<typeof Availability>;

export type StockInput = {
  tracked: boolean;
  onHand: number;
  committed: number;
  unavailable: number;
  lowStockThreshold: number | null;
};

export type VariantInput = {
  status: "active" | "archived";
  pricePaise: number | null;
  inventoryUnitsPerSale: number;
  maxOrderQuantity: number;
  stock: StockInput;
};

export type VariantAvailability = {
  availability: AvailabilityState;
  /** Largest quantity a customer may order right now (0 when not orderable). */
  orderableQuantity: number;
  /** Set only for low_stock, so the UI never shows exact counts otherwise (API_CONTRACT §4). */
  stockLeft?: number;
};

export function availableUnits(stock: StockInput): number {
  return Math.max(0, stock.onHand - stock.committed - stock.unavailable);
}

/**
 * How many of this variant can be sold from its inventory item.
 * A Pack of 2 that draws on shared single-unit stock has inventoryUnitsPerSale = 2.
 */
export function sellableQuantity(variant: Pick<VariantInput, "inventoryUnitsPerSale" | "stock">): number {
  return Math.floor(availableUnits(variant.stock) / variant.inventoryUnitsPerSale);
}

export function variantAvailability(variant: VariantInput): VariantAvailability {
  // Archived SKUs and SKUs without an approved price cannot be bought (Phase 0 rule: no invented prices).
  if (variant.status !== "active" || variant.pricePaise === null) {
    return { availability: "not_for_sale", orderableQuantity: 0 };
  }
  if (!variant.stock.tracked) {
    return { availability: "in_stock", orderableQuantity: variant.maxOrderQuantity };
  }

  const sellable = sellableQuantity(variant);
  if (sellable === 0) return { availability: "out_of_stock", orderableQuantity: 0 };

  const orderableQuantity = Math.min(sellable, variant.maxOrderQuantity);
  const threshold = variant.stock.lowStockThreshold;
  if (threshold !== null && availableUnits(variant.stock) <= threshold) {
    return { availability: "low_stock", orderableQuantity, stockLeft: sellable };
  }
  return { availability: "in_stock", orderableQuantity };
}

/** Product-level summary for listings: the best state among its sellable variants. */
export function productAvailability(states: AvailabilityState[]): AvailabilityState {
  if (states.includes("in_stock")) return "in_stock";
  if (states.includes("low_stock")) return "low_stock";
  if (states.includes("out_of_stock")) return "out_of_stock";
  return "not_for_sale";
}

/** Lowest approved price among active variants, or null while every price is pending. */
export function priceFrom(variants: Pick<VariantInput, "status" | "pricePaise">[]): number | null {
  const prices = variants
    .filter((variant) => variant.status === "active" && variant.pricePaise !== null)
    .map((variant) => variant.pricePaise as number);
  return prices.length ? Math.min(...prices) : null;
}

/** Per-unit price for pack comparison, rounded to the nearest paisa. */
export function unitPricePaise(pricePaise: number, packQuantity: number): number {
  return Math.round(pricePaise / packQuantity);
}

/** Canonical key for an option combination: order-independent, so {Size, Colour} and {Colour, Size} match. */
export function optionKey(optionValueIds: string[]): string {
  return [...optionValueIds].sort().join(",");
}
