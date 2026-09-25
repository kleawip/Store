import { PlaceOrderResponse, Problem } from "@kleawip/contract";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inventoryItems, orders, refunds, variants } from "../src/db/schema";
import { seedDemoCatalogue } from "../src/db/seed-demo";
import type { DevGateway } from "../src/payments/gateway";
import { addVariantFixture } from "./fixtures";
import { createStaff, createTestApp, customerSignIn, resetStaffAndAudit, signIn } from "./helpers";

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let owner: Awaited<ReturnType<typeof signIn>>;
let stockItem: string;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await resetStaffAndAudit(ctx.db);
  await ctx.db.execute(sql`TRUNCATE customers, otp_challenges, carts, payment_events RESTART IDENTITY CASCADE`);
  await seedDemoCatalogue(ctx.db);
  stockItem = (await addVariantFixture(ctx.db, { onHand: 10 })).inventoryItemId;
  await ctx.db.update(variants).set({ taxRateBasisPoints: 1200 });
  await createStaff(ctx.db, "owner");
  owner = await signIn(ctx.app, "owner@kleawip.test");
});

const problem = (res: { json: () => unknown }) => Problem.parse(res.json());
const stock = async () => (await ctx.db.select().from(inventoryItems).where(eq(inventoryItems.id, stockItem)))[0]!;

async function paidOrder(paymentMethod: "prepaid" | "partial_cod" = "prepaid") {
  const customer = await customerSignIn(ctx);
  await customer.call("PUT", "/v1/store/cart/lines/DEMO-SKU-A", { quantity: 2 });
  const { id: addressId } = (await customer.call("POST", "/v1/store/me/addresses", { name: "Priya", phone: "9876543210", line1: "12 MG Road", city: "Pune", stateCode: "MH", pincode: "411001" })).json();
  const quote = (await customer.call("POST", "/v1/store/checkout/quote", { addressId, paymentMethod })).json();
  const placed = PlaceOrderResponse.parse((await ctx.app.inject({ method: "POST", url: "/v1/store/orders", headers: { "x-kleawip-client": "s", "idempotency-key": randomUUID() }, cookies: { klw_session: customer.cookie }, payload: { quoteId: quote.quoteId } })).json());
  const handler = (await ctx.app.inject({ method: "POST", url: `/v1/dev/payments/${placed.payment!.providerOrderId}/succeed` })).json();
  await customer.call("POST", `/v1/store/orders/${placed.order.id}/payments/verify`, handler);
  return { ...placed, customer };
}

describe("fulfilment steps", () => {
  it("moves a paid order through processing → packed by hand, and refuses skipping ahead", async () => {
    const { order } = await paidOrder();
    const step = (fulfilmentStatus: string) => owner.request("POST", `/v1/admin/orders/${order.id}/fulfilment`, { fulfilmentStatus });
    expect(problem(await step("packed")).errors![0]!.code).toBe("invalid_transition");
    expect((await step("processing")).json().order.fulfilmentStatus).toBe("processing");
    expect((await step("packed")).json().order.fulfilmentStatus).toBe("packed");
    expect((await ctx.app.inject({ method: "POST", url: `/v1/admin/orders/${order.id}/fulfilment`, cookies: { klw_admin: owner.cookie.value }, headers: { "x-csrf-token": owner.session.csrfToken }, payload: { fulfilmentStatus: "shipped" } })).statusCode).toBe(422);
  });
});

describe("staff cancellation", () => {
  it("cancels before dispatch: releases stock and refunds everything paid online", async () => {
    const { order, customer } = await paidOrder();
    expect((await stock()).committed).toBe(2);
    const res = await owner.request("POST", `/v1/admin/orders/${order.id}/cancel`, { reason: "Customer asked to cancel" });
    expect(res.statusCode, res.body).toBe(200);
    const detail = res.json();
    expect(detail).toMatchObject({ cancelReason: "Customer asked to cancel", order: { status: "cancelled", refundedTotal: { amount: order.total.amount } } });
    expect(detail.refunds).toEqual([expect.objectContaining({ method: "gateway", status: "processed", amount: { amount: order.total.amount, currency: "INR" } })]);
    expect((await stock()).committed).toBe(0);
    // The customer sees it too.
    expect((await customer.call("GET", `/v1/store/orders/${order.id}`)).json()).toMatchObject({ status: "cancelled", refundedTotal: { amount: order.total.amount } });
    expect(problem(await owner.request("POST", `/v1/admin/orders/${order.id}/cancel`, { reason: "again" })).errors![0]!.code).toBe("already_cancelled");
  });

  it("refuses to cancel once shipped", async () => {
    const { order } = await paidOrder();
    await ctx.db.update(orders).set({ fulfilmentStatus: "shipped" }).where(eq(orders.id, order.id));
    expect(problem(await owner.request("POST", `/v1/admin/orders/${order.id}/cancel`, { reason: "Too late" })).errors![0]!.code).toBe("already_shipped");
  });

  it("partial COD: only the online deposit is refunded on cancel", async () => {
    const { order } = await paidOrder("partial_cod");
    const detail = (await owner.request("POST", `/v1/admin/orders/${order.id}/cancel`, { reason: "Out of area" })).json();
    expect(detail.order.refundedTotal.amount).toBe(order.payNow.amount);
  });
});

