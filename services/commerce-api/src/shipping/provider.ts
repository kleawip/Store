// Shipping (ADR 0002 R2: Shiprocket): serviceability, and (Milestone 3) booking, AWB, labels, pickups and
// cancellation. Tracking arrives by webhook (shipping/tracking.ts). Everything courier-specific stays behind this interface.

export type ServiceabilityQuery = {
  deliveryPincode: string;
  weightGrams: number;
  cod: boolean;
  declaredValuePaise: number;
};

export type ServiceabilityResult =
  | { serviceable: false }
  | {
      serviceable: true;
      codAvailable: boolean;
      estimatedDays: { min: number; max: number } | null;
      courierName: string | null;
      /** What the courier charges us (not the customer's shipping price, which follows the shipping policy). */
      courierRatePaise: number | null;
    };

export type ShipmentRequest = {
  orderNumber: string;
  orderDate: Date;
  customer: { name: string; phone: string; email: string | null; line1: string; line2: string; city: string; stateName: string; pincode: string };
  items: { name: string; sku: string; units: number; unitPricePaise: number; taxRatePercent: number; hsnCode: string | null; discountPerUnitPaise?: number }[];
  /** Goods value of the parcel (GST-inclusive). */
  subTotalPaise: number;
  /** What the courier collects in cash: 0 for prepaid, the balance for partial COD. */
  codAmountPaise: number;
  weightGrams: number;
  dimensionsCm: { length: number; breadth: number; height: number };
};

export interface ShippingProvider {
  readonly name: string;
  checkServiceability(query: ServiceabilityQuery): Promise<ServiceabilityResult>;
  /** Registers the parcel with the courier platform. Booking is split into steps so a failure half-way can resume. */
  createShipment(request: ShipmentRequest): Promise<{ providerOrderId: string; providerShipmentId: string }>;
  assignAwb(providerShipmentId: string): Promise<{ awb: string; courierName: string }>;
  generateLabel(providerShipmentId: string): Promise<{ labelUrl: string }>;
  requestPickup(providerShipmentId: string): Promise<void>;
  cancelShipment(providerOrderId: string): Promise<void>;
}

/** Public tracking page for an AWB (stored shipments only keep the provider name and AWB). */
export function trackingUrlFor(provider: string, awb: string | null) {
  if (!awb) return null;
  if (provider === "shiprocket") return `https://shiprocket.co/tracking/${encodeURIComponent(awb)}`;
  return `https://mock-courier.invalid/track/${encodeURIComponent(awb)}`;
}

/** Network trouble or an outage: safe to retry. */
export class ShippingUnavailableError extends Error {}
/** The courier refused the request (bad address, no courier, pickup location missing…): needs a person. */
export class ShippingRejectedError extends Error {}

/**
 * Deterministic stand-in used in development and tests until the client's Shiprocket account exists.
 * Rules: 9xxxxx (Army Postal Service) not serviceable; 79xxxx (parts of the North East) prepaid only;
 * delivery estimate grows with the distance between the first pincode digits of pickup and delivery.
 */
export class MockShippingProvider implements ShippingProvider {
  readonly name = "mock";
  private counter = 0;
  /** Tests: make the next call to this step fail ("unavailable" or "rejected"). */
  failNext: { step: "createShipment" | "assignAwb" | "generateLabel" | "requestPickup" | "cancelShipment"; kind: "unavailable" | "rejected" } | null = null;
  readonly calls: { step: string; arg: unknown }[] = [];
  constructor(private readonly pickupPincode = "400001") {}

  private step(step: NonNullable<MockShippingProvider["failNext"]>["step"], arg: unknown) {
    this.calls.push({ step, arg });
    if (this.failNext?.step !== step) return;
    const kind = this.failNext.kind;
    this.failNext = null;
    throw kind === "rejected" ? new ShippingRejectedError(`Mock courier rejected ${step}`) : new ShippingUnavailableError(`Mock courier unavailable (${step})`);
  }

  async createShipment(request: ShipmentRequest) {
    this.step("createShipment", request);
    const id = `${Date.now().toString(36)}${(++this.counter).toString(36)}`;
    return { providerOrderId: `mo_${id}`, providerShipmentId: `ms_${id}` };
  }

