import { Problem, ProductDetail, ProductListResponse } from "@kleawip/contract";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { optionKey } from "../src/domain/availability";
import { inventoryItems, products, variants } from "../src/db/schema";
import { seedDemoCatalogue } from "../src/db/seed-demo";
import { addVariantFixture } from "./fixtures";
import { createTestApp } from "./helpers";

let ctx: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await seedDemoCatalogue(ctx.db);
});

const getDetail = async (slug = "twisted-loop-1200") => {
  const res = await ctx.app.inject({ method: "GET", url: `/v1/store/products/${slug}` });
  return { res, body: res.statusCode === 200 ? ProductDetail.parse(res.json()) : null };
};

describe("GET /v1/store/products/{slug}", () => {
  it("returns a demo product with no variants as not for sale with pending price", async () => {
    const { res, body } = await getDetail();
    expect(res.statusCode).toBe(200);
    expect(body).toMatchObject({
      slug: "twisted-loop-1200",
      category: { slug: "automotive", title: "Automotive Care" },
      variants: [],
      defaultSku: null,
      priceFrom: null,
      priceStatus: "pending",
      availability: "not_for_sale",
      isDemo: true,
    });
    expect(body!.images.length).toBeGreaterThan(0);
  });

  it("returns option groups and only valid combinations as SKUs", async () => {
    await addVariantFixture(ctx.db);
    const { body } = await getDetail();
    expect(body!.optionGroups.map((group) => group.code)).toEqual(["size", "pack"]);
    expect(body!.optionGroups[1]!.values.map((value) => value.code)).toEqual(["p1", "p2", "p3"]);
    expect(body!.variants.map((variant) => variant.sku)).toEqual(["DEMO-SKU-A", "DEMO-SKU-B", "DEMO-SKU-C"]);
    expect(body!.variants[1]!.options).toEqual({ size: "40x60", pack: "p2" });
  });

  it("computes pack stock from shared single units and per-unit price", async () => {
    await addVariantFixture(ctx.db, { onHand: 5 });
    const { body } = await getDetail();
    const [single, pack2, pack3] = body!.variants;
    expect(single).toMatchObject({ availability: "in_stock", maxOrderQuantity: 5, price: { amount: 49900, currency: "INR" } });
    expect(pack2).toMatchObject({
      availability: "in_stock",
      maxOrderQuantity: 2, // 5 units ÷ 2 per pack
      price: { amount: 94900, currency: "INR" },
      mrp: { amount: 99800, currency: "INR" },
      unitPrice: { amount: 47450, currency: "INR" },
    });
    expect(pack3).toMatchObject({ availability: "not_for_sale", priceStatus: "pending", price: null, unitPrice: null, maxOrderQuantity: 0 });
    expect(body).toMatchObject({ priceFrom: { amount: 49900 }, priceStatus: "approved", availability: "in_stock", defaultSku: "DEMO-SKU-A" });
  });

  it("marks a pack out of stock when shared units cannot fill it, while the single stays available", async () => {
    await addVariantFixture(ctx.db, { onHand: 1 });
    const { body } = await getDetail();
    expect(body!.variants[0]!.availability).toBe("in_stock");
    expect(body!.variants[1]!.availability).toBe("out_of_stock");
  });

  it("exposes stockLeft only in the low-stock state", async () => {
    await addVariantFixture(ctx.db, { onHand: 3, lowStockThreshold: 3 });
    const { body } = await getDetail();
    expect(body!.variants[0]).toMatchObject({ availability: "low_stock", stockLeft: 3 });
    await ctx.db.update(inventoryItems).set({ onHand: 50 });
    const { body: restocked } = await getDetail();
    expect(restocked!.variants[0]!.stockLeft).toBeUndefined();
  });

  it("links option-specific images to the variants that use that option value", async () => {
    await addVariantFixture(ctx.db);
    const { body } = await getDetail();
    const packImage = body!.images.find((image) => image.optionValue === "pack:p2")!;
    expect(packImage).toBeDefined();
    expect(body!.variants[1]!.imageIds).toEqual([packImage.id]);
    expect(body!.variants[0]!.imageIds).toEqual([]);
  });

  it("hides archived variants", async () => {
    await addVariantFixture(ctx.db);
    await ctx.db.update(variants).set({ status: "archived" }).where(eq(variants.sku, "DEMO-SKU-A"));
    const { body } = await getDetail();
    expect(body!.variants.map((variant) => variant.sku)).not.toContain("DEMO-SKU-A");
    expect(body!.defaultSku).toBe("DEMO-SKU-B");
  });

  it("returns NOT_FOUND for unknown and unpublished products", async () => {
    await ctx.db.update(products).set({ status: "draft" }).where(eq(products.slug, "twisted-loop-1200"));
    for (const slug of ["twisted-loop-1200", "no-such-product"]) {
      const { res } = await getDetail(slug);
      expect(res.statusCode).toBe(404);
      expect(Problem.parse(res.json()).code).toBe("NOT_FOUND");
    }
  });

  it("feeds real price and availability into the product list", async () => {
    await addVariantFixture(ctx.db);
    const res = await ctx.app.inject({ method: "GET", url: "/v1/store/products?category=automotive" });
    const item = ProductListResponse.parse(res.json()).data.find((product) => product.slug === "twisted-loop-1200")!;
    expect(item).toMatchObject({ priceFrom: { amount: 49900, currency: "INR" }, priceStatus: "approved", availability: "in_stock" });
  });
});

describe("database constraints protect catalogue integrity", () => {
  it("rejects a duplicate SKU", async () => {
    const { productId, inventoryItemId, optionValueIds } = await addVariantFixture(ctx.db);
    await expect(
      ctx.db.insert(variants).values({ productId, sku: "DEMO-SKU-A", optionKey: optionKey([optionValueIds.size4060]), inventoryItemId }),
    ).rejects.toThrow();
  });

  it("rejects a second SKU for the same option combination", async () => {
    const { productId, inventoryItemId, optionValueIds } = await addVariantFixture(ctx.db);
    await expect(
      ctx.db.insert(variants).values({
        productId,
        sku: "DEMO-SKU-Z",
        optionKey: optionKey([optionValueIds.p1, optionValueIds.size4060]),
        inventoryItemId,
      }),
    ).rejects.toThrow();
  });

  it("rejects MRP below price and a lowercase SKU", async () => {
    const { productId, inventoryItemId } = await addVariantFixture(ctx.db);
    await expect(
      ctx.db.insert(variants).values({ productId, sku: "DEMO-SKU-M", optionKey: "m", inventoryItemId, pricePaise: 50000, mrpPaise: 40000 }),
    ).rejects.toThrow();
    await expect(ctx.db.insert(variants).values({ productId, sku: "demo-sku-l", optionKey: "l", inventoryItemId })).rejects.toThrow();
  });

  it("rejects stock that would make available negative", async () => {
    const { inventoryItemId } = await addVariantFixture(ctx.db, { onHand: 5 });
    await expect(ctx.db.update(inventoryItems).set({ committed: 6 }).where(eq(inventoryItems.id, inventoryItemId))).rejects.toThrow();
  });
});
