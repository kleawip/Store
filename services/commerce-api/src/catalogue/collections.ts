// Collections: hand-curated, ordered product lists (ADMIN_SCREENS_BRIEF §7). Rule-based collections are out of scope.
import type { AdminCollection, CollectionDetail, ProductListItem } from "@kleawip/contract";
import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { recordAudit } from "../audit";
import type { Database } from "../db/client";
import { collectionProducts, collections, mediaAssets, productMedia, products, categories } from "../db/schema";
import { ApiError, notFound } from "../errors";
import { slugify } from "./admin-service";
import { productSummaries } from "./queries";

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const invalid = (path: string, code: string, message: string) =>
  new ApiError(422, "VALIDATION_FAILED", "Validation failed", message, [{ path, code, message }]);

async function collectionRow(db: Database, id: string) {
  if (!isUuid(id)) throw notFound("Collection not found.");
  const [row] = await db.select().from(collections).where(eq(collections.id, id));
  if (!row) throw notFound("Collection not found.");
  return row;
}

async function uniqueSlug(db: Database, base: string) {
  const taken = new Set(
    (await db.select({ slug: collections.slug }).from(collections).where(or(eq(collections.slug, base), ilike(collections.slug, `${base}-%`)))).map((r) => r.slug),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

function translateDbError(error: unknown): never {
  const pg = (error as { cause?: { code?: string; constraint?: string } }).cause;
  if (pg?.code === "23505" && pg.constraint === "collections_slug_key") throw invalid("slug", "duplicate", "Another collection already uses this slug.");
  throw error;
}

// ---- Admin ----

export async function adminCollection(db: Database, id: string): Promise<AdminCollection> {
  const row = await collectionRow(db, id);
  const [banner, members] = await Promise.all([
    row.bannerAssetId ? db.select().from(mediaAssets).where(eq(mediaAssets.id, row.bannerAssetId)).then((rows) => rows[0]) : Promise.resolve(undefined),
    db
      .select({
        id: products.id,
        title: products.title,
        slug: products.slug,
        status: products.status,
        thumbnailUrl: sql<string | null>`(SELECT m.url FROM product_media m WHERE m.product_id = ${products.id} ORDER BY m.position LIMIT 1)`,
      })
      .from(collectionProducts)
      .innerJoin(products, eq(products.id, collectionProducts.productId))
      .where(eq(collectionProducts.collectionId, id))
      .orderBy(asc(collectionProducts.position)),
  ]);
  const publishedCount = members.filter((member) => member.status === "published").length;
  return {
    id: row.id,
    slug: row.slug,
    slugLocked: row.publishedAt !== null,
    title: row.title,
    description: row.description,
    status: row.status,
    banner: banner ? { assetId: banner.id, url: banner.url, width: banner.width, height: banner.height, alt: row.bannerAlt } : null,
    position: row.position,
    products: members,
    publishChecklist: [
      { code: "has_published_product", ok: publishedCount > 0, message: "Add at least one published product." },
      { code: "banner_alt_text", ok: !banner || row.bannerAlt.trim().length > 0, message: "The banner image needs alt text." },
    ],
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listAdminCollections(db: Database) {
  const rows = await db
    .select({
      id: collections.id,
      slug: collections.slug,
      title: collections.title,
      status: collections.status,
      updatedAt: collections.updatedAt,
      productCount: sql<number>`(SELECT count(*)::int FROM collection_products cp WHERE cp.collection_id = ${collections.id})`,
    })
    .from(collections)
    .orderBy(asc(collections.position), asc(collections.title));
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
}

export async function createCollection(db: Database, input: { title: string; slug?: string; description: string }, actorStaffId: string) {
  const slug = input.slug ?? (await uniqueSlug(db, slugify(input.title)));
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.insert(collections).values({ title: input.title, slug, description: input.description }).returning();
      await recordAudit(tx, { entityType: "collection", entityId: row!.id, action: "collection.created", actorStaffId, after: { ...input, slug } });
      return row!.id;
    });
  } catch (error) {
    translateDbError(error);
  }
}

export async function updateCollection(
  db: Database,
  id: string,
  patch: { title?: string; slug?: string; description?: string; bannerAssetId?: string | null; bannerAlt?: string; position?: number },
  actorStaffId: string,
) {
  const current = await collectionRow(db, id);
  if (patch.slug !== undefined && patch.slug !== current.slug && current.publishedAt) {
    throw invalid("slug", "slug_locked", "The slug cannot change after the collection has been published.");
  }
  if (patch.bannerAssetId) {
    const [asset] = await db.select({ id: mediaAssets.id }).from(mediaAssets).where(eq(mediaAssets.id, patch.bannerAssetId));
    if (!asset) throw invalid("bannerAssetId", "unknown", "That image is not in the media library.");
  }
  if (!Object.keys(patch).length) return;
  try {
    await db.transaction(async (tx) => {
      await tx.update(collections).set({ ...patch, updatedAt: new Date() }).where(eq(collections.id, id));
      const before = Object.fromEntries(Object.keys(patch).map((key) => [key, (current as Record<string, unknown>)[key]]));
      await recordAudit(tx, { entityType: "collection", entityId: id, action: "collection.updated", actorStaffId, before, after: patch });
    });
  } catch (error) {
    translateDbError(error);
  }
}

/** Replaces the ordered product list. Drafts may be included; they stay hidden until published. */
export async function setCollectionProducts(db: Database, id: string, productIds: string[], actorStaffId: string) {
  await collectionRow(db, id);
  if (new Set(productIds).size !== productIds.length) throw invalid("productIds", "duplicate", "A product appears more than once.");
  if (productIds.length) {
    const found = await db.select({ id: products.id }).from(products).where(inArray(products.id, productIds));
    const missing = productIds.filter((pid) => !found.some((row) => row.id === pid));
    if (missing.length) throw invalid("productIds", "unknown", `Unknown product id(s): ${missing.join(", ")}.`);
  }
  await db.transaction(async (tx) => {
    const before = await tx.select({ productId: collectionProducts.productId }).from(collectionProducts).where(eq(collectionProducts.collectionId, id)).orderBy(asc(collectionProducts.position));
    await tx.delete(collectionProducts).where(eq(collectionProducts.collectionId, id));
    if (productIds.length) {
      await tx.insert(collectionProducts).values(productIds.map((productId, position) => ({ collectionId: id, productId, position })));
    }
    await tx.update(collections).set({ updatedAt: new Date() }).where(eq(collections.id, id));
    await recordAudit(tx, {
      entityType: "collection",
      entityId: id,
      action: "collection.products_set",
      actorStaffId,
      before: { productIds: before.map((row) => row.productId) },
      after: { productIds },
    });
  });
}

export async function setCollectionStatus(db: Database, id: string, status: "published" | "draft" | "archived", actorStaffId: string) {
  const current = await collectionRow(db, id);
  if (status === "published") {
    const blocking = (await adminCollection(db, id)).publishChecklist.filter((check) => !check.ok);
    if (blocking.length) {
      throw new ApiError(
        422,
        "PUBLISH_BLOCKED",
        "Cannot publish yet",
        `${blocking.length} item(s) must be fixed before publishing.`,
        blocking.map((check) => ({ path: `publishChecklist.${check.code}`, code: check.code, message: check.message })),
      );
    }
  }
  if (current.status === status) return;
  await db.transaction(async (tx) => {
    await tx
      .update(collections)
      .set({ status, updatedAt: new Date(), ...(status === "published" && !current.publishedAt ? { publishedAt: new Date() } : {}) })
      .where(eq(collections.id, id));
    await recordAudit(tx, { entityType: "collection", entityId: id, action: `collection.${status}`, actorStaffId, before: { status: current.status }, after: { status } });
  });
}

// ---- Storefront ----

const publishedMembers = sql`(SELECT count(*)::int FROM collection_products cp JOIN products p ON p.id = cp.product_id
  WHERE cp.collection_id = ${collections.id} AND p.status = 'published')`;

export async function storeCollections(db: Database) {
  const rows = await db
    .select({
      slug: collections.slug,
      title: collections.title,
      description: collections.description,
      bannerAlt: collections.bannerAlt,
      banner: mediaAssets,
      productCount: sql<number>`${publishedMembers}`,
    })
    .from(collections)
    .leftJoin(mediaAssets, eq(mediaAssets.id, collections.bannerAssetId))
    .where(eq(collections.status, "published"))
    .orderBy(asc(collections.position), asc(collections.title));
  return rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    description: row.description,
    banner: row.banner ? { url: row.banner.url, alt: row.bannerAlt, width: row.banner.width, height: row.banner.height } : null,
    productCount: row.productCount,
  }));
}

