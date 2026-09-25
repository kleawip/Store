// Shipping (ADR 0002 R2: Shiprocket). Only serviceability and rates here; AWB, labels, pickups and
// tracking come with fulfilment (Milestone 3). Everything courier-specific stays behind this interface.

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

export interface ShippingProvider {
  readonly name: string;
  checkServiceability(query: ServiceabilityQuery): Promise<ServiceabilityResult>;
}

export class ShippingUnavailableError extends Error {}

/**
 * Deterministic stand-in used in development and tests until the client's Shiprocket account exists.
 * Rules: 9xxxxx (Army Postal Service) not serviceable; 79xxxx (parts of the North East) prepaid only;
 * delivery estimate grows with the distance between the first pincode digits of pickup and delivery.
 */
export class MockShippingProvider implements ShippingProvider {
  readonly name = "mock";
  constructor(private readonly pickupPincode = "400001") {}

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
    private readonly config: { email: string; password: string; pickupPincode: string; baseUrl?: string },
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
}
