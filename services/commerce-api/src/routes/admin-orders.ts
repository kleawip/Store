import { AdminOrderListItem, AdminOrderListQuery, AdminOrderPayment, Order } from "@kleawip/contract";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authorize } from "../auth/guard";
import type { Database } from "../db/client";
import { adminOrder, listAdminOrders } from "../orders/admin";

const AdminOrderDetail = z.object({
  order: Order,
  customer: z.object({ id: z.string(), name: z.string(), phone: z.string(), email: z.string().nullable() }),
  payments: z.array(AdminOrderPayment),
  needsAttention: z.string().nullable(),
});

export const adminOrderRoutes = (db: Database): FastifyPluginAsync => async (app) => {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "private, no-store");
  });
  const read = { preHandler: authorize(db, "orders.read") };

  app.get("/orders", read, async (request) => {
    const result = await listAdminOrders(db, AdminOrderListQuery.parse(request.query));
    return { data: z.array(AdminOrderListItem).parse(result.data), totalCount: result.totalCount };
  });

  app.get<{ Params: { id: string } }>("/orders/:id", read, async (request) => AdminOrderDetail.parse(await adminOrder(db, request.params.id)));
};
