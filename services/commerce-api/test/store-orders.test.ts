import { Order, PlaceOrderResponse, Problem } from "@kleawip/contract";
import { eq, sql } from "drizzle-orm";
import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_COMMERCE_SETTINGS } from "../src/checkout/settings";
import { cartLines, checkoutQuotes, inventoryItems, inventoryMovements, orders, payments, variants } from "../src/db/schema";
import { seedDemoCatalogue } from "../src/db/seed-demo";
import { expireUnpaidOrders } from "../src/orders/service";
import { DevGateway, RazorpayGateway } from "../src/payments/gateway";
import { addVariantFixture } from "./fixtures";
import { createTestApp, customerSignIn } from "./helpers";

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let stockItem: string;
const gateway = () => ctx.payments as DevGateway;

beforeAll(async () => {
  ctx = await createTestApp({ commerce: { ...DEFAULT_COMMERCE_SETTINGS, shipping: { flatPaise: 4900, freeAbovePaise: null } } });
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.db.execute(sql`TRUNCATE customers, otp_challenges, carts, payment_events RESTART IDENTITY CASCADE`);
  await seedDemoCatalogue(ctx.db);
  stockItem = (await addVariantFixture(ctx.db, { onHand: 4 })).inventoryItemId; // A: ₹499 single; B: ₹949 pack of 2 (shared)
  await ctx.db.update(variants).set({ taxRateBasisPoints: 1200 });
});

const problem = (res: { json: () => unknown }) => Problem.parse(res.json());
const stock = async () => (await ctx.db.select().from(inventoryItems).where(eq(inventoryItems.id, stockItem)))[0]!;

async function checkout(phone = "9876543210", lines: [string, number][] = [["DEMO-SKU-A", 1]], paymentMethod = "prepaid") {
  const customer = await customerSignIn(ctx, phone);
  for (const [sku, quantity] of lines) await customer.call("PUT", `/v1/store/cart/lines/${sku}`, { quantity });
  const { id: addressId } = (await customer.call("POST", "/v1/store/me/addresses", { name: "Priya", phone, line1: "12 MG Road", city: "Pune", stateCode: "MH", pincode: "411001" })).json();
  const quote = (await customer.call("POST", "/v1/store/checkout/quote", { addressId, paymentMethod })).json();
  const place = (key = randomUUID(), quoteId = quote.quoteId as string) =>
    ctx.app.inject({ method: "POST", url: "/v1/store/orders", headers: { "x-kleawip-client": "storefront", "idempotency-key": key }, cookies: { klw_session: customer.cookie }, payload: { quoteId } });
  return { ...customer, quote, place };
}

async function paySuccessfully(customer: Awaited<ReturnType<typeof checkout>>, placed: { order: { id: string }; payment: { providerOrderId: string } | null }) {
  const handler = (await ctx.app.inject({ method: "POST", url: `/v1/dev/payments/${placed.payment!.providerOrderId}/succeed` })).json();
  return customer.call("POST", `/v1/store/orders/${placed.order.id}/payments/verify`, handler);
}

function webhook(event: string, providerOrderId: string, eventId = randomUUID(), sign = true) {
  const body = JSON.stringify({ event, payload: { payment: { entity: { id: `pay_${eventId.slice(0, 8)}`, order_id: providerOrderId, error_description: "Card declined" } } } });
  return ctx.app.inject({
    method: "POST",
    url: "/v1/webhooks/razorpay",
    headers: { "content-type": "application/json", "x-razorpay-event-id": eventId, "x-razorpay-signature": sign ? gateway().signWebhook(body) : "0".repeat(64) },
    payload: body,
  });
}

