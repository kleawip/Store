import { Cart, Problem } from "@kleawip/contract";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inventoryItems, products, variants } from "../src/db/schema";
import { seedDemoCatalogue } from "../src/db/seed-demo";
import { addVariantFixture } from "./fixtures";
import { createTestApp, customerSignIn, STORE_CLIENT } from "./helpers";

let ctx: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.db.execute(sql`TRUNCATE customers, otp_challenges, carts RESTART IDENTITY CASCADE`);
  await seedDemoCatalogue(ctx.db);
  await addVariantFixture(ctx.db, { onHand: 5 }); // DEMO-SKU-A ₹499 single, DEMO-SKU-B ₹949 pack of 2 (shared), DEMO-SKU-C price pending
  await ctx.db.update(variants).set({ taxRateBasisPoints: 1200 });
});

const problem = (res: { json: () => unknown }) => Problem.parse(res.json());
const guest = (method: "GET" | "PUT" | "DELETE", url: string, payload?: object, cookie?: string) =>
  ctx.app.inject({ method, url, headers: STORE_CLIENT, ...(payload ? { payload } : {}), ...(cookie ? { cookies: { klw_cart: cookie } } : {}) });

describe("guest cart", () => {
  it("creates a cart on first add, prices it on the server and includes GST", async () => {
    const res = await guest("PUT", "/v1/store/cart/lines/demo-sku-a", { quantity: 2 });
    expect(res.statusCode, res.body).toBe(200);
    const cookie = res.cookies.find((c) => c.name === "klw_cart")!;
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax" });
    const cart = Cart.parse(res.json());
    expect(cart).toMatchObject({ itemCount: 2, subtotal: { amount: 99800 }, gstIncluded: { amount: 10693 }, signedIn: false, hasWarnings: false });
    expect(cart.lines[0]).toMatchObject({ sku: "DEMO-SKU-A", productSlug: "twisted-loop-1200", optionsLabel: "Size: 40 × 60 cm · Pack: Single", unitPrice: { amount: 49900 }, gstRatePercent: 12 });

    const again = Cart.parse((await guest("GET", "/v1/store/cart", undefined, cookie.value)).json());
    expect(again.itemCount).toBe(2);
  });

  it("returns an empty cart without creating one for a plain visit", async () => {
    const res = await guest("GET", "/v1/store/cart");
    expect(Cart.parse(res.json())).toMatchObject({ lines: [], itemCount: 0, subtotal: { amount: 0 } });
    expect(res.cookies).toEqual([]);
  });

  it("sets absolute quantities (retries are harmless) and removes at 0", async () => {
    const first = await guest("PUT", "/v1/store/cart/lines/DEMO-SKU-A", { quantity: 1 });
    const cookie = first.cookies.find((c) => c.name === "klw_cart")!.value;
    await guest("PUT", "/v1/store/cart/lines/DEMO-SKU-A", { quantity: 3 }, cookie);
    await guest("PUT", "/v1/store/cart/lines/DEMO-SKU-A", { quantity: 3 }, cookie);
    expect(Cart.parse((await guest("GET", "/v1/store/cart", undefined, cookie)).json()).itemCount).toBe(3);
    expect(Cart.parse((await guest("PUT", "/v1/store/cart/lines/DEMO-SKU-A", { quantity: 0 }, cookie)).json()).lines).toEqual([]);
  });

  it("refuses unpriced, unknown and over-stock requests with clear codes", async () => {
    expect(problem(await guest("PUT", "/v1/store/cart/lines/DEMO-SKU-C", { quantity: 1 })).code).toBe("PRICE_PENDING");
    expect(problem(await guest("PUT", "/v1/store/cart/lines/NOPE-1", { quantity: 1 })).code).toBe("SKU_UNAVAILABLE");
    const tooMany = await guest("PUT", "/v1/store/cart/lines/DEMO-SKU-B", { quantity: 3 }); // 5 units ÷ 2 = 2 packs
    expect(problem(tooMany)).toMatchObject({ code: "QUANTITY_EXCEEDS_STOCK", detail: "You can order up to 2 of this item." });
  });

  it("needs the client header to change the cart", async () => {
    const res = await ctx.app.inject({ method: "PUT", url: "/v1/store/cart/lines/DEMO-SKU-A", payload: { quantity: 1 } });
    expect(res.statusCode).toBe(403);
  });
});

