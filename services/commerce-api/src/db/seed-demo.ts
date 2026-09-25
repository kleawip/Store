import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { Database } from "./client";
import { categories, productMedia, products } from "./schema";

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

/**
 * Replaces all catalogue rows with the demo fixture. Every row is marked isDemo.
 * Refuses to run against production.
 */
export async function seedDemoCatalogue(db: Database) {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production.");
  const catalogue = DemoCatalogue.parse(JSON.parse(await readFile(demoCataloguePath, "utf8")));

  await db.transaction(async (tx) => {
    await tx.delete(productMedia);
    await tx.delete(products);
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