describe("refunds", () => {
  it("allows partial online refunds up to what was paid, never more", async () => {
    const { order } = await paidOrder();
    const refund = (amountPaise: number) => owner.request("POST", `/v1/admin/orders/${order.id}/refunds`, { amountPaise, method: "gateway", reason: "Goodwill for late delivery" });
    expect((await refund(5000)).statusCode).toBe(201);
    const over = await refund(order.total.amount);
    expect(problem(over).errors![0]).toMatchObject({ code: "exceeds_refundable" });
    expect((await refund(order.total.amount - 5000)).statusCode).toBe(201);
    expect(problem(await refund(1)).errors![0]!.code).toBe("exceeds_refundable");
  });

  it("never over-refunds under concurrent requests", async () => {
    const { order } = await paidOrder();
    const results = await Promise.all(Array.from({ length: 4 }, () => owner.request("POST", `/v1/admin/orders/${order.id}/refunds`, { amountPaise: order.total.amount, method: "gateway", reason: "Double click" })));
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 422, 422, 422]);
    const total = (await ctx.db.select().from(refunds)).reduce((sum, r) => sum + r.amountPaise, 0);
    expect(total).toBe(order.total.amount);
  });

  it("records a failed gateway refund, flags the order, and can retry", async () => {
    const { order } = await paidOrder();
    (ctx.payments as DevGateway).failNextRefund = true;
    const detail = (await owner.request("POST", `/v1/admin/orders/${order.id}/refunds`, { amountPaise: 10000, method: "gateway", reason: "Damaged box" })).json();
    expect(detail.refunds[0]).toMatchObject({ status: "failed", failureReason: expect.stringContaining("simulated") });
    expect(detail.needsAttention).toContain("refund failed");
    expect(detail.order.refundedTotal.amount).toBe(0);

    const retried = (await owner.request("POST", `/v1/admin/orders/${order.id}/refunds/${detail.refunds[0].id}/retry`)).json();
    expect(retried.refunds.map((r: { status: string }) => r.status)).toEqual(["processed", "failed"]);
    const resolved = (await owner.request("POST", `/v1/admin/orders/${order.id}/resolve-attention`, { note: "Retried successfully" })).json();
    expect(resolved.needsAttention).toBeNull();
  });

  it("cash refunds need collected COD cash and a note", async () => {
    const { order } = await paidOrder("partial_cod");
    const cash = (amountPaise: number, note: string | null = "UPI ref 42") => owner.request("POST", `/v1/admin/orders/${order.id}/refunds`, { amountPaise, method: "manual", reason: "Returned item", note });
    expect(problem(await cash(1000)).detail).toContain("No cash has been collected");
    await ctx.db.update(orders).set({ codCollectedPaise: order.codBalance.amount }).where(eq(orders.id, order.id));
    expect(problem(await cash(1000, null)).errors![0]!.path).toBe("note");
    const ok = (await cash(1000)).json();
    expect(ok.refunds[0]).toMatchObject({ method: "manual", status: "processed", note: "UPI ref 42", createdBy: "Test owner" });
  });

  it("applies Razorpay refund webhooks once", async () => {
    const { order } = await paidOrder();
    await owner.request("POST", `/v1/admin/orders/${order.id}/refunds`, { amountPaise: 5000, method: "gateway", reason: "Partial" });
    const [refund] = await ctx.db.select().from(refunds);
    await ctx.db.update(refunds).set({ status: "pending" }).where(eq(refunds.id, refund!.id));
    const body = JSON.stringify({ event: "refund.processed", payload: { refund: { entity: { id: refund!.providerRefundId, status: "processed" } } } });
    const send = () => ctx.app.inject({ method: "POST", url: "/v1/webhooks/razorpay", headers: { "content-type": "application/json", "x-razorpay-event-id": "evt_refund_1", "x-razorpay-signature": (ctx.payments as DevGateway).signWebhook(body) }, payload: body });
    expect((await send()).json()).toEqual({ result: "refund_processed" });
    expect((await send()).json()).toEqual({ result: "duplicate" });
  });

  it("only the owner can cancel paid orders or refund; operations can run fulfilment", async () => {
    const { order } = await paidOrder();
    await createStaff(ctx.db, "operations");
    const ops = await signIn(ctx.app, "operations@kleawip.test");
    expect((await ops.request("POST", `/v1/admin/orders/${order.id}/fulfilment`, { fulfilmentStatus: "processing" })).statusCode).toBe(200);
    expect((await ops.request("POST", `/v1/admin/orders/${order.id}/cancel`, { reason: "nope" })).statusCode).toBe(403);
    expect((await ops.request("POST", `/v1/admin/orders/${order.id}/refunds`, { amountPaise: 100, method: "gateway", reason: "nope" })).statusCode).toBe(403);
  });
});
