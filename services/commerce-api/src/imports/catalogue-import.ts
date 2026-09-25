// Catalogue CSV import (ADMIN_SCREENS_BRIEF §5). One row per SKU; rows sharing a product_slug form one product.
// Flow: validate (nothing written) → staff review the report → commit re-validates and applies all-or-nothing.
// Rules: imports never publish; published products are not changed; a blank cell leaves an existing value unchanged.
import { IMPORT_COLUMNS, type ImportReport } from "@kleawip/contract";
import { eq, inArray, max } from "drizzle-orm";
import { recordAudit, type DbOrTx } from "../audit";
import {
  categories,
  inventoryItems,
  inventoryMovements,
  productOptionValues,
  productOptions,
  products,
  variantOptionValues,
  variants,
} from "../db/schema";
import { optionKey } from "../domain/availability";
import { CsvSyntaxError, parseCsv } from "./csv";

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_REPORTED_ISSUES = 500;

type Column = (typeof IMPORT_COLUMNS)[number];
type Issue = ImportReport["errors"][number];

type PlannedOption = { index: number; code: string; label: string; valueCode: string; valueLabel: string };
type StockSource = { mode: "own" } | { mode: "shared"; fromSku: string };

type PlannedVariant = {
  row: number;
  sku: string;
  options: PlannedOption[];
  price?: number | null; // undefined = cell blank
  mrp?: number | null;
  taxBp?: number | null;
  hsn?: string | null;
  packQuantity?: number;
  stock?: StockSource; // undefined = cell blank
  openingStock?: number;
  maxOrder?: number;
  weight?: number | null;
};

type ProductField = "title" | "category" | "detail" | "spec" | "summary";

type PlannedProduct = {
  slug: string;
  firstRow: number;
  fields: Partial<Record<ProductField, { value: string; row: number }>>;
  groups: Map<number, { code: string; label: string; row: number }>;
  variants: PlannedVariant[];
};

export type ImportPlan = { products: Map<string, PlannedProduct>; rowCount: number };

// ---- Cell parsing ----

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SKU = /^[A-Z0-9][A-Z0-9-]{1,63}$/;

export function toCode(label: string) {
  return label.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

/** "499", "499.5", "1,299.00" → paise. Commas are allowed as thousands separators. */
export function parseRupees(raw: string): number | null {
  const text = raw.replace(/,/g, "").replace(/^₹\s*/, "");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

function parseGst(raw: string): number | null {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(raw)) return null;
  const [whole, fraction = ""] = raw.split(".");
  const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return basisPoints <= 10000 ? basisPoints : null;
}

function parseWhole(raw: string, min: number, maxValue: number): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= min && value <= maxValue ? value : null;
}

// ---- Step 1: read the file into a plan (no database) ----

