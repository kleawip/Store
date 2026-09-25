import type { MediaAsset } from "@kleawip/contract";
import { and, asc, count, desc, eq, ilike, inArray, max, or, sql } from "drizzle-orm";
import { recordAudit } from "../audit";
import type { Database } from "../db/client";
import { collections, heroSlides, mediaAssets, productMedia, productOptionValues, productOptions, products } from "../db/schema";
import { ApiError, notFound } from "../errors";
import { deliveryKey, originalKey, processImage } from "./process";
import type { MediaStorage } from "./storage";

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const invalid = (path: string, code: string, message: string) =>
  new ApiError(422, "VALIDATION_FAILED", "Validation failed", message, [{ path, code, message }]);

type AssetRow = typeof mediaAssets.$inferSelect;

async function usageFor(db: Database, assetIds: string[]) {
  if (!assetIds.length) return new Map<string, MediaAsset["usedBy"]>();
  const [productUses, collectionUses, slideUses] = await Promise.all([
    db
      .selectDistinct({ assetId: productMedia.assetId, id: products.id, title: products.title })
      .from(productMedia)
      .innerJoin(products, eq(products.id, productMedia.productId))
      .where(inArray(productMedia.assetId, assetIds)),
    db
      .select({ assetId: collections.bannerAssetId, id: collections.id, title: collections.title })
      .from(collections)
      .where(inArray(collections.bannerAssetId, assetIds)),
    db
      .select({ id: heroSlides.id, title: heroSlides.internalTitle, desktop: heroSlides.desktopAssetId, tablet: heroSlides.tabletAssetId, mobile: heroSlides.mobileAssetId })
      .from(heroSlides)
      .where(or(inArray(heroSlides.desktopAssetId, assetIds), inArray(heroSlides.tabletAssetId, assetIds), inArray(heroSlides.mobileAssetId, assetIds))),
  ]);
  const usage = new Map<string, MediaAsset["usedBy"]>(assetIds.map((id) => [id, []]));
  for (const use of productUses) usage.get(use.assetId!)!.push({ type: "product", id: use.id, title: use.title });
  for (const use of collectionUses) usage.get(use.assetId!)!.push({ type: "collection", id: use.id, title: use.title });
  for (const slide of slideUses) {
    for (const assetId of new Set([slide.desktop, slide.tablet, slide.mobile])) {
      if (assetId && usage.has(assetId)) usage.get(assetId)!.push({ type: "hero_slide", id: slide.id, title: slide.title });
    }
  }
  return usage;
}

function toAsset(row: AssetRow, usedBy: MediaAsset["usedBy"]): MediaAsset {
  return {
    id: row.id,
    url: row.url,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    originalFilename: row.originalFilename,
    alt: row.alt,
    createdAt: row.createdAt.toISOString(),
    usedBy,
  };
}

async function assetRow(db: Database, id: string) {
  if (!isUuid(id)) throw notFound("Media not found.");
  const [row] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id));
  if (!row) throw notFound("Media not found.");
  return row;
}

export async function getAsset(db: Database, id: string) {
  const row = await assetRow(db, id);
  return toAsset(row, (await usageFor(db, [row.id])).get(row.id)!);
}

