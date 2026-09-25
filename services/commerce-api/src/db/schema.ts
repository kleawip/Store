// Kleawip catalogue schema (single-tenant: one store, INR, India).
// Money is integer paise. Nullable price/tax columns mean "not yet approved by the client" (API_CONTRACT §2).
import { sql } from "drizzle-orm";
import {
  boolean, check, index, integer, jsonb, pgEnum, pgSequence, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid,
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

// Uploaded image files (the media library). Files are content-addressed, so a URL never changes behind a cache.
export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Delivery file (normalised WebP) and the untouched original, as storage keys.
  storageKey: text("storage_key").notNull(),
  originalKey: text("original_key").notNull(),
  url: text("url").notNull(),
  originalFilename: text("original_filename").notNull(),
  originalMime: text("original_mime").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  bytes: integer("bytes").notNull(),
  sha256: text("sha256").notNull(),
  alt: text("alt").notNull().default(""),
  uploadedByStaffId: uuid("uploaded_by_staff_id").references(() => staffUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("media_assets_sha256_key").on(t.sha256)]);

export const productMedia = pgTable("product_media", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  alt: text("alt").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  position: integer("position").notNull().default(0),
  // Show this image when the customer selects this option value (e.g. Colour = Blue). Null = always.
  optionValueId: uuid("option_value_id").references(() => productOptionValues.id, { onDelete: "set null" }),
  // Library file this image came from. Null for legacy/demo images that live in the storefront's public folder.
  assetId: uuid("asset_id").references(() => mediaAssets.id, { onDelete: "restrict" }),
  ...timestamps,
}, (t) => [
  index("product_media_product_idx").on(t.productId, t.position),
  check("product_media_dimensions_check", sql`${t.width} > 0 AND ${t.height} > 0`),
]);

export const variantStatus = pgEnum("variant_status", ["active", "archived"]);
export const stockMode = pgEnum("stock_mode", ["own", "shared"]);

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
  // own: this SKU's own inventory item; shared: draws on a single-unit SKU's item (ADMIN_SCREENS_BRIEF §4).
  stockMode: stockMode("stock_mode").notNull().default("own"),
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
  actorStaffId: uuid("actor_staff_id").references(() => staffUsers.id, { onDelete: "set null" }),
  sourceRef: text("source_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("inventory_movements_item_idx").on(t.inventoryItemId, t.createdAt)]);

export const collections = pgTable("collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  bannerAssetId: uuid("banner_asset_id").references(() => mediaAssets.id, { onDelete: "restrict" }),
  bannerAlt: text("banner_alt").notNull().default(""),
  status: publishStatus("status").notNull().default("draft"),
  position: integer("position").notNull().default(0),
  isDemo: boolean("is_demo").notNull().default(false),
  publishedAt: timestamp("published_at", { withTimezone: true }),
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
  actorStaffId: uuid("actor_staff_id").references(() => staffUsers.id, { onDelete: "set null" }),
  before: jsonb("before"),
  after: jsonb("after"),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("audit_events_entity_idx").on(t.entityType, t.entityId, t.createdAt)]);

// ---- Staff (Kleawip employees only; no public sign-up) ----

export const staffRole = pgEnum("staff_role", ["owner", "catalogue_manager", "marketing_editor", "operations", "support", "viewer"]);
export const staffStatus = pgEnum("staff_status", ["invited", "active", "disabled"]);

export const staffUsers = pgTable("staff_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: staffRole("role").notNull(),
  status: staffStatus("status").notNull().default("active"),
  passwordHash: text("password_hash").notNull(),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [
  uniqueIndex("staff_users_email_key").on(t.email),
  check("staff_users_email_lowercase", sql`${t.email} = lower(${t.email})`),
]);

// One-time links for setting a password (new invites and resets). Only the SHA-256 of the token is stored.
export const staffSetupTokens = pgTable("staff_setup_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  staffId: uuid("staff_id").notNull().references(() => staffUsers.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  purpose: text("purpose").notNull(), // "invite" | "reset"
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdByStaffId: uuid("created_by_staff_id").references(() => staffUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("staff_setup_tokens_hash_key").on(t.tokenHash)]);

