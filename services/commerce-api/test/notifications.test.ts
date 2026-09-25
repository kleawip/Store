import { PlaceOrderResponse } from "@kleawip/contract";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { customers, notifications, variants } from "../src/db/schema";
import { seedDemoCatalogue } from "../src/db/seed-demo";
import { deliverDueNotifications, RETRY_DELAYS_MS } from "../src/notifications/outbox";
import { MemoryNotificationSender } from "../src/notifications/senders";
import { renderNotification } from "../src/notifications/templates";
import { addVariantFixture } from "./fixtures";
import { createStaff, createTestApp, customerSignIn, resetStaffAndAudit, signIn, TEST_COURIER_TOKEN } from "./helpers";

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let owner: Awaited<ReturnType<typeof signIn>>;
let sender: MemoryNotificationSender;

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
  await addVariantFixture(ctx.db, { onHand: 10 });
  await ctx.db.update(variants).set({ taxRateBasisPoints: 1200 });
  await createStaff(ctx.db, "owner");
  owner = await signIn(ctx.app, "owner@kleawip.test");
  await owner.request("PUT", "/v1/admin/settings/seller", SELLER);
  sender = new MemoryNotificationSender();
});

const deliver = (now = new Date()) => deliverDueNotifications(ctx.db, sender, now);
const rows = () => ctx.db.select().from(notifications).orderBy(notifications.createdAt);
const track = (awb: string, status: string, when: string) =>
  ctx.app.inject({ method: "POST", url: "/v1/webhooks/courier", headers: { "x-api-key": TEST_COURIER_TOKEN }, payload: { awb, current_status: status, current_timestamp: when } });

async function paidOrder(paymentMethod: "prepaid" | "partial_cod" = "prepaid") {
  const customer = await customerSignIn(ctx);
  await ctx.db.update(customers).set({ name: "Priya Sharma" }).where(eq(customers.id, customer.customerId));
  await customer.call("PUT", "/v1/store/cart/lines/DEMO-SKU-A", { quantity: 2 });
  const { id: addressId } = (await customer.call("POST", "/v1/store/me/addresses", { name: "Priya", phone: "9876543210", line1: "12 MG Road", city: "Pune", stateCode: "MH", pincode: "411001" })).json();
  const quote = (await customer.call("POST", "/v1/store/checkout/quote", { addressId, paymentMethod })).json();
  const placed = PlaceOrderResponse.parse((await ctx.app.inject({ method: "POST", url: "/v1/store/orders", headers: { "x-kleawip-client": "s", "idempotency-key": randomUUID() }, cookies: { klw_session: customer.cookie }, payload: { quoteId: quote.quoteId } })).json());
  const handler = (await ctx.app.inject({ method: "POST", url: `/v1/dev/payments/${placed.payment!.providerOrderId}/succeed` })).json();
  await customer.call("POST", `/v1/store/orders/${placed.order.id}/payments/verify`, handler);
  // A second confirmation path (e.g. the webhook after the handler) must not add a second message.
  await customer.call("POST", `/v1/store/orders/${placed.order.id}/payments/verify`, handler);
  return { ...placed, customer };
}