export function planImport(csvText: string): { plan: ImportPlan | null; errors: Issue[]; warnings: Issue[] } {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const fileError = (code: string, message: string) => ({ plan: null, errors: [{ row: null, column: null, code, message }], warnings });

  if (Buffer.byteLength(csvText, "utf8") > MAX_IMPORT_BYTES) return fileError("file_too_large", "The file is larger than 2 MB. Split it into smaller files.");
  let rows: string[][];
  try {
    rows = parseCsv(csvText);
  } catch (error) {
    if (error instanceof CsvSyntaxError) return fileError("csv_syntax", error.message);
    throw error;
  }
  if (rows.length === 0) return fileError("empty_file", "The file is empty.");

  const header = rows[0]!.map((cell) => cell.trim().toLowerCase());
  const known = new Set<string>(IMPORT_COLUMNS);
  const headerErrors: Issue[] = [];
  header.forEach((name, index) => {
    if (!known.has(name)) headerErrors.push({ row: 1, column: name || `column ${index + 1}`, code: "unknown_column", message: `Unknown column "${name}". Use the template's column names.` });
    else if (header.indexOf(name) !== index) headerErrors.push({ row: 1, column: name, code: "duplicate_column", message: `Column "${name}" appears twice.` });
  });
  for (const required of ["product_slug", "sku"] as const) {
    if (!header.includes(required)) headerErrors.push({ row: 1, column: required, code: "missing_column", message: `The "${required}" column is required.` });
  }
  if (headerErrors.length) return { plan: null, errors: headerErrors, warnings };

  const dataRows = rows.slice(1);
  if (dataRows.length === 0) return fileError("no_rows", "The file has a header but no product rows.");
  if (dataRows.length > MAX_IMPORT_ROWS) return fileError("too_many_rows", `The file has ${dataRows.length} rows; the limit is ${MAX_IMPORT_ROWS}.`);

  const products = new Map<string, PlannedProduct>();
  const skuRows = new Map<string, number>();

  dataRows.forEach((cells, index) => {
    const row = index + 2;
    const cell = (column: Column) => (header.includes(column) ? (cells[header.indexOf(column)] ?? "").trim() : "");
    const error = (column: Column | null, code: string, message: string) => errors.push({ row, column, code, message });

    const slug = cell("product_slug").toLowerCase();
    if (!slug) return error("product_slug", "required", "product_slug is required.");
    if (!SLUG.test(slug)) return error("product_slug", "invalid", "Use lowercase letters, numbers and single hyphens (e.g. twisted-loop-1200).");

    let product = products.get(slug);
    if (!product) {
      product = { slug, firstRow: row, fields: {}, groups: new Map(), variants: [] };
      products.set(slug, product);
    }

    // Product-level cells may repeat on every row, but must agree.
    const fieldColumns: [ProductField, Column][] = [["title", "product_title"], ["category", "category"], ["detail", "detail"], ["spec", "spec"], ["summary", "summary"]];
    for (const [field, column] of fieldColumns) {
      const value = field === "category" ? cell(column).toLowerCase() : cell(column);
      if (!value) continue;
      const existing = product.fields[field];
      if (existing && existing.value !== value) error(column, "conflicting_value", `Differs from row ${existing.row} for the same product.`);
      else if (!existing) product.fields[field] = { value, row };
    }

    // Options: optionN_name + optionN_value, filled from 1 upwards.
    const options: PlannedOption[] = [];
    for (const n of [1, 2, 3]) {
      const nameColumn = `option${n}_name` as Column;
      const valueColumn = `option${n}_value` as Column;
      const name = cell(nameColumn);
      const value = cell(valueColumn);
      if (!name && !value) continue;
      if (!name || !value) {
        error(name ? valueColumn : nameColumn, "incomplete_option", `Fill both option${n}_name and option${n}_value, or neither.`);
        continue;
      }
      if (n > 1 && options.length < n - 1) error(nameColumn, "option_gap", `Fill option${n - 1} before option${n}.`);
      const code = toCode(name);
      const valueCode = toCode(value);
      if (!code || !valueCode) {
        error(nameColumn, "invalid_option", "Option names and values need at least one letter or number.");
        continue;
      }
      const group = product.groups.get(n);
      if (group && group.code !== code) error(nameColumn, "inconsistent_option", `Row ${group.row} calls option ${n} "${group.label}".`);
      else if (!group) product.groups.set(n, { code, label: name, row });
      options.push({ index: n, code, label: name, valueCode, valueLabel: value });
    }

    const sku = cell("sku").toUpperCase();
    if (!sku) return error("sku", "required", "sku is required.");
    if (!SKU.test(sku)) return error("sku", "invalid", "Use 2–64 letters, numbers and hyphens (e.g. KLW-TL1200-P2).");
    const seenAt = skuRows.get(sku);
    if (seenAt) return error("sku", "duplicate_in_file", `SKU ${sku} already appears on row ${seenAt}.`);
    skuRows.set(sku, row);

    const variant: PlannedVariant = { row, sku, options };
    const price = cell("price_inr");
    if (price) {
      variant.price = parseRupees(price);
      if (variant.price === null || variant.price === 0) error("price_inr", "invalid", "Enter a positive amount in rupees, e.g. 499 or 499.50.");
    }
    const mrp = cell("mrp_inr");
    if (mrp) {
      variant.mrp = parseRupees(mrp);
      if (variant.mrp === null || variant.mrp === 0) error("mrp_inr", "invalid", "Enter a positive amount in rupees, e.g. 599.");
    }
    const gst = cell("gst_percent").replace(/%$/, "");
    if (gst) {
      variant.taxBp = parseGst(gst);
      if (variant.taxBp === null) error("gst_percent", "invalid", "Enter a percentage between 0 and 100, e.g. 12 or 18.");
    }
    const hsn = cell("hsn");
    if (hsn) {
      if (!/^\d{4,8}$/.test(hsn)) error("hsn", "invalid", "HSN codes are 4 to 8 digits.");
      else variant.hsn = hsn;
    }
    const pack = cell("pack_quantity");
    if (pack) {
      const value = parseWhole(pack, 1, 100);
      if (value === null) error("pack_quantity", "invalid", "Pack quantity must be a whole number from 1 to 100.");
      else variant.packQuantity = value;
    }
    const stock = cell("stock_source");
    if (stock) {
      const shared = /^shared\s*:\s*(.+)$/i.exec(stock);
      if (stock.toLowerCase() === "own") variant.stock = { mode: "own" };
      else if (shared) variant.stock = { mode: "shared", fromSku: shared[1]!.trim().toUpperCase() };
      else error("stock_source", "invalid", 'Use "own" or "shared:SKU" (e.g. shared:KLW-TL1200-P1).');
    }
    const opening = cell("opening_stock");
    if (opening) {
      const value = parseWhole(opening, 0, 1_000_000);
      if (value === null) error("opening_stock", "invalid", "Opening stock must be a whole number of units.");
      else variant.openingStock = value;
    }
    const maxOrder = cell("max_order_quantity");
    if (maxOrder) {
      const value = parseWhole(maxOrder, 1, 999);
      if (value === null) error("max_order_quantity", "invalid", "Max order quantity must be a whole number from 1 to 999.");
      else variant.maxOrder = value;
    }
    const weight = cell("weight_grams");
    if (weight) {
      const value = parseWhole(weight, 1, 100000);
      if (value === null) error("weight_grams", "invalid", "Weight must be whole grams from 1 to 100000.");
      else variant.weight = value;
    }
    product.variants.push(variant);
  });

  // Within each product: every SKU names every option once, and no two SKUs share a combination.
  for (const product of products.values()) {
    const groupCount = product.groups.size;
    const combos = new Map<string, number>();
    for (const variant of product.variants) {
      if (variant.options.length !== groupCount) {
        errors.push({ row: variant.row, column: "option1_value", code: "missing_option", message: `This product has ${groupCount} option(s); every SKU row must give a value for each.` });
        continue;
      }
      const key = variant.options.map((o) => `${o.code}=${o.valueCode}`).sort().join("|");
      const other = combos.get(key);
      if (other) errors.push({ row: variant.row, column: "option1_value", code: "duplicate_combination", message: `Same option combination as row ${other}.` });
      else combos.set(key, variant.row);
    }
    if (groupCount === 0 && product.variants.length > 1) {
      errors.push({ row: product.variants[1]!.row, column: "option1_name", code: "options_required", message: "A product with more than one SKU needs options (e.g. option1_name = Pack) to tell them apart." });
    }
  }

  return { plan: { products, rowCount: dataRows.length }, errors, warnings };
}

