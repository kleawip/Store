// Admin catalogue operations. Every write runs in one transaction together with its audit entry.
import type {
  AdminOptionsReplace,
  AdminProduct,
  AdminProductCreate,
  AdminProductUpdate,
  AdminVariantCreate,
  AdminVariantUpdate,
} from "@kleawip/contract";
import { and, asc, count, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { recordAudit } from "../audit";
import type { Database } from "../db/client";
import {
  categories,
  inventoryItems,
  productMedia,
  productOptionValues,
  productOptions,
  products,
  variantOptionValues,
  variants,
} from "../db/schema";
import { optionKey, sellableQuantity } from "../domain/availability";
import { ApiError, notFound } from "../errors";

type FieldError = { path: string; code: string; message: string };
const invalid = (errors: FieldError[], detail = "One or more fields are invalid.") =>
  new ApiError(422, "VALIDATION_FAILED", "Validation failed", detail, errors);

/** Maps Postgres unique/check violations to field errors instead of a 500. */
function translateDbError(error: unknown): never {
  const pg = (error as { cause?: { code?: string; constraint?: string } }).cause ?? (error as { code?: string; constraint?: string });
  const constraint = pg?.constraint ?? "";
  const known: Record<string, FieldError> = {
    variants_sku_key: { path: "sku", code: "duplicate", message: "This SKU is already used by another product variant." },
    variants_product_option_key: { path: "options", code: "duplicate_combination", message: "A variant with this option combination already exists." },
    products_slug_key: { path: "slug", code: "duplicate", message: "Another product already uses this slug." },
    variants_mrp_not_below_price: { path: "mrpPaise", code: "mrp_below_price", message: "MRP must be at least the selling price." },
    inventory_items_available_non_negative: { path: "delta", code: "negative_available", message: "Available stock cannot go below zero." },
    inventory_items_non_negative: { path: "delta", code: "negative_stock", message: "Stock counts cannot go below zero." },
  };
  if ((pg?.code === "23505" || pg?.code === "23514") && known[constraint]) throw invalid([known[constraint]!]);
  throw error;
}

export function slugify(title: string) {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "product";
}

async function uniqueSlug(db: Database, base: string) {
  const taken = new Set(
    (await db.select({ slug: products.slug }).from(products).where(or(eq(products.slug, base), ilike(products.slug, `${base}-%`))))
      .map((row) => row.slug),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

async function categoryId(db: Database, slug: string) {
  const [row] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug));
  if (!row) throw invalid([{ path: "categorySlug", code: "unknown", message: `Unknown category "${slug}".` }]);
  return row.id;
}

async function productRow(db: Database, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Product not found.");
  const [row] = await db.select().from(products).where(eq(products.id, id));
  if (!row) throw notFound("Product not found.");
  return row;
}

// ---- Read ----

export async function adminProduct(db: Database, id: string): Promise<AdminProduct> {
  const product = await productRow(db, id);
  const [[category], options, values, media, variantRows] = await Promise.all([
    db.select({ slug: categories.slug }).from(categories).where(eq(categories.id, product.categoryId)),
    db.select().from(productOptions).where(eq(productOptions.productId, id)).orderBy(asc(productOptions.position)),
    db
      .select({ id: productOptionValues.id, optionId: productOptionValues.optionId, code: productOptionValues.code, label: productOptionValues.label, swatch: productOptionValues.swatch })
      .from(productOptionValues)
      .innerJoin(productOptions, eq(productOptions.id, productOptionValues.optionId))
      .where(eq(productOptions.productId, id))
      .orderBy(asc(productOptionValues.position)),
    db.select().from(productMedia).where(eq(productMedia.productId, id)).orderBy(asc(productMedia.position)),
    db
      .select({ variant: variants, stock: inventoryItems })
      .from(variants)
      .innerJoin(inventoryItems, eq(inventoryItems.id, variants.inventoryItemId))
      .where(eq(variants.productId, id))
      .orderBy(asc(variants.position), asc(variants.sku)),
  ]);
  const links = variantRows.length
    ? await db.select().from(variantOptionValues).where(inArray(variantOptionValues.variantId, variantRows.map((row) => row.variant.id)))
    : [];
  const optionCode = new Map(options.map((option) => [option.id, option.code]));

  const adminVariants = variantRows.map(({ variant, stock }) => {
    const selected: Record<string, string> = {};
    for (const link of links.filter((l) => l.variantId === variant.id)) {
      const value = values.find((v) => v.id === link.optionValueId);
      if (value) selected[optionCode.get(value.optionId)!] = value.code;
    }
    return {
      sku: variant.sku,
      options: selected,
      status: variant.status,
      pricePaise: variant.pricePaise,
      mrpPaise: variant.mrpPaise,
      taxRateBasisPoints: variant.taxRateBasisPoints,
      hsnCode: variant.hsnCode,
      packQuantity: variant.packQuantity,
      inventoryUnitsPerSale: variant.inventoryUnitsPerSale,
      maxOrderQuantity: variant.maxOrderQuantity,
      weightGrams: variant.weightGrams,
      inventoryItemId: stock.id,
      stockMode: variant.stockMode,
      sellableQuantity: stock.tracked ? sellableQuantity({ inventoryUnitsPerSale: variant.inventoryUnitsPerSale, stock }) : null,
    };
  });

  return {
    id: product.id,
    slug: product.slug,
    slugLocked: product.publishedAt !== null,
    title: product.title,
    categorySlug: category!.slug,
    status: product.status,
    detail: product.detail,
    spec: product.spec,
    summary: product.summary,
    specifications: product.specifications,
    contentSections: product.contentSections,
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    position: product.position,
    optionGroups: options.map((option) => ({
      code: option.code,
      label: option.label,
      values: values.filter((value) => value.optionId === option.id).map(({ code, label, swatch }) => ({ code, label, swatch })),
    })),
    variants: adminVariants,
    media: media.map((image) => {
      const value = image.optionValueId ? values.find((v) => v.id === image.optionValueId) : undefined;
      return {
        id: image.id,
        assetId: image.assetId,
        url: image.url,
        alt: image.alt,
        width: image.width,
        height: image.height,
        position: image.position,
        optionValue: value ? `${optionCode.get(value.optionId)}:${value.code}` : null,
      };
    }),
    publishChecklist: publishChecklist(media, adminVariants),
    isDemo: product.isDemo,
    updatedAt: product.updatedAt.toISOString(),
  };
}

/** What blocks publishing (PRODUCT_PAGE_ADMIN_MAPPING_SPEC "Publish gate"). */
export function publishChecklist(
  media: { alt: string }[],
  productVariants: { status: string; pricePaise: number | null; taxRateBasisPoints: number | null; hsnCode: string | null }[],
) {
  const active = productVariants.filter((variant) => variant.status === "active");
  return [
    { code: "has_image", ok: media.length > 0, message: "Add at least one product image." },
    { code: "image_alt_text", ok: media.length > 0 && media.every((image) => image.alt.trim().length > 0), message: "Every image needs alt text." },
    { code: "has_active_sku", ok: active.length > 0, message: "Add at least one active SKU." },
    { code: "prices_approved", ok: active.length > 0 && active.every((variant) => variant.pricePaise !== null), message: "Every active SKU needs an approved price." },
    {
      code: "tax_details",
      ok: active.length > 0 && active.every((variant) => variant.taxRateBasisPoints !== null && variant.hsnCode !== null),
      message: "Every active SKU needs a GST rate and HSN code.",
    },
  ];
}

export async function listAdminProducts(
  db: Database,
  query: { status?: "draft" | "published" | "archived"; category?: string; q?: string; missing?: "price" | "images"; limit: number; offset: number },
) {
  const filters: (SQL | undefined)[] = [
    query.status ? eq(products.status, query.status) : undefined,
    query.category ? eq(categories.slug, query.category) : undefined,
    query.q ? or(ilike(products.title, `%${query.q}%`), sql`EXISTS (SELECT 1 FROM variants v WHERE v.product_id = ${products.id} AND v.sku ILIKE ${`%${query.q}%`})`) : undefined,
    query.missing === "images" ? sql`NOT EXISTS (SELECT 1 FROM product_media m WHERE m.product_id = ${products.id})` : undefined,
    query.missing === "price"
      ? sql`EXISTS (SELECT 1 FROM variants v WHERE v.product_id = ${products.id} AND v.status = 'active' AND v.price_paise IS NULL)`
      : undefined,
  ];
  const where = and(...filters);
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: products.id,
        slug: products.slug,
        title: products.title,
        categorySlug: categories.slug,
        status: products.status,
        updatedAt: products.updatedAt,
        thumbnailUrl: sql<string | null>`(SELECT m.url FROM product_media m WHERE m.product_id = ${products.id} ORDER BY m.position LIMIT 1)`,
        variantCount: sql<number>`(SELECT count(*)::int FROM variants v WHERE v.product_id = ${products.id} AND v.status = 'active')`,
        minPricePaise: sql<number | null>`(SELECT min(v.price_paise) FROM variants v WHERE v.product_id = ${products.id} AND v.status = 'active')`,
        maxPricePaise: sql<number | null>`(SELECT max(v.price_paise) FROM variants v WHERE v.product_id = ${products.id} AND v.status = 'active')`,
        missingPrice: sql<boolean>`EXISTS (SELECT 1 FROM variants v WHERE v.product_id = ${products.id} AND v.status = 'active' AND v.price_paise IS NULL)`,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(where)
      .orderBy(asc(products.position), asc(products.slug))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ value: count() }).from(products).innerJoin(categories, eq(categories.id, products.categoryId)).where(where),
  ]);
  return {
    data: rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
    totalCount: total?.value ?? 0,
  };
}

