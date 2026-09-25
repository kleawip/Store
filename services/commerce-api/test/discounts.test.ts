import { CheckoutQuote, PlaceOrderResponse, Problem } from "@kleawip/contract";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_COMMERCE_SETTINGS } from "../src/checkout/settings";
import { discounts, orders, variants } from "../src/db/schema";
import { seedDemoCatalogue } from "../src/db/seed-demo";
import { allocateDiscount } from "../src/discounts/service";
import { splitGst } from "../src/domain/tax";
import { expireUnpaidOrders } from "../src/orders/service";
import { addVariantFixture } from "./fixtures";
import { createStaff, createTestApp, customerSignIn, resetStaffAndAudit, signIn } from "./helpers";

// Flat ₹50 shipping so free-shipping codes have something to remove.
const commerce = { ...DEFAULT_COMMERCE_SETTINGS, shipping: { flatPaise: 5000, freeAbovePaise: null } };
let ctx: Awaited<ReturnType<typeof createTestApp>>;
let owner: Awaited<ReturnType<typeof signIn>>;

beforeAll(async () => {
  ctx = await createTestApp({ commerce });
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await resetStaffAndAudit(ctx.db);
  await ctx.db.execute(sql`TRUNCATE customers, otp_challenges, carts, payment_events, invoice_sequences, discounts RESTART IDENTITY CASCADE`);
  await seedDemoCatalogue(ctx.db);
  await addVariantFixture(ctx.db, { onHand: 50 });
  await ctx.db.update(variants).set({ taxRateBasisPoints: 1200 });
  await createStaff(ctx.db, "owner");
  owner = await signIn(ctx.app, "owner@kleawip.test");
});

const problem = (res: { json: () => unknown }) => Problem.parse(res.json());
const code = (body: object) => owner.request("POST", "/v1/admin/discounts", { kind: "percentage", percent: 10, ...body });

async function shopper(phone = "9876543210", cart: [string, number][] = [["DEMO-SKU-A", 2], ["DEMO-SKU-B", 1]]) {
  const customer = await customerSignIn(ctx, phone);
  for (const [sku, quantity] of cart) await customer.call("PUT", `/v1/store/cart/lines/${sku}`, { quantity });
  const { id: addressId } = (await customer.call("POST", "/v1/store/me/addresses", { name: "Priya", phone, line1: "12 MG Road", city: "Pune", stateCode: "MH", pincode: "411001" })).json();
  const quote = (discountCode?: string, paymentMethod: "prepaid" | "partial_cod" = "prepaid") =>
    customer.call("POST", "/v1/store/checkout/quote", { addressId, paymentMethod, ...(discountCode ? { discountCode } : {}) });
  const place = async (quoteId: string, pay = true) => {
    const res = await ctx.app.inject({ method: "POST", url: "/v1/store/orders", headers: { "x-kleawip-client": "s", "idempotency-key": randomUUID() }, cookies: { klw_session: customer.cookie }, payload: { quoteId } });
    if (res.statusCode !== 201 || !pay) return res;
    const placed = PlaceOrderResponse.parse(res.json());
    const handler = (await ctx.app.inject({ method: "POST", url: `/v1/dev/payments/${placed.payment!.providerOrderId}/succeed` })).json();
    await customer.call("POST", `/v1/store/orders/${placed.order.id}/payments/verify`, handler);
    return res;
  };
  return { customer, quote, place };
}

describe("admin discount codes", () => {
  it("owner creates codes (stored uppercase, unique); others can only look", async () => {
    const created = await code({ code: "welcome10", description: "Welcome", maxDiscountPaise: 20000 });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json()).toMatchObject({ code: "WELCOME10", percent: 10, maxDiscount: { amount: 20000 }, perCustomerLimit: 1, state: "active", timesUsed: 0 });
    expect(problem(await code({ code: "WELCOME10" })).errors![0]!.code).toBe("code_taken");
    expect(problem(await owner.request("POST", "/v1/admin/discounts", { code: "FLAT", kind: "fixed_amount" })).errors![0]!.path).toBe("amountPaise");
    expect(problem(await code({ code: "LATE", startsAt: "2026-10-10T00:00:00+05:30", endsAt: "2026-10-01T00:00:00+05:30" })).errors![0]!.code).toBe("before_start");

    await createStaff(ctx.db, "marketing_editor");
    const marketing = await signIn(ctx.app, "marketing_editor@kleawip.test");
    expect((await marketing.request("GET", "/v1/admin/discounts?q=welcome")).json().totalCount).toBe(1);
    expect((await marketing.request("POST", "/v1/admin/discounts", { code: "MINE", kind: "free_shipping" })).statusCode).toBe(403);

    const disabled = await owner.request("POST", `/v1/admin/discounts/${created.json().id}/disable`);
    expect(disabled.json()).toMatchObject({ status: "disabled", state: "disabled" });
  });
});

