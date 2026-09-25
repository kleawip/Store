import { describe, expect, it } from "vitest";
import { Money, ProductListQuery } from "./index";

describe("Money", () => {
  it("accepts integer paise", () => {
    expect(Money.parse({ amount: 49900, currency: "INR" }).amount).toBe(49900);
  });

  it("rejects fractional amounts and other currencies", () => {
    expect(Money.safeParse({ amount: 499.5, currency: "INR" }).success).toBe(false);
    expect(Money.safeParse({ amount: 100, currency: "USD" }).success).toBe(false);
  });
});

describe("ProductListQuery", () => {
  it("applies defaults and caps the limit", () => {
    expect(ProductListQuery.parse({})).toEqual({ sort: "featured", limit: 24 });
    expect(ProductListQuery.safeParse({ limit: "101" }).success).toBe(false);
  });
});
