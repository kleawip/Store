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
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${fields}. See services/commerce-api/.env.example.`);
  }
  if (parsed.data.NODE_ENV === "production" && !parsed.data.COOKIE_SECURE) {
    throw new Error("COOKIE_SECURE=false is not allowed in production: admin sessions must only travel over HTTPS.");
  }
  if (parsed.data.NODE_ENV === "production" && !(parsed.data.WHATSAPP_PHONE_NUMBER_ID && parsed.data.WHATSAPP_ACCESS_TOKEN)) {
    throw new Error("WhatsApp is not configured: customers could not sign in. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN.");
  }
  return parsed.data;
}