describe("checkout with a code", () => {
  it("takes the discount off the goods, spreads it over lines, charges GST on the discounted amounts", async () => {
    await code({ code: "SAVE10" });
    const { quote } = await shopper();
    const res = await quote("save10");
    expect(res.statusCode, res.body).toBe(201);
    const q = CheckoutQuote.parse(res.json());
    const merchandise = 49900 * 2 + 94900;
    const discount = Math.floor(merchandise / 10);
    expect(q.discount).toMatchObject({ code: "SAVE10", goods: { amount: discount }, shipping: { amount: 0 } });
    expect(q.lines.reduce((sum, line) => sum + line.discount.amount, 0)).toBe(discount);
    expect(q.total.amount).toBe(merchandise - discount + 5000);
    // GST on each discounted line, same seller state (CGST + SGST).
    const taxable = q.lines.reduce((sum, line) => sum + splitGst(line.lineTotal.amount - line.discount.amount, 1200, true).taxablePaise, 0);
    expect(q.gst.taxable.amount).toBe(taxable);
  });

  it("free shipping removes the shipping charge; partial COD splits the discounted total", async () => {
    await code({ code: "SHIPFREE", kind: "free_shipping", percent: null });
    const { quote } = await shopper();
    const q = CheckoutQuote.parse((await quote("SHIPFREE", "partial_cod")).json());
    expect(q.shipping.amount).toBe(0);
    expect(q.discount!.shipping.amount).toBe(5000);
    expect(q.payment.payNow.amount + q.payment.codBalance.amount).toBe(q.total.amount);
    expect(q.total.amount).toBe(49900 * 2 + 94900);
  });

  it("explains why a code can't be used", async () => {
    const { quote } = await shopper();
    const reason = async (discountCode: string) => problem(await quote(discountCode)).errors![0]!.code;
    expect(await reason("NOPE")).toBe("discount_invalid");
    await code({ code: "SOON", startsAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(await reason("SOON")).toBe("discount_not_started");
    await code({ code: "OLD", startsAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), endsAt: new Date(Date.now() - 86_400_000).toISOString() });
    expect(await reason("OLD")).toBe("discount_expired");
    await code({ code: "BIGSPEND", minSubtotalPaise: 500000 });
    const min = problem(await quote("BIGSPEND"));
    expect(min.errors![0]).toMatchObject({ code: "discount_min_subtotal", path: "discountCode" });
    expect(min.detail).toContain("more");
  });

  it("per-customer and first-order limits, and a fixed amount never makes the order free", async () => {
    await code({ code: "ONCE" });
    await code({ code: "FIRST", firstOrderOnly: true, perCustomerLimit: null });
    await owner.request("POST", "/v1/admin/discounts", { code: "HUGE", kind: "fixed_amount", amountPaise: 10_000_000 });
    const { quote, place, customer } = await shopper();
    const huge = CheckoutQuote.parse((await quote("HUGE")).json());
    expect(huge.total.amount).toBe(100 + 5000); // ₹1 of goods + shipping

    const q = CheckoutQuote.parse((await quote("ONCE")).json());
    expect((await place(q.quoteId)).statusCode).toBe(201);
    await customer.call("PUT", "/v1/store/cart/lines/DEMO-SKU-A", { quantity: 1 }); // paying emptied the bag
    expect(problem(await quote("ONCE")).errors![0]!.code).toBe("discount_already_used");
    expect(problem(await quote("FIRST")).errors![0]!.code).toBe("discount_first_order");
  });

  it("the last use goes to whoever places first; an expired unpaid order gives its use back", async () => {
    await code({ code: "LAST1", usageLimit: 1 });
    const a = await shopper("9876500001");
    const b = await shopper("9876500002");
    const qa = CheckoutQuote.parse((await a.quote("LAST1")).json());
    const qb = CheckoutQuote.parse((await b.quote("LAST1")).json());
    expect((await a.place(qa.quoteId, false)).statusCode).toBe(201); // placed, not yet paid: holds the use
    const refused = await b.place(qb.quoteId);
    expect(refused.statusCode).toBe(409);
    expect(problem(refused).errors![0]!.code).toBe("discount_unavailable");

    await ctx.db.update(orders).set({ reservationExpiresAt: new Date(Date.now() - 1000) });
    await expireUnpaidOrders(ctx.db);
    const again = CheckoutQuote.parse((await b.quote("LAST1")).json());
    expect((await b.place(again.quoteId)).statusCode).toBe(201);
    const [row] = await ctx.db.select().from(discounts);
    const view = (await owner.request("GET", `/v1/admin/discounts/${row!.id}`)).json();
    expect(view).toMatchObject({ timesUsed: 1, usesHeld: 1, totalDiscounted: { amount: again.discount!.total.amount } });
  });

  it("the order, invoice and return value carry the discount", async () => {
    await code({ code: "SAVE10" });
    await owner.request("PUT", "/v1/admin/settings/seller", { legalName: "Kleawip Test Pvt Ltd", gstin: "27ABCDE1234F1Z5", line1: "Unit 4", city: "Mumbai", stateCode: "MH", pincode: "400001" });
    const { quote, place, customer } = await shopper();
    const q = CheckoutQuote.parse((await quote("SAVE10")).json());
    const placed = PlaceOrderResponse.parse((await place(q.quoteId)).json());
    const order = (await customer.call("GET", `/v1/store/orders/${placed.order.id}`)).json();
    expect(order.discount).toMatchObject({ code: "SAVE10", goods: { amount: q.discount!.goods.amount } });
    expect(order.total.amount).toBe(q.total.amount);

    await owner.request("POST", `/v1/admin/orders/${placed.order.id}/shipment`, {});
    const invoice = (await owner.request("GET", `/v1/admin/orders/${placed.order.id}/invoice`)).body;
    expect(invoice).toContain("<th>Discount</th>");
    const [stored] = await ctx.db.select().from(orders).where(eq(orders.id, placed.order.id));
    expect(stored).toMatchObject({ discountCode: "SAVE10", discountPaise: q.discount!.goods.amount });
  });

  it("allocation adds up exactly and never exceeds a line", () => {
    expect(allocateDiscount([100, 200, 300], 60)).toEqual([10, 20, 30]);
    const parts = allocateDiscount([333, 333, 334], 100);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(allocateDiscount([5, 1000], 1004).every((part, i) => part <= [5, 1000][i]!)).toBe(true);
    expect(allocateDiscount([500], 0)).toEqual([0]);
  });
});
