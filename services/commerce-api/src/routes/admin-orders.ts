import { AdminNotification, AdminNotificationListQuery, AdminOrderDetail, AdminOrderListItem, AdminOrderListQuery, AttentionResolve, FulfilmentStep, OrderCancel, RefundCreate, ShipmentBook } from "@kleawip/contract";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import { authorize, staffOf } from "../auth/guard";
import type { Database } from "../db/client";
import { notFound } from "../errors";
import { adminOrder, listAdminOrders } from "../orders/admin";
import { clearAttention, createRefund, retryRefund, setFulfilmentStep, staffCancelOrder } from "../orders/lifecycle";
import type { CommerceSettings } from "../checkout/settings";
import { invoiceFor, type InvoiceDocument } from "../invoices/service";
import { renderInvoiceHtml } from "../invoices/render";
import type { PaymentGateway } from "../payments/gateway";
import type { ShippingProvider } from "../shipping/provider";
import { listNotifications, retryNotification } from "../notifications/outbox";
import { bookShipment, cancelShipment, requestPickup, retryBooking } from "../shipping/shipments";

export const adminOrderRoutes = (db: Database, gateway: PaymentGateway, shipping: ShippingProvider | null, settings: CommerceSettings): FastifyPluginAsync => async (app) => {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "private, no-store");
  });
  const read = { preHandler: authorize(db, "orders.read") };

  app.get("/orders", read, async (request) => {
    const result = await listAdminOrders(db, AdminOrderListQuery.parse(request.query));
    return { data: z.array(AdminOrderListItem).parse(result.data), totalCount: result.totalCount };
  });

  app.get<{ Params: { id: string } }>("/orders/:id", read, async (request) => AdminOrderDetail.parse(await adminOrder(db, request.params.id)));

  type IdParams = { Params: { id: string } };
  const manage = { preHandler: authorize(db, "orders.manage") };
  const money = { preHandler: authorize(db, "orders.refund") };
  const detail = async (id: string) => AdminOrderDetail.parse(await adminOrder(db, id));

  app.post<IdParams>("/orders/:id/fulfilment", manage, async (request) => {
    await setFulfilmentStep(db, request.params.id, FulfilmentStep.parse(request.body).fulfilmentStatus, staffOf(request).staffId);
    return detail(request.params.id);
  });

  // Cancelling a paid order moves money, so it needs the refund permission.
  app.post<IdParams>("/orders/:id/cancel", money, async (request) => {
    await staffCancelOrder(db, gateway, request.params.id, OrderCancel.parse(request.body).reason, staffOf(request).staffId);
    return detail(request.params.id);
  });

  app.post<IdParams>("/orders/:id/refunds", money, async (request, reply) => {
    await createRefund(db, gateway, request.params.id, RefundCreate.parse(request.body), staffOf(request).staffId);
    return reply.status(201).send(await detail(request.params.id));
  });

  app.post<{ Params: { id: string; refundId: string } }>("/orders/:id/refunds/:refundId/retry", money, async (request) => {
    await retryRefund(db, gateway, request.params.id, request.params.refundId, staffOf(request).staffId);
    return detail(request.params.id);
  });

  app.post<IdParams>("/orders/:id/resolve-attention", money, async (request) => {
    await clearAttention(db, request.params.id, AttentionResolve.parse(request.body).note, staffOf(request).staffId);
    return detail(request.params.id);
  });

  // ---- Shipments (orders.manage) ----
  app.post<IdParams>("/orders/:id/shipment", manage, async (request, reply) => {
    await bookShipment(db, shipping, settings, request.params.id, ShipmentBook.parse(request.body ?? {}), staffOf(request).staffId);
    return reply.status(201).send(await detail(request.params.id));
  });
  app.post<IdParams>("/orders/:id/shipment/retry", manage, async (request) => {
    await retryBooking(db, shipping, request.params.id, staffOf(request).staffId);
    return detail(request.params.id);
  });
  app.post<IdParams>("/orders/:id/shipment/pickup", manage, async (request) => {
    await requestPickup(db, shipping, request.params.id, staffOf(request).staffId);
    return detail(request.params.id);
  });
  app.post<IdParams>("/orders/:id/shipment/cancel", manage, async (request) => {
    await cancelShipment(db, shipping, request.params.id, staffOf(request).staffId);
    return detail(request.params.id);
  });

  // ---- Customer notifications (WhatsApp/email outbox) ----
  app.get("/notifications", read, async (request) => ({
    data: z.array(AdminNotification).parse(await listNotifications(db, AdminNotificationListQuery.parse(request.query))),
  }));
  app.post<IdParams>("/notifications/:id/retry", manage, async (request) => {
    if (!/^[0-9a-f-]{36}$/i.test(request.params.id) || !(await retryNotification(db, request.params.id))) {
      throw notFound("No failed or skipped message with that id.");
    }
    return { status: "pending" };
  });

  // Printable GST invoice (HTML; staff print it into the parcel).
  app.get<IdParams>("/orders/:id/invoice", read, async (request, reply) => {
    const invoice = /^[0-9a-f-]{36}$/i.test(request.params.id) ? await invoiceFor(db, request.params.id) : null;
    if (!invoice) throw notFound("No invoice has been issued for this order yet.");
    return sendInvoice(reply, renderInvoiceHtml(invoice.document as InvoiceDocument, invoice.status));
  });
};

/** HTML with a CSP that allows only the page's own inline styles: no scripts, no external loads. */
export function sendInvoice(reply: FastifyReply, html: string) {
  return reply
    .header("content-type", "text/html; charset=utf-8")
    .header("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'")
    .send(html);
}
