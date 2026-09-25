import { PlaceOrderResponse, Problem } from "@kleawip/contract";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inventoryItems, variants } from "../src/db/schema";
import { seedDemoCatalogue } from "../src/db/seed-demo";
import { amountInWords } from "../src/invoices/render";
import { financialYear } from "../src/invoices/service";
import { MockShippingProvider, ShippingRejectedError, ShippingUnavailableError, ShiprocketProvider } from "../src/shipping/provider";
import { mapCourierStatus, parseShiprocketTracking } from "../src/shipping/shipments";
import { addVariantFixture } from "./fixtures";
import { createStaff, createTestApp, customerSignIn, resetStaffAndAudit, signIn, TEST_COURIER_TOKEN } from "./helpers";

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let owner: Awaited<ReturnType<typeof signIn>>;
let stockItem: string;
const courier = () => ctx.shipping as MockShippingProvider;

const SELLER = { legalName: "Kleawip Test Pvt Ltd", tradeName: "Kleawip", gstin: "27ABCDE1234F1Z5", line1: "Unit 4, Test Estate", city: "Mumbai", stateCode: "MH", pincode: "400001" };

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
  courier().failNext = null;
  courier().calls.length = 0;
});

const problem = (res: { json: () => unknown }) => Problem.parse(res.json());
const stock = async () => (await ctx.db.select().from(inventoryItems).where(eq(inventoryItems.id, stockItem)))[0]!;
const setSeller = () => owner.request("PUT", "/v1/admin/settings/seller", SELLER);

async function paidOrder(paymentMethod: "prepaid" | "partial_cod" = "prepaid", phone = "9876543210", stateCode = "MH", name = "Priya") {
  const customer = await customerSignIn(ctx, phone);
  await customer.call("PUT", "/v1/store/cart/lines/DEMO-SKU-A", { quantity: 2 });
  const { id: addressId } = (await customer.call("POST", "/v1/store/me/addresses", { name, phone, line1: "12 MG Road", city: "Pune", stateCode, pincode: "411001" })).json();
  const quote = (await customer.call("POST", "/v1/store/checkout/quote", { addressId, paymentMethod })).json();
  const placed = PlaceOrderResponse.parse((await ctx.app.inject({ method: "POST", url: "/v1/store/orders", headers: { "x-kleawip-client": "s", "idempotency-key": randomUUID() }, cookies: { klw_session: customer.cookie }, payload: { quoteId: quote.quoteId } })).json());
  const handler = (await ctx.app.inject({ method: "POST", url: `/v1/dev/payments/${placed.payment!.providerOrderId}/succeed` })).json();
  await customer.call("POST", `/v1/store/orders/${placed.order.id}/payments/verify`, handler);
  return { ...placed, customer };
}

const book = (orderId: string, body: object = {}) => owner.request("POST", `/v1/admin/orders/${orderId}/shipment`, body);
const track = (awb: string, status: string, when = "2026-09-26 10:00:00", token = TEST_COURIER_TOKEN) =>
  ctx.app.inject({ method: "POST", url: "/v1/webhooks/courier", headers: { "x-api-key": token }, payload: { awb, current_status: status, current_timestamp: when, scans: [{ location: "Pune Hub" }] } });

describe("seller details", () => {
  it("are owner-only and must match the seller state and GSTIN prefix", async () => {
    expect((await owner.request("GET", "/v1/admin/settings/seller")).json()).toEqual({ seller: null, sellerStateCode: "MH" });
    expect(problem(await owner.request("PUT", "/v1/admin/settings/seller", { ...SELLER, stateCode: "KA" })).errors![0]!.code).toBe("state_mismatch");
    expect(problem(await owner.request("PUT", "/v1/admin/settings/seller", { ...SELLER, gstin: "29ABCDE1234F1Z5" })).errors![0]!.path).toBe("gstin");
    expect((await setSeller()).statusCode).toBe(200);
    await createStaff(ctx.db, "operations");
    const ops = await signIn(ctx.app, "operations@kleawip.test");
    expect((await ops.request("PUT", "/v1/admin/settings/seller", SELLER)).statusCode).toBe(403);
    expect((await ops.request("GET", "/v1/admin/settings/seller")).json().seller.gstin).toBe(SELLER.gstin);
  });
});

