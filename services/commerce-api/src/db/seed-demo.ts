import { sql } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { Database } from "./client";
import { categories, collections, inventoryItems, inventoryMovements, productMedia, products } from "./schema";

const demoCataloguePath = fileURLToPath(new URL("../../../../database/seeds/demo/catalogue.json", import.meta.url));

const DemoCatalogue = z.object({
  categories: z.array(z.object({ slug: z.string(), title: z.string(), note: z.string(), tone: z.string() })),
  products: z.array(z.object({
    slug: z.string(),
    title: z.string(),
    detail: z.string(),
    category: z.string(),
    spec: z.string(),
    position: z.number().int(),
    images: z.array(z.object({ url: z.string(), alt: z.string(), width: z.number().int(), height: z.number().int() })),
  })),
});

/** Databases the demo seed may wipe: names ending in _dev or _test (e.g. kleawip_dev, kleawip_test). */
export const DEMO_SEEDABLE_DATABASE = /_(dev|test)$/;

/**
 * DESTRUCTIVE: replaces all catalogue rows with the demo fixture. Every row is marked isDemo.
 * Refuses to run in production or against any database whose real name (asked from Postgres,
 * not from configuration) does not end in _dev or _test.
 */
export async function seedDemoCatalogue(db: Database) {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production.");
  const result = await db.execute<{ name: string }>(sql`SELECT current_database() AS name`);
  const name = result.rows[0]?.name ?? "";
  if (!DEMO_SEEDABLE_DATABASE.test(name)) {
    throw new Error(`Refusing to seed demo data into database "${name}": only *_dev or *_test databases may be wiped.`);
  }
  const catalogue = DemoCatalogue.parse(JSON.parse(await readFile(demoCataloguePath, "utf8")));

  await db.transaction(async (tx) => {
    await tx.delete(collections);
    await tx.delete(inventoryMovements);
    await tx.delete(productMedia);
    await tx.delete(products); // cascades options, values, variants and their option links
    await tx.delete(inventoryItems);
    await tx.delete(categories);

    const insertedCategories = await tx
      .insert(categories)
      .values(catalogue.categories.map((category, position) => ({ ...category, position, isDemo: true })))
      .returning({ id: categories.id, slug: categories.slug });
    const categoryIds = new Map(insertedCategories.map((row) => [row.slug, row.id]));

    for (const product of catalogue.products) {
      const categoryId = categoryIds.get(product.category);
      if (!categoryId) throw new Error(`Demo product ${product.slug} has unknown category ${product.category}`);
      const [inserted] = await tx
        .insert(products)
        .values({
          slug: product.slug,
          categoryId,
          title: product.title,
          detail: product.detail,
          spec: product.spec,
          position: product.position,
          status: "published",
          publishedAt: new Date(),
          isDemo: true,
        })
        .returning({ id: products.id });
      if (product.images.length) {
        await tx.insert(productMedia).values(product.images.map((image, position) => ({ ...image, productId: inserted!.id, position })));
      }
    }
  });

  return { categories: catalogue.categories.length, products: catalogue.products.length };
}
