import { PlaceOrderResponse, Problem } from "@kleawip/contract";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inventoryItems, shipments, variants } from "../src/db/schema";
import { seedDemoCatalogue } from "../src/db/seed-demo";
import { financialYear } from "../src/invoices/service";
import { addVariantFixture } from "./fixtures";
import { createStaff, createTestApp, customerSignIn, resetStaffAndAudit, signIn, TEST_COURIER_TOKEN } from "./helpers";

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let owner: Awaited<ReturnType<typeof signIn>>;
let stockItem: string;

const SELLER = { legalName: "Kleawip Test Pvt Ltd", gstin: "27ABCDE1234F1Z5", line1: "Unit 4, Test Estate", city: "Mumbai", stateCode: "MH", pincode: "400001" };

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await resetStaffAndAudit(ctx.db);
  await ctx.db.execute(sql`TRUNCATE customers, otp_challenges, carts, payment_events, invoice_sequences RESTART IDENTITY CASCADE`);
  await seedDemoCatalogue(ctx.db);
  stockItem = (await addVariantFixture(ctx.db, { onHand: 10 })).inventoryItemId;
  await ctx.db.update(variants).set({ taxRateBasisPoints: 1200 });
  await createStaff(ctx.db, "owner");
  owner = await signIn(ctx.app, "owner@kleawip.test");
  await owner.request("PUT", "/v1/admin/settings/seller", SELLER);
});

const problem = (res: { json: () => unknown }) => Problem.parse(res.json());
const stock = async () => (await ctx.db.select().from(inventoryItems).where(eq(inventoryItems.id, stockItem)))[0]!;
const track = (awb: string, status: string, when: string) =>
  ctx.app.inject({ method: "POST", url: "/v1/webhooks/courier", headers: { "x-api-key": TEST_COURIER_TOKEN }, payload: { awb, current_status: status, current_timestamp: when } });
// Courier times are IST; "now" is used so the return window is open.
const istNow = (offsetMinutes = 0) => new Date(Date.now() + 330 * 60_000 + offsetMinutes * 60_000).toISOString().slice(0, 19).replace("T", " ");

async function paidOrder(paymentMethod: "prepaid" | "partial_cod" = "prepaid", phone = "9876543210") {
  const customer = await customerSignIn(ctx, phone);
  await customer.call("PUT", "/v1/store/cart/lines/DEMO-SKU-A", { quantity: 2 });
  const { id: addressId } = (await customer.call("POST", "/v1/store/me/addresses", { name: "Priya", phone, line1: "12 MG Road", city: "Pune", stateCode: "MH", pincode: "411001" })).json();
  const quote = (await customer.call("POST", "/v1/store/checkout/quote", { addressId, paymentMethod })).json();
  const placed = PlaceOrderResponse.parse((await ctx.app.inject({ method: "POST", url: "/v1/store/orders", headers: { "x-kleawip-client": "s", "idempotency-key": randomUUID() }, cookies: { klw_session: customer.cookie }, payload: { quoteId: quote.quoteId } })).json());
  const handler = (await ctx.app.inject({ method: "POST", url: `/v1/dev/payments/${placed.payment!.providerOrderId}/succeed` })).json();
  await customer.call("POST", `/v1/store/orders/${placed.order.id}/payments/verify`, handler);
  return { ...placed, customer };
}

async function deliveredOrder(paymentMethod: "prepaid" | "partial_cod" = "prepaid", phone?: string) {
  const placed = await paidOrder(paymentMethod, phone);
  const awb = (await owner.request("POST", `/v1/admin/orders/${placed.order.id}/shipment`, {})).json().shipments[0].awb;
  await track(awb, "PICKED UP", istNow(-120));
  await track(awb, "DELIVERED", istNow(-60));
  return { ...placed, awb };
}