describe("placing an order", () => {
  it("reserves stock, consumes the quote and returns a payment session", async () => {
    const shopper = await checkout();
    const res = await shopper.place();
    expect(res.statusCode, res.body).toBe(201);
    const body = PlaceOrderResponse.parse(res.json());
    expect(body.order).toMatchObject({ status: "pending_payment", paymentStatus: "awaiting", total: { amount: 54800 }, payNow: { amount: 54800 }, codBalance: { amount: 0 } });
    expect(body.order.number).toMatch(/^KLW\d{6}$/);
    expect(body.order.shippingAddress).toMatchObject({ city: "Pune", stateName: "Maharashtra" });
    expect(body.payment).toMatchObject({ provider: "dev", amount: { amount: 54800 }, purpose: "full", prefill: { contact: "+919876543210" } });
    expect(await stock()).toMatchObject({ onHand: 4, committed: 1 });
    expect((await ctx.db.select().from(checkoutQuotes))[0]!.consumedAt).not.toBeNull();
    expect(await ctx.db.select().from(inventoryMovements).where(eq(inventoryMovements.reason, "order_committed"))).toHaveLength(1);
  });

  it("is idempotent: the same key returns the same order; a key reused for another quote is refused", async () => {
    const shopper = await checkout();
    const key = randomUUID();
    const first = PlaceOrderResponse.parse((await shopper.place(key)).json());
    const again = await shopper.place(key);
    expect(again.statusCode).toBe(200);
    expect(PlaceOrderResponse.parse(again.json()).order.id).toBe(first.order.id);
    expect(await ctx.db.select().from(orders)).toHaveLength(1);
    expect((await stock()).committed).toBe(1);

    const otherQuote = await ctx.db.insert(checkoutQuotes).values({ ...(await ctx.db.select().from(checkoutQuotes))[0]!, id: randomUUID(), consumedAt: null }).returning();
    expect(problem(await shopper.place(key, otherQuote[0]!.id)).code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("requires an Idempotency-Key", async () => {
    const shopper = await checkout();
    const res = await ctx.app.inject({ method: "POST", url: "/v1/store/orders", headers: { "x-kleawip-client": "s" }, cookies: { klw_session: shopper.cookie }, payload: { quoteId: shopper.quote.quoteId } });
    expect(problem(res).errors![0]!.path).toBe("Idempotency-Key");
  });

  it("refuses used, expired and changed quotes without reserving anything", async () => {
    const shopper = await checkout();
    await ctx.db.update(checkoutQuotes).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(problem(await shopper.place()).errors![0]!.code).toBe("quote_expired");

    await ctx.db.update(checkoutQuotes).set({ expiresAt: new Date(Date.now() + 600_000) });
    await ctx.db.update(variants).set({ pricePaise: 55900 }).where(eq(variants.sku, "DEMO-SKU-A"));
    expect(problem(await shopper.place()).errors![0]!.code).toBe("quote_changed");
    expect((await stock()).committed).toBe(0);
    expect(await ctx.db.select().from(orders)).toHaveLength(0);
  });

  it("never oversells when two customers race for the last units", async () => {
    await ctx.db.update(inventoryItems).set({ onHand: 2 });
    const a = await checkout("9876543210", [["DEMO-SKU-B", 1]]); // pack of 2 = both units
    const b = await checkout("9123456780", [["DEMO-SKU-B", 1]]);
    const results = await Promise.all([a.place(), b.place()]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    const loser = results.find((r) => r.statusCode === 409)!;
    expect(problem(loser).errors![0]!.code).toBe("out_of_stock");
    expect(await stock()).toMatchObject({ onHand: 2, committed: 2 });
  });
});

describe("paying", () => {
  it("confirms only after a valid signature, then empties the purchased lines from the bag", async () => {
    const shopper = await checkout();
    const placed = PlaceOrderResponse.parse((await shopper.place()).json());

    const forged = await shopper.call("POST", `/v1/store/orders/${placed.order.id}/payments/verify`, { providerOrderId: placed.payment!.providerOrderId, providerPaymentId: "pay_x", signature: "a".repeat(64) });
    expect(problem(forged).errors![0]!.code).toBe("signature_invalid");
    expect(Order.parse((await shopper.call("GET", `/v1/store/orders/${placed.order.id}`)).json()).status).toBe("pending_payment");

    const paid = Order.parse((await paySuccessfully(shopper, placed)).json());
    expect(paid).toMatchObject({ status: "confirmed", paymentStatus: "paid", payBy: null });
    expect(await ctx.db.select().from(cartLines)).toHaveLength(0);
    expect(await stock()).toMatchObject({ onHand: 4, committed: 1 });
  });

  it("partial COD charges only the 30% deposit online and confirms on it", async () => {
    const shopper = await checkout("9876543210", [["DEMO-SKU-A", 1]], "partial_cod");
    const placed = PlaceOrderResponse.parse((await shopper.place()).json());
    // ₹499 + ₹49 = ₹548 → ₹164.40 → ₹165 online, ₹383 cash.
    expect(placed.payment).toMatchObject({ amount: { amount: 16500 }, purpose: "deposit" });
    expect(placed.order).toMatchObject({ payNow: { amount: 16500 }, codBalance: { amount: 38300 } });
    expect(Order.parse((await paySuccessfully(shopper, placed)).json()).status).toBe("confirmed");
  });

  it("webhooks: reject bad signatures, apply captures once, and record failures", async () => {
    const shopper = await checkout();
    const placed = PlaceOrderResponse.parse((await shopper.place()).json());
    const providerOrderId = placed.payment!.providerOrderId;

    expect((await webhook("payment.captured", providerOrderId, randomUUID(), false)).statusCode).toBe(400);

    const failed = await webhook("payment.failed", providerOrderId);
    expect(failed.json()).toEqual({ result: "failed" });
    expect(Order.parse((await shopper.call("GET", `/v1/store/orders/${placed.order.id}`)).json()).paymentStatus).toBe("failed");

    // Customer retries with a fresh gateway order; the capture webhook arrives twice.
    const retry = (await shopper.call("POST", `/v1/store/orders/${placed.order.id}/payments`)).json();
    const eventId = randomUUID();
    expect((await webhook("payment.captured", retry.providerOrderId, eventId)).json()).toEqual({ result: "captured" });
    expect((await webhook("payment.captured", retry.providerOrderId, eventId)).json()).toEqual({ result: "duplicate" });
    expect(Order.parse((await shopper.call("GET", `/v1/store/orders/${placed.order.id}`)).json())).toMatchObject({ status: "confirmed", paymentStatus: "paid" });
    expect((await ctx.db.select().from(payments).where(eq(payments.status, "captured")))).toHaveLength(1);
  });

  it("treats the checkout callback and the webhook for the same payment as one", async () => {
    const shopper = await checkout();
    const placed = PlaceOrderResponse.parse((await shopper.place()).json());
    await paySuccessfully(shopper, placed);
    await webhook("payment.captured", placed.payment!.providerOrderId);
    const [order] = await ctx.db.select().from(orders);
    expect(order).toMatchObject({ status: "confirmed", needsAttention: null });
  });
});

describe("unpaid orders", () => {
  it("expire after the payment window and give the stock back", async () => {
    const shopper = await checkout();
    const placed = PlaceOrderResponse.parse((await shopper.place()).json());
    expect(await expireUnpaidOrders(ctx.db)).toBe(0);
    await ctx.db.update(orders).set({ reservationExpiresAt: new Date(Date.now() - 1000) });
    expect(await expireUnpaidOrders(ctx.db)).toBe(1);
    expect(await stock()).toMatchObject({ committed: 0 });
    const order = Order.parse((await shopper.call("GET", `/v1/store/orders/${placed.order.id}`)).json());
    expect(order.status).toBe("expired");
    expect(problem(await shopper.call("POST", `/v1/store/orders/${placed.order.id}/payments`)).errors![0]!.code).toBe("not_payable");
  });

  it("a late payment re-reserves stock if it's still there, otherwise flags the order for a refund", async () => {
    const shopper = await checkout();
    const placed = PlaceOrderResponse.parse((await shopper.place()).json());
    await ctx.db.update(orders).set({ reservationExpiresAt: new Date(Date.now() - 1000) });
    await expireUnpaidOrders(ctx.db);
    await webhook("payment.captured", placed.payment!.providerOrderId);
    expect((await ctx.db.select().from(orders))[0]).toMatchObject({ status: "confirmed", needsAttention: null });
    expect((await stock()).committed).toBe(1);

    // Second order whose stock is sold elsewhere before the late payment lands.
    await ctx.db.execute(sql`TRUNCATE customers, otp_challenges, carts, payment_events RESTART IDENTITY CASCADE`);
    await ctx.db.update(inventoryItems).set({ committed: 0 });
    const late = await checkout();
    const latePlaced = PlaceOrderResponse.parse((await late.place()).json());
    await ctx.db.update(orders).set({ reservationExpiresAt: new Date(Date.now() - 1000) });
    await expireUnpaidOrders(ctx.db);
    await ctx.db.update(inventoryItems).set({ onHand: 0 });
    await webhook("payment.captured", latePlaced.payment!.providerOrderId);
    const [flagged] = await ctx.db.select().from(orders).where(eq(orders.id, latePlaced.order.id));
    expect(flagged).toMatchObject({ status: "expired" });
    expect(flagged!.needsAttention).toContain("Refund");
  });

  it("can be cancelled by the customer before payment", async () => {
    const shopper = await checkout();
    const placed = PlaceOrderResponse.parse((await shopper.place()).json());
    expect(Order.parse((await shopper.call("POST", `/v1/store/orders/${placed.order.id}/cancel`)).json()).status).toBe("cancelled");
    expect((await stock()).committed).toBe(0);
  });
});

describe("privacy", () => {
  it("never shows one customer's order to another", async () => {
    const owner = await checkout();
    const placed = PlaceOrderResponse.parse((await owner.place()).json());
    const other = await customerSignIn(ctx, "9123456780");
    expect((await other.call("GET", `/v1/store/orders/${placed.order.id}`)).statusCode).toBe(404);
    expect((await other.call("GET", "/v1/store/orders")).json().data).toEqual([]);
  });
});

describe("Razorpay gateway", () => {
  it("creates orders with basic auth in paise and verifies Razorpay's signature scheme", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      captured = { url, init };
      return new Response(JSON.stringify({ id: "order_ABC123" }), { status: 200 });
    }) as unknown as typeof fetch;
    const razorpay = new RazorpayGateway({ keyId: "rzp_test_key", keySecret: "secret123", webhookSecret: "whsec" }, fakeFetch);
    expect(await razorpay.createOrder({ amountPaise: 54800, receipt: "q-1", notes: { a: "b" } })).toEqual({ providerOrderId: "order_ABC123" });
    expect(captured!.url).toBe("https://api.razorpay.com/v1/orders");
    expect((captured!.init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from("rzp_test_key:secret123").toString("base64")}`);
    expect(JSON.parse(captured!.init.body as string)).toMatchObject({ amount: 54800, currency: "INR", receipt: "q-1" });

    const signature = createHmac("sha256", "secret123").update("order_ABC123|pay_XYZ").digest("hex");
    expect(razorpay.verifyPaymentSignature({ providerOrderId: "order_ABC123", providerPaymentId: "pay_XYZ", signature })).toBe(true);
    expect(razorpay.verifyPaymentSignature({ providerOrderId: "order_ABC123", providerPaymentId: "pay_OTHER", signature })).toBe(false);
    const body = '{"event":"payment.captured"}';
    expect(razorpay.verifyWebhookSignature(body, createHmac("sha256", "whsec").update(body).digest("hex"))).toBe(true);
    expect(razorpay.verifyWebhookSignature(body, "not-hex")).toBe(false);
  });
});
