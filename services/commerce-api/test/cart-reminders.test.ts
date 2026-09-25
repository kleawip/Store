import { CartReminderReport, Customer, PlaceOrderResponse } from "@kleawip/contract";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cartLines, customers, notifications, variants } from "../src/db/schema";
import { seedDemoCatalogue } from "../src/db/seed-demo";
import { queueCartReminders } from "../src/marketing/cart-reminders";
import { deliverDueNotifications } from "../src/notifications/outbox";
import { MemoryNotificationSender } from "../src/notifications/senders";
import { addVariantFixture } from "./fixtures";
import { createStaff, createTestApp, customerSignIn, resetStaffAndAudit, signIn, STORE_CLIENT } from "./helpers";

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let owner: Awaited<ReturnType<typeof signIn>>;
// 12:00 India time: inside sending hours.
const NOON_IST = new Date("2026-09-25T06:30:00Z");
const STOREFRONT = "https://kleawip.example";
const run = (now = NOON_IST) => queueCartReminders(ctx.db, { storefrontUrl: STOREFRONT, now });

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
  await addVariantFixture(ctx.db, { onHand: 20 });
  await ctx.db.update(variants).set({ taxRateBasisPoints: 1200 });
  await createStaff(ctx.db, "owner");
  owner = await signIn(ctx.app, "owner@kleawip.test");
});

/** A signed-in shopper with a bag last touched 3 hours before noon. */
async function shopperWithBag(phone = "9876543210", optIn = true) {
  const customer = await customerSignIn(ctx, phone);
  await customer.call("PATCH", "/v1/store/me", { name: "Priya Sharma", ...(optIn ? { marketingOptIn: true, marketingOptInSource: "checkout" } : {}) });
  await customer.call("PUT", "/v1/store/cart/lines/DEMO-SKU-A", { quantity: 1 });
  await customer.call("PUT", "/v1/store/cart/lines/DEMO-SKU-B", { quantity: 1 });
  await ctx.db.update(cartLines).set({ updatedAt: new Date(NOON_IST.getTime() - 3 * 60 * 60_000) });
  return customer;
}
const enable = () => owner.request("PATCH", "/v1/admin/settings", { cartRemindersEnabled: true });

describe("marketing consent", () => {
  it("is off by default, recorded when turned on, and one-click unsubscribe turns it off", async () => {
    const customer = await customerSignIn(ctx);
    expect(Customer.parse((await customer.call("GET", "/v1/store/me")).json()).marketingOptIn).toBe(false);
    const on = Customer.parse((await customer.call("PATCH", "/v1/store/me", { marketingOptIn: true, marketingOptInSource: "checkout" })).json());
    expect(on.marketingOptIn).toBe(true);
    const [row] = await ctx.db.select().from(customers).where(eq(customers.id, customer.customerId));
    expect(row).toMatchObject({ marketingOptInSource: "checkout" });
    expect(row!.unsubscribeToken).toMatch(/^[A-Za-z0-9_-]{30,}$/);

    const unsubscribe = (token: string, headers: Record<string, string> = STORE_CLIENT) => ctx.app.inject({ method: "POST", url: "/v1/store/unsubscribe", headers, payload: { token } });
    expect((await unsubscribe("x".repeat(32))).json()).toEqual({ unsubscribed: true }); // unknown token: same answer
    expect((await unsubscribe(row!.unsubscribeToken!, {})).statusCode).toBe(403);
    expect((await unsubscribe(row!.unsubscribeToken!)).json()).toEqual({ unsubscribed: true });
    expect(Customer.parse((await customer.call("GET", "/v1/store/me")).json()).marketingOptIn).toBe(false);
  });
});