export async function storeCollection(db: Database, slug: string): Promise<CollectionDetail | null> {
  const [row] = await db
    .select({ collection: collections, banner: mediaAssets })
    .from(collections)
    .leftJoin(mediaAssets, eq(mediaAssets.id, collections.bannerAssetId))
    .where(and(eq(collections.slug, slug), eq(collections.status, "published")));
  if (!row) return null;

  const members = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      detail: products.detail,
      spec: products.spec,
      isDemo: products.isDemo,
      category: categories.slug,
    })
    .from(collectionProducts)
    .innerJoin(products, eq(products.id, collectionProducts.productId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(collectionProducts.collectionId, row.collection.id), eq(products.status, "published")))
    .orderBy(asc(collectionProducts.position));

  const ids = members.map((member) => member.id);
  const [media, summaries] = await Promise.all([
    ids.length ? db.select().from(productMedia).where(inArray(productMedia.productId, ids)).orderBy(asc(productMedia.position)) : Promise.resolve([]),
    productSummaries(db, ids),
  ]);

  const items: ProductListItem[] = members.map((member) => {
    const summary = summaries.get(member.id)!;
    return {
      slug: member.slug,
      title: member.title,
      detail: member.detail,
      category: member.category,
      spec: member.spec,
      images: media.filter((image) => image.productId === member.id).map(({ url, alt, width, height }) => ({ url, alt, width, height })),
      priceFrom: summary.priceFrom,
      priceStatus: summary.priceFrom ? "approved" : "pending",
      availability: summary.availability,
      badge: null,
      isDemo: member.isDemo,
    };
  });

  return {
    slug: row.collection.slug,
    title: row.collection.title,
    description: row.collection.description,
    banner: row.banner ? { url: row.banner.url, alt: row.collection.bannerAlt, width: row.banner.width, height: row.banner.height } : null,
    productCount: items.length,
    products: items,
  };
}

