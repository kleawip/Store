import { GstReport, PlaceOrderResponse, Problem, SalesReport } from "@kleawip/contract";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { customers, variants } from "../src/db/schema";
import { seedDemoCatalogue } from "../src/db/seed-demo";
import { addVariantFixture } from "./fixtures";
import { createStaff, createTestApp, customerSignIn, resetStaffAndAudit, signIn, TEST_COURIER_TOKEN } from "./helpers";

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let owner: Awaited<ReturnType<typeof signIn>>;

const SELLER = { legalName: "Kleawip Test Pvt Ltd", gstin: "27ABCDE1234F1Z5", line1: "Unit 4", city: "Mumbai", stateCode: "MH", pincode: "400001" };
const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const istNow = (offsetMinutes = 0) => new Date(Date.now() + 330 * 60_000 + offsetMinutes * 60_000).toISOString().slice(0, 19).replace("T", " ");

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await resetStaffAndAudit(ctx.db);
  await ctx.db.execute(sql`TRUNCATE customers, otp_challenges, carts, payment_events, invoice_sequences, discounts RESTART IDENTITY CASCADE`);
  await seedDemoCatalogue(ctx.db);
  await addVariantFixture(ctx.db, { onHand: 50 });
  await ctx.db.update(variants).set({ taxRateBasisPoints: 1200, hsnCode: "6302" });
  await createStaff(ctx.db, "owner");
  owner = await signIn(ctx.app, "owner@kleawip.test");
  await owner.request("PUT", "/v1/admin/settings/seller", SELLER);
});

const problem = (res: { json: () => unknown }) => Problem.parse(res.json());

async function paidOrder(phone: string, opts: { stateCode?: string; discountCode?: string; name?: string } = {}) {
  const customer = await customerSignIn(ctx, phone);
  await customer.call("PUT", "/v1/store/cart/lines/DEMO-SKU-A", { quantity: 2 });
  const { id: addressId } = (await customer.call("POST", "/v1/store/me/addresses", { name: opts.name ?? "Priya", phone, line1: "12 MG Road", city: "Pune", stateCode: opts.stateCode ?? "MH", pincode: "411001" })).json();
  const quote = (await customer.call("POST", "/v1/store/checkout/quote", { addressId, paymentMethod: "prepaid", ...(opts.discountCode ? { discountCode: opts.discountCode } : {}) })).json();
  const placed = PlaceOrderResponse.parse((await ctx.app.inject({ method: "POST", url: "/v1/store/orders", headers: { "x-kleawip-client": "s", "idempotency-key": randomUUID() }, cookies: { klw_session: customer.cookie }, payload: { quoteId: quote.quoteId } })).json());
  const handler = (await ctx.app.inject({ method: "POST", url: `/v1/dev/payments/${placed.payment!.providerOrderId}/succeed` })).json();
  await customer.call("POST", `/v1/store/orders/${placed.order.id}/payments/verify`, handler);
  return { order: placed.order, customer };
}

describe("sales report", () => {
  it("counts confirmed orders, discounts and refunds by day and month", async () => {
    await owner.request("POST", "/v1/admin/discounts", { code: "SAVE10", kind: "percentage", percent: 10 });
    const a = await paidOrder("9876500001");
    const b = await paidOrder("9876500002", { discountCode: "SAVE10" });
    await owner.request("POST", `/v1/admin/orders/${a.order.id}/cancel`, { reason: "Customer asked" });

    const res = await owner.request("GET", `/v1/admin/reports/sales?from=${today}&to=${today}`);
    expect(res.statusCode, res.body).toBe(200);
    const report = SalesReport.parse(res.json());
    expect(report.rows).toHaveLength(1);
    expect(report.totals).toMatchObject({
      orders: 2,
      units: 4,
      grossSales: { amount: 49900 * 4 },
      discounts: { amount: 9980 },
      totalSales: { amount: a.order.total.amount + b.order.total.amount },
      refunds: { amount: a.order.total.amount },
      netSales: { amount: b.order.total.amount },
    });
    expect(report.totals.averageOrderValue.amount).toBe(Math.round((a.order.total.amount + b.order.total.amount) / 2));

    const monthly = SalesReport.parse((await owner.request("GET", `/v1/admin/reports/sales?from=${today}&to=${today}&groupBy=month`)).json());
    expect(monthly.rows[0]!.period).toBe(today.slice(0, 7));

    const products = (await owner.request("GET", `/v1/admin/reports/products?from=${today}&to=${today}`)).json();
    expect(products.rows[0]).toMatchObject({ sku: "DEMO-SKU-A", units: 4, orders: 2 });
  });

  it("validates ranges and is owner-only", async () => {
    expect(problem(await owner.request("GET", "/v1/admin/reports/sales?from=2026-09-10&to=2026-09-01")).errors![0]!.code).toBe("invalid_range");
    expect(problem(await owner.request("GET", "/v1/admin/reports/sales?from=2025-01-01&to=2026-09-01")).errors![0]!.code).toBe("invalid_range");
    expect((await owner.request("GET", "/v1/admin/reports/sales?from=2026-9-1&to=2026-09-01")).statusCode).toBe(422);
    await createStaff(ctx.db, "operations");
    const ops = await signIn(ctx.app, "operations@kleawip.test");
    expect((await ops.request("GET", `/v1/admin/reports/sales?from=${today}&to=${today}`)).statusCode).toBe(403);
  });
});