// Only a SHA-256 of the session token is stored, so a database leak does not expose live sessions.
export const staffSessions = pgTable("staff_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  staffId: uuid("staff_id").notNull().references(() => staffUsers.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  csrfToken: text("csrf_token").notNull(),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("staff_sessions_token_hash_key").on(t.tokenHash),
  index("staff_sessions_staff_idx").on(t.staffId),
]);

// ---- Homepage campaigns (HOMEPAGE_CAMPAIGNS_SPEC) ----

export const campaignTargetType = pgEnum("campaign_target_type", ["product", "collection", "category", "page"]);

// One destination per slide/message. FKs are SET NULL so a deleted target simply hides the slide (never a 404 link).
const campaignTarget = {
  targetType: campaignTargetType("target_type"),
  targetProductId: uuid("target_product_id").references(() => products.id, { onDelete: "set null" }),
  targetCollectionId: uuid("target_collection_id").references(() => collections.id, { onDelete: "set null" }),
  targetCategoryId: uuid("target_category_id").references(() => categories.id, { onDelete: "set null" }),
  targetPage: text("target_page"),
};

const schedule = {
  // Null start = as soon as published; null end = no end. Stored in UTC, entered and shown in IST.
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
};

export const heroSlides = pgTable("hero_slides", {
  id: uuid("id").primaryKey().defaultRandom(),
  internalTitle: text("internal_title").notNull(),
  eyebrow: text("eyebrow").notNull().default(""),
  headline: text("headline").notNull().default(""),
  description: text("description").notNull().default(""),
  ctaLabel: text("cta_label").notNull().default(""),
  ...campaignTarget,
  desktopAssetId: uuid("desktop_asset_id").references(() => mediaAssets.id, { onDelete: "restrict" }),
  tabletAssetId: uuid("tablet_asset_id").references(() => mediaAssets.id, { onDelete: "restrict" }),
  mobileAssetId: uuid("mobile_asset_id").references(() => mediaAssets.id, { onDelete: "restrict" }),
  desktopAlt: text("desktop_alt").notNull().default(""),
  tabletAlt: text("tablet_alt").notNull().default(""),
  mobileAlt: text("mobile_alt").notNull().default(""),
  ...schedule,
  status: publishStatus("status").notNull().default("draft"),
  position: integer("position").notNull().default(0),
  isDemo: boolean("is_demo").notNull().default(false),
  ...timestamps,
}, (t) => [check("hero_slides_schedule_order", sql`${t.endsAt} IS NULL OR ${t.startsAt} IS NULL OR ${t.endsAt} > ${t.startsAt}`)]);

export const ribbonMessages = pgTable("ribbon_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  text: text("text").notNull(),
  ...campaignTarget,
  ...schedule,
  status: publishStatus("status").notNull().default("draft"),
  position: integer("position").notNull().default(0),
  isDemo: boolean("is_demo").notNull().default(false),
  ...timestamps,
}, (t) => [check("ribbon_messages_schedule_order", sql`${t.endsAt} IS NULL OR ${t.startsAt} IS NULL OR ${t.endsAt} > ${t.startsAt}`)]);

// ---- Catalogue CSV imports (ADMIN_SCREENS_BRIEF §5): validate first, apply on confirm ----

export const importStatus = pgEnum("import_status", ["validated", "committed", "failed"]);

export const catalogueImports = pgTable("catalogue_imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: text("filename").notNull(),
  // The uploaded CSV is kept so the commit re-validates exactly what staff reviewed.
  csv: text("csv").notNull(),
  status: importStatus("status").notNull(),
  report: jsonb("report").notNull(),
  createdByStaffId: uuid("created_by_staff_id").references(() => staffUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  committedAt: timestamp("committed_at", { withTimezone: true }),
});

// ---- Customers (Milestone 2): phone is the identity, verified by WhatsApp OTP (ADR 0002 R1) ----