/** Uploads (or de-duplicates) an image. Identical bytes return the existing asset instead of a copy. */
export async function uploadAsset(
  db: Database,
  storage: MediaStorage,
  file: { buffer: Buffer; filename: string },
  alt: string,
  actorStaffId: string | null,
): Promise<{ asset: MediaAsset; duplicate: boolean }> {
  const image = await processImage(file.buffer);
  const [existing] = await db.select().from(mediaAssets).where(eq(mediaAssets.sha256, image.sha256));
  if (existing) return { asset: await getAsset(db, existing.id), duplicate: true };

  const storageKey = deliveryKey(image.sha256);
  const origKey = originalKey(image.sha256, image.original.ext);
  await storage.put(origKey, image.original.buffer, image.original.mime);
  await storage.put(storageKey, image.delivery.buffer, "image/webp");

  const [row] = await db
    .insert(mediaAssets)
    .values({
      storageKey,
      originalKey: origKey,
      url: storage.publicUrl(storageKey),
      originalFilename: file.filename.slice(0, 200),
      originalMime: image.original.mime,
      width: image.delivery.width,
      height: image.delivery.height,
      bytes: image.delivery.buffer.length,
      sha256: image.sha256,
      alt: alt.trim().slice(0, 250),
      uploadedByStaffId: actorStaffId,
    })
    .onConflictDoNothing({ target: mediaAssets.sha256 })
    .returning();
  // Two identical uploads raced: the other one won, so return its row.
  if (!row) {
    const [winner] = await db.select().from(mediaAssets).where(eq(mediaAssets.sha256, image.sha256));
    return { asset: await getAsset(db, winner!.id), duplicate: true };
  }
  return { asset: toAsset(row, []), duplicate: false };
}

export async function listAssets(db: Database, query: { q?: string; unused?: "true" | "false"; limit: number; offset: number }) {
  const used = sql`(EXISTS (SELECT 1 FROM product_media pm WHERE pm.asset_id = ${mediaAssets.id})
    OR EXISTS (SELECT 1 FROM collections c WHERE c.banner_asset_id = ${mediaAssets.id})
    OR EXISTS (SELECT 1 FROM hero_slides h WHERE ${mediaAssets.id} IN (h.desktop_asset_id, h.tablet_asset_id, h.mobile_asset_id)))`;
  const where = and(
    query.q ? or(ilike(mediaAssets.originalFilename, `%${query.q}%`), ilike(mediaAssets.alt, `%${query.q}%`)) : undefined,
    query.unused === "true" ? sql`NOT ${used}` : query.unused === "false" ? used : undefined,
  );
  const [rows, [total]] = await Promise.all([
    db.select().from(mediaAssets).where(where).orderBy(desc(mediaAssets.createdAt), asc(mediaAssets.id)).limit(query.limit).offset(query.offset),
    db.select({ value: count() }).from(mediaAssets).where(where),
  ]);
  const usage = await usageFor(db, rows.map((row) => row.id));
  return { data: rows.map((row) => toAsset(row, usage.get(row.id)!)), totalCount: total?.value ?? 0 };
}

export async function updateAssetAlt(db: Database, id: string, alt: string) {
  await assetRow(db, id);
  await db.update(mediaAssets).set({ alt }).where(eq(mediaAssets.id, id));
  return getAsset(db, id);
}

/** Deletes an unused asset and its files. Blocked (with the list of uses) while anything references it. */
export async function deleteAsset(db: Database, storage: MediaStorage, id: string) {
  const asset = await getAsset(db, id);
  if (asset.usedBy.length) {
    const where = asset.usedBy.map((use) => `${use.type} "${use.title}"`).join(", ");
    throw invalid("id", "in_use", `This image is still used by ${where}. Remove it there first.`);
  }
  const [row] = await db.delete(mediaAssets).where(eq(mediaAssets.id, id)).returning();
  if (row) {
    await storage.remove(row.storageKey);
    await storage.remove(row.originalKey);
  }
}

// ---- Product images ----

async function optionValueId(db: Database, productId: string, ref: string | null) {
  if (ref === null) return null;
  const [code, valueCode] = ref.split(":");
  const [row] = await db
    .select({ id: productOptionValues.id })
    .from(productOptionValues)
    .innerJoin(productOptions, eq(productOptions.id, productOptionValues.optionId))
    .where(and(eq(productOptions.productId, productId), eq(productOptions.code, code!), eq(productOptionValues.code, valueCode!)));
  if (!row) throw invalid("optionValue", "unknown", `"${ref}" is not an option value of this product.`);
  return row.id;
}

