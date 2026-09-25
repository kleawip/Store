import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/client";
import { products, variants, wishlistItems } from "../db/schema";
import { ApiError } from "../errors";

export const MAX_WISHLIST = 200;

/** Saved items for a customer; products that are no longer published are hidden, not deleted. */
export async function listWishlist(db: Database, customerId: string) {
  const rows = await db
    .select({ productSlug: products.slug, sku: variants.sku, addedAt: wishlistItems.createdAt })
    .from(wishlistItems)
    .innerJoin(products, eq(products.id, wishlistItems.productId))
    .leftJoin(variants, eq(variants.id, wishlistItems.variantId))
    .where(and(eq(wishlistItems.customerId, customerId), eq(products.status, "published")))
    .orderBy(asc(wishlistItems.createdAt));
  return rows.map((row) => ({ productSlug: row.productSlug, sku: row.sku, addedAt: row.addedAt.toISOString() }));
}

async function resolve(db: Database, productSlug: string, sku: string | null) {
  const [product] = await db.select({ id: products.id }).from(products).where(and(eq(products.slug, productSlug), eq(products.status, "published")));
  if (!product) throw new ApiError(404, "NOT_FOUND", "Not found", "This product isn't available.");
  let variantId: string | null = null;
  if (sku) {
    const [variant] = await db.select({ id: variants.id }).from(variants).where(and(eq(variants.sku, sku.toUpperCase()), eq(variants.productId, product.id)));
    if (!variant) throw new ApiError(422, "VALIDATION_FAILED", "Validation failed", "That option doesn't belong to this product.", [{ path: "sku", code: "unknown", message: "Unknown option." }]);
    variantId = variant.id;
  }
  return { productId: product.id, variantId };
}

export async function putWishlist(db: Database, customerId: string, productSlug: string, sku: string | null) {
  const { productId, variantId } = await resolve(db, productSlug, sku);
  const count = (await db.select({ id: wishlistItems.id }).from(wishlistItems).where(eq(wishlistItems.customerId, customerId))).length;
  const [exists] = await db.select({ id: wishlistItems.id }).from(wishlistItems).where(and(eq(wishlistItems.customerId, customerId), eq(wishlistItems.productId, productId)));
  if (!exists && count >= MAX_WISHLIST) throw new ApiError(422, "VALIDATION_FAILED", "Wishlist full", `You can save up to ${MAX_WISHLIST} items.`, [{ path: "productSlug", code: "wishlist_full", message: "Your wishlist is full." }]);
  await db
    .insert(wishlistItems)
    .values({ customerId, productId, variantId })
    .onConflictDoUpdate({ target: [wishlistItems.customerId, wishlistItems.productId], set: { variantId } });
}

export async function removeWishlist(db: Database, customerId: string, productSlug: string) {
  const [product] = await db.select({ id: products.id }).from(products).where(eq(products.slug, productSlug));
  if (product) await db.delete(wishlistItems).where(and(eq(wishlistItems.customerId, customerId), eq(wishlistItems.productId, product.id)));
}

/** Imports a browser-saved wishlist after sign-in. Unknown or unpublished items are skipped silently. */
export async function mergeWishlist(db: Database, customerId: string, items: { productSlug: string; sku: string | null }[]) {
  const slugs = [...new Set(items.map((item) => item.productSlug))];
  if (!slugs.length) return;
  const found = await db.select({ slug: products.slug }).from(products).where(and(inArray(products.slug, slugs), eq(products.status, "published")));
  for (const item of items.filter((i) => found.some((f) => f.slug === i.productSlug))) {
    await putWishlist(db, customerId, item.productSlug, item.sku).catch(() => undefined);
  }
}