describe("cart reminders", () => {
  it("do nothing until the owner switches them on", async () => {
    await shopperWithBag();
    expect(await run()).toBe(0);
    expect((await enable()).json()).toMatchObject({ cartRemindersEnabled: true });
    expect(await run()).toBe(1);
  });

  it("go once per cooldown, only to opted-in customers, only in daytime, with the bag link and unsubscribe link", async () => {
    await enable();
    await shopperWithBag("9876500001");
    await shopperWithBag("9876500002", false);
    await ctx.db.update(customers).set({ email: "priya@example.com" }).where(eq(customers.phone, "+919876500001"));
    await ctx.db.update(cartLines).set({ updatedAt: new Date(NOON_IST.getTime() - 3 * 60 * 60_000) });

    expect(await run(new Date("2026-09-25T17:30:00Z"))).toBe(0); // 23:00 IST
    expect(await run()).toBe(1);
    expect(await run()).toBe(0); // cooldown

    const sender = new MemoryNotificationSender();
    await deliverDueNotifications(ctx.db, sender);
    const whatsapp = sender.sent.find((message) => message.channel === "whatsapp")!;
    expect(whatsapp.whatsapp).toMatchObject({ template: "kleawip_cart_reminder" });
    expect(whatsapp.whatsapp.variables[0]).toBe("Priya");
    expect(whatsapp.whatsapp.variables[1]).toContain("and 1 more item");
    expect(whatsapp.whatsapp.variables[2]).toBe(`${STOREFRONT}/bag?utm_source=reminder&utm_medium=cart_reminder`);
    const email = sender.sent.find((message) => message.channel === "email")!;
    expect(email.email.text).toMatch(new RegExp(`${STOREFRONT}/unsubscribe\\?token=[A-Za-z0-9_-]{30,}`));
  });

  it("skip bags that are too fresh, and customers who ordered since changing the bag", async () => {
    await enable();
    const customer = await shopperWithBag();
    expect(await run(new Date(NOON_IST.getTime() - 2 * 60 * 60_000))).toBe(0); // only 1 h old then

    const { id: addressId } = (await customer.call("POST", "/v1/store/me/addresses", { name: "Priya", phone: "9876543210", line1: "12 MG Road", city: "Pune", stateCode: "MH", pincode: "411001" })).json();
    const quote = (await customer.call("POST", "/v1/store/checkout/quote", { addressId, paymentMethod: "prepaid" })).json();
    await ctx.app.inject({ method: "POST", url: "/v1/store/orders", headers: { "x-kleawip-client": "s", "idempotency-key": randomUUID() }, cookies: { klw_session: customer.cookie }, payload: { quoteId: quote.quoteId } });
    expect(await run(new Date(Date.now() + 60_000))).toBe(0);
  });

  it("a customer who unsubscribes before sending isn't messaged", async () => {
    await enable();
    const customer = await shopperWithBag();
    expect(await run()).toBe(1);
    await customer.call("PATCH", "/v1/store/me", { marketingOptIn: false });
    const sender = new MemoryNotificationSender();
    await deliverDueNotifications(ctx.db, sender);
    expect(sender.sent).toHaveLength(0);
    expect((await ctx.db.select().from(notifications))[0]).toMatchObject({ status: "skipped" });
  });

  it("the owner report counts reminders and the paid orders that followed", async () => {
    await enable();
    const customer = await shopperWithBag();
    await run();
    await deliverDueNotifications(ctx.db, new MemoryNotificationSender());

    const { id: addressId } = (await customer.call("POST", "/v1/store/me/addresses", { name: "Priya", phone: "9876543210", line1: "12 MG Road", city: "Pune", stateCode: "MH", pincode: "411001" })).json();
    const quote = (await customer.call("POST", "/v1/store/checkout/quote", { addressId, paymentMethod: "prepaid" })).json();
    const placed = PlaceOrderResponse.parse((await ctx.app.inject({ method: "POST", url: "/v1/store/orders", headers: { "x-kleawip-client": "s", "idempotency-key": randomUUID() }, cookies: { klw_session: customer.cookie }, payload: { quoteId: quote.quoteId } })).json());
    const handler = (await ctx.app.inject({ method: "POST", url: `/v1/dev/payments/${placed.payment!.providerOrderId}/succeed` })).json();
    await customer.call("POST", `/v1/store/orders/${placed.order.id}/payments/verify`, handler);

    const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    const report = CartReminderReport.parse((await owner.request("GET", `/v1/admin/reports/cart-reminders?from=${today}&to=${today}`)).json());
    expect(report).toMatchObject({ messagesSent: 1, customersReminded: 1, recoveredOrders: 1, recoveredSales: { amount: placed.order.total.amount } });
  });
});
