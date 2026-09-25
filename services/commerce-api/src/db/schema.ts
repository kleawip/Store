// Kleawip catalogue schema (single-tenant: one store, INR, India).
// Money is integer paise. Nullable price/tax columns mean "not yet approved by the client" (API_CONTRACT §2).
import { sql } from "drizzle-orm";
import {
  boolean, check, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const publishStatus = pgEnum("publish_status", ["draft", "published", "archived"]);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  note: text("note").notNull().default(""),
  tone: text("tone").notNull(),
  position: integer("position").notNull().default(0),
  isDemo: boolean("is_demo").notNull().default(false),
  ...timestamps,
}, (t) => [uniqueIndex("categories_slug_key").on(t.slug)]);

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull(),
  categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  detail: text("detail").notNull().default(""),
  spec: text("spec").notNull().default(""),
  summary: text("summary").notNull().default(""),
  specifications: jsonb("specifications").$type<{ label: string; value: string }[]>().notNull().default([]),
  contentSections: jsonb("content_sections").$type<{ code: string; title: string; bodyHtml: string }[]>().notNull().default([]),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  status: publishStatus("status").notNull().default("draft"),
  position: integer("position").notNull().default(0),
  isDemo: boolean("is_demo").notNull().default(false),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [
  uniqueIndex("products_slug_key").on(t.slug),
  index("products_category_status_idx").on(t.categoryId, t.status),
]);

export const productMedia = pgTable("product_media", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  alt: text("alt").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  position: integer("position").notNull().default(0),
  // Show this image when the customer selects this option value (e.g. Colour = Blue). Null = always.
  optionValueId: uuid("option_value_id"),
  ...timestamps,
}, (t) => [
  index("product_media_product_idx").on(t.productId, t.position),
  check("product_media_dimensions_check", sql`${t.width} > 0 AND ${t.height} > 0`),
]);

export const variantStatus = pgEnum("variant_status", ["active", "archived"]);

// Option groups (e.g. Size, Colour, Pack) and their values, per product.
export const productOptions = pgTable("product_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  label: text("label").notNull(),
  position: integer("position").notNull().default(0),
}, (t) => [uniqueIndex("product_options_product_code_key").on(t.productId, t.code)]);

export const productOptionValues = pgTable("product_option_values", {
  id: uuid("id").primaryKey().defaultRandom(),
  optionId: uuid("option_id").notNull().references(() => productOptions.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  label: text("label").notNull(),
  swatch: text("swatch"),
  position: integer("position").notNull().default(0),
}, (t) => [uniqueIndex("product_option_values_option_code_key").on(t.optionId, t.code)]);

/**
 * Physical stock. Several variants may draw on one item (a Pack of 2 consuming 2 single units),
 * or a pre-packed variant may have its own item. available = on_hand - committed - unavailable.
 */
export const inventoryItems = pgTable("inventory_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  tracked: boolean("tracked").notNull().default(true),
  onHand: integer("on_hand").notNull().default(0),
  committed: integer("committed").notNull().default(0),
  unavailable: integer("unavailable").notNull().default(0),
  incoming: integer("incoming").notNull().default(0),
  lowStockThreshold: integer("low_stock_threshold"),
  isDemo: boolean("is_demo").notNull().default(false),
  ...timestamps,
}, (t) => [
  check("inventory_items_non_negative", sql`${t.onHand} >= 0 AND ${t.committed} >= 0 AND ${t.unavailable} >= 0 AND ${t.incoming} >= 0`),
  check("inventory_items_available_non_negative", sql`${t.onHand} - ${t.committed} - ${t.unavailable} >= 0`),
]);