async function requireProduct(db: Database, productId: string) {
  if (!isUuid(productId)) throw notFound("Product not found.");
  const [row] = await db.select({ id: products.id }).from(products).where(eq(products.id, productId));
  if (!row) throw notFound("Product not found.");
}

export async function attachProductMedia(
  db: Database,
  productId: string,
  input: { assetId: string; alt?: string; optionValue: string | null },
  actorStaffId: string,
) {
  await requireProduct(db, productId);
  const asset = await assetRow(db, input.assetId).catch(() => {
    throw invalid("assetId", "unknown", "That image is not in the media library.");
  });
  const optionId = await optionValueId(db, productId, input.optionValue);
  await db.transaction(async (tx) => {
    const [{ value: last } = { value: null }] = await tx.select({ value: max(productMedia.position) }).from(productMedia).where(eq(productMedia.productId, productId));
    const [row] = await tx
      .insert(productMedia)
      .values({
        productId,
        assetId: asset.id,
        url: asset.url,
        alt: input.alt ?? asset.alt,
        width: asset.width,
        height: asset.height,
        position: (last ?? -1) + 1,
        optionValueId: optionId,
      })
      .returning();
    await recordAudit(tx, { entityType: "product", entityId: productId, action: "media.attached", actorStaffId, after: { mediaId: row!.id, assetId: asset.id, alt: row!.alt } });
  });
}

async function productMediaRow(db: Database, productId: string, mediaId: string) {
  if (!isUuid(mediaId)) throw notFound("Image not found on this product.");
  const [row] = await db.select().from(productMedia).where(and(eq(productMedia.id, mediaId), eq(productMedia.productId, productId)));
  if (!row) throw notFound("Image not found on this product.");
  return row;
}

export async function updateProductMedia(
  db: Database,
  productId: string,
  mediaId: string,
  patch: { alt?: string; optionValue?: string | null },
  actorStaffId: string,
) {
  await requireProduct(db, productId);
  const current = await productMediaRow(db, productId, mediaId);
  const changes = {
    ...(patch.alt !== undefined ? { alt: patch.alt } : {}),
    ...(patch.optionValue !== undefined ? { optionValueId: await optionValueId(db, productId, patch.optionValue) } : {}),
  };
  if (!Object.keys(changes).length) return;
  await db.transaction(async (tx) => {
    await tx.update(productMedia).set({ ...changes, updatedAt: new Date() }).where(eq(productMedia.id, mediaId));
    await recordAudit(tx, { entityType: "product", entityId: productId, action: "media.updated", actorStaffId, before: { mediaId, alt: current.alt }, after: { mediaId, ...patch } });
  });
}

export async function removeProductMedia(db: Database, productId: string, mediaId: string, actorStaffId: string) {
  await requireProduct(db, productId);
  const current = await productMediaRow(db, productId, mediaId);
  await db.transaction(async (tx) => {
    await tx.delete(productMedia).where(eq(productMedia.id, mediaId));
    await recordAudit(tx, { entityType: "product", entityId: productId, action: "media.removed", actorStaffId, before: { mediaId, url: current.url } });
  });
}

/** Sets gallery order. The list must contain exactly the product's current images. */
export async function reorderProductMedia(db: Database, productId: string, mediaIds: string[], actorStaffId: string) {
  await requireProduct(db, productId);
  const current = await db.select({ id: productMedia.id }).from(productMedia).where(eq(productMedia.productId, productId));
  const same = current.length === mediaIds.length && new Set(mediaIds).size === mediaIds.length && current.every((row) => mediaIds.includes(row.id));
  if (!same) throw invalid("mediaIds", "mismatch", "Send every image of this product exactly once.");
  await db.transaction(async (tx) => {
    for (const [position, id] of mediaIds.entries()) await tx.update(productMedia).set({ position }).where(eq(productMedia.id, id));
    await recordAudit(tx, { entityType: "product", entityId: productId, action: "media.reordered", actorStaffId, after: { mediaIds } });
  });
}
