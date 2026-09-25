import { z } from "zod";

const Env = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default("127.0.0.1"),
  STOREFRONT_ORIGIN: z.string().default("http://localhost:3000"),
  // Secure admin cookie unless explicitly disabled for plain-HTTP local development.
  COOKIE_SECURE: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  // Local development media store (served by the API under /media). Production uses a cloud store (Phase 0 decision).
  MEDIA_DIR: z.string().default(".data/media"),
  MEDIA_PUBLIC_BASE_URL: z.string().url().default("http://127.0.0.1:4000/media"),
  // Cloudflare R2 (ADR 0002). All six together, or none (then development stores media on local disk).
  R2_ACCOUNT_ID: z.string().regex(/^[0-9a-f]{32}$/, "the 32-character Cloudflare account ID").optional(),
  R2_ACCESS_KEY_ID: z.string().min(16).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(32).optional(),
  R2_PUBLIC_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/).optional(),
  R2_PRIVATE_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/).optional(),
  // The public bucket's address: https://pub-….r2.dev for the demo, a custom domain (https://media.kleawip.com) at launch.
  R2_PUBLIC_BASE_URL: z.string().url().optional(),
  // Number of proxy hops to trust for the client IP (Railway sets 1). 0 = trust none.
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  // WhatsApp Cloud API (customer sign-in codes). Required in production.
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_OTP_TEMPLATE: z.string().default("kleawip_login_otp"),
  WHATSAPP_TEMPLATE_LANGUAGE: z.string().default("en"),
  WHATSAPP_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v21.0"),
  // Resend (email codes and, later, order emails). Optional.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Kleawip <no-reply@kleawip.com>"),
  // Development only: where codes are written when no provider is configured.
  OTP_OUTBOX_FILE: z.string().default(".data/otp-outbox.log"),
  // Development only: where customer notifications are written when no provider is configured.
  NOTIFICATION_OUTBOX_FILE: z.string().default(".data/notification-outbox.log"),
  // Shiprocket (ADR 0002 R2). Without credentials, development uses a mock courier; production has none.
  SHIPROCKET_EMAIL: z.string().optional(),
  SHIPROCKET_PASSWORD: z.string().optional(),
  PICKUP_PINCODE: z.string().regex(/^[1-9]\d{5}$/).default("400001"),
  // The pickup address name exactly as saved in the Shiprocket panel.
  SHIPROCKET_PICKUP_LOCATION: z.string().default("Primary"),
  // Shared secret Shiprocket sends in the x-api-key header of tracking webhooks (set the same value in its panel).
  COURIER_WEBHOOK_TOKEN: z.string().min(24).optional(),
  // Commerce rules (TBC defaults; see src/checkout/settings.ts and ADR 0002).
  SELLER_STATE_CODE: z.string().regex(/^[A-Z]{2}$/).default("MH"),
  SHIPPING_FLAT_PAISE: z.coerce.number().int().min(0).default(0),
  SHIPPING_FREE_ABOVE_PAISE: z.coerce.number().int().min(0).optional(),
  MAX_COD_BALANCE_PAISE: z.coerce.number().int().min(0).default(5_000_000),
  // Razorpay. Without keys, development uses a local DevGateway (no money moves). Production requires keys.
  RAZORPAY_KEY_ID: z.string().regex(/^rzp_(test|live)_[A-Za-z0-9]+$/).optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    // Names only: values may be secrets and must never reach logs.
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${fields}. See services/commerce-api/.env.example.`);
  }
  if (parsed.data.NODE_ENV === "production" && !parsed.data.COOKIE_SECURE) {
    throw new Error("COOKIE_SECURE=false is not allowed in production: admin sessions must only travel over HTTPS.");
  }
  const razorpay = parsed.data.RAZORPAY_KEY_ID;
  if (razorpay && !(parsed.data.RAZORPAY_KEY_SECRET && parsed.data.RAZORPAY_WEBHOOK_SECRET)) {
    throw new Error("RAZORPAY_KEY_ID is set but RAZORPAY_KEY_SECRET or RAZORPAY_WEBHOOK_SECRET is missing.");
  }
  if (parsed.data.NODE_ENV !== "production" && razorpay?.startsWith("rzp_live_")) {
    throw new Error("Refusing live Razorpay keys outside production. Use rzp_test_ keys for development and staging.");
  }
  if (parsed.data.NODE_ENV === "production" && !razorpay) {
    throw new Error("Razorpay is not configured: customers could not pay. Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET.");
  }
  if (parsed.data.NODE_ENV === "production" && !(parsed.data.WHATSAPP_PHONE_NUMBER_ID && parsed.data.WHATSAPP_ACCESS_TOKEN)) {
    throw new Error("WhatsApp is not configured: customers could not sign in. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN.");
  }
  const r2 = [parsed.data.R2_ACCOUNT_ID, parsed.data.R2_ACCESS_KEY_ID, parsed.data.R2_SECRET_ACCESS_KEY, parsed.data.R2_PUBLIC_BUCKET, parsed.data.R2_PRIVATE_BUCKET, parsed.data.R2_PUBLIC_BASE_URL];
  if (r2.some(Boolean) && !r2.every(Boolean)) {
    throw new Error("R2 is partly configured: set all of R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BUCKET, R2_PRIVATE_BUCKET and R2_PUBLIC_BASE_URL.");
  }
  if (parsed.data.R2_PUBLIC_BUCKET && parsed.data.R2_PUBLIC_BUCKET === parsed.data.R2_PRIVATE_BUCKET) {
    throw new Error("R2_PUBLIC_BUCKET and R2_PRIVATE_BUCKET must be different buckets: originals must never be public.");
  }
  if (parsed.data.NODE_ENV === "production" && !parsed.data.R2_ACCOUNT_ID) {
    throw new Error("R2 is not configured: production never stores uploads on local disk. Set the R2_* variables.");
  }
  if (parsed.data.SHIPROCKET_EMAIL && parsed.data.NODE_ENV === "production" && !parsed.data.COURIER_WEBHOOK_TOKEN) {
    throw new Error("Shiprocket is configured but COURIER_WEBHOOK_TOKEN is missing: tracking updates could not be verified.");
  }
  return parsed.data;
}
