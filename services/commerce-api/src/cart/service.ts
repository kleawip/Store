// Server-side cart (API_CONTRACT §6 cart rule): the browser sends only SKU + quantity; every read re-prices
// from the catalogue and reports changes honestly (PRICE_CHANGED, QUANTITY_REDUCED, SKU_UNAVAILABLE).
import type { Cart, CartLine } from "@kleawip/contract";
import { and, asc, eq, inArray } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import type { DbOrTx } from "../audit";
import type { Database } from "../db/client";
import {
  cartLines,
  carts,
  inventoryItems,
  productMedia,
  productOptionValues,
  productOptions,
  products,
  variantOptionValues,
  variants,
} from "../db/schema";
import { variantAvailability } from "../domain/availability";
import { gstIncluded } from "../domain/tax";
import { ApiError } from "../errors";

export const MAX_CART_LINES = 50;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const inr = (amount: number) => ({ amount, currency: "INR" as const });

export type CartOwner = { customerId: string } | { guestToken: string };

// ---- Loading and pricing lines ----

export type PricedLine = CartLine & { variantId: string; taxRateBasisPoints: number | null; hsnCode: string | null; inventoryItemId: string; inventoryUnitsPerSale: number; weightGrams: number | null };

/** Prices stored lines against the live catalogue. Also used by checkout, so both agree to the paisa. */
export async function priceLines(db: DbOrTx, stored: { variantId: string; quantity: number; pricePaiseWhenAdded: number | null }[]): Promise<PricedLine[]> {
  if (!stored.length) return [];
  const ids = stored.map((line) => line.variantId);
  const rows = await db
    .select({ variant: variants, product: { id: products.id, slug: products.slug, title: products.title, status: products.status }, stock: inventoryItems })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .innerJoin(inventoryItems, eq(inventoryItems.id, variants.inventoryItemId))
    .where(inArray(variants.id, ids));
  // Sequential on purpose: this also runs inside transactions, where one connection can't run queries in parallel.
  const labels = await db
    .select({ variantId: variantOptionValues.variantId, option: productOptions.label, value: productOptionValues.label, position: productOptions.position })
    .from(variantOptionValues)
    .innerJoin(productOptionValues, eq(productOptionValues.id, variantOptionValues.optionValueId))
    .innerJoin(productOptions, eq(productOptions.id, productOptionValues.optionId))
    .where(inArray(variantOptionValues.variantId, ids))
    .orderBy(asc(productOptions.position));
  const images = await db
    .select({ productId: productMedia.productId, url: productMedia.url, alt: productMedia.alt, optionValueId: productMedia.optionValueId, position: productMedia.position })
    .from(productMedia)
    .where(inArray(productMedia.productId, rows.map((row) => row.product.id)))
    .orderBy(asc(productMedia.position));
  const valueLinks = await db.select().from(variantOptionValues).where(inArray(variantOptionValues.variantId, ids));

  return stored.flatMap((line) => {
    const row = rows.find((r) => r.variant.id === line.variantId);
    if (!row) return [];
    const { variant, product, stock } = row;
    const available = product.status === "published" ? variantAvailability({ ...variant, stock }) : { availability: "not_for_sale" as const, orderableQuantity: 0 };
    const orderable = Math.min(line.quantity, available.orderableQuantity);
    const warnings: CartLine["warnings"] = [];
    if (available.orderableQuantity === 0) {
      warnings.push({ code: "SKU_UNAVAILABLE", message: variant.pricePaise === null || product.status !== "published" || variant.status !== "active" ? "This item is no longer available." : "This item is out of stock." });
    } else if (orderable < line.quantity) {
      warnings.push({ code: "QUANTITY_REDUCED", message: `Only ${orderable} can be ordered right now.` });
    }
    if (variant.pricePaise !== null && line.pricePaiseWhenAdded !== null && variant.pricePaise !== line.pricePaiseWhenAdded && available.orderableQuantity > 0) {
      warnings.push({ code: "PRICE_CHANGED", message: variant.pricePaise > line.pricePaiseWhenAdded ? "The price has gone up since you added this." : "The price has gone down since you added this.", previousUnitPrice: inr(line.pricePaiseWhenAdded) });
    }
    const ownImages = images.filter((image) => image.productId === product.id);
    const variantValueIds = valueLinks.filter((l) => l.variantId === variant.id).map((l) => l.optionValueId);
    const image = ownImages.find((i) => i.optionValueId && variantValueIds.includes(i.optionValueId)) ?? ownImages[0];
    return [{
      variantId: variant.id,
      inventoryItemId: variant.inventoryItemId,
      inventoryUnitsPerSale: variant.inventoryUnitsPerSale,
      weightGrams: variant.weightGrams,
      taxRateBasisPoints: variant.taxRateBasisPoints,
      hsnCode: variant.hsnCode,
      sku: variant.sku,
      productSlug: product.slug,
      productTitle: product.title,
      optionsLabel: labels.filter((l) => l.variantId === variant.id).map((l) => `${l.option}: ${l.value}`).join(" · "),
      image: image ? { url: image.url, alt: image.alt } : null,
      packQuantity: variant.packQuantity,
      quantity: line.quantity,
      orderableQuantity: orderable,
      unitPrice: variant.pricePaise === null ? null : inr(variant.pricePaise),
      mrp: variant.mrpPaise === null ? null : inr(variant.mrpPaise),
      lineTotal: inr(variant.pricePaise === null ? 0 : variant.pricePaise * orderable),
      gstRatePercent: variant.taxRateBasisPoints === null ? null : variant.taxRateBasisPoints / 100,
      warnings,
    }];
  });
}