// ---- Step 2: check the plan against the database ----

type DbVariant = typeof variants.$inferSelect & { optionPairs: string[] };

export type Resolution = {
  categoryIds: Map<string, string>;
  existingProducts: Map<string, typeof products.$inferSelect>;
  existingGroups: Map<string, { id: string; code: string; label: string; values: { id: string; code: string }[] }[]>;
  existingVariants: Map<string, DbVariant>;
  summary: ImportReport["summary"];
};

export async function resolvePlan(db: DbOrTx, plan: ImportPlan): Promise<{ resolution: Resolution; errors: Issue[]; warnings: Issue[] }> {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const slugs = [...plan.products.keys()];
  const allVariants = [...plan.products.values()].flatMap((product) => product.variants);
  const skus = allVariants.map((variant) => variant.sku);
  const sharedSources = allVariants.flatMap((variant) => (variant.stock?.mode === "shared" ? [variant.stock.fromSku] : []));

  const [categoryRows, productRows, variantRows] = await Promise.all([
    db.select({ id: categories.id, slug: categories.slug }).from(categories),
    db.select().from(products).where(inArray(products.slug, slugs)),
    db.select().from(variants).where(inArray(variants.sku, [...new Set([...skus, ...sharedSources])])),
  ]);
  const categoryIds = new Map(categoryRows.map((row) => [row.slug, row.id]));
  const existingProducts = new Map(productRows.map((row) => [row.slug, row]));

  // Option groups and existing SKU combinations for the products being touched.
  const productIds = productRows.map((row) => row.id);
  const [optionRows, valueRows, productVariantRows] = productIds.length
    ? await Promise.all([
        db.select().from(productOptions).where(inArray(productOptions.productId, productIds)),
        db
          .select({ id: productOptionValues.id, optionId: productOptionValues.optionId, code: productOptionValues.code })
          .from(productOptionValues)
          .innerJoin(productOptions, eq(productOptions.id, productOptionValues.optionId))
          .where(inArray(productOptions.productId, productIds)),
        db.select().from(variants).where(inArray(variants.productId, productIds)),
      ])
    : [[], [], []];
  const linkRows = [...productVariantRows, ...variantRows].length
    ? await db.select().from(variantOptionValues).where(inArray(variantOptionValues.variantId, [...new Set([...productVariantRows, ...variantRows].map((v) => v.id))]))
    : [];

  const valuePair = (valueId: string) => {
    const value = valueRows.find((v) => v.id === valueId);
    const option = value && optionRows.find((o) => o.id === value.optionId);
    return option && value ? `${option.code}=${value.code}` : "?";
  };
  const withPairs = (variant: typeof variants.$inferSelect): DbVariant => ({
    ...variant,
    optionPairs: linkRows.filter((link) => link.variantId === variant.id).map((link) => valuePair(link.optionValueId)).sort(),
  });
  const existingVariants = new Map([...variantRows, ...productVariantRows].map((variant) => [variant.sku, withPairs(variant)]));

  const existingGroups = new Map<string, Resolution["existingGroups"] extends Map<string, infer G> ? G : never>();
  for (const product of productRows) {
    existingGroups.set(
      product.slug,
      optionRows
        .filter((option) => option.productId === product.id)
        .sort((a, b) => a.position - b.position)
        .map((option) => ({ id: option.id, code: option.code, label: option.label, values: valueRows.filter((v) => v.optionId === option.id).map(({ id, code }) => ({ id, code })) })),
    );
  }

  const summary = { productsCreated: 0, productsUpdated: 0, variantsCreated: 0, variantsUpdated: 0 };
  const plannedSkus = new Map(allVariants.map((variant) => [variant.sku, variant]));

  for (const product of plan.products.values()) {
    const existing = existingProducts.get(product.slug);
    const error = (row: number, column: string | null, code: string, message: string) => errors.push({ row, column, code, message });

    if (existing) {
      summary.productsUpdated++;
      if (existing.status === "published") {
        error(product.firstRow, "product_slug", "product_published", `"${existing.title}" is published. Imports never change live products; unpublish it first or edit it in the admin.`);
        continue;
      }
    } else {
      summary.productsCreated++;
      if (!product.fields.title) error(product.firstRow, "product_title", "required", "product_title is required for a new product.");
      if (!product.fields.category) error(product.firstRow, "category", "required", "category is required for a new product.");
    }
    if (product.fields.category && !categoryIds.has(product.fields.category.value)) {
      error(product.fields.category.row, "category", "unknown", `Unknown category. Use one of: ${[...categoryIds.keys()].join(", ")}.`);
    }

    // Option groups must match an existing product's groups exactly (codes, order-independent).
    const dbGroups = existingGroups.get(product.slug) ?? [];
    const fileCodes = [...product.groups.values()].map((group) => group.code).sort().join(",");
    const dbCodes = dbGroups.map((group) => group.code).sort().join(",");
    if (existing && dbGroups.length && fileCodes !== dbCodes) {
      error(product.firstRow, "option1_name", "option_groups_mismatch", `This product's options are ${dbGroups.map((g) => g.label).join(", ") || "none"}; the file uses ${[...product.groups.values()].map((g) => g.label).join(", ") || "none"}.`);
      continue;
    }

    for (const variant of product.variants) {
      const pairs = variant.options.map((o) => `${o.code}=${o.valueCode}`).sort();
      const current = existingVariants.get(variant.sku);
      if (current) {
        summary.variantsUpdated++;
        if (current.productId !== existing?.id) {
          error(variant.row, "sku", "sku_belongs_elsewhere", `SKU ${variant.sku} already belongs to another product.`);
          continue;
        }
        if (pairs.join("|") !== current.optionPairs.join("|")) error(variant.row, "option1_value", "options_changed", "An existing SKU's options can't change. Use a new SKU instead.");
        if (variant.stock && (variant.stock.mode !== current.stockMode || (variant.stock.mode === "shared" && existingVariants.get(variant.stock.fromSku)?.inventoryItemId !== current.inventoryItemId))) {
          error(variant.row, "stock_source", "stock_source_changed", "An existing SKU's stock source can't change by import.");
        }
        if (variant.openingStock !== undefined) error(variant.row, "opening_stock", "existing_sku", "Opening stock only applies to new SKUs. Use an inventory adjustment for existing ones.");
        if (variant.packQuantity !== undefined && variant.packQuantity !== current.packQuantity) error(variant.row, "pack_quantity", "pack_changed", "An existing SKU's pack quantity can't change by import.");
      } else {
        summary.variantsCreated++;
        const clash = existing && [...existingVariants.values()].find((v) => v.productId === existing.id && v.optionPairs.join("|") === pairs.join("|"));
        if (clash) error(variant.row, "option1_value", "duplicate_combination", `SKU ${clash.sku} already has this option combination.`);
      }

      const effectivePrice = variant.price !== undefined ? variant.price : (current?.pricePaise ?? null);
      const effectiveMrp = variant.mrp !== undefined ? variant.mrp : (current?.mrpPaise ?? null);
      if (effectiveMrp !== null && effectivePrice === null) error(variant.row, "mrp_inr", "mrp_without_price", "Set price_inr before mrp_inr.");
      if (effectiveMrp !== null && effectivePrice !== null && effectiveMrp < effectivePrice) error(variant.row, "mrp_inr", "mrp_below_price", "MRP must be at least the selling price.");
      if (effectivePrice === null) warnings.push({ row: variant.row, column: "price_inr", code: "price_pending", message: `No price for ${variant.sku}: it stays “pending approval” and the product can't be published until priced.` });

      if (!current && variant.stock?.mode === "shared") {
        const source = variant.stock.fromSku;
        const planned = plannedSkus.get(source);
        const stored = existingVariants.get(source);
        const plannedOk = planned && (planned.stock?.mode ?? "own") === "own" && (planned.packQuantity ?? 1) === 1 && !existingVariants.has(source);
        const storedOk = stored && stored.stockMode === "own" && stored.inventoryUnitsPerSale === 1;
        if (source === variant.sku) error(variant.row, "stock_source", "self_reference", "A SKU can't share its own stock.");
        else if (!plannedOk && !storedOk) error(variant.row, "stock_source", "invalid_source", `${source} must be a single-unit SKU with its own stock (in this file or already in the catalogue).`);
        if (variant.openingStock !== undefined) error(variant.row, "opening_stock", "shared_stock", "Shared-stock SKUs have no stock of their own; put opening stock on the single-unit SKU.");
      }
    }
  }

  return { resolution: { categoryIds, existingProducts, existingGroups, existingVariants, summary }, errors, warnings };
}

