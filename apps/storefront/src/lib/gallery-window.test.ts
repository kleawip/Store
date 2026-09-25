import { describe, expect, it } from "vitest";
import { galleryWindow } from "./gallery-window";

describe("galleryWindow", () => {
  it("shows every dot for the current three-image catalogue", () => {
    expect(galleryWindow(3, 1)).toEqual([0, 1, 2]);
  });

  it("moves a compact four-dot window as larger galleries advance", () => {
    expect(galleryWindow(9, 0)).toEqual([0, 1, 2, 3]);
    expect(galleryWindow(9, 5)).toEqual([3, 4, 5, 6]);
    expect(galleryWindow(9, 8)).toEqual([5, 6, 7, 8]);
  });
});