// ---- Product writes ----

export async function createProduct(db: Database, input: AdminProductCreate, actorStaffId: string) {
  const slug = input.slug ?? (await uniqueSlug(db, slugify(input.title)));
  const catId = await categoryId(db, input.categorySlug);
  try {
    return await db.transaction(async (tx) => {
      const { categorySlug: _categorySlug, ...fields } = input;
      const [row] = await tx.insert(products).values({ ...fields, slug, categoryId: catId, status: "draft" }).returning();
      await recordAudit(tx, { entityType: "product", entityId: row!.id, action: "product.created", actorStaffId, after: { ...input, slug } });
      return row!.id;
    });
  } catch (error) {
    translateDbError(error);
  }
}

export async function updateProduct(db: Database, id: string, patch: AdminProductUpdate, actorStaffId: string) {
  const current = await productRow(db, id);
  if (patch.slug !== undefined && patch.slug !== current.slug && current.publishedAt !== null) {
    throw invalid([{ path: "slug", code: "slug_locked", message: "The slug cannot change after the product has been published; customer links depend on it." }]);
  }
  const { categorySlug, ...fields } = patch;
  const changes = { ...fields, ...(categorySlug ? { categoryId: await categoryId(db, categorySlug) } : {}) };
  if (!Object.keys(changes).length) return;
  try {
    await db.transaction(async (tx) => {
      await tx.update(products).set({ ...changes, updatedAt: new Date() }).where(eq(products.id, id));
      const before = Object.fromEntries(Object.keys(patch).map((key) => [key, (current as Record<string, unknown>)[key === "categorySlug" ? "categoryId" : key]]));
      await recordAudit(tx, { entityType: "product", entityId: id, action: "product.updated", actorStaffId, before, after: patch });
    });
  } catch (error) {
    translateDbError(error);
  }
}

