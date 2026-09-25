import { Order, PaymentSession, PaymentVerifyRequest, PlaceOrderRequest, PlaceOrderResponse } from "@kleawip/contract";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { customerOf, customerSession } from "../customers/guard";
import type { Database } from "../db/client";
import { ApiError, notFound } from "../errors";
import { cancelUnpaidOrder, customerOrder, getCustomerOrder, handleWebhook, listCustomerOrders, placeOrder, retryPayment, verifyPayment } from "../orders/service";
import { renderInvoiceHtml } from "../invoices/render";
import { invoiceFor, type InvoiceDocument } from "../invoices/service";
import { DevGateway, type PaymentGateway } from "../payments/gateway";
import { sendInvoice } from "./admin-orders";

type IdParams = { Params: { id: string } };
const IdempotencyKey = z.string().regex(/^[A-Za-z0-9_-]{8,100}$/, "Send a unique Idempotency-Key header (8–100 letters, digits, - or _), e.g. a UUID.");

export const storeOrderRoutes = (db: Database, gateway: PaymentGateway): FastifyPluginAsync => async (app) => {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "private, no-store");
  });
  const signedIn = { preHandler: customerSession(db, { required: true }) };

  app.post("/orders", signedIn, async (request, reply) => {
    const key = IdempotencyKey.safeParse(request.headers["idempotency-key"]);
    if (!key.success) throw new ApiError(422, "VALIDATION_FAILED", "Idempotency-Key required", key.error.issues[0]!.message, [{ path: "Idempotency-Key", code: "required", message: key.error.issues[0]!.message }]);
    const { quoteId } = PlaceOrderRequest.parse(request.body);
    const result = await placeOrder(db, gateway, customerOf(request).customerId, quoteId, key.data);
    return reply.status(result.created ? 201 : 200).send(PlaceOrderResponse.parse({ order: result.order, payment: result.payment }));
  });

  app.get("/orders", signedIn, async (request) => ({ data: z.array(Order).parse(await listCustomerOrders(db, customerOf(request).customerId)) }));
  app.get<IdParams>("/orders/:id", signedIn, async (request) => Order.parse(await getCustomerOrder(db, customerOf(request).customerId, request.params.id)));

  app.post<IdParams>("/orders/:id/payments", signedIn, async (request, reply) =>
    reply.status(201).send(PaymentSession.parse(await retryPayment(db, gateway, customerOf(request).customerId, request.params.id))),
  );

  app.post<IdParams>("/orders/:id/payments/verify", signedIn, async (request) =>
    Order.parse(await verifyPayment(db, gateway, customerOf(request).customerId, request.params.id, PaymentVerifyRequest.parse(request.body))),
  );

  app.post<IdParams>("/orders/:id/cancel", signedIn, async (request) => Order.parse(await cancelUnpaidOrder(db, customerOf(request).customerId, request.params.id)));

  // The customer's own tax invoice (printable HTML), once issued. Cancelled invoices aren't offered.
  app.get<IdParams>("/orders/:id/invoice", signedIn, async (request, reply) => {
    const order = await customerOrder(db, customerOf(request).customerId, request.params.id);
    const invoice = await invoiceFor(db, order.id);
    if (!invoice || invoice.status !== "issued") throw notFound("The invoice for this order isn't ready yet.");
    return sendInvoice(reply, renderInvoiceHtml(invoice.document as InvoiceDocument, invoice.status));
  });
};

/** Razorpay → us. The raw body is needed for the signature, so this plugin parses JSON itself. */
export const paymentWebhookRoutes = (db: Database, gateway: PaymentGateway): FastifyPluginAsync => async (app) => {
  app.addContentTypeParser("application/json", { parseAs: "string", bodyLimit: 256 * 1024 }, (_request, body, done) => done(null, body));
  app.post("/razorpay", { config: { rateLimit: false } }, async (request, reply) => {
    const outcome = await handleWebhook(
      db,
      gateway,
      String(request.body ?? ""),
      request.headers["x-razorpay-signature"] as string | undefined,
      request.headers["x-razorpay-event-id"] as string | undefined,
    );
    return reply.status(outcome.status).send({ result: outcome.result });
  });
};

/**
 * DEVELOPMENT ONLY (registered only with the DevGateway, never in production): stands in for Razorpay
 * Checkout so the storefront can be built without keys. Returns what Razorpay's success handler would.
 */
export const devPaymentRoutes = (gateway: DevGateway): FastifyPluginAsync => async (app) => {
  app.post<{ Params: { providerOrderId: string } }>("/payments/:providerOrderId/succeed", async (request) => {
    const providerPaymentId = `pay_dev_${Date.now().toString(36)}`;
    return {
      providerOrderId: request.params.providerOrderId,
      providerPaymentId,
      signature: gateway.sign(request.params.providerOrderId, providerPaymentId),
    };
  });
};
