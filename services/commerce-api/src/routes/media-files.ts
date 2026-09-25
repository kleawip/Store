import type { FastifyPluginAsync } from "fastify";
import { notFound } from "../errors";
import type { MediaStorage } from "../media/storage";

const CONTENT_TYPES: Record<string, string> = { webp: "image/webp", mp4: "video/mp4", webm: "video/webm" };

/**
 * Serves delivery images and product videos from local development storage. Originals are never served.
 * Keys are content-addressed, so responses are cacheable forever. Supports single HTTP byte ranges, which
 * browsers need to seek in video (iOS Safari won't play video without them).
 */
export const mediaFileRoutes = (storage: MediaStorage): FastifyPluginAsync => async (app) => {
  app.get<{ Params: { "*": string } }>("/*", async (request, reply) => {
    const key = request.params["*"];
    if (!key.startsWith("media/") && !key.startsWith("videos/")) throw notFound("File not found.");
    const contentType = CONTENT_TYPES[key.split(".").pop() ?? ""];
    const head = contentType ? await storage.read?.(key) : null;
    if (!head || !contentType) throw notFound("File not found.");
    head.stream.destroy();

    reply
      .header("content-type", contentType)
      .header("accept-ranges", "bytes")
      .header("cache-control", "public, max-age=31536000, immutable")
      .header("x-content-type-options", "nosniff");

    const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? "");
    if (!match || (match[1] === "" && match[2] === "")) {
      const file = (await storage.read!(key))!;
      return reply.header("content-length", file.size).send(file.stream);
    }
    const size = head.size;
    // "bytes=START-END", "bytes=START-" or the suffix form "bytes=-LENGTH".
    let start = match[1] === "" ? Math.max(0, size - Number(match[2])) : Number(match[1]);
    let end = match[1] === "" || match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
    if (start > end || start >= size) {
      return reply.status(416).header("content-range", `bytes */${size}`).send();
    }
    start = Math.max(0, start);
    end = Math.max(start, end);
    const part = (await storage.read!(key, { start, end }))!;
    return reply
      .status(206)
      .header("content-range", `bytes ${start}-${end}/${size}`)
      .header("content-length", end - start + 1)
      .send(part.stream);
  });
};