describe("customer return requests", () => {
  it("opens only after delivery and within the window; quantities are capped; customers can cancel", async () => {
    const pending = await paidOrder();
    const early = (await pending.customer.call("GET", `/v1/store/orders/${pending.order.id}/returns/eligibility`)).json();
    expect(early).toMatchObject({ eligible: false, returnBy: null });
    expect(problem(await pending.customer.call("POST", `/v1/store/orders/${pending.order.id}/returns`, { lines: [{ sku: "DEMO-SKU-A", quantity: 1 }], reason: "damaged" })).errors![0]!.code).toBe("not_returnable");

    const { order, customer } = await deliveredOrder("prepaid", "9876500001");
    const eligibility = (await customer.call("GET", `/v1/store/orders/${order.id}/returns/eligibility`)).json();
    expect(eligibility).toMatchObject({ eligible: true, lines: [{ sku: "DEMO-SKU-A", returnableQuantity: 2 }] });

    const created = await customer.call("POST", `/v1/store/orders/${order.id}/returns`, { lines: [{ sku: "DEMO-SKU-A", quantity: 1 }], reason: "damaged", note: "Torn edge" });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json()).toMatchObject({ number: "RET100001", status: "requested", note: "Torn edge", lines: [{ sku: "DEMO-SKU-A", quantity: 1 }] });
    expect(problem(await customer.call("POST", `/v1/store/orders/${order.id}/returns`, { lines: [{ sku: "DEMO-SKU-A", quantity: 2 }], reason: "damaged" })).errors![0]!.code).toBe("exceeds_returnable");
    expect(problem(await customer.call("POST", `/v1/store/orders/${order.id}/returns`, { lines: [{ sku: "NOT-OURS", quantity: 1 }], reason: "damaged" })).errors![0]!.code).toBe("not_in_order");
    expect((await customer.call("POST", `/v1/store/orders/${order.id}/returns`, { lines: [{ sku: "DEMO-SKU-A", quantity: 1 }], reason: "undelivered" })).statusCode).toBe(422);

    const cancelled = (await customer.call("POST", `/v1/store/returns/${created.json().id}/cancel`)).json();
    expect(cancelled.status).toBe("cancelled");
    expect((await customer.call("GET", `/v1/store/orders/${order.id}/returns/eligibility`)).json().lines[0].returnableQuantity).toBe(2);

    // Another customer can't touch it.
    const stranger = await customerSignIn(ctx, "9876500002");
    expect((await stranger.call("POST", `/v1/store/returns/${created.json().id}/cancel`)).statusCode).toBe(404);
    expect((await stranger.call("GET", `/v1/store/orders/${order.id}/returns`)).statusCode).toBe(404);
  });

  it("closes the window after the configured days", async () => {
    const { order, customer } = await deliveredOrder();
    await ctx.db.update(shipments).set({ deliveredAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) }).where(eq(shipments.orderId, order.id));
    const eligibility = (await customer.call("GET", `/v1/store/orders/${order.id}/returns/eligibility`)).json();
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toContain("7-day");
  });
});

