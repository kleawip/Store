import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { categories, products } from "./products";

describe("preview catalogue", () => {
  it("contains ten distinct products and supported categories", () => {
    expect(products).toHaveLength(10);
    expect(new Set(products.map((product) => product.id)).size).toBe(products.length);
    expect(products.every((product) => categories.some((category) => category.id === product.category))).toBe(true);
  });
  it("has all local product images", () => {
    for (const product of products) {
      expect(product.images.length).toBeGreaterThan(1);
      for (const image of product.images) expect(existsSync(path.join(process.cwd(), "public", image))).toBe(true);
    }
  });
});
