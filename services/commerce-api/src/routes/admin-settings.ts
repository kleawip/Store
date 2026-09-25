import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authorize, staffOf } from "../auth/guard";
import type { Database } from "../db/client";
import { getSeller, getSettings, updateSeller, updateSettings } from "../settings/service";
import { SellerDetails } from "@kleawip/contract";

const SettingsSchema = z.object({ instagramEmbedsVerified: z.boolean(), cartRemindersEnabled: z.boolean() });

/** Owner switches (Settings → Content). Everyone signed in can read them; only the owner changes them. */
export const adminSettingsRoutes = (db: Database, sellerStateCode: string): FastifyPluginAsync => async (app) => {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "private, no-store");
  });
  app.get("/settings", { preHandler: authorize(db, null) }, async () => SettingsSchema.parse(await getSettings(db)));
  app.patch("/settings", { preHandler: authorize(db, "staff.manage") }, async (request) =>
    SettingsSchema.parse(await updateSettings(db, SettingsSchema.partial().parse(request.body), staffOf(request).staffId)),
  );

  // Business details printed on GST invoices. Invoices can't be issued until these exist.
  app.get("/settings/seller", { preHandler: authorize(db, "orders.read") }, async () => ({ seller: await getSeller(db), sellerStateCode }));
  app.put("/settings/seller", { preHandler: authorize(db, "staff.manage") }, async (request) =>
    ({ seller: await updateSeller(db, SellerDetails.parse(request.body), sellerStateCode, staffOf(request).staffId), sellerStateCode }),
  );
};