describe("booking a shipment", () => {
  it("needs seller details first (the parcel needs a tax invoice)", async () => {
    const { order } = await paidOrder();
    expect(problem(await book(order.id)).errors![0]!.code).toBe("seller_details_missing");
  });

  it("books courier order, AWB and label, issues the invoice, and shows tracking to the customer", async () => {
    await setSeller();
    const { order, customer } = await paidOrder();
    const res = await book(order.id, { weightGrams: 1200 });
    expect(res.statusCode, res.body).toBe(201);
    const detail = res.json();
    expect(detail.order.fulfilmentStatus).toBe("packed");
    expect(detail.shipments).toHaveLength(1);
    expect(detail.shipments[0]).toMatchObject({ status: "ready", courierName: "Mock Courier", weightGrams: 1200, lastError: null, dimensionsCm: { length: 30, breadth: 25, height: 10 } });
    expect(detail.shipments[0].awb).toMatch(/^MOCK/);
    expect(detail.invoice).toMatchObject({ number: `KLW/${financialYear(new Date())}/00001`, status: "issued" });
    expect(problem(await book(order.id)).errors![0]!.code).toBe("shipment_active");

    const mine = (await customer.call("GET", `/v1/store/orders/${order.id}`)).json();
    expect(mine.tracking).toMatchObject({ status: "ready", awb: detail.shipments[0].awb, courierName: "Mock Courier" });
    expect(mine.invoice.number).toBe(detail.invoice.number);

    // Partial COD is sent to the courier with only the balance to collect.
    const request = courier().calls.find((call) => call.step === "createShipment")!.arg as { codAmountPaise: number; orderNumber: string };
    expect(request).toMatchObject({ codAmountPaise: 0, orderNumber: order.number });
  });

  it("partial COD: the courier collects only the balance", async () => {
    await setSeller();
    const { order } = await paidOrder("partial_cod");
    expect((await book(order.id)).statusCode).toBe(201);
    const request = courier().calls.find((call) => call.step === "createShipment")!.arg as { codAmountPaise: number; subTotalPaise: number };
    expect(request).toMatchObject({ codAmountPaise: order.codBalance.amount, subTotalPaise: order.total.amount });
  });

  it("a courier outage half-way keeps progress and a retry finishes without a second courier order", async () => {
    await setSeller();
    const { order } = await paidOrder();
    courier().failNext = { step: "assignAwb", kind: "unavailable" };
    const failed = await book(order.id);
    expect(failed.statusCode).toBe(503);
    expect(problem(failed).code).toBe("COURIER_UNAVAILABLE");
    const pending = (await owner.request("GET", `/v1/admin/orders/${order.id}`)).json().shipments[0];
    expect(pending).toMatchObject({ status: "pending", awb: null });
    expect(pending.lastError).toContain("unavailable");

    const retried = await owner.request("POST", `/v1/admin/orders/${order.id}/shipment/retry`);
    expect(retried.statusCode, retried.body).toBe(200);
    expect(retried.json().shipments[0]).toMatchObject({ status: "ready", lastError: null });
    expect(courier().calls.filter((call) => call.step === "createShipment")).toHaveLength(1);
    expect(problem(await owner.request("POST", `/v1/admin/orders/${order.id}/shipment/retry`)).errors![0]!.code).toBe("not_retryable");
  });

  it("reports a courier refusal as a validation error with the courier's reason", async () => {
    await setSeller();
    const { order } = await paidOrder();
    courier().failNext = { step: "createShipment", kind: "rejected" };
    const res = await book(order.id);
    expect(res.statusCode).toBe(422);
    expect(problem(res).errors![0]).toMatchObject({ code: "courier_rejected" });
  });

  it("refuses unpaid orders", async () => {
    await setSeller();
    const customer = await customerSignIn(ctx);
    await customer.call("PUT", "/v1/store/cart/lines/DEMO-SKU-A", { quantity: 1 });
    const { id: addressId } = (await customer.call("POST", "/v1/store/me/addresses", { name: "Priya", phone: "9876543210", line1: "12 MG Road", city: "Pune", stateCode: "MH", pincode: "411001" })).json();
    const quote = (await customer.call("POST", "/v1/store/checkout/quote", { addressId, paymentMethod: "prepaid" })).json();
    const placed = (await ctx.app.inject({ method: "POST", url: "/v1/store/orders", headers: { "x-kleawip-client": "s", "idempotency-key": randomUUID() }, cookies: { klw_session: customer.cookie }, payload: { quoteId: quote.quoteId } })).json();
    expect(problem(await book(placed.order.id)).errors![0]!.code).toBe("not_confirmed");
  });
});