// ---- Step 3: apply (inside the caller's transaction) ----

export async function applyPlan(tx: DbOrTx, plan: ImportPlan, resolution: Resolution, meta: { importId: string; filename: string; actorStaffId: string | null }) {
  const itemForSku = new Map<string, string>([...resolution.existingVariants.values()].map((v) => [v.sku, v.inventoryItemId]));
  const productIdFor = new Map<string, string>();
  const valueIdFor = new Map<string, string>(); // `${slug}|${optionCode}=${valueCode}`
  const titleFor = new Map<string, string>();
  const touched = new Map<string, string[]>();

  // Pass 1: products, options, existing-SKU updates and new own-stock SKUs.
  for (const product of plan.products.values()) {
    const existing = resolution.existingProducts.get(product.slug);
    const value = (field: ProductField) => product.fields[field]?.value;
    let productId: string;
    if (existing) {
      productId = existing.id;
      const changes = {
        ...(value("title") ? { title: value("title") } : {}),
        ...(value("category") ? { categoryId: resolution.categoryIds.get(value("category")!)! } : {}),
        ...(value("detail") !== undefined ? { detail: value("detail") } : {}),
        ...(value("spec") !== undefined ? { spec: value("spec") } : {}),
        ...(value("summary") !== undefined ? { summary: value("summary") } : {}),
      };
      if (Object.keys(changes).length) await tx.update(products).set({ ...changes, updatedAt: new Date() }).where(eq(products.id, productId));
      titleFor.set(product.slug, value("title") ?? existing.title);
    } else {
      const [row] = await tx
        .insert(products)
        .values({
          slug: product.slug,
          title: value("title")!,
          categoryId: resolution.categoryIds.get(value("category")!)!,
          detail: value("detail") ?? "",
          spec: value("spec") ?? "",
          summary: value("summary") ?? "",
          status: "draft",
        })
        .returning({ id: products.id });
      productId = row!.id;
      titleFor.set(product.slug, value("title")!);
    }
    productIdFor.set(product.slug, productId);

    // Option groups and any new values.
    const dbGroups = resolution.existingGroups.get(product.slug) ?? [];
    for (const [index, group] of [...product.groups.entries()].sort((a, b) => a[0] - b[0])) {
      let optionId = dbGroups.find((g) => g.code === group.code)?.id;
      const knownValues = dbGroups.find((g) => g.code === group.code)?.values ?? [];
      if (!optionId) {
        const [row] = await tx.insert(productOptions).values({ productId, code: group.code, label: group.label, position: index - 1 }).returning({ id: productOptions.id });
        optionId = row!.id;
      }
      for (const known of knownValues) valueIdFor.set(`${product.slug}|${group.code}=${known.code}`, known.id);
      const [{ value: last } = { value: null }] = await tx.select({ value: max(productOptionValues.position) }).from(productOptionValues).where(eq(productOptionValues.optionId, optionId));
      let position = (last ?? -1) + 1;
      const wanted = new Map(product.variants.flatMap((v) => v.options.filter((o) => o.code === group.code).map((o) => [o.valueCode, o.valueLabel] as const)));
      for (const [valueCode, valueLabel] of wanted) {
        if (valueIdFor.has(`${product.slug}|${group.code}=${valueCode}`)) continue;
        const [row] = await tx.insert(productOptionValues).values({ optionId, code: valueCode, label: valueLabel, position: position++ }).returning({ id: productOptionValues.id });
        valueIdFor.set(`${product.slug}|${group.code}=${valueCode}`, row!.id);
      }
    }

    const [{ value: lastVariant } = { value: null }] = await tx.select({ value: max(variants.position) }).from(variants).where(eq(variants.productId, productId));
    let variantPosition = (lastVariant ?? -1) + 1;
    for (const variant of product.variants) {
      const current = resolution.existingVariants.get(variant.sku);
      const valueIds = variant.options.map((o) => valueIdFor.get(`${product.slug}|${o.code}=${o.valueCode}`)!);
      const priceFields = {
        ...(variant.price !== undefined ? { pricePaise: variant.price } : {}),
        ...(variant.mrp !== undefined ? { mrpPaise: variant.mrp } : {}),
        ...(variant.taxBp !== undefined ? { taxRateBasisPoints: variant.taxBp } : {}),
        ...(variant.hsn !== undefined ? { hsnCode: variant.hsn } : {}),
        ...(variant.maxOrder !== undefined ? { maxOrderQuantity: variant.maxOrder } : {}),
        ...(variant.weight !== undefined ? { weightGrams: variant.weight } : {}),
      };
      if (current) {
        if (Object.keys(priceFields).length) await tx.update(variants).set({ ...priceFields, updatedAt: new Date() }).where(eq(variants.id, current.id));
      } else if ((variant.stock?.mode ?? "own") === "own") {
        const [item] = await tx
          .insert(inventoryItems)
          .values({ label: `${titleFor.get(product.slug)} · ${variant.sku}`, onHand: variant.openingStock ?? 0 })
          .returning({ id: inventoryItems.id });
        if (variant.openingStock) {
          await tx.insert(inventoryMovements).values({
            inventoryItemId: item!.id,
            reason: "received",
            onHandDelta: variant.openingStock,
            note: `Opening stock from CSV import ${meta.filename}`,
            actorStaffId: meta.actorStaffId,
            sourceRef: `import:${meta.importId}`,
          });
        }
        const [row] = await tx
          .insert(variants)
          .values({
            productId,
            sku: variant.sku,
            optionKey: optionKey(valueIds),
            packQuantity: variant.packQuantity ?? 1,
            inventoryItemId: item!.id,
            inventoryUnitsPerSale: 1,
            stockMode: "own",
            position: variantPosition++,
            ...priceFields,
          })
          .returning({ id: variants.id });
        if (valueIds.length) await tx.insert(variantOptionValues).values(valueIds.map((optionValueId) => ({ variantId: row!.id, optionValueId })));
        itemForSku.set(variant.sku, item!.id);
      }
      touched.set(product.slug, [...(touched.get(product.slug) ?? []), variant.sku]);
    }
    (product as PlannedProduct & { nextPosition?: number }).nextPosition = variantPosition;
  }

  // Pass 2: new shared-stock SKUs (their source may have been created in pass 1).
  for (const product of plan.products.values()) {
    let position = (product as PlannedProduct & { nextPosition?: number }).nextPosition ?? 0;
    for (const variant of product.variants) {
      if (resolution.existingVariants.has(variant.sku) || variant.stock?.mode !== "shared") continue;
      const valueIds = variant.options.map((o) => valueIdFor.get(`${product.slug}|${o.code}=${o.valueCode}`)!);
      const packQuantity = variant.packQuantity ?? 1;
      const [row] = await tx
        .insert(variants)
        .values({
          productId: productIdFor.get(product.slug)!,
          sku: variant.sku,
          optionKey: optionKey(valueIds),
          packQuantity,
          inventoryItemId: itemForSku.get(variant.stock.fromSku)!,
          inventoryUnitsPerSale: packQuantity,
          stockMode: "shared",
          position: position++,
          ...(variant.price !== undefined ? { pricePaise: variant.price } : {}),
          ...(variant.mrp !== undefined ? { mrpPaise: variant.mrp } : {}),
          ...(variant.taxBp !== undefined ? { taxRateBasisPoints: variant.taxBp } : {}),
          ...(variant.hsn !== undefined ? { hsnCode: variant.hsn } : {}),
          ...(variant.maxOrder !== undefined ? { maxOrderQuantity: variant.maxOrder } : {}),
          ...(variant.weight !== undefined ? { weightGrams: variant.weight } : {}),
        })
        .returning({ id: variants.id });
      if (valueIds.length) await tx.insert(variantOptionValues).values(valueIds.map((optionValueId) => ({ variantId: row!.id, optionValueId })));
    }
  }

  for (const [slug, skus] of touched) {
    await recordAudit(tx, {
      entityType: "product",
      entityId: productIdFor.get(slug)!,
      action: resolution.existingProducts.has(slug) ? "product.import_updated" : "product.import_created",
      actorStaffId: meta.actorStaffId,
      after: { importId: meta.importId, filename: meta.filename, skus },
    });
  }
  return [...productIdFor.values()];
}

/** Keeps reports readable: errors first by row, capped. */
export function capIssues(issues: Issue[]) {
  return [...issues].sort((a, b) => (a.row ?? 0) - (b.row ?? 0)).slice(0, MAX_REPORTED_ISSUES);
}

