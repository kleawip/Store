// Milestone 1 scaffold: categories, products and media only.
// Variants, prices and inventory are added once the contract and Phase 0 SKU rules are approved.
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
  ...timestamps,
}, (t) => [
  index("product_media_product_idx").on(t.productId, t.position),
  check("product_media_dimensions_check", sql`${t.width} > 0 AND ${t.height} > 0`),
]);
