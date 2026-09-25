import { describe, expect, it } from "vitest";
import {
  availableUnits,
  optionKey,
  priceFrom,
  productAvailability,
  sellableQuantity,
  unitPricePaise,
  variantAvailability,
  type VariantInput,
} from "./availability";

type VariantOverrides = Partial<Omit<VariantInput, "stock">> & { stock?: Partial<VariantInput["stock"]> };

const variant = (overrides: VariantOverrides = {}): VariantInput => ({
  status: "active",
  pricePaise: 49900,
  inventoryUnitsPerSale: 1,
  maxOrderQuantity: 10,
  ...overrides,
  stock: { tracked: true, onHand: 20, committed: 0, unavailable: 0, lowStockThreshold: null, ...overrides.stock },
});

describe("availableUnits", () => {
  it("subtracts committed and unavailable from on hand", () => {
    expect(availableUnits({ tracked: true, onHand: 20, committed: 3, unavailable: 2, lowStockThreshold: null })).toBe(15);
  });
});

describe("sellableQuantity with shared single-unit stock", () => {
  it("a Pack of 2 drawing on 5 single units can sell 2 packs", () => {
    expect(sellableQuantity(variant({ inventoryUnitsPerSale: 2, stock: { onHand: 5 } }))).toBe(2);
  });

  it("a Pack of 3 with 2 units left cannot sell", () => {
    expect(sellableQuantity(variant({ inventoryUnitsPerSale: 3, stock: { onHand: 2 } }))).toBe(0);
  });
});

describe("variantAvailability", () => {
  it("is not for sale while the price is pending, even with stock", () => {
    expect(variantAvailability(variant({ pricePaise: null }))).toEqual({ availability: "not_for_sale", orderableQuantity: 0 });
  });

  it("is not for sale when archived", () => {
    expect(variantAvailability(variant({ status: "archived" })).availability).toBe("not_for_sale");
  });

  it("is in stock with orderable quantity capped by the max order quantity", () => {
    expect(variantAvailability(variant())).toEqual({ availability: "in_stock", orderableQuantity: 10 });
  });

  it("caps orderable quantity by stock when stock is lower than the max", () => {
    expect(variantAvailability(variant({ stock: { onHand: 4 } })).orderableQuantity).toBe(4);
  });

  it("is out of stock when nothing is sellable", () => {
    expect(variantAvailability(variant({ stock: { onHand: 5, committed: 5 } }))).toEqual({ availability: "out_of_stock", orderableQuantity: 0 });
  });

  it("reports low stock with stockLeft only at or below the threshold", () => {
    expect(variantAvailability(variant({ stock: { onHand: 3, lowStockThreshold: 3 } }))).toEqual({
      availability: "low_stock",
      orderableQuantity: 3,
      stockLeft: 3,
    });
    expect(variantAvailability(variant({ stock: { onHand: 4, lowStockThreshold: 3 } })).availability).toBe("in_stock");
  });

  it("reports stockLeft in packs, not units, for shared stock", () => {
    const result = variantAvailability(variant({ inventoryUnitsPerSale: 2, stock: { onHand: 5, lowStockThreshold: 5 } }));
    expect(result).toMatchObject({ availability: "low_stock", stockLeft: 2, orderableQuantity: 2 });
  });

  it("treats untracked stock as always in stock up to the max order quantity", () => {
    expect(variantAvailability(variant({ stock: { tracked: false, onHand: 0 } }))).toEqual({ availability: "in_stock", orderableQuantity: 10 });
  });
});

describe("productAvailability", () => {
  it("picks the best state across variants", () => {
    expect(productAvailability(["out_of_stock", "low_stock"])).toBe("low_stock");
    expect(productAvailability(["out_of_stock", "in_stock", "not_for_sale"])).toBe("in_stock");
    expect(productAvailability(["not_for_sale", "out_of_stock"])).toBe("out_of_stock");
    expect(productAvailability([])).toBe("not_for_sale");
  });
});

describe("priceFrom", () => {
  it("returns the lowest approved active price, ignoring pending and archived", () => {
    expect(priceFrom([
      { status: "active", pricePaise: 94900 },
      { status: "active", pricePaise: null },
      { status: "archived", pricePaise: 100 },
      { status: "active", pricePaise: 49900 },
    ])).toBe(49900);
  });

  it("is null while every price is pending", () => {
    expect(priceFrom([{ status: "active", pricePaise: null }])).toBeNull();
  });
});

describe("unitPricePaise and optionKey", () => {
  it("divides pack price per unit, rounding to the paisa", () => {
    expect(unitPricePaise(94900, 2)).toBe(47450);
    expect(unitPricePaise(100, 3)).toBe(33);
  });

  it("builds an order-independent combination key", () => {
    expect(optionKey(["b", "a", "c"])).toBe(optionKey(["c", "b", "a"]));
  });
});