describe("staff handling", () => {
  it("approve → receive (restock) → refund issues a GST credit note and money back", async () => {
    const { order, customer } = await deliveredOrder();
    expect(await stock()).toMatchObject({ onHand: 8, committed: 0 });
    const ret = (await customer.call("POST", `/v1/store/orders/${order.id}/returns`, { lines: [{ sku: "DEMO-SKU-A", quantity: 2 }], reason: "quality_issue" })).json();

    const lineValue = order.lines[0]!.lineTotal.amount;
    expect(problem(await owner.request("POST", `/v1/admin/returns/${ret.id}/receive`, {})).errors![0]!.code).toBe("invalid_transition");
    const approved = (await owner.request("POST", `/v1/admin/returns/${ret.id}/approve`, { note: "OK" })).json();
    expect(approved).toMatchObject({ status: "approved", decidedBy: "Test owner", suggestedRefund: { amount: lineValue } });

    // One unit is fine, one is written off.
    expect(problem(await owner.request("POST", `/v1/admin/returns/${ret.id}/receive`, { lines: [{ sku: "DEMO-SKU-A", restockQuantity: 3 }] })).errors![0]!.code).toBe("exceeds_returned");
    const received = (await owner.request("POST", `/v1/admin/returns/${ret.id}/receive`, { lines: [{ sku: "DEMO-SKU-A", restockQuantity: 1 }] })).json();
    expect(received.lines[0]).toMatchObject({ quantity: 2, restockedQuantity: 1 });
    expect((await stock()).onHand).toBe(9);

    const refunded = await owner.request("POST", `/v1/admin/returns/${ret.id}/refund`, { method: "gateway" });
    expect(refunded.statusCode, refunded.body).toBe(200);
    expect(refunded.json()).toMatchObject({ status: "refunded", refundedTotal: { amount: lineValue }, creditNote: { number: `CN/${financialYear(new Date())}/00001` } });

    const note = await owner.request("GET", `/v1/admin/returns/${ret.id}/credit-note`);
    expect(note.headers["content-type"]).toContain("text/html");
    expect(note.body).toContain("Credit Note");
    expect(note.body).toContain(`KLW/${financialYear(new Date())}/00001`);

    const detail = (await owner.request("GET", `/v1/admin/orders/${order.id}`)).json();
    expect(detail.order.refundedTotal.amount).toBe(lineValue);
    expect(detail.returns).toHaveLength(1);
    expect(detail.refunds[0]).toMatchObject({ reason: `Return ${ret.number}`, status: "processed" });
    expect((await customer.call("GET", `/v1/store/orders/${order.id}/returns`)).json().data[0]).toMatchObject({ status: "refunded", refundedTotal: { amount: lineValue } });
  });

  it("reject shows the reason to the customer and frees the quantity", async () => {
    const { order, customer } = await deliveredOrder();
    const ret = (await customer.call("POST", `/v1/store/orders/${order.id}/returns`, { lines: [{ sku: "DEMO-SKU-A", quantity: 1 }], reason: "changed_mind" })).json();
    await owner.request("POST", `/v1/admin/returns/${ret.id}/reject`, { reason: "Used item" });
    expect((await customer.call("GET", `/v1/store/orders/${order.id}/returns`)).json().data[0]).toMatchObject({ status: "rejected", rejectionReason: "Used item" });
    expect(problem(await owner.request("POST", `/v1/admin/returns/${ret.id}/approve`, {})).errors![0]!.code).toBe("invalid_transition");
    expect((await customer.call("GET", `/v1/store/orders/${order.id}/returns/eligibility`)).json().lines[0].returnableQuantity).toBe(2);
  });

  it("RTO parcel: staff record the return; partial COD refunds only what was paid online", async () => {
    const { order, awb } = await (async () => {
      const placed = await paidOrder("partial_cod");
      const booked = (await owner.request("POST", `/v1/admin/orders/${placed.order.id}/shipment`, {})).json();
      return { ...placed, awb: booked.shipments[0].awb as string };
    })();
    await track(awb, "SHIPPED", istNow(-300));
    await track(awb, "RTO INITIATED", istNow(-200));
    await track(awb, "RTO DELIVERED", istNow(-100));

    const created = await owner.request("POST", `/v1/admin/orders/${order.id}/returns`, { lines: [{ sku: "DEMO-SKU-A", quantity: 2 }], reason: "undelivered", source: "rto" });
    expect(created.statusCode, created.body).toBe(201);
    const ret = created.json();
    expect(ret).toMatchObject({ status: "approved", source: "rto" });
    await owner.request("POST", `/v1/admin/returns/${ret.id}/receive`, {});
    expect((await stock()).onHand).toBe(10);

    // Nothing was collected in cash, so the suggested full value exceeds what can go back online.
    expect(problem(await owner.request("POST", `/v1/admin/returns/${ret.id}/refund`, { method: "gateway" })).errors![0]!.code).toBe("exceeds_refundable");
    const refunded = (await owner.request("POST", `/v1/admin/returns/${ret.id}/refund`, { method: "gateway", amountPaise: order.payNow.amount })).json();
    expect(refunded).toMatchObject({ status: "refunded", refundedTotal: { amount: order.payNow.amount } });
  });

  it("close without refund; staff returns only after dispatch; permissions", async () => {
    const unshipped = await paidOrder("prepaid", "9876500003");
    expect(problem(await owner.request("POST", `/v1/admin/orders/${unshipped.order.id}/returns`, { lines: [{ sku: "DEMO-SKU-A", quantity: 1 }], reason: "other" })).errors![0]!.code).toBe("not_returnable");

    const { order, customer } = await deliveredOrder();
    const ret = (await customer.call("POST", `/v1/store/orders/${order.id}/returns`, { lines: [{ sku: "DEMO-SKU-A", quantity: 1 }], reason: "wrong_item" })).json();
    await createStaff(ctx.db, "operations");
    await createStaff(ctx.db, "support");
    const ops = await signIn(ctx.app, "operations@kleawip.test");
    const support = await signIn(ctx.app, "support@kleawip.test");
    expect((await support.request("POST", `/v1/admin/returns/${ret.id}/approve`, {})).statusCode).toBe(403);
    expect((await support.request("GET", `/v1/admin/returns?status=requested`)).json()).toMatchObject({ totalCount: 1 });
    expect((await ops.request("POST", `/v1/admin/returns/${ret.id}/approve`, {})).statusCode).toBe(200);
    expect((await ops.request("POST", `/v1/admin/returns/${ret.id}/receive`, {})).statusCode).toBe(200);
    expect((await ops.request("POST", `/v1/admin/returns/${ret.id}/refund`, { method: "gateway" })).statusCode).toBe(403);
    const closed = (await owner.request("POST", `/v1/admin/returns/${ret.id}/close`, { note: "Sent a replacement" })).json();
    expect(closed).toMatchObject({ status: "closed", staffNote: "Sent a replacement", creditNote: null });
  });
});