// ---- Cart ownership ----

export const newGuestToken = () => randomBytes(32).toString("base64url");

async function findCart(db: DbOrTx, owner: CartOwner) {
  const [cart] = "customerId" in owner
    ? await db.select().from(carts).where(eq(carts.customerId, owner.customerId))
    : await db.select().from(carts).where(eq(carts.guestTokenHash, sha256(owner.guestToken)));
  return cart;
}

async function findOrCreateCart(db: DbOrTx, owner: CartOwner) {
  const existing = await findCart(db, owner);
  if (existing) return existing;
  const [created] = await db
    .insert(carts)
    .values("customerId" in owner ? { customerId: owner.customerId } : { guestTokenHash: sha256(owner.guestToken) })
    .onConflictDoNothing()
    .returning();
  return created ?? (await findCart(db, owner))!;
}

export async function getCart(db: Database, owner: CartOwner | null): Promise<Cart> {
  const cart = owner ? await findCart(db, owner) : undefined;
  const stored = cart ? await db.select().from(cartLines).where(eq(cartLines.cartId, cart.id)).orderBy(asc(cartLines.createdAt)) : [];
  const lines = await priceLines(db, stored);
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal.amount, 0);
  const gst = lines.reduce((sum, line) => sum + (line.taxRateBasisPoints === null ? 0 : gstIncluded(line.lineTotal.amount, line.taxRateBasisPoints)), 0);
  return {
    lines: lines.map(({ variantId: _v, taxRateBasisPoints: _t, hsnCode: _h, inventoryItemId: _i, inventoryUnitsPerSale: _u, weightGrams: _w, ...line }) => line),
    itemCount: lines.reduce((sum, line) => sum + line.orderableQuantity, 0),
    subtotal: inr(subtotal),
    gstIncluded: inr(gst),
    hasWarnings: lines.some((line) => line.warnings.length > 0),
    signedIn: !!owner && "customerId" in owner,
  };
}

async function sellableVariant(db: DbOrTx, sku: string) {
  const [row] = await db
    .select({ variant: variants, productStatus: products.status, stock: inventoryItems })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .innerJoin(inventoryItems, eq(inventoryItems.id, variants.inventoryItemId))
    .where(eq(variants.sku, sku.toUpperCase()));
  if (!row || row.productStatus !== "published" || row.variant.status !== "active") {
    throw new ApiError(422, "SKU_UNAVAILABLE", "Not available", "This item isn't available.", [{ path: "sku", code: "SKU_UNAVAILABLE", message: "This item isn't available." }]);
  }
  if (row.variant.pricePaise === null) {
    throw new ApiError(422, "PRICE_PENDING", "Not for sale yet", "This item isn't on sale yet.", [{ path: "sku", code: "PRICE_PENDING", message: "This item isn't on sale yet." }]);
  }
  return { ...row, availability: variantAvailability({ ...row.variant, stock: row.stock }) };
}

