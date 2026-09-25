import type { FastifyPluginAsync } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Database } from "../db/client";
import type { MockShippingProvider } from "../shipping/provider";
import { applyTrackingUpdate, parseShiprocketTracking } from "../shipping/shipments";

const sameSecret = (given: string | undefined, expected: string) => {
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Shiprocket tracking webhook. Path deliberately avoids the word "shiprocket" (its panel refuses such URLs).
 * Authenticated by the shared token Shiprocket sends as x-api-key. Always answers 200 for a valid token, even
 * for unknown AWBs, so Shiprocket doesn't retry forever.
 */
export const courierWebhookRoutes = (db: Database, provider: string, token: string): FastifyPluginAsync => async (app) => {
  app.post("/courier", { config: { rateLimit: false } }, async (request, reply) => {
    if (!sameSecret(request.headers["x-api-key"] as string | undefined, token)) return reply.status(401).send({ result: "unauthorised" });
    const update = parseShiprocketTracking(request.body);
    if (!update) return reply.status(200).send({ result: "ignored" });
    return reply.status(200).send({ result: await applyTrackingUpdate(db, provider, update) });
  });
};

/** DEVELOPMENT ONLY (mock courier, never production): pretend the courier sent a tracking update for an AWB. */
export const devCourierRoutes = (db: Database, mock: MockShippingProvider): FastifyPluginAsync => async (app) => {
  app.post<{ Params: { awb: string } }>("/shipments/:awb/track", async (request) => {
    const { status, location } = z.object({ status: z.string().min(2).max(60), location: z.string().max(60).nullable().default(null) }).parse(request.body);
    return { result: await applyTrackingUpdate(db, mock.name, { awb: request.params.awb, courierStatus: status, occurredAt: new Date(), location, payload: { dev: true, status } }) };
  });
};
