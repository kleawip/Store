import { DashboardResponse, PlaceOrderResponse } from "@kleawip/contract";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { orders, variants } from "../src/db/schema";
import { seedDemoCatalogue } from "../src/db/seed-demo";
import { addVariantFixture } from "./fixtures";
import { createStaff, createTestApp, customerSignIn, resetStaffAndAudit, signIn } from "./helpers";

let ctx: Awaited<ReturnType<typeof createTestApp>>;

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
  await addVariantFixture(ctx.db, { onHand: 10 });
  await ctx.db.update(variants).set({ taxRateBasisPoints: 1200 });
});

async function placeOrder(phone: string, pay: boolean) {
  const customer = await customerSignIn(ctx, phone);
  await customer.call("PATCH", "/v1/store/me", { name: `Customer ${phone.slice(-4)}` });
  await customer.call("PUT", "/v1/store/cart/lines/DEMO-SKU-A", { quantity: 2 });
  const { id: addressId } = (await customer.call("POST", "/v1/store/me/addresses", { name: "Priya", phone, line1: "12 MG Road", city: "Pune", stateCode: "MH", pincode: "411001" })).json();
  const quote = (await customer.call("POST", "/v1/store/checkout/quote", { addressId, paymentMethod: "partial_cod" })).json();
  const placed = PlaceOrderResponse.parse((await ctx.app.inject({ method: "POST", url: "/v1/store/orders", headers: { "x-kleawip-client": "s", "idempotency-key": randomUUID() }, cookies: { klw_session: customer.cookie }, payload: { quoteId: quote.quoteId } })).json());
  if (pay) {
    const handler = (await ctx.app.inject({ method: "POST", url: `/v1/dev/payments/${placed.payment!.providerOrderId}/succeed` })).json();
    await customer.call("POST", `/v1/store/orders/${placed.order.id}/payments/verify`, handler);
  }
  return placed.order;
}

describe("admin orders", () => {
  it("lists orders with customer, payment state and filters; shows detail with payments and timeline", async () => {
    await createStaff(ctx.db, "operations");
    const staff = await signIn(ctx.app, "operations@kleawip.test");
    const paid = await placeOrder("9876543210", true);
    const unpaid = await placeOrder("9123456780", false);

    const all = (await staff.request("GET", "/v1/admin/orders")).json();
    expect(all.totalCount).toBe(2);
    expect(all.data.map((o: { number: string; paymentStatus: string }) => [o.number, o.paymentStatus])).toEqual([[unpaid.number, "awaiting"], [paid.number, "paid"]]);
    expect(all.data[1]).toMatchObject({ customer: { phone: "+919876543210", name: "Customer 3210" }, itemCount: 2, paymentMethod: "partial_cod" });

    expect((await staff.request("GET", "/v1/admin/orders?status=confirmed")).json().data).toHaveLength(1);
    expect((await staff.request("GET", `/v1/admin/orders?q=${paid.number}`)).json().data[0].id).toBe(paid.id);
    expect((await staff.request("GET", "/v1/admin/orders?q=9123456780")).json().data[0].id).toBe(unpaid.id);

    const detail = (await staff.request("GET", `/v1/admin/orders/${paid.id}`)).json();
    expect(detail.order).toMatchObject({ status: "confirmed", codBalance: { amount: expect.any(Number) } });
    expect(detail.payments).toEqual([expect.objectContaining({ provider: "dev", purpose: "deposit", status: "captured" })]);
    const timeline = (await staff.request("GET", `/v1/admin/timeline/order/${paid.id}`)).json().data;
    expect(timeline.map((e: { action: string }) => e.action)).toEqual(["order.confirmed", "order.placed"]);
  });

  it("surfaces orders that need attention", async () => {
    await createStaff(ctx.db, "owner");
    const owner = await signIn(ctx.app, "owner@kleawip.test");
    const order = await placeOrder("9876543210", true);
    await ctx.db.update(orders).set({ needsAttention: "A second payment was captured for this order. Refund the duplicate." }).where(eq(orders.id, order.id));
    const flagged = (await owner.request("GET", "/v1/admin/orders?needsAttention=true")).json().data;
    expect(flagged).toEqual([expect.objectContaining({ id: order.id, needsAttention: expect.stringContaining("Refund") })]);
    const dashboard = DashboardResponse.parse((await owner.request("GET", "/v1/admin/dashboard")).json());
    expect(dashboard.orders).toEqual({ confirmedToday: 1, awaitingPayment: 0, needsAttention: 1 });
  });

  it("keeps customer data from roles that don't serve customers", async () => {
    const order = await placeOrder("9876543210", false);
    for (const role of ["viewer", "catalogue_manager", "marketing_editor"] as const) {
      await createStaff(ctx.db, role);
      const staff = await signIn(ctx.app, `${role}@kleawip.test`);
      expect((await staff.request("GET", "/v1/admin/orders")).statusCode, role).toBe(403);
      expect((await staff.request("GET", `/v1/admin/orders/${order.id}`)).statusCode, role).toBe(403);
      expect((await staff.request("GET", `/v1/admin/timeline/order/${order.id}`)).statusCode, role).toBe(403);
    }
    await createStaff(ctx.db, "support");
    expect((await (await signIn(ctx.app, "support@kleawip.test")).request("GET", "/v1/admin/orders")).statusCode).toBe(200);
  });
});
