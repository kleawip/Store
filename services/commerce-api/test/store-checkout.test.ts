import { CheckoutQuote, Problem, Serviceability } from "@kleawip/contract";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_COMMERCE_SETTINGS } from "../src/checkout/settings";
import { checkoutQuotes, inventoryItems, variants } from "../src/db/schema";
import { seedDemoCatalogue } from "../src/db/seed-demo";
import { ShiprocketProvider, ShippingUnavailableError, type ShippingProvider } from "../src/shipping/provider";
import { addVariantFixture } from "./fixtures";
import { createTestApp, customerSignIn } from "./helpers";

let ctx: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  ctx = await createTestApp({ commerce: { ...DEFAULT_COMMERCE_SETTINGS, shipping: { flatPaise: 4900, freeAbovePaise: 99900 } } });
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.db.execute(sql`TRUNCATE customers, otp_challenges, carts RESTART IDENTITY CASCADE`);
  await seedDemoCatalogue(ctx.db);
  await addVariantFixture(ctx.db, { onHand: 10 });
  await ctx.db.update(variants).set({ taxRateBasisPoints: 1200 });
});

const problem = (res: { json: () => unknown }) => Problem.parse(res.json());
const address = (overrides: object = {}) => ({ name: "Priya Sharma", phone: "9876543210", line1: "12 MG Road", city: "Pune", stateCode: "MH", pincode: "411001", ...overrides });

async function shopper(lines: [string, number][] = [["DEMO-SKU-A", 1]], addr: object = {}) {
  const customer = await customerSignIn(ctx);
  for (const [sku, quantity] of lines) await customer.call("PUT", `/v1/store/cart/lines/${sku}`, { quantity });
  const { id: addressId } = (await customer.call("POST", "/v1/store/me/addresses", address(addr))).json();
  const quote = (paymentMethod: string, id = addressId) => customer.call("POST", "/v1/store/checkout/quote", { addressId: id, paymentMethod });
  return { ...customer, addressId, quote };
}

describe("GET /v1/store/serviceability", () => {
  it("answers serviceable with an estimate, not serviceable, or prepaid-only", async () => {
    const check = async (pincode: string) => Serviceability.parse((await ctx.app.inject({ method: "GET", url: `/v1/store/serviceability?pincode=${pincode}` })).json());
    expect(await check("411001")).toMatchObject({ status: "serviceable", partialCodAvailable: true, estimatedDeliveryDays: { min: 2, max: 4 } });
    expect(await check("900001")).toMatchObject({ status: "not_serviceable", partialCodAvailable: false });
    expect(await check("793001")).toMatchObject({ status: "serviceable", partialCodAvailable: false });
    expect((await ctx.app.inject({ method: "GET", url: "/v1/store/serviceability?pincode=12" })).statusCode).toBe(422);
  });

  it("says 'unavailable' (never guesses) when no courier is configured", async () => {
    const offline = await createTestApp({ shipping: null });
    const res = await offline.app.inject({ method: "GET", url: "/v1/store/serviceability?pincode=411001" });
    expect(res.json()).toMatchObject({ status: "unavailable" });
    await offline.close();
  });
});