describe("pickup, cancellation and the order's other actions", () => {
  it("requests a pickup, blocks manual steps and order cancel while booked, and re-books after cancelling", async () => {
    await setSeller();
    const { order, customer } = await paidOrder();
    const first = (await book(order.id)).json();
    expect(problem(await owner.request("POST", `/v1/admin/orders/${order.id}/fulfilment`, { fulfilmentStatus: "processing" })).errors![0]!.code).toBe("shipment_active");
    expect(problem(await owner.request("POST", `/v1/admin/orders/${order.id}/cancel`, { reason: "Changed mind" })).errors![0]!.code).toBe("shipment_active");

    const picked = await owner.request("POST", `/v1/admin/orders/${order.id}/shipment/pickup`);
    expect(picked.json().shipments[0].status).toBe("pickup_requested");

    const cancelled = (await owner.request("POST", `/v1/admin/orders/${order.id}/shipment/cancel`)).json();
    expect(cancelled.shipments[0].status).toBe("cancelled");
    expect(cancelled.order).toMatchObject({ fulfilmentStatus: "packed", tracking: null });

    // Re-booking keeps the same invoice.
    const again = (await book(order.id)).json();
    expect(again.shipments).toHaveLength(2);
    expect(again.invoice.number).toBe(first.invoice.number);

    // Cancel the shipment, then the order: the invoice is cancelled (number kept) and no longer offered to the customer.
    await owner.request("POST", `/v1/admin/orders/${order.id}/shipment/cancel`);
    const orderCancelled = (await owner.request("POST", `/v1/admin/orders/${order.id}/cancel`, { reason: "Customer asked" })).json();
    expect(orderCancelled.invoice).toMatchObject({ number: first.invoice.number, status: "cancelled" });
    expect((await customer.call("GET", `/v1/store/orders/${order.id}/invoice`)).statusCode).toBe(404);
    expect((await owner.request("GET", `/v1/admin/orders/${order.id}/invoice`)).body).toContain("CANCELLED");
  });

  it("pickup needs a finished booking; cancel is refused once the courier has the parcel", async () => {
    await setSeller();
    const { order } = await paidOrder();
    expect(problem(await owner.request("POST", `/v1/admin/orders/${order.id}/shipment/pickup`)).errors![0]!.code).toBe("not_ready");
    const awb = (await book(order.id)).json().shipments[0].awb;
    await track(awb, "PICKED UP");
    expect(problem(await owner.request("POST", `/v1/admin/orders/${order.id}/shipment/cancel`)).errors![0]!.code).toBe("already_picked_up");
  });

  it("permissions: operations can ship, support can only look", async () => {
    await setSeller();
    const { order } = await paidOrder();
    await createStaff(ctx.db, "support");
    await createStaff(ctx.db, "operations");
    const support = await signIn(ctx.app, "support@kleawip.test");
    const ops = await signIn(ctx.app, "operations@kleawip.test");
    expect((await support.request("POST", `/v1/admin/orders/${order.id}/shipment`, {})).statusCode).toBe(403);
    expect((await ops.request("POST", `/v1/admin/orders/${order.id}/shipment`, {})).statusCode).toBe(201);
    expect((await support.request("GET", `/v1/admin/orders/${order.id}/invoice`)).statusCode).toBe(200);
  });
});