export async function setProductStatus(db: Database, id: string, status: "published" | "draft" | "archived", actorStaffId: string) {
  const current = await productRow(db, id);
  if (status === "published") {
    const blocking = (await adminProduct(db, id)).publishChecklist.filter((check) => !check.ok);
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
      .update(products)
      .set({ status, updatedAt: new Date(), ...(status === "published" && !current.publishedAt ? { publishedAt: new Date() } : {}) })
      .where(eq(products.id, id));
    await recordAudit(tx, { entityType: "product", entityId: id, action: `product.${status}`, actorStaffId, before: { status: current.status }, after: { status } });
  });
}

// ---- Options ----

export async function replaceOptions(db: Database, productId: string, input: AdminOptionsReplace, actorStaffId: string) {
  await productRow(db, productId);
  const groupCodes = input.groups.map((group) => group.code);
  const duplicates = [
    ...groupCodes.filter((code, i) => groupCodes.indexOf(code) !== i).map((code) => ({ path: "groups", code: "duplicate_group", message: `Option "${code}" appears twice.` })),
    ...input.groups.flatMap((group, gi) => {
      const codes = group.values.map((value) => value.code);
      return codes
        .filter((code, i) => codes.indexOf(code) !== i)
        .map((code) => ({ path: `groups.${gi}.values`, code: "duplicate_value", message: `Value "${code}" appears twice in ${group.label}.` }));
    }),
  ];
  if (duplicates.length) throw invalid(duplicates);

  await db.transaction(async (tx) => {
    const existing = await tx.select().from(productOptions).where(eq(productOptions.productId, productId));
    const existingValues = existing.length
      ? await tx.select().from(productOptionValues).where(inArray(productOptionValues.optionId, existing.map((option) => option.id)))
      : [];
    const variantCount = (await tx.select({ value: count() }).from(variants).where(eq(variants.productId, productId)))[0]?.value ?? 0;

    // Changing which option groups exist would orphan every variant's combination.
    const existingCodes = existing.map((option) => option.code).sort().join(",");
    if (variantCount > 0 && existingCodes !== [...groupCodes].sort().join(",")) {
      throw invalid([{ path: "groups", code: "groups_in_use", message: "Option groups cannot be added or removed while the product has variants. Archive or delete the variants first." }]);
    }

    const kept = new Set<string>();
    for (const [position, group] of input.groups.entries()) {
      let option = existing.find((row) => row.code === group.code);
      if (option) {
        await tx.update(productOptions).set({ label: group.label, position }).where(eq(productOptions.id, option.id));
      } else {
        [option] = await tx.insert(productOptions).values({ productId, code: group.code, label: group.label, position }).returning();
      }
      for (const [valuePosition, value] of group.values.entries()) {
        const found = existingValues.find((row) => row.optionId === option!.id && row.code === value.code);
        if (found) {
          await tx.update(productOptionValues).set({ label: value.label, swatch: value.swatch, position: valuePosition }).where(eq(productOptionValues.id, found.id));
          kept.add(found.id);
        } else {
          await tx.insert(productOptionValues).values({ optionId: option!.id, code: value.code, label: value.label, swatch: value.swatch, position: valuePosition });
        }
      }
    }

    const removed = existingValues.filter((value) => !kept.has(value.id));
    if (removed.length) {
      const used = await tx.select().from(variantOptionValues).where(inArray(variantOptionValues.optionValueId, removed.map((value) => value.id)));
      if (used.length) {
        const codes = [...new Set(removed.filter((value) => used.some((u) => u.optionValueId === value.id)).map((value) => value.code))];
        throw invalid([{ path: "groups", code: "value_in_use", message: `Values in use by a variant cannot be removed: ${codes.join(", ")}.` }]);
      }
      await tx.delete(productOptionValues).where(inArray(productOptionValues.id, removed.map((value) => value.id)));
    }
    const removedGroups = existing.filter((option) => !groupCodes.includes(option.code));
    if (removedGroups.length) await tx.delete(productOptions).where(inArray(productOptions.id, removedGroups.map((option) => option.id)));

    await recordAudit(tx, { entityType: "product", entityId: productId, action: "product.options_replaced", actorStaffId, after: input });
  });
}

