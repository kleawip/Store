import { describe, expect, it } from "vitest";
import { formatDemoPrice, getDemoMerchandising } from "./demo-merchandising";
import { products } from "./products";

describe("local demo merchandising", () => {
  it("has a fixed sample value for every current placeholder product", () => {
    for (const product of products) {
      const demo = getDemoMerchandising(product.id);
      expect(demo?.price).toBeGreaterThan(0);
      expect(demo?.rating).toBeGreaterThanOrEqual(0);
      expect(demo?.rating).toBeLessThanOrEqual(5);
    }
  });

  it("does not invent a price or rating for a new real product", () => {
    expect(getDemoMerchandising("future-approved-product")).toBeUndefined();
  });

  it("formats the sample price in rupees", () => {
    expect(formatDemoPrice(799)).toContain("799");
    expect(formatDemoPrice(799)).toContain("₹");
  });
});
