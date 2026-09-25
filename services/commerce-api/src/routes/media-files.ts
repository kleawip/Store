import type { FastifyPluginAsync } from "fastify";
import { notFound } from "../errors";
import type { MediaStorage } from "../media/storage";

/**
 * Serves delivery images from local development storage. Originals are never served publicly.
 * Keys are content-addressed, so responses are cacheable forever.
 */
export const mediaFileRoutes = (storage: MediaStorage): FastifyPluginAsync => async (app) => {
  app.get<{ Params: { "*": string } }>("/*", async (request, reply) => {
    const key = request.params["*"];
    if (!key.startsWith("media/")) throw notFound("File not found.");
    const file = await storage.read?.(key);
    if (!file) throw notFound("File not found.");
    return reply
      .header("content-type", "image/webp")
      .header("content-length", file.size)
      .header("cache-control", "public, max-age=31536000, immutable")
      .header("x-content-type-options", "nosniff")
      .send(file.stream);
  });
};