export const variants = pgTable("variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  sku: text("sku").notNull(),
  // Sorted option-value ids joined by ",": makes each combination unique within a product.
  optionKey: text("option_key").notNull(),
  status: variantStatus("status").notNull().default("active"),
  position: integer("position").notNull().default(0),
  pricePaise: integer("price_paise"),
  mrpPaise: integer("mrp_paise"),
  taxRateBasisPoints: integer("tax_rate_basis_points"),
  hsnCode: text("hsn_code"),
  // Units shown to the customer (for per-unit price), e.g. 2 for "Pack of 2".
  packQuantity: integer("pack_quantity").notNull().default(1),
  inventoryItemId: uuid("inventory_item_id").notNull().references(() => inventoryItems.id, { onDelete: "restrict" }),
  // Inventory units consumed per unit sold: packQuantity when drawing on shared single-unit stock, 1 for own pre-packed stock.
  inventoryUnitsPerSale: integer("inventory_units_per_sale").notNull().default(1),
  maxOrderQuantity: integer("max_order_quantity").notNull().default(10),
  weightGrams: integer("weight_grams"),
  isDemo: boolean("is_demo").notNull().default(false),
  ...timestamps,
}, (t) => [
  uniqueIndex("variants_sku_key").on(t.sku),
  uniqueIndex("variants_product_option_key").on(t.productId, t.optionKey),
  index("variants_inventory_item_idx").on(t.inventoryItemId),
  check("variants_sku_format", sql`${t.sku} ~ '^[A-Z0-9][A-Z0-9-]{1,63}$'`),
  check("variants_price_positive", sql`${t.pricePaise} IS NULL OR ${t.pricePaise} > 0`),
  check("variants_mrp_not_below_price", sql`${t.mrpPaise} IS NULL OR (${t.pricePaise} IS NOT NULL AND ${t.mrpPaise} >= ${t.pricePaise})`),
  check("variants_tax_rate_range", sql`${t.taxRateBasisPoints} IS NULL OR ${t.taxRateBasisPoints} BETWEEN 0 AND 10000`),
  check("variants_quantities_positive", sql`${t.packQuantity} >= 1 AND ${t.inventoryUnitsPerSale} >= 1 AND ${t.maxOrderQuantity} >= 1`),
]);

export const variantOptionValues = pgTable("variant_option_values", {
  variantId: uuid("variant_id").notNull().references(() => variants.id, { onDelete: "cascade" }),
  // NO ACTION (checked at statement end) blocks deleting an in-use value, yet allows deleting a whole product.
  optionValueId: uuid("option_value_id").notNull().references(() => productOptionValues.id, { onDelete: "no action" }),
}, (t) => [primaryKey({ columns: [t.variantId, t.optionValueId] })]);

export const inventoryReason = pgEnum("inventory_reason", [
  "received", "count_correction", "damaged", "returned_restock", "order_committed", "order_released", "order_fulfilled", "other",
]);

// Append-only stock ledger: every change to an inventory item records who, why and the deltas.
export const inventoryMovements = pgTable("inventory_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  inventoryItemId: uuid("inventory_item_id").notNull().references(() => inventoryItems.id, { onDelete: "restrict" }),
  reason: inventoryReason("reason").notNull(),
  onHandDelta: integer("on_hand_delta").notNull().default(0),
  committedDelta: integer("committed_delta").notNull().default(0),
  unavailableDelta: integer("unavailable_delta").notNull().default(0),
  note: text("note"),
  actorStaffId: uuid("actor_staff_id"),
  sourceRef: text("source_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("inventory_movements_item_idx").on(t.inventoryItemId, t.createdAt)]);

export const collections = pgTable("collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: publishStatus("status").notNull().default("draft"),
  position: integer("position").notNull().default(0),
  isDemo: boolean("is_demo").notNull().default(false),
  ...timestamps,
}, (t) => [uniqueIndex("collections_slug_key").on(t.slug)]);

export const collectionProducts = pgTable("collection_products", {
  collectionId: uuid("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.collectionId, t.productId] })]);

// Shared timeline/audit for every entity (admin brief §0 "Timeline panel").
export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  action: text("action").notNull(),
  actorStaffId: uuid("actor_staff_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("audit_events_entity_idx").on(t.entityType, t.entityId, t.createdAt)]);
