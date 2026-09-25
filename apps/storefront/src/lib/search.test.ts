import { describe, expect, it } from "vitest";
import { searchProducts, searchSuggestions } from "./search";

describe("local catalogue search", () => {
  it("suggests the Bath Towels category and the real hair-wrap product for bath", () => {
    const suggestions = searchSuggestions("bath");
    expect(suggestions.map((item) => item.href)).toContain("/shop/bath");
    expect(suggestions.map((item) => item.href)).toContain("/product/hair-wrap-towel");
  });

  it("matches GSM queries and multiple words from the product data", () => {
    expect(searchProducts("1200 gsm").map((product) => product.id)).toContain("twisted-loop-1200");
    expect(searchProducts("cleaning gloves").map((product) => product.id)).toContain("cleaning-gloves");
  });

  it("does not invent suggestions for empty or unknown input", () => {
    expect(searchSuggestions("  ")).toEqual([]);
    expect(searchSuggestions("unlisted item")).toEqual([]);
  });
});