export const customerStatus = pgEnum("customer_status", ["active", "blocked"]);

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  // E.164, Indian mobiles only for now: +91 followed by 10 digits starting 6–9.
  phone: text("phone").notNull(),
  phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
  name: text("name").notNull().default(""),
  email: text("email"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  status: customerStatus("status").notNull().default("active"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [
  uniqueIndex("customers_phone_key").on(t.phone),
  uniqueIndex("customers_email_key").on(t.email),
  check("customers_phone_format", sql`${t.phone} ~ '^\\+91[6-9][0-9]{9}$'`),
  check("customers_email_lowercase", sql`${t.email} IS NULL OR ${t.email} = lower(${t.email})`),
]);

export const otpChannel = pgEnum("otp_channel", ["whatsapp", "email"]);

// One sign-in attempt. Only a hash of the code is stored; codes expire in minutes and allow few guesses.
export const otpChallenges = pgTable("otp_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone: text("phone").notNull(),
  channel: otpChannel("channel").notNull(),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("otp_challenges_phone_created_idx").on(t.phone, t.createdAt)]);

export const customerSessions = pgTable("customer_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [uniqueIndex("customer_sessions_token_hash_key").on(t.tokenHash), index("customer_sessions_customer_idx").on(t.customerId)]);

export const addresses = pgTable("addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  line1: text("line1").notNull(),
  line2: text("line2").notNull().default(""),
  landmark: text("landmark").notNull().default(""),
  city: text("city").notNull(),
  // ISO 3166-2:IN subdivision code without the "IN-" prefix, e.g. "MH", "KA", "DL".
  stateCode: text("state_code").notNull(),
  pincode: text("pincode").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  ...timestamps,
}, (t) => [
  index("addresses_customer_idx").on(t.customerId),
  check("addresses_pincode_format", sql`${t.pincode} ~ '^[1-9][0-9]{5}$'`),
  check("addresses_phone_format", sql`${t.phone} ~ '^\\+91[6-9][0-9]{9}$'`),
]);

// ---- Cart and wishlist (Milestone 2) ----

// A cart belongs to a customer, or to an anonymous browser (hashed token in the klw_cart cookie) until sign-in merges it.
export const carts = pgTable("carts", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
  guestTokenHash: text("guest_token_hash"),
  ...timestamps,
}, (t) => [
  uniqueIndex("carts_customer_key").on(t.customerId),
  uniqueIndex("carts_guest_token_key").on(t.guestTokenHash),
  check("carts_owner", sql`(${t.customerId} IS NULL) <> (${t.guestTokenHash} IS NULL)`),
]);

