import { describe, expect, it } from "vitest";
import { addLine, changeQuantity, validBagLines } from "./bag";

describe("preview bag", () => {
  it("adds and increments a product", () => {
    expect(addLine(addLine([], "towel"), "towel")).toEqual([{ productId: "towel", quantity: 2 }]);
  });
  it("adds the selected preview quantity and caps a line at 99", () => {
    expect(addLine([], "towel", 3)).toEqual([{ productId: "towel", quantity: 3 }]);
    expect(addLine([{ productId: "towel", quantity: 98 }], "towel", 3)).toEqual([{ productId: "towel", quantity: 99 }]);
    expect(addLine([], "towel", 0)).toEqual([]);
  });
  it("removes a line at zero", () => {
    expect(changeQuantity([{ productId: "towel", quantity: 2 }], "towel", 0)).toEqual([]);
  });
  it("rejects quantities beyond the preview limit", () => {
    const lines = [{ productId: "towel", quantity: 2 }];
    expect(changeQuantity(lines, "towel", 100)).toBe(lines);
  });
  it("rejects invalid saved data", () => {
    expect(validBagLines([{ productId: "ok", quantity: 2 }, { productId: "bad", quantity: -1 }, null])).toEqual([{ productId: "ok", quantity: 2 }]);
  });
  it("drops unknown products and merges duplicate saved lines", () => {
    expect(validBagLines([
      { productId: "known", quantity: 50 },
      { productId: "unknown", quantity: 1 },
      { productId: "known", quantity: 60 },
      { productId: " ", quantity: 1 },
    ], new Set(["known"]))).toEqual([{ productId: "known", quantity: 99 }]);
  });
});
