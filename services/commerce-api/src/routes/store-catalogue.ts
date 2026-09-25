import {
  CategoryListResponse,
  CollectionDetail,
  CollectionListResponse,
  ProductDetail,
  ProductListQuery,
  ProductListResponse,
  SearchSuggestQuery,
  SearchSuggestResponse,
  type ProductListItem,
  type SearchSuggestion,
} from "@kleawip/contract";
import { and, asc, count, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { createHash } from "node:crypto";
import { z } from "zod";
import { storeCollection, storeCollections } from "../catalogue/collections";
import { productDetail, productSummaries } from "../catalogue/queries";
import type { Database } from "../db/client";
import { categories, productMedia, products } from "../db/schema";
import { ApiError, notFound } from "../errors";

const PUBLIC_CACHE = "public, max-age=60, stale-while-revalidate=300";

const invalid = (path: string, code: string, message: string) =>
  new ApiError(422, "VALIDATION_FAILED", "Validation failed", message, [{ path, code, message }]);

// ---- Search ranking (API_CONTRACT §11 Q5) ----

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/** Matches title, detail, spec or category title; `%` and `_` in the term are literal. */
function searchFilter(q: string): SQL {
  const pattern = `%${escapeLike(q)}%`;
  return or(ilike(products.title, pattern), ilike(products.detail, pattern), ilike(products.spec, pattern), ilike(categories.title, pattern))!;
}

/** 0 exact title · 1 title prefix · 2 title contains · 3 other fields. Constant 0 without a query. */
function rankExpression(q: string | undefined): SQL<number> {
  // A bare `0` in ORDER BY would mean "column 0", so cast it; callers also skip ordering by it without a query.
  if (!q) return sql<number>`0::int`;
  const escaped = escapeLike(q);
  return sql<number>`(CASE
    WHEN lower(${products.title}) = lower(${q}) THEN 0
    WHEN ${products.title} ILIKE ${`${escaped}%`} THEN 1
    WHEN ${products.title} ILIKE ${`%${escaped}%`} THEN 2
    ELSE 3 END)`;
}

// ---- Keyset cursor bound to the filters it was issued for ----

const Cursor = z.object({ r: z.number().int(), p: z.number().int(), s: z.string(), f: z.string() });

function filterFingerprint(query: ProductListQuery) {
  const key = JSON.stringify({ category: query.category ?? null, q: query.q?.toLowerCase() ?? null, sort: query.sort });
  return createHash("sha256").update(key).digest("base64url").slice(0, 16);
}

function encodeCursor(rank: number, position: number, slug: string, fingerprint: string) {
  return Buffer.from(JSON.stringify({ r: rank, p: position, s: slug, f: fingerprint })).toString("base64url");
}

function decodeCursor(raw: string, fingerprint: string) {
  let cursor: z.infer<typeof Cursor>;
  try {
    cursor = Cursor.parse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
  } catch {
    throw invalid("cursor", "invalid_cursor", "Cursor is malformed.");
  }
  if (cursor.f !== fingerprint) throw invalid("cursor", "cursor_filter_mismatch", "Cursor was issued for different filters.");
  return cursor;
}

function parseListQuery(raw: unknown): ProductListQuery {
  const sort = (raw as Record<string, unknown> | null)?.sort;
  if (typeof sort === "string" && sort !== "featured") {
    throw invalid("sort", "unsupported_sort", `Sort "${sort}" is not available yet. Use "featured".`);
  }
  return ProductListQuery.parse(raw);
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
    const query = parseListQuery(request.query);
    const fingerprint = filterFingerprint(query);
    const rank = rankExpression(query.q);

    const published = eq(products.status, "published");
    const search = query.q ? searchFilter(query.q) : undefined;
    const byCategory = query.category ? eq(categories.slug, query.category) : undefined;
    const matching = and(published, search, byCategory);

    const pageFilters: (SQL | undefined)[] = [matching];
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor, fingerprint);
      pageFilters.push(sql`(${rank}, ${products.position}, ${products.slug}) > (${cursor.r}, ${cursor.p}, ${cursor.s})`);
    }

    const [rows, [total], categoryFacet] = await Promise.all([
      db
        .select({
          id: products.id,
          slug: products.slug,
          title: products.title,
          detail: products.detail,
          spec: products.spec,
          position: products.position,
          isDemo: products.isDemo,
          category: categories.slug,
          rank,
        })
        .from(products)
        .innerJoin(categories, eq(categories.id, products.categoryId))
        .where(and(...pageFilters))
        .orderBy(...(query.q ? [rank] : []), asc(products.position), asc(products.slug))
        .limit(query.limit + 1),
      db.select({ value: count() }).from(products).innerJoin(categories, eq(categories.id, products.categoryId)).where(matching),
      // Category facet ignores the category filter itself so every category stays selectable.
      db
        .select({ value: categories.slug, label: categories.title, count: count(products.id) })
        .from(categories)
        .innerJoin(products, and(eq(products.categoryId, categories.id), published, search))
        .groupBy(categories.id)
        .orderBy(asc(categories.position)),
    ]);

    const pageRows = rows.slice(0, query.limit);
    const last = pageRows.at(-1);
    const nextCursor = rows.length > query.limit && last ? encodeCursor(Number(last.rank), last.position, last.slug, fingerprint) : null;

    const [media, summaries] = await Promise.all([
      pageRows.length
        ? db.select().from(productMedia).where(inArray(productMedia.productId, pageRows.map((row) => row.id))).orderBy(asc(productMedia.position))
        : Promise.resolve([]),
      productSummaries(db, pageRows.map((row) => row.id)),
    ]);

    const data: ProductListItem[] = pageRows.map((row) => {
      const summary = summaries.get(row.id)!;
      return {
        slug: row.slug,
        title: row.title,
        detail: row.detail,
        category: row.category,
        spec: row.spec,
        images: media.filter((image) => image.productId === row.id).map(({ url, alt, width, height }) => ({ url, alt, width, height })),
        priceFrom: summary.priceFrom,
        priceStatus: summary.priceFrom ? "approved" : "pending",
        availability: summary.availability,
        badge: null, // no approved badges exist yet
        isDemo: row.isDemo,
      };
    });

    reply.header("cache-control", PUBLIC_CACHE);
    return ProductListResponse.parse({
      data,
      totalCount: total?.value ?? 0,
      facets: [{ code: "category", values: categoryFacet }],
      page: { nextCursor },
    });
  });

  app.get("/search/suggest", async (request, reply) => {
    const { q, limit } = SearchSuggestQuery.parse(request.query);
    reply.header("cache-control", PUBLIC_CACHE);
    if (q.length < 2) return SearchSuggestResponse.parse({ query: q, suggestions: [] });

    const pattern = `%${escapeLike(q)}%`;
    const rank = rankExpression(q);
    const [categoryRows, productRows] = await Promise.all([
      db
        .select({ slug: categories.slug, title: categories.title })
        .from(categories)
        .where(ilike(categories.title, pattern))
        .orderBy(asc(categories.position))
        .limit(limit),
      db
        .select({ id: products.id, slug: products.slug, title: products.title })
        .from(products)
        .innerJoin(categories, eq(categories.id, products.categoryId))
        .where(and(eq(products.status, "published"), searchFilter(q)))
        .orderBy(rank, asc(products.position), asc(products.slug))
        .limit(limit),
    ]);

    const thumbnails = productRows.length
      ? await db
          .select({ productId: productMedia.productId, url: productMedia.url, alt: productMedia.alt, position: productMedia.position })
          .from(productMedia)
          .where(inArray(productMedia.productId, productRows.map((row) => row.id)))
          .orderBy(asc(productMedia.position))
      : [];

    const suggestions: SearchSuggestion[] = [
      ...categoryRows.map((row) => ({ kind: "category" as const, label: row.title, href: `/shop/${row.slug}`, thumbnail: null })),
      ...productRows.map((row) => {
        const thumb = thumbnails.find((image) => image.productId === row.id);
        return {
          kind: "product" as const,
          label: row.title,
          href: `/product/${row.slug}`,
          thumbnail: thumb ? { url: thumb.url, alt: thumb.alt } : null,
        };
      }),
    ].slice(0, limit);

    return SearchSuggestResponse.parse({ query: q, suggestions });
  });

  app.get("/collections", async (_request, reply) => {
    reply.header("cache-control", PUBLIC_CACHE);
    return CollectionListResponse.parse({ data: await storeCollections(db) });
  });

  app.get<{ Params: { slug: string } }>("/collections/:slug", async (request, reply) => {
    const collection = await storeCollection(db, request.params.slug);
    if (!collection) throw notFound(`No published collection "${request.params.slug}".`);
    reply.header("cache-control", PUBLIC_CACHE);
    return CollectionDetail.parse(collection);
  });

  app.get<{ Params: { slug: string } }>("/products/:slug", async (request, reply) => {
    const detail = await productDetail(db, request.params.slug);
    if (!detail) throw notFound(`No published product "${request.params.slug}".`);
    reply.header("cache-control", PUBLIC_CACHE);
    return ProductDetail.parse(detail);
  });
};
