// Payment gateway (Razorpay). Card and UPI details never touch our servers: the customer pays in Razorpay's
// checkout; we only create gateway orders and verify signatures.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type GatewayOrder = { providerOrderId: string };

export interface PaymentGateway {
  readonly provider: "razorpay" | "dev";
  /** Public key id for the storefront checkout widget. */
  readonly keyId: string;
  createOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<GatewayOrder>;
  /** Checkout success handler: signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
  verifyPaymentSignature(input: { providerOrderId: string; providerPaymentId: string; signature: string }): boolean;
  /** Webhooks: X-Razorpay-Signature = HMAC_SHA256(raw request body, webhook_secret). */
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
  /** Refunds part or all of a captured payment back to the customer's original method. */
  refund(input: { providerPaymentId: string; amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<{ providerRefundId: string; status: "processed" | "pending" }>;
}

export class PaymentGatewayError extends Error {}

const hmacHex = (secret: string, message: string) => createHmac("sha256", secret).update(message).digest("hex");

function safeEqualHex(expectedHex: string, actual: string) {
  const expected = Buffer.from(expectedHex, "hex");
  const given = Buffer.from(actual, "hex");
  return /^[0-9a-f]+$/i.test(actual) && given.length === expected.length && timingSafeEqual(expected, given);
}

type Fetch = typeof fetch;

export class RazorpayGateway implements PaymentGateway {
  readonly provider = "razorpay" as const;
  constructor(
    private readonly config: { keyId: string; keySecret: string; webhookSecret: string; baseUrl?: string },
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  get keyId() {
    return this.config.keyId;
  }

  async createOrder({ amountPaise, receipt, notes }: { amountPaise: number; receipt: string; notes: Record<string, string> }) {
    const auth = Buffer.from(`${this.config.keyId}:${this.config.keySecret}`).toString("base64");
    const response = await this.fetchImpl(`${this.config.baseUrl ?? "https://api.razorpay.com"}/v1/orders`, {
      method: "POST",
      headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
      body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt: receipt.slice(0, 40), notes }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.json().catch(() => null)) as { id?: string; error?: { code?: string } } | null;
    if (!response.ok || !body?.id) throw new PaymentGatewayError(`Razorpay order creation failed (${response.status}${body?.error?.code ? `, ${body.error.code}` : ""})`);
    return { providerOrderId: body.id };
  }

  verifyPaymentSignature({ providerOrderId, providerPaymentId, signature }: { providerOrderId: string; providerPaymentId: string; signature: string }) {
    return safeEqualHex(hmacHex(this.config.keySecret, `${providerOrderId}|${providerPaymentId}`), signature);
  }

  async refund({ providerPaymentId, amountPaise, receipt, notes }: { providerPaymentId: string; amountPaise: number; receipt: string; notes: Record<string, string> }) {
    const auth = Buffer.from(`${this.config.keyId}:${this.config.keySecret}`).toString("base64");
    const response = await this.fetchImpl(`${this.config.baseUrl ?? "https://api.razorpay.com"}/v1/payments/${encodeURIComponent(providerPaymentId)}/refund`, {
      method: "POST",
      headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
      body: JSON.stringify({ amount: amountPaise, speed: "normal", receipt: receipt.slice(0, 40), notes }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.json().catch(() => null)) as { id?: string; status?: string; error?: { code?: string; description?: string } } | null;
    if (!response.ok || !body?.id || body.status === "failed") {
      throw new PaymentGatewayError(`Razorpay refund failed (${response.status}${body?.error?.code ? `, ${body.error.code}` : ""})`);
    }
    return { providerRefundId: body.id, status: body.status === "processed" ? ("processed" as const) : ("pending" as const) };
  }

  verifyWebhookSignature(rawBody: string, signature: string) {
    return safeEqualHex(hmacHex(this.config.webhookSecret, rawBody), signature);
  }
}

/**
 * DEVELOPMENT ONLY: no network, no money. Same signature scheme as Razorpay with local secrets, so the whole
 * flow (including webhooks) can be exercised; the dev-only simulate endpoint produces valid signatures.
 */
export class DevGateway implements PaymentGateway {
  readonly provider = "dev" as const;
  readonly keyId = "dev_key";
  readonly keySecret = "dev-key-secret";
  readonly webhookSecret = "dev-webhook-secret";

  async createOrder() {
    return { providerOrderId: `order_dev_${randomBytes(8).toString("hex")}` };
  }

  sign(providerOrderId: string, providerPaymentId: string) {
    return hmacHex(this.keySecret, `${providerOrderId}|${providerPaymentId}`);
  }

  signWebhook(rawBody: string) {
    return hmacHex(this.webhookSecret, rawBody);
  }

  verifyPaymentSignature({ providerOrderId, providerPaymentId, signature }: { providerOrderId: string; providerPaymentId: string; signature: string }) {
    return safeEqualHex(this.sign(providerOrderId, providerPaymentId), signature);
  }

  verifyWebhookSignature(rawBody: string, signature: string) {
    return safeEqualHex(this.signWebhook(rawBody), signature);
  }

  /** Test hook: make the next refund fail like a gateway outage. */
  failNextRefund = false;

  async refund() {
    if (this.failNextRefund) {
      this.failNextRefund = false;
      throw new PaymentGatewayError("simulated refund failure");
    }
    return { providerRefundId: `rfnd_dev_${randomBytes(8).toString("hex")}`, status: "processed" as const };
  }
}
