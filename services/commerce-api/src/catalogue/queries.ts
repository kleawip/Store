import type { Money, ProductDetail } from "@kleawip/contract";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  categories,
  inventoryItems,
  productMedia,
  productOptions,
  productOptionValues,
  products,
  variantOptionValues,
  variants,
} from "../db/schema";
import { storefrontVideos } from "../media/videos";
import {
  priceFrom,
  productAvailability,
  unitPricePaise,
  variantAvailability,
  type AvailabilityState,
} from "../domain/availability";

const inr = (amount: number | null): Money | null => (amount === null ? null : { amount, currency: "INR" });

async function loadVariantRows(db: Database, productIds: string[]) {
  if (!productIds.length) return [];
  return db
    .select({
      id: variants.id,
      productId: variants.productId,
      sku: variants.sku,
      status: variants.status,
      position: variants.position,
      pricePaise: variants.pricePaise,
      mrpPaise: variants.mrpPaise,
      packQuantity: variants.packQuantity,
      inventoryUnitsPerSale: variants.inventoryUnitsPerSale,
      maxOrderQuantity: variants.maxOrderQuantity,
      stock: {
        tracked: inventoryItems.tracked,
        onHand: inventoryItems.onHand,
        committed: inventoryItems.committed,
        unavailable: inventoryItems.unavailable,
        lowStockThreshold: inventoryItems.lowStockThreshold,
      },
    })
    .from(variants)
    .innerJoin(inventoryItems, eq(inventoryItems.id, variants.inventoryItemId))
    .where(and(inArray(variants.productId, productIds), eq(variants.status, "active")))
    .orderBy(asc(variants.position), asc(variants.sku));
}

/** Price and availability summaries for product listings, keyed by product id. */
export async function productSummaries(db: Database, productIds: string[]) {
  const rows = await loadVariantRows(db, productIds);
  const summaries = new Map<string, { priceFrom: Money | null; availability: AvailabilityState }>();
  for (const productId of productIds) {
    const own = rows.filter((row) => row.productId === productId);
    summaries.set(productId, {
      priceFrom: inr(priceFrom(own)),
      availability: productAvailability(own.map((row) => variantAvailability(row).availability)),
    });
  }
  return summaries;
}

/** Full product detail for the reusable product template, or null when not published. */
export async function productDetail(db: Database, slug: string): Promise<ProductDetail | null> {
  const [product] = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      detail: products.detail,
      spec: products.spec,
      summary: products.summary,
      specifications: products.specifications,
      contentSections: products.contentSections,
      isDemo: products.isDemo,
      categorySlug: categories.slug,
      categoryTitle: categories.title,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(products.slug, slug), eq(products.status, "published")));
  if (!product) return null;

  const [options, values, media, variantRows] = await Promise.all([
    db.select().from(productOptions).where(eq(productOptions.productId, product.id)).orderBy(asc(productOptions.position)),
    db
      .select({ id: productOptionValues.id, optionId: productOptionValues.optionId, code: productOptionValues.code, label: productOptionValues.label, swatch: productOptionValues.swatch, position: productOptionValues.position })
      .from(productOptionValues)
      .innerJoin(productOptions, eq(productOptions.id, productOptionValues.optionId))
      .where(eq(productOptions.productId, product.id))
      .orderBy(asc(productOptionValues.position)),
    db.select().from(productMedia).where(eq(productMedia.productId, product.id)).orderBy(asc(productMedia.position)),
    loadVariantRows(db, [product.id]),
  ]);

  const links = variantRows.length
    ? await db.select().from(variantOptionValues).where(inArray(variantOptionValues.variantId, variantRows.map((row) => row.id)))
    : [];

  const optionCodeById = new Map(options.map((option) => [option.id, option.code]));
  const valueById = new Map(values.map((value) => [value.id, { ...value, optionCode: optionCodeById.get(value.optionId)! }]));
  const valueRef = (valueId: string) => {
    const value = valueById.get(valueId);
    return value ? `${value.optionCode}:${value.code}` : null;
  };

  const productVariants = variantRows.map((row) => {
    const valueIds = links.filter((link) => link.variantId === row.id).map((link) => link.optionValueId);
    const state = variantAvailability(row);
    const optionsForVariant: Record<string, string> = {};
    for (const valueId of valueIds) {
      const value = valueById.get(valueId);
      if (value) optionsForVariant[value.optionCode] = value.code;
    }
    return {
      sku: row.sku,
      options: optionsForVariant,
      packQuantity: row.packQuantity,
      price: inr(row.pricePaise),
      mrp: inr(row.mrpPaise),
      unitPrice: inr(row.pricePaise === null ? null : unitPricePaise(row.pricePaise, row.packQuantity)),
      priceStatus: row.pricePaise === null ? ("pending" as const) : ("approved" as const),
      availability: state.availability,
      ...(state.stockLeft !== undefined ? { stockLeft: state.stockLeft } : {}),
      maxOrderQuantity: state.orderableQuantity,
      imageIds: media.filter((image) => image.optionValueId && valueIds.includes(image.optionValueId)).map((image) => image.id),
    };
  });

  const defaultVariant =
    productVariants.find((variant) => variant.availability === "in_stock" || variant.availability === "low_stock") ?? productVariants[0];
  const lowest = priceFrom(variantRows);

  return {
    slug: product.slug,
    title: product.title,
    category: { slug: product.categorySlug, title: product.categoryTitle },
    detail: product.detail,
    spec: product.spec,
    summary: product.summary,
    images: media.map((image) => ({
      id: image.id,
      url: image.url,
      alt: image.alt,
      width: image.width,
      height: image.height,
      optionValue: image.optionValueId ? valueRef(image.optionValueId) : null,
    })),
    optionGroups: options.map((option) => ({
      code: option.code,
      label: option.label,
      values: values
        .filter((value) => value.optionId === option.id)
        .map((value) => ({ code: value.code, label: value.label, ...(value.swatch ? { swatch: value.swatch } : {}) })),
    })),
    variants: productVariants,
    defaultSku: defaultVariant?.sku ?? null,
    priceFrom: inr(lowest),
    priceStatus: lowest === null ? "pending" : "approved",
    availability: productAvailability(productVariants.map((variant) => variant.availability)),
    specifications: product.specifications,
    contentSections: product.contentSections,
    related: [],
    videos: await storefrontVideos(db, product.id),
    isDemo: product.isDemo,
  };
}
