import { expect, it } from "vitest";
import { formatRupees } from "./money";

it("formats approved paise amounts without dropping cents", () => {
  expect(formatRupees(79900)).toBe("₹799");
  expect(formatRupees(79950)).toBe("₹799.50");
});
