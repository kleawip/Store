import { describe, expect, it } from "vitest";
import { validWishlistIds } from "./wishlist";

describe("preview wishlist", () => {
  it("keeps each known product once and removes invalid saved entries", () => {
    expect(validWishlistIds(["known", "unknown", "known", 4, null], new Set(["known"]))).toEqual(["known"]);
    expect(validWishlistIds({ productId: "known" }, new Set(["known"]))).toEqual([]);
  });
});