describe("GST report", () => {
  it("adds invoices, subtracts credit notes, lists cancelled invoices without counting them, exports CSV", async () => {
    // A: invoiced (intra-state). B: invoiced, then shipment and order cancelled. C: other state, delivered, returned and refunded.
    const a = await paidOrder("9876500001", { name: "=HYPERLINK(\"http://x\")" });
    const b = await paidOrder("9876500002");
    const c = await paidOrder("9876500003", { stateCode: "KA" });
    await owner.request("POST", `/v1/admin/orders/${a.order.id}/shipment`, {});
    await owner.request("POST", `/v1/admin/orders/${b.order.id}/shipment`, {});
    await owner.request("POST", `/v1/admin/orders/${b.order.id}/shipment/cancel`);
    await owner.request("POST", `/v1/admin/orders/${b.order.id}/cancel`, { reason: "Duplicate" });
    const awb = (await owner.request("POST", `/v1/admin/orders/${c.order.id}/shipment`, {})).json().shipments[0].awb;
    const track = (status: string, when: string) => ctx.app.inject({ method: "POST", url: "/v1/webhooks/courier", headers: { "x-api-key": TEST_COURIER_TOKEN }, payload: { awb, current_status: status, current_timestamp: when } });
    await track("PICKED UP", istNow(-60));
    await track("DELIVERED", istNow(-30));
    const ret = (await c.customer.call("POST", `/v1/store/orders/${c.order.id}/returns`, { lines: [{ sku: "DEMO-SKU-A", quantity: 1 }], reason: "damaged" })).json();
    await owner.request("POST", `/v1/admin/returns/${ret.id}/approve`, {});
    await owner.request("POST", `/v1/admin/returns/${ret.id}/receive`, {});
    await owner.request("POST", `/v1/admin/returns/${ret.id}/refund`, { method: "gateway" });

    const res = await owner.request("GET", `/v1/admin/reports/gst?from=${today}&to=${today}`);
    expect(res.statusCode, res.body).toBe(200);
    const report = GstReport.parse(res.json());
    expect(report.totals).toMatchObject({ invoices: 2, cancelledInvoices: 1, creditNotes: 1 });
    expect(report.documents.map((doc) => `${doc.kind}:${doc.status}`).sort()).toEqual(["credit_note:issued", "invoice:cancelled", "invoice:issued", "invoice:issued"]);
    // One and a half orders' worth of goods remain (A in full + half of C), incl. GST.
    expect(report.totals.total.amount).toBe(49900 * 2 + 49900);
    expect(report.hsnSummary).toEqual([expect.objectContaining({ hsnCode: "6302", gstRatePercent: 12, quantity: 3 })]);
    expect(report.totals.cgst.amount).toBeGreaterThan(0); // Maharashtra buyer
    expect(report.totals.igst.amount).toBeGreaterThan(0); // Karnataka buyer
    expect(report.stateSummary.map((row) => row.placeOfSupply)).toEqual(["Karnataka (29)", "Maharashtra (27)"]);

    const csv = await owner.request("GET", `/v1/admin/reports/gst?from=${today}&to=${today}&format=csv`);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.headers["content-disposition"]).toContain(`kleawip-gst-documents-${today}`);
    expect(csv.body.startsWith("﻿\"Type\",\"Number\"")).toBe(true);
    expect(csv.body).toContain(`"'=HYPERLINK(""http://x"")"`); // formula neutralised
    const hsnCsv = await owner.request("GET", `/v1/admin/reports/gst?from=${today}&to=${today}&format=csv&section=hsn`);
    expect(hsnCsv.body.split("\r\n")[1]).toContain('"6302","12","3"');
    expect(await ctx.db.select().from(customers).where(eq(customers.phone, "+919876500001"))).toHaveLength(1);
  });
});