export const cartLines = pgTable("cart_lines", {
  cartId: uuid("cart_id").notNull().references(() => carts.id, { onDelete: "cascade" }),
  variantId: uuid("variant_id").notNull().references(() => variants.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
  // Price the customer saw when adding; a later difference is reported as PRICE_CHANGED.
  pricePaiseWhenAdded: integer("price_paise_when_added").notNull(),
  ...timestamps,
}, (t) => [primaryKey({ columns: [t.cartId, t.variantId] }), check("cart_lines_quantity_positive", sql`${t.quantity} > 0`)]);

export const wishlistItems = pgTable("wishlist_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  variantId: uuid("variant_id").references(() => variants.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("wishlist_items_customer_product_key").on(t.customerId, t.productId)]);

// ---- Checkout quotes (Milestone 2): the exact amounts a customer agreed to, valid for 15 minutes ----

export const paymentMethod = pgEnum("payment_method", ["prepaid", "partial_cod"]);

export const checkoutQuotes = pgTable("checkout_quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  addressId: uuid("address_id").notNull().references(() => addresses.id, { onDelete: "cascade" }),
  paymentMethod: paymentMethod("payment_method").notNull(),
  // Snapshot of lines and totals: order creation must reproduce these exactly or ask for a new quote.
  snapshot: jsonb("snapshot").notNull(),
  totalPaise: integer("total_paise").notNull(),
  payNowPaise: integer("pay_now_paise").notNull(),
  codBalancePaise: integer("cod_balance_paise").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("checkout_quotes_customer_idx").on(t.customerId, t.createdAt),
  check("checkout_quotes_amounts", sql`${t.payNowPaise} + ${t.codBalancePaise} = ${t.totalPaise} AND ${t.payNowPaise} > 0`),
]);

// ---- Orders and payments (Milestone 2) ----

export const orderNumberSeq = pgSequence("order_number_seq", { startWith: 100001 });

export const orderStatus = pgEnum("order_status", ["pending_payment", "confirmed", "expired", "cancelled"]);

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Human-facing number, e.g. KLW100001.
  number: text("number").notNull(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
  quoteId: uuid("quote_id").notNull().references(() => checkoutQuotes.id, { onDelete: "restrict" }),
  idempotencyKey: text("idempotency_key").notNull(),
  status: orderStatus("status").notNull().default("pending_payment"),
  paymentMethod: paymentMethod("payment_method").notNull(),
  // Frozen at order time: later edits to the address book or catalogue never change a placed order.
  shippingAddress: jsonb("shipping_address").notNull(),
  merchandisePaise: integer("merchandise_paise").notNull(),
  shippingPaise: integer("shipping_paise").notNull(),
  totalPaise: integer("total_paise").notNull(),
  payNowPaise: integer("pay_now_paise").notNull(),
  codBalancePaise: integer("cod_balance_paise").notNull(),
  gst: jsonb("gst").notNull(),
  reservationExpiresAt: timestamp("reservation_expires_at", { withTimezone: true }).notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  // Set when money arrived for an order that can no longer be fulfilled (e.g. paid after expiry, stock gone).
  needsAttention: text("needs_attention"),
  ...timestamps,
}, (t) => [
  uniqueIndex("orders_number_key").on(t.number),
  uniqueIndex("orders_quote_key").on(t.quoteId),
  uniqueIndex("orders_customer_idempotency_key").on(t.customerId, t.idempotencyKey),
  index("orders_status_created_idx").on(t.status, t.createdAt),
  check("orders_amounts", sql`${t.payNowPaise} + ${t.codBalancePaise} = ${t.totalPaise} AND ${t.merchandisePaise} + ${t.shippingPaise} = ${t.totalPaise}`),
]);

export const orderLines = pgTable("order_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  variantId: uuid("variant_id").notNull().references(() => variants.id, { onDelete: "restrict" }),
  inventoryItemId: uuid("inventory_item_id").notNull().references(() => inventoryItems.id, { onDelete: "restrict" }),
  inventoryUnits: integer("inventory_units").notNull(), // units reserved = quantity × units per sale
  sku: text("sku").notNull(),
  productTitle: text("product_title").notNull(),
  optionsLabel: text("options_label").notNull(),
  quantity: integer("quantity").notNull(),
  unitPricePaise: integer("unit_price_paise").notNull(),
  taxRateBasisPoints: integer("tax_rate_basis_points").notNull(),
  lineTotalPaise: integer("line_total_paise").notNull(),
}, (t) => [index("order_lines_order_idx").on(t.orderId), check("order_lines_positive", sql`${t.quantity} > 0 AND ${t.inventoryUnits} > 0`)]);

export const paymentStatus = pgEnum("payment_status", ["created", "captured", "failed"]);

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
  provider: text("provider").notNull(), // "razorpay" | "dev"
  purpose: text("purpose").notNull(), // "full" (prepaid) | "deposit" (partial COD)
  providerOrderId: text("provider_order_id").notNull(),
  providerPaymentId: text("provider_payment_id"),
  amountPaise: integer("amount_paise").notNull(),
  status: paymentStatus("status").notNull().default("created"),
  failureReason: text("failure_reason"),
  capturedAt: timestamp("captured_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [
  uniqueIndex("payments_provider_order_key").on(t.provider, t.providerOrderId),
  uniqueIndex("payments_provider_payment_key").on(t.provider, t.providerPaymentId),
  index("payments_order_idx").on(t.orderId),
]);

// Every webhook delivery is recorded once by the provider's event id, so retries never double-process.
export const paymentEvents = pgTable("payment_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(),
  eventId: text("event_id").notNull(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("payment_events_provider_event_key").on(t.provider, t.eventId)]);
