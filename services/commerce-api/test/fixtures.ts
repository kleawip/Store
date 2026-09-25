import { eq } from "drizzle-orm";
import type { Database } from "../src/db/client";
import {
  inventoryItems,
  productMedia,
  productOptionValues,
  productOptions,
  products,
  variantOptionValues,
  variants,
} from "../src/db/schema";
import { optionKey } from "../src/domain/availability";

/**
 * TEST-ONLY variant fixture on top of the demo catalogue (FRONTEND_DATA_HANDOFF "first integration test gate").
 * SKUs and prices are placeholders, never seed data.
 *
 * twisted-loop-1200: option groups size (40x60) and pack (p1, p2, p3), one shared single-unit stock of 5.
 *   DEMO-SKU-A  Single     ₹499  draws 1 unit
 *   DEMO-SKU-B  Pack of 2  ₹949  draws 2 units   (MRP ₹998)
 *   DEMO-SKU-C  Pack of 3  price pending          → not_for_sale
 */
export async function addVariantFixture(db: Database, { onHand = 5, lowStockThreshold = null as number | null } = {}) {
  const [product] = await db.select({ id: products.id }).from(products).where(eq(products.slug, "twisted-loop-1200"));
  const productId = product!.id;

  const [size] = await db.insert(productOptions).values({ productId, code: "size", label: "Size", position: 0 }).returning();
  const [pack] = await db.insert(productOptions).values({ productId, code: "pack", label: "Pack", position: 1 }).returning();
  const [size4060] = await db.insert(productOptionValues).values({ optionId: size!.id, code: "40x60", label: "40 × 60 cm" }).returning();
  const packValues = await db
    .insert(productOptionValues)
    .values([
      { optionId: pack!.id, code: "p1", label: "Single", position: 0 },
      { optionId: pack!.id, code: "p2", label: "Pack of 2", position: 1 },
      { optionId: pack!.id, code: "p3", label: "Pack of 3", position: 2 },
    ])
    .returning();
  const [p1, p2, p3] = packValues;

  const [stock] = await db
    .insert(inventoryItems)
    .values({ label: "DEMO Twisted Loop single unit", onHand, lowStockThreshold, isDemo: true })
    .returning();

  const make = async (
    sku: string,
    packValue: typeof p1,
    fields: Partial<typeof variants.$inferInsert>,
  ) => {
    const valueIds = [size4060!.id, packValue!.id];
    const [row] = await db
      .insert(variants)
      .values({ productId, sku, optionKey: optionKey(valueIds), inventoryItemId: stock!.id, isDemo: true, ...fields })
      .returning();
    await db.insert(variantOptionValues).values(valueIds.map((optionValueId) => ({ variantId: row!.id, optionValueId })));
    return row!;
  };

  await make("DEMO-SKU-A", p1, { position: 0, pricePaise: 49900, packQuantity: 1, inventoryUnitsPerSale: 1 });
  await make("DEMO-SKU-B", p2, { position: 1, pricePaise: 94900, mrpPaise: 99800, packQuantity: 2, inventoryUnitsPerSale: 2 });
  await make("DEMO-SKU-C", p3, { position: 2, pricePaise: null, packQuantity: 3, inventoryUnitsPerSale: 3 });

  // Tie the second demo image to "Pack of 2".
  const images = await db.select().from(productMedia).where(eq(productMedia.productId, productId));
  const second = images.find((image) => image.position === 1)!;
  await db.update(productMedia).set({ optionValueId: p2!.id }).where(eq(productMedia.id, second.id));

  return { productId, inventoryItemId: stock!.id, optionValueIds: { size4060: size4060!.id, p1: p1!.id, p2: p2!.id, p3: p3!.id } };
}
