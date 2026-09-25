import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authorize, staffOf } from "../auth/guard";
import type { Database } from "../db/client";
import { getSettings, updateSettings } from "../settings/service";

const SettingsSchema = z.object({ instagramEmbedsVerified: z.boolean() });

/** Owner switches (Settings → Content). Everyone signed in can read them; only the owner changes them. */
export const adminSettingsRoutes = (db: Database): FastifyPluginAsync => async (app) => {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "private, no-store");
  });
  app.get("/settings", { preHandler: authorize(db, null) }, async () => SettingsSchema.parse(await getSettings(db)));
  app.patch("/settings", { preHandler: authorize(db, "staff.manage") }, async (request) =>
    SettingsSchema.parse(await updateSettings(db, SettingsSchema.partial().parse(request.body), staffOf(request).staffId)),
  );
};