/** Sets an absolute quantity for a SKU (0 removes it). Idempotent, so retries are harmless. */
export async function setLineQuantity(db: Database, owner: CartOwner, sku: string, quantity: number) {
  if (quantity === 0) {
    const cart = await findCart(db, owner);
    if (cart) {
      const [variant] = await db.select({ id: variants.id }).from(variants).where(eq(variants.sku, sku.toUpperCase()));
      if (variant) await db.delete(cartLines).where(and(eq(cartLines.cartId, cart.id), eq(cartLines.variantId, variant.id)));
    }
    return;
  }
  const { variant, availability } = await sellableVariant(db, sku);
  if (availability.orderableQuantity === 0) {
    throw new ApiError(422, "SKU_UNAVAILABLE", "Out of stock", "This item is out of stock.", [{ path: "sku", code: "SKU_UNAVAILABLE", message: "This item is out of stock." }]);
  }
  if (quantity > availability.orderableQuantity) {
    const code = quantity > variant.maxOrderQuantity ? "QUANTITY_EXCEEDS_MAX" : "QUANTITY_EXCEEDS_STOCK";
    const message = `You can order up to ${availability.orderableQuantity} of this item.`;
    throw new ApiError(422, code, "Quantity not available", message, [{ path: "quantity", code, message }]);
  }
  await db.transaction(async (tx) => {
    const cart = await findOrCreateCart(tx, owner);
    const lineCount = (await tx.select({ id: cartLines.variantId }).from(cartLines).where(eq(cartLines.cartId, cart.id))).length;
    const exists = (await tx.select().from(cartLines).where(and(eq(cartLines.cartId, cart.id), eq(cartLines.variantId, variant.id)))).length > 0;
    if (!exists && lineCount >= MAX_CART_LINES) {
      throw new ApiError(422, "VALIDATION_FAILED", "Bag full", `Your bag can hold up to ${MAX_CART_LINES} different items.`, [{ path: "sku", code: "cart_full", message: "Your bag is full." }]);
    }
    await tx
      .insert(cartLines)
      .values({ cartId: cart.id, variantId: variant.id, quantity, pricePaiseWhenAdded: variant.pricePaise! })
      .onConflictDoUpdate({ target: [cartLines.cartId, cartLines.variantId], set: { quantity, pricePaiseWhenAdded: variant.pricePaise!, updatedAt: new Date() } });
    await tx.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cart.id));
  });
}

/**
 * On sign-in: moves the guest cart into the customer's cart. Quantities add up, capped at what can be
 * ordered; the guest cart is then deleted. Unavailable lines are dropped.
 */
export async function mergeGuestCart(db: Database, guestToken: string, customerId: string) {
  await db.transaction(async (tx) => {
    const guest = await findCart(tx, { guestToken });
    if (!guest) return;
    const guestLines = await tx.select().from(cartLines).where(eq(cartLines.cartId, guest.id));
    const target = await findOrCreateCart(tx, { customerId });
    const existing = await tx.select().from(cartLines).where(eq(cartLines.cartId, target.id));
    for (const line of guestLines) {
      const current = existing.find((e) => e.variantId === line.variantId);
      const [row] = await tx
        .select({ variant: variants, productStatus: products.status, stock: inventoryItems })
        .from(variants)
        .innerJoin(products, eq(products.id, variants.productId))
        .innerJoin(inventoryItems, eq(inventoryItems.id, variants.inventoryItemId))
        .where(eq(variants.id, line.variantId));
      if (!row || row.productStatus !== "published" || row.variant.pricePaise === null) continue;
      const cap = variantAvailability({ ...row.variant, stock: row.stock }).orderableQuantity;
      const quantity = Math.min((current?.quantity ?? 0) + line.quantity, cap);
      if (quantity <= 0) continue;
      await tx
        .insert(cartLines)
        .values({ cartId: target.id, variantId: line.variantId, quantity, pricePaiseWhenAdded: current?.pricePaiseWhenAdded ?? line.pricePaiseWhenAdded })
        .onConflictDoUpdate({ target: [cartLines.cartId, cartLines.variantId], set: { quantity, updatedAt: new Date() } });
    }
    await tx.delete(carts).where(eq(carts.id, guest.id));
  });
}

export async function clearCart(db: DbOrTx, customerId: string) {
  const cart = await findCart(db, { customerId });
  if (cart) await db.delete(cartLines).where(eq(cartLines.cartId, cart.id));
}
