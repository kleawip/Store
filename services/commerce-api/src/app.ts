import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import type { Database } from "./db/client";
import { errorHandler, notFoundHandler } from "./errors";
import { MAX_UPLOAD_BYTES } from "./media/process";
import type { MediaStorage } from "./media/storage";
import { adminAuthRoutes } from "./routes/admin-auth";
import { adminCampaignRoutes } from "./routes/admin-campaigns";
import { adminCatalogueRoutes } from "./routes/admin-catalogue";
import { adminMediaCollectionRoutes } from "./routes/admin-media-collections";
import { mediaFileRoutes } from "./routes/media-files";
import { storeCatalogueRoutes } from "./routes/store-catalogue";

export type AppOptions = {
  db: Database;
  storage: MediaStorage;
  storefrontOrigins: string[];
  /** Mark the admin session cookie Secure (HTTPS only). True everywhere except local HTTP development and tests. */
  cookieSecure?: boolean;
  logger?: boolean;
};

export async function buildApp({ db, storage, storefrontOrigins, cookieSecure = true, logger = false }: AppOptions) {
  const app = Fastify({
    logger,
    genReqId: () => `req_${randomUUID()}`,
    requestIdHeader: false,
  });

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);
  app.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  await app.register(cors, { origin: storefrontOrigins, credentials: true });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

  app.get("/health", async () => ({ status: "ok" }));
  await app.register(storeCatalogueRoutes(db), { prefix: "/v1/store" });
  await app.register(adminAuthRoutes(db, { cookieSecure }), { prefix: "/v1/admin/auth" });
  await app.register(adminCatalogueRoutes(db), { prefix: "/v1/admin" });
  await app.register(adminMediaCollectionRoutes(db, storage), { prefix: "/v1/admin" });
  await app.register(adminCampaignRoutes(db), { prefix: "/v1/admin/campaigns" });
  if (storage.read) await app.register(mediaFileRoutes(storage), { prefix: "/media" });

  return app;
}