// ---- Variants ----

function checkPrices(price: number | null, mrp: number | null, pathPrefix = "") {
  if (mrp !== null && price === null) {
    throw invalid([{ path: `${pathPrefix}mrpPaise`, code: "mrp_without_price", message: "Set a selling price before an MRP." }]);
  }
  if (mrp !== null && price !== null && mrp < price) {
    throw invalid([{ path: `${pathPrefix}mrpPaise`, code: "mrp_below_price", message: "MRP must be at least the selling price." }]);
  }
}

export async function createVariant(db: Database, productId: string, input: AdminVariantCreate, actorStaffId: string) {
  const product = await productRow(db, productId);
  checkPrices(input.pricePaise, input.mrpPaise);

  const options = await db.select().from(productOptions).where(eq(productOptions.productId, productId));
  const values = options.length
    ? await db.select().from(productOptionValues).where(inArray(productOptionValues.optionId, options.map((option) => option.id)))
    : [];

  // Exactly one value per option group, and nothing else.
  const errors: FieldError[] = [];
  const valueIds: string[] = [];
  for (const option of options) {
    const code = input.options[option.code];
    const value = values.find((row) => row.optionId === option.id && row.code === code);
    if (!value) errors.push({ path: `options.${option.code}`, code: "missing_or_unknown", message: `Choose a valid ${option.label}.` });
    else valueIds.push(value.id);
  }
  for (const code of Object.keys(input.options)) {
    if (!options.some((option) => option.code === code)) errors.push({ path: `options.${code}`, code: "unknown_option", message: `"${code}" is not an option of this product.` });
  }
  if (errors.length) throw new ApiError(422, "INVALID_OPTION_COMBINATION", "Invalid option combination", "The options do not match this product.", errors);

  let inventoryItemId: string | undefined;
  let unitsPerSale = 1;
  if (input.stock.mode === "shared") {
    const [source] = await db.select().from(variants).where(eq(variants.sku, input.stock.fromSku));
    if (!source) throw invalid([{ path: "stock.fromSku", code: "unknown", message: `No SKU "${input.stock.fromSku}".` }]);
    if (source.stockMode !== "own" || source.inventoryUnitsPerSale !== 1) {
      throw invalid([{ path: "stock.fromSku", code: "not_single_unit", message: "Shared stock must come from a single-unit SKU that owns its stock." }]);
    }
    inventoryItemId = source.inventoryItemId;
    unitsPerSale = input.packQuantity;
  }

  try {
    return await db.transaction(async (tx) => {
      if (!inventoryItemId) {
        const stock = input.stock.mode === "own" ? input.stock : { tracked: true, lowStockThreshold: null };
        const [item] = await tx
          .insert(inventoryItems)
          .values({ label: `${product.title} · ${input.sku}`, tracked: stock.tracked, lowStockThreshold: stock.lowStockThreshold, isDemo: product.isDemo })
          .returning();
        inventoryItemId = item!.id;
      }
      const [row] = await tx
        .insert(variants)
        .values({
          productId,
          sku: input.sku,
          optionKey: optionKey(valueIds),
          pricePaise: input.pricePaise,
          mrpPaise: input.mrpPaise,
          taxRateBasisPoints: input.taxRateBasisPoints,
          hsnCode: input.hsnCode,
          packQuantity: input.packQuantity,
          maxOrderQuantity: input.maxOrderQuantity,
          weightGrams: input.weightGrams,
          inventoryItemId,
          inventoryUnitsPerSale: unitsPerSale,
          stockMode: input.stock.mode,
          isDemo: product.isDemo,
        })
        .returning();
      if (valueIds.length) await tx.insert(variantOptionValues).values(valueIds.map((optionValueId) => ({ variantId: row!.id, optionValueId })));
      await recordAudit(tx, { entityType: "product", entityId: productId, action: "variant.created", actorStaffId, after: input });
      return row!.sku;
    });
  } catch (error) {
    translateDbError(error);
  }
}

