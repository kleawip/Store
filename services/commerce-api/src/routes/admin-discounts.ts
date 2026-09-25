import { AdminDiscount, AdminDiscountListQuery, DiscountInput } from "@kleawip/contract";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authorize, staffOf } from "../auth/guard";
import type { Database } from "../db/client";
import { adminDiscount, createDiscount, listDiscounts, setDiscountStatus, updateDiscount } from "../discounts/service";

type IdParams = { Params: { id: string } };

/** Discount codes: staff who talk to customers can look them up; only the Owner creates or changes them. */
export const adminDiscountRoutes = (db: Database): FastifyPluginAsync => async (app) => {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "private, no-store");
  });
  const read = { preHandler: authorize(db, "discounts.read") };
  const manage = { preHandler: authorize(db, "discounts.manage") };

  app.get("/discounts", read, async (request) => {
    const result = await listDiscounts(db, AdminDiscountListQuery.parse(request.query));
    return { data: z.array(AdminDiscount).parse(result.data), totalCount: result.totalCount };
  });
  app.get<IdParams>("/discounts/:id", read, async (request) => AdminDiscount.parse(await adminDiscount(db, request.params.id)));
  app.post("/discounts", manage, async (request, reply) =>
    reply.status(201).send(AdminDiscount.parse(await createDiscount(db, DiscountInput.parse(request.body), staffOf(request).staffId))),
  );
  app.put<IdParams>("/discounts/:id", manage, async (request) =>
    AdminDiscount.parse(await updateDiscount(db, request.params.id, DiscountInput.parse(request.body), staffOf(request).staffId)),
  );
  app.post<IdParams>("/discounts/:id/disable", manage, async (request) => AdminDiscount.parse(await setDiscountStatus(db, request.params.id, "disabled", staffOf(request).staffId)));
  app.post<IdParams>("/discounts/:id/enable", manage, async (request) => AdminDiscount.parse(await setDiscountStatus(db, request.params.id, "active", staffOf(request).staffId)));
};