describe("courier tracking webhook", () => {
  it("moves the order forward, takes stock off the shelf once, ignores duplicates and late updates", async () => {
    await setSeller();
    const { order, customer } = await paidOrder("partial_cod");
    const awb = (await book(order.id)).json().shipments[0].awb;
    expect(await stock()).toMatchObject({ onHand: 10, committed: 2 });

    expect((await track(awb, "PICKED UP", undefined, "wrong-token")).statusCode).toBe(401);
    expect((await track(awb, "PICKED UP")).json().result).toBe("applied");
    expect((await track(awb, "PICKED UP")).json().result).toBe("duplicate");
    expect(await stock()).toMatchObject({ onHand: 8, committed: 0 });
    expect((await track(awb, "IN TRANSIT", "2026-09-26 18:00:00")).json().result).toBe("recorded");
    await track(awb, "OUT FOR DELIVERY", "2026-09-27 09:00:00");
    expect((await track(awb, "DELIVERED", "2026-09-27 14:00:00")).json().result).toBe("applied");
    expect((await track(awb, "IN TRANSIT", "2026-09-27 15:00:00")).json().result).toBe("recorded");
    expect(await stock()).toMatchObject({ onHand: 8, committed: 0 });

    const detail = (await owner.request("GET", `/v1/admin/orders/${order.id}`)).json();
    expect(detail.order.fulfilmentStatus).toBe("delivered");
    expect(detail.codCollected.amount).toBe(order.codBalance.amount);
    expect(detail.shipments[0]).toMatchObject({ status: "delivered", shippedAt: "2026-09-26T04:30:00.000Z", deliveredAt: "2026-09-27T08:30:00.000Z" });
    expect(detail.shipments[0].events[0]).toMatchObject({ status: "IN TRANSIT", location: "Pune Hub" });
    expect((await customer.call("GET", `/v1/store/orders/${order.id}`)).json().tracking.events).toHaveLength(5);
  });

  it("flags failed deliveries and returns to origin for staff", async () => {
    await setSeller();
    const { order } = await paidOrder();
    const awb = (await book(order.id)).json().shipments[0].awb;
    await track(awb, "SHIPPED");
    await track(awb, "UNDELIVERED", "2026-09-26 12:00:00");
    let detail = (await owner.request("GET", `/v1/admin/orders/${order.id}`)).json();
    expect(detail.needsAttention).toContain("Delivery attempt failed");
    expect(detail.order.fulfilmentStatus).toBe("shipped");
    await track(awb, "RTO INITIATED", "2026-09-27 12:00:00");
    await track(awb, "RTO DELIVERED", "2026-09-29 12:00:00");
    detail = (await owner.request("GET", `/v1/admin/orders/${order.id}`)).json();
    expect(detail.order.fulfilmentStatus).toBe("returned_to_origin");
    expect(detail.needsAttention).toContain("back at the warehouse");
  });

  it("answers 200 for unknown AWBs and non-tracking bodies (so the courier stops retrying)", async () => {
    expect((await track("NOPE123", "DELIVERED")).json()).toEqual({ result: "unknown_awb" });
    const odd = await ctx.app.inject({ method: "POST", url: "/v1/webhooks/courier", headers: { "x-api-key": TEST_COURIER_TOKEN }, payload: { hello: "world" } });
    expect(odd.json()).toEqual({ result: "ignored" });
  });

  it("is not mounted without a token", async () => {
    const bare = await createTestApp({ courierWebhookToken: null });
    try {
      expect((await bare.app.inject({ method: "POST", url: "/v1/webhooks/courier", payload: {} })).statusCode).toBe(404);
    } finally {
      await bare.close();
    }
  });
});