describe("POST /v1/store/checkout/quote", () => {
  it("quotes a prepaid order: GST-inclusive goods + flat shipping, intra-state CGST/SGST", async () => {
    const { quote } = await shopper([["DEMO-SKU-A", 1]]);
    const res = await quote("prepaid");
    expect(res.statusCode, res.body).toBe(201);
    const body = CheckoutQuote.parse(res.json());
    expect(body).toMatchObject({
      merchandiseTotal: { amount: 49900 },
      shipping: { amount: 4900 },
      total: { amount: 54800 },
      gst: { intraState: true, taxable: { amount: 44554 }, cgst: { amount: 2673 }, sgst: { amount: 2673 }, igst: { amount: 0 } },
      payment: { method: "prepaid", payNow: { amount: 54800 }, codBalance: { amount: 0 }, depositPercent: null },
      delivery: { pincode: "411001", estimatedDeliveryDays: { min: 2, max: 4 } },
    });
    expect(body.lines).toEqual([expect.objectContaining({ sku: "DEMO-SKU-A", quantity: 1, gstRatePercent: 12 })]);
    const [stored] = await ctx.db.select().from(checkoutQuotes);
    expect(stored).toMatchObject({ totalPaise: 54800, payNowPaise: 54800, codBalancePaise: 0 });
  });

  it("splits partial COD 30% online (rounded up to the rupee) / 70% cash, and uses IGST across states", async () => {
    const { quote } = await shopper([["DEMO-SKU-B", 1]], { stateCode: "KA", city: "Bengaluru", pincode: "560001" });
    const body = CheckoutQuote.parse((await quote("partial_cod")).json());
    // ₹949 goods + ₹49 shipping = ₹998 → deposit ₹299.40 → ₹300 online, ₹698 on delivery.
    expect(body.total.amount).toBe(99800);
    expect(body.payment).toEqual({ method: "partial_cod", payNow: { amount: 30000, currency: "INR" }, codBalance: { amount: 69800, currency: "INR" }, depositPercent: 30 });
    expect(body.gst).toMatchObject({ intraState: false, cgst: { amount: 0 }, sgst: { amount: 0 }, igst: { amount: 10168 } });
  });

  it("gives free shipping at the threshold", async () => {
    const { quote } = await shopper([["DEMO-SKU-A", 2]]); // ₹998 ≥ ₹999? no → still charged
    expect(CheckoutQuote.parse((await quote("prepaid")).json()).shipping.amount).toBe(4900);
    const second = await shopper([["DEMO-SKU-A", 3]]); // ₹1,497 ≥ ₹999 → free
    expect(CheckoutQuote.parse((await second.quote("prepaid")).json()).shipping.amount).toBe(0);
  });

  it("refuses undeliverable pincodes, COD where the courier can't collect, and unknown addresses", async () => {
    const far = await shopper([["DEMO-SKU-A", 1]], { pincode: "900001" });
    expect(problem(await far.quote("prepaid")).errors![0]).toMatchObject({ code: "not_serviceable", path: "addressId" });

    await ctx.db.execute(sql`TRUNCATE customers, otp_challenges, carts RESTART IDENTITY CASCADE`);
    const northEast = await shopper([["DEMO-SKU-A", 1]], { stateCode: "ML", city: "Shillong", pincode: "793001" });
    expect(problem(await northEast.quote("partial_cod")).errors![0]).toMatchObject({ code: "cod_unavailable", path: "paymentMethod" });
    expect((await northEast.quote("prepaid")).statusCode).toBe(201);
    expect(problem(await northEast.quote("prepaid", "00000000-0000-0000-0000-000000000000")).errors![0]!.code).toBe("unknown_address");
  });

  it("leaves out lines that can't be ordered and refuses an empty result", async () => {
    const { quote } = await shopper([["DEMO-SKU-A", 1], ["DEMO-SKU-B", 1]]);
    await ctx.db.update(inventoryItems).set({ onHand: 1 }); // single still possible, pack of 2 not
    const body = CheckoutQuote.parse((await quote("prepaid")).json());
    expect(body.lines.map((line) => line.sku)).toEqual(["DEMO-SKU-A"]);
    expect(body.excluded).toEqual([{ sku: "DEMO-SKU-B", reason: "This item is out of stock." }]);

    await ctx.db.update(inventoryItems).set({ onHand: 0 });
    expect(problem(await quote("prepaid")).errors![0]!.code).toBe("empty_cart");
  });

  it("caps the COD balance", async () => {
    const small = await createTestApp({ commerce: { ...DEFAULT_COMMERCE_SETTINGS, maxCodBalancePaise: 10000 } });
    const saved = ctx;
    ctx = small;
    try {
      const { quote } = await shopper([["DEMO-SKU-A", 1]]);
      expect(problem(await quote("partial_cod")).errors![0]!.code).toBe("cod_limit");
    } finally {
      ctx = saved;
      await small.close();
    }
  });

  it("reports delivery as unavailable when the courier check fails", async () => {
    const failing: ShippingProvider = { name: "down", checkServiceability: async () => { throw new ShippingUnavailableError("down"); } };
    const down = await createTestApp({ shipping: failing });
    const saved = ctx;
    ctx = down;
    try {
      const { quote } = await shopper([["DEMO-SKU-A", 1]]);
      expect(problem(await quote("prepaid")).errors![0]!.code).toBe("delivery_unavailable");
    } finally {
      ctx = saved;
      await down.close();
    }
  });

  it("requires sign-in", async () => {
    const res = await ctx.app.inject({ method: "POST", url: "/v1/store/checkout/quote", headers: { "x-kleawip-client": "s" }, payload: { addressId: "00000000-0000-0000-0000-000000000000", paymentMethod: "prepaid" } });
    expect(res.statusCode).toBe(401);
  });
});

describe("Shiprocket adapter", () => {
  function fakeShiprocket(serviceability: object, status = 200) {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      if (url.endsWith("/auth/login")) return new Response(JSON.stringify({ token: "tok" }), { status: 200 });
      return new Response(JSON.stringify(serviceability), { status });
    }) as unknown as typeof fetch;
    return { calls, provider: new ShiprocketProvider({ email: "e", password: "p", pickupPincode: "400001" }, fetchImpl) };
  }

  it("logs in once, queries serviceability and picks the cheapest courier", async () => {
    const { calls, provider } = fakeShiprocket({
      data: { available_courier_companies: [
        { courier_name: "Fast", rate: 120.5, cod: 1, estimated_delivery_days: "2" },
        { courier_name: "Cheap", rate: 70, cod: 0, estimated_delivery_days: "5" },
      ] },
    });
    const result = await provider.checkServiceability({ deliveryPincode: "560001", weightGrams: 750, cod: true, declaredValuePaise: 99800 });
    expect(result).toEqual({ serviceable: true, codAvailable: true, estimatedDays: { min: 2, max: 5 }, courierName: "Cheap", courierRatePaise: 7000 });
    await provider.checkServiceability({ deliveryPincode: "560001", weightGrams: 750, cod: false, declaredValuePaise: 99800 });
    expect(calls.filter((url) => url.endsWith("/auth/login"))).toHaveLength(1);
    expect(calls[1]).toContain("delivery_postcode=560001");
    expect(calls[1]).toContain("weight=0.750");
    expect(calls[1]).toContain("cod=1");
  });

  it("treats an empty courier list as not serviceable and server errors as unavailable", async () => {
    expect(await fakeShiprocket({ data: { available_courier_companies: [] } }).provider.checkServiceability({ deliveryPincode: "900001", weightGrams: 500, cod: false, declaredValuePaise: 100 })).toEqual({ serviceable: false });
    await expect(fakeShiprocket({}, 500).provider.checkServiceability({ deliveryPincode: "411001", weightGrams: 500, cod: false, declaredValuePaise: 100 })).rejects.toBeInstanceOf(ShippingUnavailableError);
  });
});

