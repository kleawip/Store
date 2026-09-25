import {
  CategoryListResponse,
  ProductListQuery,
  ProductListResponse,
  type ProductListItem,
} from "@kleawip/contract";
import { and, asc, count, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client";
import { categories, productMedia, products } from "../db/schema";
import { ApiError } from "../errors";

const PUBLIC_CACHE = "public, max-age=60, stale-while-revalidate=300";

// Opaque keyset cursor over the (position, slug) ordering.
const Cursor = z.object({ p: z.number().int(), s: z.string() });

function encodeCursor(position: number, slug: string) {
  return Buffer.from(JSON.stringify({ p: position, s: slug })).toString("base64url");
}

function decodeCursor(raw: string) {
  try {
    return Cursor.parse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
  } catch {
    throw new ApiError(422, "VALIDATION_FAILED", "Validation failed", "Invalid cursor.", [
      { path: "cursor", code: "invalid_cursor", message: "Cursor is malformed or expired." },
    ]);
  }
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export const storeCatalogueRoutes = (db: Database): FastifyPluginAsync => async (app) => {
  app.get("/categories", async (_request, reply) => {
    const rows = await db
      .select({
        slug: categories.slug,
        title: categories.title,
        note: categories.note,
        tone: categories.tone,
        productCount: count(products.id),
      })
      .from(categories)
      .leftJoin(products, and(eq(products.categoryId, categories.id), eq(products.status, "published")))
      .groupBy(categories.id)
      .orderBy(asc(categories.position), asc(categories.slug));

    reply.header("cache-control", PUBLIC_CACHE);
    return CategoryListResponse.parse({ data: rows });
  });

  app.get("/products", async (request, reply) => {
    const query = ProductListQuery.parse(request.query);
    const filters: SQL[] = [eq(products.status, "published")];

    if (query.category) filters.push(eq(categories.slug, query.category));
    if (query.q) {
      const pattern = `%${escapeLike(query.q)}%`;
      filters.push(or(ilike(products.title, pattern), ilike(products.detail, pattern), ilike(categories.title, pattern))!);
    }
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      filters.push(sql`(${products.position}, ${products.slug}) > (${cursor.p}, ${cursor.s})`);
    }

    // Only "featured" ordering exists until variants and prices are approved. Every price is
    // pending, so price_asc/price_desc would be ties and fall back to this same order.
    const rows = await db
      .select({
        id: products.id,
        slug: products.slug,
        title: products.title,
        detail: products.detail,
        spec: products.spec,
        position: products.position,
        isDemo: products.isDemo,
        category: categories.slug,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(and(...filters))
      .orderBy(asc(products.position), asc(products.slug))
      .limit(query.limit + 1);

    const pageRows = rows.slice(0, query.limit);
    const last = pageRows.at(-1);
    const nextCursor = rows.length > query.limit && last ? encodeCursor(last.position, last.slug) : null;

    const media = pageRows.length
      ? await db
          .select()
          .from(productMedia)
          .where(inArray(productMedia.productId, pageRows.map((row) => row.id)))
          .orderBy(asc(productMedia.position))
      : [];

    const data: ProductListItem[] = pageRows.map((row) => ({
      slug: row.slug,
      title: row.title,
      detail: row.detail,
      category: row.category,
      spec: row.spec,
      images: media
        .filter((image) => image.productId === row.id)
        .map(({ url, alt, width, height }) => ({ url, alt, width, height })),
      // No approved variants or prices exist yet (Phase 0), so nothing is purchasable.
      priceFrom: null,
      priceStatus: "pending",
      availability: "not_for_sale",
      isDemo: row.isDemo,
    }));

    reply.header("cache-control", PUBLIC_CACHE);
    return ProductListResponse.parse({ data, page: { nextCursor } });
  });
};