describe("GST invoice", () => {
  it("prints seller, buyer, HSN-level tax split and escapes customer text; numbers run consecutively", async () => {
    await setSeller();
    const intra = await paidOrder("prepaid", "9876543210", "MH", "Priya <script>alert(1)</script>");
    const inter = await paidOrder("prepaid", "9876500000", "KA", "Ravi");
    const a = (await book(intra.order.id)).json();
    const b = (await book(inter.order.id)).json();
    const fy = financialYear(new Date());
    expect([a.invoice.number, b.invoice.number]).toEqual([`KLW/${fy}/00001`, `KLW/${fy}/00002`]);

    const html = await owner.request("GET", `/v1/admin/orders/${intra.order.id}/invoice`);
    expect(html.headers["content-type"]).toContain("text/html");
    expect(html.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(html.body).toContain(SELLER.gstin);
    expect(html.body).toContain("CGST");
    expect(html.body).toContain("Priya &lt;script&gt;");
    expect(html.body).not.toContain("<script>");
    const other = await owner.request("GET", `/v1/admin/orders/${inter.order.id}/invoice`);
    expect(other.body).toContain("IGST");
    expect(other.body).toContain("Karnataka (29)");

    // Customers get their own invoice only.
    expect((await inter.customer.call("GET", `/v1/store/orders/${inter.order.id}/invoice`)).statusCode).toBe(200);
    expect((await inter.customer.call("GET", `/v1/store/orders/${intra.order.id}/invoice`)).statusCode).toBe(404);
  });

  it("financial year and amount in words", () => {
    expect(financialYear(new Date("2026-09-25T10:00:00Z"))).toBe("26-27");
    expect(financialYear(new Date("2027-03-31T18:00:00Z"))).toBe("26-27"); // 31 Mar 23:30 IST
    expect(financialYear(new Date("2027-03-31T18:31:00Z"))).toBe("27-28"); // 1 Apr 00:01 IST
    expect(amountInWords(123456789)).toBe("Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven Rupees and Eighty Nine Paise");
    expect(amountInWords(100)).toBe("One Rupees");
    expect(amountInWords(10_00_00_000_00)).toBe("Ten Crore Rupees");
  });
});

describe("courier status mapping and Shiprocket adapter", () => {
  it("maps courier texts", () => {
    expect(mapCourierStatus("Picked Up")).toBe("in_transit");
    expect(mapCourierStatus("OUT_FOR_DELIVERY")).toBe("out_for_delivery");
    expect(mapCourierStatus("Delivered")).toBe("delivered");
    expect(mapCourierStatus("RTO Initiated")).toBe("rto_initiated");
    expect(mapCourierStatus("RTO Delivered")).toBe("returned_to_origin");
    expect(mapCourierStatus("Undelivered")).toBe("ndr");
    expect(mapCourierStatus("Out For Pickup")).toBeNull();
    expect(parseShiprocketTracking({ awb: 123, current_status: "Delivered", current_timestamp: "27 09 2026 14:00:00" })).toMatchObject({ awb: "123", occurredAt: new Date("2026-09-27T08:30:00Z") });
    expect(parseShiprocketTracking({ current_status: "Delivered" })).toBeNull();
  });

  it("sends partial COD as COD with the deposit as a discount, and classifies failures", async () => {
    const calls: { url: string; body: unknown }[] = [];
    let next: Response = new Response("{}");
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      if (url.endsWith("/auth/login")) return new Response(JSON.stringify({ token: "t" }));
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      return next;
    }) as typeof fetch;
    const shiprocket = new ShiprocketProvider({ email: "e", password: "p", pickupPincode: "400001", pickupLocation: "Warehouse" }, fetchImpl);
    next = new Response(JSON.stringify({ order_id: 11, shipment_id: 22 }));
    const created = await shiprocket.createShipment({
      orderNumber: "KLW100001", orderDate: new Date("2026-09-25T04:30:00Z"),
      customer: { name: "Priya Sharma", phone: "+919876543210", email: null, line1: "12 MG Road", line2: "", city: "Pune", stateName: "Maharashtra", pincode: "411001" },
      items: [{ name: "Towel", sku: "A", units: 2, unitPricePaise: 50000, taxRatePercent: 12, hsnCode: "6302" }],
      subTotalPaise: 100000, codAmountPaise: 70000, weightGrams: 800, dimensionsCm: { length: 30, breadth: 25, height: 10 },
    });
    expect(created).toEqual({ providerOrderId: "11", providerShipmentId: "22" });
    expect(calls[0]!.body).toMatchObject({ order_id: "KLW100001", order_date: "2026-09-25 10:00", pickup_location: "Warehouse", payment_method: "COD", total_discount: "300.00", sub_total: "1000.00", billing_customer_name: "Priya", billing_last_name: "Sharma", billing_phone: "9876543210", weight: "0.800" });

    next = new Response(JSON.stringify({ awb_assign_status: 1, response: { data: { awb_code: "AWB1", courier_name: "Delhivery" } } }));
    expect(await shiprocket.assignAwb("22")).toEqual({ awb: "AWB1", courierName: "Delhivery" });
    next = new Response(JSON.stringify({ message: "Pickup location not found" }), { status: 422 });
    await expect(shiprocket.generateLabel("22")).rejects.toThrow(ShippingRejectedError);
    next = new Response("oops", { status: 502 });
    await expect(shiprocket.requestPickup("22")).rejects.toThrow(ShippingUnavailableError);
  });
});
