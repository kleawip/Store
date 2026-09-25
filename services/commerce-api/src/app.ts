import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { sql } from "drizzle-orm";
import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import type { Database } from "./db/client";
import { errorHandler, notFoundHandler } from "./errors";
import { MAX_UPLOAD_BYTES } from "./media/process";
import type { MediaStorage } from "./media/storage";
import type { ChannelOtpSender } from "./messaging/otp-senders";
import type { CommerceSettings } from "./checkout/settings";
import { MockShippingProvider, type ShippingProvider } from "./shipping/provider";
import { DevGateway, type PaymentGateway } from "./payments/gateway";
import { adminAuthRoutes } from "./routes/admin-auth";
import { adminCampaignRoutes } from "./routes/admin-campaigns";
import { adminCatalogueRoutes } from "./routes/admin-catalogue";
import { adminImportRoutes } from "./routes/admin-imports";
import { adminOrderRoutes } from "./routes/admin-orders";
import { adminSettingsRoutes } from "./routes/admin-settings";
import { adminAccountRoutes, adminStaffRoutes } from "./routes/admin-staff";
import { adminMediaCollectionRoutes } from "./routes/admin-media-collections";
import { mediaFileRoutes } from "./routes/media-files";
import { storeAccountRoutes } from "./routes/store-account";
import { mergeGuestCartOnSignIn, storeCartRoutes } from "./routes/store-cart";
import { storeCheckoutRoutes } from "./routes/store-checkout";
import { devPaymentRoutes, paymentWebhookRoutes, storeOrderRoutes } from "./routes/store-orders";
import { storeCatalogueRoutes } from "./routes/store-catalogue";
import { courierWebhookRoutes, devCourierRoutes } from "./routes/courier-webhooks";
import { adminReturnRoutes, storeReturnRoutes } from "./routes/returns";

export type AppOptions = {
  db: Database;
  storage: MediaStorage;
  otpSender: ChannelOtpSender;
  /** Courier integration; null = not configured (checkout reports delivery as unavailable, never guesses). */
  shipping: ShippingProvider | null;
  commerce: CommerceSettings;
  payments: PaymentGateway;
  /** Shared secret for the courier tracking webhook; null = webhook disabled. */
  courierWebhookToken?: string | null;
  storefrontOrigins: string[];
  /** Mark the admin session cookie Secure (HTTPS only). True everywhere except local HTTP development and tests. */
  cookieSecure?: boolean;
  /** Per-IP request limits. Tests turn this off except where they test it. */
  rateLimits?: boolean;
  /** Number of proxy hops in front of the API (e.g. 1 on Railway) whose X-Forwarded-For is trusted for client IPs. */
  trustedProxyHops?: number;
  logger?: boolean;
};

export async function buildApp({ db, storage, otpSender, shipping, commerce, payments, courierWebhookToken = null, storefrontOrigins, cookieSecure = true, rateLimits = true, trustedProxyHops = 0, logger = false }: AppOptions) {
  const app = Fastify({
    genReqId: () => `req_${randomUUID()}`,
    requestIdHeader: false,
    // Trust exactly N hops so clients can't spoof their IP (which rate limits depend on) with X-Forwarded-For.
    trustProxy: trustedProxyHops > 0 ? (_address: string, hop: number) => hop < trustedProxyHops : false,
    bodyLimit: 1024 * 1024, // JSON bodies; uploads have their own multipart limits
    // Never log credentials or session material.
    logger: logger ? { redact: ["req.headers.cookie", "req.headers.authorization", 'req.headers["x-csrf-token"]', 'res.headers["set-cookie"]'] } : false,
  });

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);
  app.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  // JSON API only: no HTML is served, so a strict CSP and no-sniff are safe defaults.
  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: "cross-origin" }, // storefront pages load /media images
  });
  await app.register(cors, { origin: storefrontOrigins, credentials: true });
  if (rateLimits) {
    // A generous global ceiling per IP; sign-in and setup get strict limits on their routes.
    await app.register(rateLimit, { global: true, max: 600, timeWindow: "1 minute" });
  }
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

  // Liveness: the process is up. Readiness: it can reach the database (used by Railway health checks).
  app.get("/health", { config: { rateLimit: false } }, async () => ({ status: "ok" }));
  app.get("/ready", { config: { rateLimit: false } }, async (_request, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { status: "ready" };
    } catch {
      return reply.status(503).send({ status: "unavailable" });
    }
  });
  await app.register(storeCatalogueRoutes(db), { prefix: "/v1/store" });
  await app.register(storeAccountRoutes(db, { otpSender, cookieSecure, onSignIn: mergeGuestCartOnSignIn(db) }), { prefix: "/v1/store" });
  await app.register(storeCartRoutes(db, { cookieSecure }), { prefix: "/v1/store" });
  await app.register(storeCheckoutRoutes(db, { shipping, settings: commerce }), { prefix: "/v1/store" });
  await app.register(storeOrderRoutes(db, payments), { prefix: "/v1/store" });
  await app.register(storeReturnRoutes(db, commerce), { prefix: "/v1/store" });
  await app.register(paymentWebhookRoutes(db, payments), { prefix: "/v1/webhooks" });
  if (payments instanceof DevGateway) await app.register(devPaymentRoutes(payments), { prefix: "/v1/dev" });
  if (shipping && courierWebhookToken) await app.register(courierWebhookRoutes(db, shipping.name, courierWebhookToken), { prefix: "/v1/webhooks" });
  // The dev tracking simulator exists only with both the mock courier and the dev payment gateway (never in production).
  if (shipping instanceof MockShippingProvider && payments instanceof DevGateway) await app.register(devCourierRoutes(db, shipping), { prefix: "/v1/dev" });
  await app.register(adminAuthRoutes(db, { cookieSecure }), { prefix: "/v1/admin/auth" });
  await app.register(adminCatalogueRoutes(db), { prefix: "/v1/admin" });
  await app.register(adminMediaCollectionRoutes(db, storage), { prefix: "/v1/admin" });
  await app.register(adminCampaignRoutes(db), { prefix: "/v1/admin/campaigns" });
  await app.register(adminImportRoutes(db), { prefix: "/v1/admin/imports" });
  await app.register(adminStaffRoutes(db), { prefix: "/v1/admin" });
  await app.register(adminOrderRoutes(db, payments, shipping, commerce), { prefix: "/v1/admin" });
  await app.register(adminReturnRoutes(db, payments), { prefix: "/v1/admin" });
  await app.register(adminSettingsRoutes(db, commerce.sellerStateCode), { prefix: "/v1/admin" });
  await app.register(adminAccountRoutes(db), { prefix: "/v1/admin/auth" });
  if (storage.read) await app.register(mediaFileRoutes(storage), { prefix: "/media" });

  return app;
}