export async function updateVariant(db: Database, sku: string, patch: AdminVariantUpdate, actorStaffId: string) {
  const [current] = await db.select().from(variants).where(eq(variants.sku, sku));
  if (!current) throw notFound(`No SKU "${sku}".`);
  checkPrices(
    patch.pricePaise !== undefined ? patch.pricePaise : current.pricePaise,
    patch.mrpPaise !== undefined ? patch.mrpPaise : current.mrpPaise,
  );
  if (patch.status === "archived" && current.stockMode === "own") {
    const [dependent] = await db
      .select({ sku: variants.sku })
      .from(variants)
      .where(and(eq(variants.inventoryItemId, current.inventoryItemId), eq(variants.stockMode, "shared"), eq(variants.status, "active")));
    if (dependent) {
      throw invalid([{ path: "status", code: "stock_in_use", message: `Active SKU ${dependent.sku} draws on this SKU's stock. Archive it first.` }]);
    }
  }
  if (!Object.keys(patch).length) return;
  try {
    await db.transaction(async (tx) => {
      await tx.update(variants).set({ ...patch, updatedAt: new Date() }).where(eq(variants.id, current.id));
      const before = Object.fromEntries(Object.keys(patch).map((key) => [key, (current as Record<string, unknown>)[key]]));
      await recordAudit(tx, { entityType: "product", entityId: current.productId, action: "variant.updated", actorStaffId, before: { sku, ...before }, after: { sku, ...patch } });
    });
  } catch (error) {
    translateDbError(error);
  }
}

