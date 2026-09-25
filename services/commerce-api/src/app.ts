import cors from "@fastify/cors";
import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import type { Database } from "./db/client";
import { errorHandler, notFoundHandler } from "./errors";
import { storeCatalogueRoutes } from "./routes/store-catalogue";

export type AppOptions = {
  db: Database;
  storefrontOrigins: string[];
  logger?: boolean;
};

export async function buildApp({ db, storefrontOrigins, logger = false }: AppOptions) {
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

  app.get("/health", async () => ({ status: "ok" }));
  await app.register(storeCatalogueRoutes(db), { prefix: "/v1/store" });

  return app;
}