  async assignAwb(providerShipmentId: string) {
    this.step("assignAwb", providerShipmentId);
    return { awb: `MOCK${providerShipmentId.slice(3).toUpperCase()}`, courierName: "Mock Courier" };
  }

  async generateLabel(providerShipmentId: string) {
    this.step("generateLabel", providerShipmentId);
    // Not a real file: mock labels exist only so the flow can be built and tested.
    return { labelUrl: `https://mock-courier.invalid/labels/${providerShipmentId}.pdf` };
  }

  async requestPickup(providerShipmentId: string) {
    this.step("requestPickup", providerShipmentId);
  }

  async cancelShipment(providerOrderId: string) {
    this.step("cancelShipment", providerOrderId);
  }

  async checkServiceability({ deliveryPincode }: ServiceabilityQuery): Promise<ServiceabilityResult> {
    if (deliveryPincode.startsWith("9")) return { serviceable: false };
    const distance = Math.abs(Number(deliveryPincode[0]) - Number(this.pickupPincode[0]));
    return {
      serviceable: true,
      codAvailable: !deliveryPincode.startsWith("79"),
      estimatedDays: { min: 2 + distance, max: 4 + distance },
      courierName: "Mock Courier",
      courierRatePaise: 6000 + distance * 1000,
    };
  }
}

type Fetch = typeof fetch;

/**
 * Shiprocket external API. VERIFY field names against Shiprocket's current API reference when the client's
 * account is set up; parsing below is defensive and anything unexpected is treated as "unavailable".
 */
export class ShiprocketProvider implements ShippingProvider {
  readonly name = "shiprocket";
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    // pickupLocation: the pickup address *name* as saved in the Shiprocket panel (Settings → Pickup addresses).
    private readonly config: { email: string; password: string; pickupPincode: string; pickupLocation: string; baseUrl?: string },
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  private get base() {
    return this.config.baseUrl ?? "https://apiv2.shiprocket.in/v1/external";
  }