describe("honest warnings when the catalogue changes", () => {
  it("reports price changes, reduced quantities and unavailable items without charging for them", async () => {
    const first = await guest("PUT", "/v1/store/cart/lines/DEMO-SKU-A", { quantity: 4 });
    const cookie = first.cookies.find((c) => c.name === "klw_cart")!.value;
    await guest("PUT", "/v1/store/cart/lines/DEMO-SKU-B", { quantity: 1 }, cookie);

    await ctx.db.update(variants).set({ pricePaise: 54900 }).where(eq(variants.sku, "DEMO-SKU-A"));
    await ctx.db.update(inventoryItems).set({ onHand: 3 });
    const cart = Cart.parse((await guest("GET", "/v1/store/cart", undefined, cookie)).json());
    const [single, pack] = cart.lines;
    expect(single!.warnings.map((w) => w.code).sort()).toEqual(["PRICE_CHANGED", "QUANTITY_REDUCED"]);
    expect(single).toMatchObject({ quantity: 4, orderableQuantity: 3, lineTotal: { amount: 164700 } });
    expect(single!.warnings.find((w) => w.code === "PRICE_CHANGED")!.previousUnitPrice).toEqual({ amount: 49900, currency: "INR" });
    expect(pack!.orderableQuantity).toBe(1);

    await ctx.db.update(products).set({ status: "draft" });
    const hidden = Cart.parse((await guest("GET", "/v1/store/cart", undefined, cookie)).json());
    expect(hidden.lines.every((line) => line.warnings.some((w) => w.code === "SKU_UNAVAILABLE"))).toBe(true);
    expect(hidden.subtotal.amount).toBe(0);
  });
});

describe("signed-in cart", () => {
  it("merges the guest bag into the account at sign-in and drops the guest cookie", async () => {
    const first = await guest("PUT", "/v1/store/cart/lines/DEMO-SKU-A", { quantity: 2 });
    const guestCookie = first.cookies.find((c) => c.name === "klw_cart")!.value;

    const customer = await customerSignIn(ctx);
    await customer.call("PUT", "/v1/store/cart/lines/DEMO-SKU-A", { quantity: 1 });
    await customer.call("POST", "/v1/store/auth/logout");

    const again = await customerSignIn(ctx, "9876543210", { klw_cart: guestCookie });
    expect(again.verify.cookies.find((c) => c.name === "klw_cart")?.value).toBe("");
    const cart = Cart.parse((await again.call("GET", "/v1/store/cart")).json());
    expect(cart).toMatchObject({ signedIn: true, itemCount: 3 }); // 1 already in the account + 2 from the guest bag
    expect(Cart.parse((await guest("GET", "/v1/store/cart", undefined, guestCookie)).json()).lines).toEqual([]);
  });

  it("caps merged quantities at what can be ordered", async () => {
    const first = await guest("PUT", "/v1/store/cart/lines/DEMO-SKU-A", { quantity: 4 });
    const guestCookie = first.cookies.find((c) => c.name === "klw_cart")!.value;
    const customer = await customerSignIn(ctx);
    await customer.call("PUT", "/v1/store/cart/lines/DEMO-SKU-A", { quantity: 3 });
    const merged = await customerSignIn(ctx, "9876543210", { klw_cart: guestCookie });
    expect(Cart.parse((await merged.call("GET", "/v1/store/cart")).json()).itemCount).toBe(5);
  });
});

describe("wishlist", () => {
  it("saves products (optionally a SKU), hides unpublished ones, and merges a browser list", async () => {
    const customer = await customerSignIn(ctx);
    expect((await customer.call("PUT", "/v1/store/me/wishlist/twisted-loop-1200", { sku: "DEMO-SKU-B" })).statusCode).toBe(204);
    const merged = (await customer.call("POST", "/v1/store/me/wishlist/merge", { items: [{ productSlug: "pet-towel" }, { productSlug: "no-such-thing" }] })).json();
    expect(merged.data.map((item: { productSlug: string; sku: string | null }) => [item.productSlug, item.sku])).toEqual([["twisted-loop-1200", "DEMO-SKU-B"], ["pet-towel", null]]);

    await ctx.db.update(products).set({ status: "draft" }).where(eq(products.slug, "pet-towel"));
    expect((await customer.call("GET", "/v1/store/me/wishlist")).json().data).toHaveLength(1);
    await customer.call("DELETE", "/v1/store/me/wishlist/twisted-loop-1200");
    expect((await customer.call("GET", "/v1/store/me/wishlist")).json().data).toEqual([]);
  });

  it("requires sign-in", async () => {
    expect((await ctx.app.inject({ method: "GET", url: "/v1/store/me/wishlist" })).statusCode).toBe(401);
  });
});
