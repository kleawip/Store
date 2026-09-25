import {
  AdminInventoryAdjustment,
  AdminOptionsReplace,
  AdminProduct,
  AdminProductCreate,
  AdminProductListQuery,
  AdminProductListResponse,
  AdminProductUpdate,
  AdminVariantCreate,
  AdminVariantUpdate,
  AuditCommentCreate,
  AuditEvent,
} from "@kleawip/contract";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { listAudit, recordAudit } from "../audit";
import { authorize, forbidden, staffOf } from "../auth/guard";
import { can } from "../auth/permissions";
import {
  adminProduct,
  createProduct,
  createVariant,
  listAdminProducts,
  replaceOptions,
  setProductStatus,
  updateProduct,
  updateVariant,
} from "../catalogue/admin-service";
import type { Database } from "../db/client";
import { adjustInventory, inventoryMovementHistory, listInventory } from "../inventory/admin-service";
import { notFound } from "../errors";

type IdParams = { Params: { id: string } };
type SkuParams = { Params: { sku: string } };

const AUDIT_ENTITY_TYPES = ["product", "inventory_item", "collection", "order"] as const;

export const adminCatalogueRoutes = (db: Database): FastifyPluginAsync => async (app) => {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "private, no-store");
  });

  const read = { preHandler: authorize(db, "catalogue.read") };
  const write = { preHandler: authorize(db, "catalogue.write") };
  const publish = { preHandler: authorize(db, "catalogue.publish") };

  // ---- Products ----

  app.get("/products", read, async (request) => {
    return AdminProductListResponse.parse(await listAdminProducts(db, AdminProductListQuery.parse(request.query)));
  });

  app.post("/products", write, async (request, reply) => {
    const id = await createProduct(db, AdminProductCreate.parse(request.body), staffOf(request).staffId);
    return reply.status(201).send(AdminProduct.parse(await adminProduct(db, id)));
  });

  app.get<IdParams>("/products/:id", read, async (request) => AdminProduct.parse(await adminProduct(db, request.params.id)));

  app.patch<IdParams>("/products/:id", write, async (request) => {
    await updateProduct(db, request.params.id, AdminProductUpdate.parse(request.body), staffOf(request).staffId);
    return AdminProduct.parse(await adminProduct(db, request.params.id));
  });

  for (const [path, status] of [["publish", "published"], ["unpublish", "draft"], ["archive", "archived"]] as const) {
    app.post<IdParams>(`/products/:id/${path}`, publish, async (request) => {
      await setProductStatus(db, request.params.id, status, staffOf(request).staffId);
      return AdminProduct.parse(await adminProduct(db, request.params.id));
    });
  }

  app.put<IdParams>("/products/:id/options", write, async (request) => {
    await replaceOptions(db, request.params.id, AdminOptionsReplace.parse(request.body), staffOf(request).staffId);
    return AdminProduct.parse(await adminProduct(db, request.params.id));
  });

  app.post<IdParams>("/products/:id/variants", write, async (request, reply) => {
    await createVariant(db, request.params.id, AdminVariantCreate.parse(request.body), staffOf(request).staffId);
    return reply.status(201).send(AdminProduct.parse(await adminProduct(db, request.params.id)));
  });

  app.patch<SkuParams>("/variants/:sku", write, async (request) => {
    await updateVariant(db, request.params.sku, AdminVariantUpdate.parse(request.body), staffOf(request).staffId);
    return { ok: true };
  });

  // ---- Inventory ----

  app.get("/inventory", { preHandler: authorize(db, "inventory.read") }, async (request) => {
    const { filter } = z.object({ filter: z.enum(["low", "out", "untracked"]).optional() }).parse(request.query);
    return { data: await listInventory(db, filter) };
  });

  app.post<IdParams>("/inventory/:id/adjustments", { preHandler: authorize(db, "inventory.adjust") }, async (request, reply) => {
    const result = await adjustInventory(db, request.params.id, AdminInventoryAdjustment.parse(request.body), staffOf(request).staffId);
    return reply.status(201).send(result);
  });

  app.get<IdParams>("/inventory/:id/movements", { preHandler: authorize(db, "inventory.read") }, async (request) => {
    return { data: await inventoryMovementHistory(db, request.params.id) };
  });

  // ---- Timeline ----

  const TimelineParams = z.object({ entityType: z.enum(AUDIT_ENTITY_TYPES), id: z.uuid() });

  app.get<{ Params: { entityType: string; id: string } }>("/timeline/:entityType/:id", { preHandler: authorize(db, "audit.read") }, async (request) => {
    const params = TimelineParams.safeParse(request.params);
    if (!params.success) throw notFound("Timeline not found.");
    if (params.data.entityType === "order" && !can(staffOf(request).role, "orders.read")) throw forbidden("Your role can't view orders.");
    return { data: z.array(AuditEvent).parse(await listAudit(db, params.data.entityType, params.data.id)) };
  });

  app.post<{ Params: { entityType: string; id: string } }>("/timeline/:entityType/:id/comments", { preHandler: authorize(db, "audit.comment") }, async (request, reply) => {
    const params = TimelineParams.safeParse(request.params);
    if (!params.success) throw notFound("Timeline not found.");
    if (params.data.entityType === "order" && !can(staffOf(request).role, "orders.read")) throw forbidden("Your role can't view orders.");
    const { comment } = AuditCommentCreate.parse(request.body);
    await recordAudit(db, { entityType: params.data.entityType, entityId: params.data.id, action: "comment", actorStaffId: staffOf(request).staffId, comment });
    return reply.status(201).send({ ok: true });
  });
};