  private async authToken() {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    const response = await this.fetchImpl(`${this.base}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: this.config.email, password: this.config.password }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json().catch(() => null)) as { token?: string } | null;
    if (!response.ok || !body?.token) throw new ShippingUnavailableError(`Shiprocket login failed (${response.status})`);
    // Tokens last several days; refresh daily to stay well inside that.
    this.token = { value: body.token, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
    return body.token;
  }

  async checkServiceability(query: ServiceabilityQuery): Promise<ServiceabilityResult> {
    const params = new URLSearchParams({
      pickup_postcode: this.config.pickupPincode,
      delivery_postcode: query.deliveryPincode,
      weight: (Math.max(query.weightGrams, 1) / 1000).toFixed(3),
      cod: query.cod ? "1" : "0",
      declared_value: (query.declaredValuePaise / 100).toFixed(2),
    });
    const response = await this.fetchImpl(`${this.base}/courier/serviceability/?${params}`, {
      headers: { authorization: `Bearer ${await this.authToken()}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 404) return { serviceable: false };
    if (!response.ok) throw new ShippingUnavailableError(`Shiprocket serviceability failed (${response.status})`);
    const body = (await response.json().catch(() => null)) as {
      data?: { available_courier_companies?: { courier_name?: string; rate?: number; cod?: number; estimated_delivery_days?: string | number }[]; recommended_courier_company_id?: number };
    } | null;
    const couriers = body?.data?.available_courier_companies ?? [];
    if (!couriers.length) return { serviceable: false };
    const cheapest = [...couriers].sort((a, b) => (a.rate ?? Infinity) - (b.rate ?? Infinity))[0]!;
    const days = couriers.map((c) => Number(c.estimated_delivery_days)).filter((d) => Number.isFinite(d) && d > 0);
    return {
      serviceable: true,
      codAvailable: couriers.some((c) => c.cod === 1),
      estimatedDays: days.length ? { min: Math.min(...days), max: Math.max(...days) } : null,
      courierName: cheapest.courier_name ?? null,
      courierRatePaise: typeof cheapest.rate === "number" ? Math.round(cheapest.rate * 100) : null,
    };
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.base}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${await this.authToken()}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      if (error instanceof ShippingUnavailableError) throw error;
      throw new ShippingUnavailableError(`Shiprocket ${path} unreachable`);
    }
    const parsed = (await response.json().catch(() => null)) as (T & { message?: string }) | null;
    if (response.status >= 500 || response.status === 429) throw new ShippingUnavailableError(`Shiprocket ${path} failed (${response.status})`);
    if (!response.ok || !parsed) throw new ShippingRejectedError(parsed?.message ? `Shiprocket: ${parsed.message}` : `Shiprocket ${path} refused (${response.status})`);
    return parsed;
  }

  // VERIFY against Shiprocket's API reference with the client's account: field names below follow the
  // published "create custom order" / "assign AWB" / "generate label" / "generate pickup" / "cancel" endpoints.
  async createShipment(request: ShipmentRequest) {
    const [first, ...rest] = request.customer.name.trim().split(/\s+/);
    const cod = request.codAmountPaise > 0;
    const body = await this.post<{ order_id?: number | string; shipment_id?: number | string }>("/orders/create/adhoc", {
      order_id: request.orderNumber,
      order_date: istDateTime(request.orderDate),
      pickup_location: this.config.pickupLocation,
      billing_customer_name: first ?? request.customer.name,
      billing_last_name: rest.join(" "),
      billing_address: request.customer.line1,
      billing_address_2: request.customer.line2,
      billing_city: request.customer.city,
      billing_pincode: request.customer.pincode,
      billing_state: request.customer.stateName,
      billing_country: "India",
      billing_email: request.customer.email ?? "",
      billing_phone: request.customer.phone.replace(/^\+91/, ""),
      shipping_is_billing: true,
      order_items: request.items.map((item) => ({
        name: item.name,
        sku: item.sku,
        units: item.units,
        selling_price: (item.unitPricePaise / 100).toFixed(2),
        discount: ((item.discountPerUnitPaise ?? 0) / 100).toFixed(2),
        tax: item.taxRatePercent,
        hsn: item.hsnCode ?? "",
      })),
      payment_method: cod ? "COD" : "Prepaid",
      // Partial COD: the online deposit is sent as a discount so the courier collects only the balance. VERIFY with Shiprocket.
      total_discount: cod ? ((request.subTotalPaise - request.codAmountPaise) / 100).toFixed(2) : "0",
      sub_total: (request.subTotalPaise / 100).toFixed(2),
      length: request.dimensionsCm.length,
      breadth: request.dimensionsCm.breadth,
      height: request.dimensionsCm.height,
      weight: (request.weightGrams / 1000).toFixed(3),
    });
    if (!body.order_id || !body.shipment_id) throw new ShippingRejectedError("Shiprocket did not return an order and shipment id");
    return { providerOrderId: String(body.order_id), providerShipmentId: String(body.shipment_id) };
  }

  async assignAwb(providerShipmentId: string) {
    const body = await this.post<{ awb_assign_status?: number; response?: { data?: { awb_code?: string; courier_name?: string } } }>("/courier/assign/awb", { shipment_id: providerShipmentId });
    const data = body.response?.data;
    if (body.awb_assign_status !== 1 || !data?.awb_code) throw new ShippingRejectedError("Shiprocket could not assign a courier (AWB)");
    return { awb: data.awb_code, courierName: data.courier_name ?? "Courier" };
  }

  async generateLabel(providerShipmentId: string) {
    const body = await this.post<{ label_created?: number; label_url?: string }>("/courier/generate/label", { shipment_id: [providerShipmentId] });
    if (!body.label_url) throw new ShippingRejectedError("Shiprocket did not return a label");
    return { labelUrl: body.label_url };
  }

  async requestPickup(providerShipmentId: string) {
    const body = await this.post<{ pickup_status?: number }>("/courier/generate/pickup", { shipment_id: [providerShipmentId] });
    if (body.pickup_status !== 1) throw new ShippingRejectedError("Shiprocket did not schedule the pickup");
  }

  async cancelShipment(providerOrderId: string) {
    await this.post("/orders/cancel", { ids: [providerOrderId] });
  }
}

/** "YYYY-MM-DD HH:mm" in India time, as Shiprocket expects. */
function istDateTime(date: Date) {
  return new Date(date.getTime() + 330 * 60_000).toISOString().slice(0, 16).replace("T", " ");
}
