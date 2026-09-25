import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import type { Database } from "./db/client";
import { errorHandler, notFoundHandler } from "./errors";
import { adminAuthRoutes } from "./routes/admin-auth";
import { adminCatalogueRoutes } from "./routes/admin-catalogue";
import { storeCatalogueRoutes } from "./routes/store-catalogue";

export type AppOptions = {
  db: Database;
  storefrontOrigins: string[];
  /** Mark the admin session cookie Secure (HTTPS only). True everywhere except local HTTP development and tests. */
  cookieSecure?: boolean;
  logger?: boolean;
};

export async function buildApp({ db, storefrontOrigins, cookieSecure = true, logger = false }: AppOptions) {
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

  app.get("/health", async () => ({ status: "ok" }));
  await app.register(storeCatalogueRoutes(db), { prefix: "/v1/store" });
  await app.register(adminAuthRoutes(db, { cookieSecure }), { prefix: "/v1/admin/auth" });
  await app.register(adminCatalogueRoutes(db), { prefix: "/v1/admin" });

  return app;
}
