import { AdminOrderListItem, AdminOrderListQuery, AdminOrderPayment, AdminRefund, AttentionResolve, FulfilmentStep, Order, OrderCancel, RefundCreate } from "@kleawip/contract";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authorize, staffOf } from "../auth/guard";
import type { Database } from "../db/client";
import { adminOrder, listAdminOrders } from "../orders/admin";
import { clearAttention, createRefund, retryRefund, setFulfilmentStep, staffCancelOrder } from "../orders/lifecycle";
import type { PaymentGateway } from "../payments/gateway";

const AdminOrderDetail = z.object({
  order: Order,
  customer: z.object({ id: z.string(), name: z.string(), phone: z.string(), email: z.string().nullable() }),
  payments: z.array(AdminOrderPayment),
  refunds: z.array(AdminRefund),
  cancelReason: z.string().nullable(),
  codCollected: z.object({ amount: z.number().int(), currency: z.literal("INR") }),
  needsAttention: z.string().nullable(),
});

export const adminOrderRoutes = (db: Database, gateway: PaymentGateway): FastifyPluginAsync => async (app) => {
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
};