describe("order messages", () => {
  it("confirmation goes out once by WhatsApp, and by email too when the customer has one", async () => {
    const { order } = await paidOrder("partial_cod");
    expect(await rows()).toHaveLength(1);
    expect(await deliver()).toBe(1);
    expect(sender.sent[0]).toMatchObject({ channel: "whatsapp", to: "+919876543210", whatsapp: { template: "kleawip_order_confirmed" } });
    expect(sender.sent[0]!.whatsapp.variables.slice(0, 2)).toEqual(["Priya", order.number]);
    expect(sender.sent[0]!.whatsapp.variables[3]).toMatch(/^₹/); // COD balance to keep ready
    expect((await rows())[0]).toMatchObject({ status: "sent", attempts: 1, providerMessageId: "mem_1" });
    expect(await deliver()).toBe(0);

    await ctx.db.update(customers).set({ email: "priya@example.com" });
    const again = await paidOrder();
    const mine = (await rows()).filter((row) => row.orderId === again.order.id);
    expect(mine.map((row) => row.channel).sort()).toEqual(["email", "whatsapp"]);
  });

  it("shipping updates: shipped, out for delivery, delivered — each once", async () => {
    const { order } = await paidOrder();
    const awb = (await owner.request("POST", `/v1/admin/orders/${order.id}/shipment`, {})).json().shipments[0].awb;
    await track(awb, "PICKED UP", "2026-09-26 10:00:00");
    await track(awb, "IN TRANSIT", "2026-09-26 12:00:00");
    await track(awb, "OUT FOR DELIVERY", "2026-09-27 09:00:00");
    await track(awb, "DELIVERED", "2026-09-27 14:00:00");
    await track(awb, "DELIVERED", "2026-09-27 14:00:00");
    await deliver();
    expect(sender.sent.map((message) => message.whatsapp.template)).toEqual(["kleawip_order_confirmed", "kleawip_order_shipped", "kleawip_out_for_delivery", "kleawip_order_delivered"]);
    expect(sender.sent[1]!.whatsapp.variables).toContain(awb);
  });

  it("staff cancellation tells the customer about the refund", async () => {
    const { order } = await paidOrder();
    await owner.request("POST", `/v1/admin/orders/${order.id}/cancel`, { reason: "Out of stock" });
    await deliver();
    const cancelled = sender.sent.find((message) => message.whatsapp.template === "kleawip_order_cancelled")!;
    expect(cancelled.whatsapp.variables[2]).toMatch(/^₹/);
    expect(cancelled.email.text).toContain("refund");
  });
});

describe("delivery worker", () => {
  it("retries with backoff, then marks failed; staff can retry", async () => {
    const { order } = await paidOrder();
    sender.failing = true;
    let now = new Date();
    for (let attempt = 1; attempt <= RETRY_DELAYS_MS.length + 1; attempt += 1) {
      expect(await deliver(now)).toBe(1);
      const [row] = await rows();
      expect(row!.attempts).toBe(attempt);
      if (attempt <= RETRY_DELAYS_MS.length) {
        expect(row!.status).toBe("pending");
        expect(row!.nextAttemptAt.getTime()).toBe(now.getTime() + RETRY_DELAYS_MS[attempt - 1]!);
        expect(await deliver(now)).toBe(0); // not due yet
        now = new Date(row!.nextAttemptAt.getTime());
      }
    }
    const [failed] = await rows();
    expect(failed).toMatchObject({ status: "failed", lastError: "simulated failure" });

    const listed = (await owner.request("GET", "/v1/admin/notifications?status=failed")).json().data;
    expect(listed).toEqual([expect.objectContaining({ id: failed!.id, recipient: "••••3210", event: "order_confirmed" })]);
    expect((await owner.request("GET", `/v1/admin/orders/${order.id}`)).json().notifications[0].status).toBe("failed");

    expect((await owner.request("POST", `/v1/admin/notifications/${failed!.id}/retry`)).statusCode).toBe(200);
    sender.failing = false;
    await deliver();
    expect((await rows())[0]).toMatchObject({ status: "sent" });
    expect((await owner.request("POST", `/v1/admin/notifications/${failed!.id}/retry`)).statusCode).toBe(404);
  });

  it("skips channels with no sender and never double-sends under concurrent workers", async () => {
    await paidOrder();
    await ctx.db.update(customers).set({ email: "priya@example.com" });
    await paidOrder();
    sender.channels = ["whatsapp"];
    const [a, b] = await Promise.all([deliver(), deliver()]);
    expect(a + b).toBe(3);
    expect(sender.sent).toHaveLength(2);
    expect((await rows()).find((row) => row.channel === "email")).toMatchObject({ status: "skipped" });
  });
});

describe("templates", () => {
  it("renders every event with first names and amounts", () => {
    const base = { name: "Ravi Kumar", orderNumber: "KLW100001" };
    expect(renderNotification("order_confirmed", { ...base, total: "₹999.00", codBalance: null }).email.text).toContain("Hi Ravi,");
    expect(renderNotification("return_update", { ...base, returnNumber: "RET100001", returnStatus: "rejected", detail: "Used item" }).email.text).toContain("Used item");
    expect(renderNotification("return_update", { ...base, returnNumber: "RET100001", returnStatus: "refunded", refund: "₹500.00" }).whatsapp.template).toBe("kleawip_return_refunded");
    expect(renderNotification("order_delivered", { ...base, name: "" }).email.text).toContain("Hi there,");
  });
});
