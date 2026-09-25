import { CheckoutQuote, CheckoutQuoteRequest, Serviceability, ServiceabilityQuery } from "@kleawip/contract";
import type { FastifyPluginAsync } from "fastify";
import { checkServiceability, createQuote } from "../checkout/quote";
import type { CommerceSettings } from "../checkout/settings";
import { customerOf, customerSession } from "../customers/guard";
import type { Database } from "../db/client";
import type { ShippingProvider } from "../shipping/provider";

export type CheckoutDeps = { shipping: ShippingProvider | null; settings: CommerceSettings };

export const storeCheckoutRoutes = (db: Database, { shipping, settings }: CheckoutDeps): FastifyPluginAsync => async (app) => {
  // Public pincode check (product page, address form). Short cache: courier coverage changes rarely.
  app.get("/serviceability", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { pincode } = ServiceabilityQuery.parse(request.query);
    reply.header("cache-control", "public, max-age=300");
    return Serviceability.parse(await checkServiceability(shipping, settings, pincode));
  });

  app.post("/checkout/quote", { preHandler: customerSession(db, { required: true }) }, async (request, reply) => {
    reply.header("cache-control", "private, no-store");
    const input = CheckoutQuoteRequest.parse(request.body);
    return reply.status(201).send(CheckoutQuote.parse(await createQuote(db, shipping, settings, customerOf(request).customerId, input)));
  });
};
