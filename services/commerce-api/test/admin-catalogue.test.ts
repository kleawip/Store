import { AdminProduct, Problem, ProductDetail } from "@kleawip/contract";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { products } from "../src/db/schema";
import { seedDemoCatalogue } from "../src/db/seed-demo";
import { createStaff, createTestApp, resetStaffAndAudit, signIn } from "./helpers";

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let owner: Awaited<ReturnType<typeof signIn>>;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await resetStaffAndAudit(ctx.db);
  await seedDemoCatalogue(ctx.db);
  await createStaff(ctx.db, "owner");
  owner = await signIn(ctx.app, "owner@kleawip.test");
});

const demoProductId = async (slug = "twisted-loop-1200") =>
  (await ctx.db.select({ id: products.id }).from(products).where(eq(products.slug, slug)))[0]!.id;

const problem = (res: { json: () => unknown }) => Problem.parse(res.json());

/** Gives the demo Twisted Loop product a Pack option and two SKUs: a single that owns stock and a Pack of 2 sharing it. */
async function setUpPackVariants(id: string, overrides: Record<string, unknown> = {}) {
  await owner.request("POST", `/v1/admin/products/${id}/unpublish`);
  expect((await owner.request("PUT", `/v1/admin/products/${id}/options`, {
    groups: [{ code: "pack", label: "Pack", values: [{ code: "p1", label: "Single" }, { code: "p2", label: "Pack of 2" }] }],
  })).statusCode).toBe(200);
  const base = { pricePaise: 49900, taxRateBasisPoints: 1200, hsnCode: "63079090", ...overrides };
  expect((await owner.request("POST", `/v1/admin/products/${id}/variants`, { ...base, sku: "TEST-TL-1", options: { pack: "p1" } })).statusCode).toBe(201);
  const res = await owner.request("POST", `/v1/admin/products/${id}/variants`, {
    ...base,
    sku: "TEST-TL-2",
    options: { pack: "p2" },
    pricePaise: 94900,
    packQuantity: 2,
    stock: { mode: "shared", fromSku: "TEST-TL-1" },
  });
  expect(res.statusCode).toBe(201);
  return AdminProduct.parse(res.json());
}

describe("products", () => {
  it("creates a draft with a generated unique slug and an audit entry", async () => {
    const first = await owner.request("POST", "/v1/admin/products", { title: "Bath Towel Deluxe", categorySlug: "bath" });
    const second = await owner.request("POST", "/v1/admin/products", { title: "Bath Towel Deluxe", categorySlug: "bath" });
    expect(first.statusCode).toBe(201);
    const a = AdminProduct.parse(first.json());
    const b = AdminProduct.parse(second.json());
    expect([a.slug, b.slug]).toEqual(["bath-towel-deluxe", "bath-towel-deluxe-2"]);
    expect(a).toMatchObject({ status: "draft", slugLocked: false, variants: [] });

    const timeline = await owner.request("GET", `/v1/admin/timeline/product/${a.id}`);
    expect(timeline.json().data[0]).toMatchObject({ action: "product.created", actorName: "Test owner" });
  });

  it("rejects an unknown category and invalid input with field paths", async () => {
    const res = await owner.request("POST", "/v1/admin/products", { title: "", categorySlug: "nope" });
    expect(res.statusCode).toBe(422);
    expect(problem(res).errors!.map((error) => error.path)).toContain("title");
    const unknown = await owner.request("POST", "/v1/admin/products", { title: "X", categorySlug: "nope" });
    expect(problem(unknown).errors![0]).toMatchObject({ path: "categorySlug", code: "unknown" });
  });

  it("lists drafts for staff but never on the storefront", async () => {
    const created = AdminProduct.parse((await owner.request("POST", "/v1/admin/products", { title: "Secret Draft", categorySlug: "pet" })).json());
    const adminList = (await owner.request("GET", "/v1/admin/products?status=draft")).json();
    expect(adminList.data.map((row: { id: string }) => row.id)).toContain(created.id);
    const store = await ctx.app.inject({ method: "GET", url: `/v1/store/products/${created.slug}` });
    expect(store.statusCode).toBe(404);
  });

  it("returns 404 for an unknown product id", async () => {
    expect((await owner.request("GET", "/v1/admin/products/00000000-0000-0000-0000-000000000000")).statusCode).toBe(404);
    expect((await owner.request("GET", "/v1/admin/products/not-a-uuid")).statusCode).toBe(404);
  });
});

describe("options and variants", () => {
  it("creates own-stock and shared-stock SKUs with the right units per sale", async () => {
    const product = await setUpPackVariants(await demoProductId());
    const [single, pack] = product.variants;
    expect(single).toMatchObject({ sku: "TEST-TL-1", stockMode: "own", inventoryUnitsPerSale: 1, options: { pack: "p1" } });
    expect(pack).toMatchObject({ sku: "TEST-TL-2", stockMode: "shared", inventoryUnitsPerSale: 2, packQuantity: 2 });
    expect(pack!.inventoryItemId).toBe(single!.inventoryItemId);
  });

  it("rejects combinations that do not match the product's options", async () => {
    const id = await demoProductId();
    await setUpPackVariants(id);
    for (const options of [{}, { pack: "p9" }, { pack: "p1", colour: "blue" }]) {
      const res = await owner.request("POST", `/v1/admin/products/${id}/variants`, { sku: "TEST-TL-X", options });
      expect(res.statusCode).toBe(422);
      expect(problem(res).code).toBe("INVALID_OPTION_COMBINATION");
    }
  });

  it("rejects a duplicate SKU, a duplicate combination and MRP below price as field errors", async () => {
    const id = await demoProductId();
    await setUpPackVariants(id);
    const other = await demoProductId("twisted-loop-800");
    const dupSku = await owner.request("POST", `/v1/admin/products/${other}/variants`, { sku: "TEST-TL-1", options: {} });
    expect(problem(dupSku).errors![0]).toMatchObject({ path: "sku", code: "duplicate" });

    const dupCombo = await owner.request("POST", `/v1/admin/products/${id}/variants`, { sku: "TEST-TL-9", options: { pack: "p1" } });
    expect(problem(dupCombo).errors![0]).toMatchObject({ path: "options", code: "duplicate_combination" });

    const mrp = await owner.request("PATCH", "/v1/admin/variants/TEST-TL-1", { mrpPaise: 100 });
    expect(problem(mrp).errors![0]).toMatchObject({ path: "mrpPaise", code: "mrp_below_price" });
  });

  it("only lets shared stock come from a single-unit SKU", async () => {
    const id = await demoProductId();
    await setUpPackVariants(id);
    await owner.request("PUT", `/v1/admin/products/${id}/options`, {
      groups: [{ code: "pack", label: "Pack", values: [{ code: "p1", label: "Single" }, { code: "p2", label: "Pack of 2" }, { code: "p4", label: "Pack of 4" }] }],
    });
    const res = await owner.request("POST", `/v1/admin/products/${id}/variants`, {
      sku: "TEST-TL-4", options: { pack: "p4" }, packQuantity: 4, stock: { mode: "shared", fromSku: "TEST-TL-2" },
    });
    expect(problem(res).errors![0]).toMatchObject({ path: "stock.fromSku", code: "not_single_unit" });
  });

  it("blocks removing an option value that a variant uses, and changing groups while variants exist", async () => {
    const id = await demoProductId();
    await setUpPackVariants(id);
    const removeValue = await owner.request("PUT", `/v1/admin/products/${id}/options`, {
      groups: [{ code: "pack", label: "Pack", values: [{ code: "p1", label: "Single" }] }],
    });
    expect(problem(removeValue).errors![0]).toMatchObject({ code: "value_in_use" });
    const addGroup = await owner.request("PUT", `/v1/admin/products/${id}/options`, {
      groups: [
        { code: "pack", label: "Pack", values: [{ code: "p1", label: "Single" }, { code: "p2", label: "Pack of 2" }] },
        { code: "colour", label: "Colour", values: [{ code: "blue", label: "Blue" }] },
      ],
    });
    expect(problem(addGroup).errors![0]).toMatchObject({ code: "groups_in_use" });
  });

  it("will not archive a SKU whose stock an active pack still uses", async () => {
    await setUpPackVariants(await demoProductId());
    const res = await owner.request("PATCH", "/v1/admin/variants/TEST-TL-1", { status: "archived" });
    expect(problem(res).errors![0]).toMatchObject({ code: "stock_in_use" });
    expect((await owner.request("PATCH", "/v1/admin/variants/TEST-TL-2", { status: "archived" })).statusCode).toBe(200);
    expect((await owner.request("PATCH", "/v1/admin/variants/TEST-TL-1", { status: "archived" })).statusCode).toBe(200);
  });
});

describe("publishing", () => {
  it("blocks publishing and lists every missing item", async () => {
    const created = AdminProduct.parse((await owner.request("POST", "/v1/admin/products", { title: "Empty", categorySlug: "bath" })).json());
    const res = await owner.request("POST", `/v1/admin/products/${created.id}/publish`);
    expect(res.statusCode).toBe(422);
    expect(problem(res).code).toBe("PUBLISH_BLOCKED");
    expect(problem(res).errors!.map((error) => error.code)).toEqual(["has_image", "image_alt_text", "has_active_sku", "prices_approved", "tax_details"]);
  });

  it("blocks publishing while any active SKU lacks GST/HSN", async () => {
    const id = await demoProductId();
    await setUpPackVariants(id, { taxRateBasisPoints: null, hsnCode: null });
    const res = await owner.request("POST", `/v1/admin/products/${id}/publish`);
    expect(problem(res).errors!.map((error) => error.code)).toEqual(["tax_details"]);
  });

  it("publishes a complete product, then locks its slug; the storefront shows real stock", async () => {
    const id = await demoProductId();
    const product = await setUpPackVariants(id);
    await owner.request("POST", `/v1/admin/inventory/${product.variants[0]!.inventoryItemId}/adjustments`, { field: "on_hand", delta: 5, reason: "received" });

    const published = AdminProduct.parse((await owner.request("POST", `/v1/admin/products/${id}/publish`)).json());
    expect(published).toMatchObject({ status: "published", slugLocked: true });
    const rename = await owner.request("PATCH", `/v1/admin/products/${id}`, { slug: "renamed" });
    expect(problem(rename).errors![0]).toMatchObject({ path: "slug", code: "slug_locked" });

    const store = ProductDetail.parse((await ctx.app.inject({ method: "GET", url: "/v1/store/products/twisted-loop-1200" })).json());
    expect(store.variants.map((variant) => [variant.sku, variant.availability, variant.maxOrderQuantity])).toEqual([
      ["TEST-TL-1", "in_stock", 5],
      ["TEST-TL-2", "in_stock", 2],
    ]);
  });

  it("requires the publish permission", async () => {
    await createStaff(ctx.db, "marketing_editor");
    const editor = await signIn(ctx.app, "marketing_editor@kleawip.test");
    const res = await editor.request("POST", `/v1/admin/products/${await demoProductId()}/unpublish`);
    expect(res.statusCode).toBe(403);
  });
});

describe("inventory", () => {
  const itemFor = async () => (await setUpPackVariants(await demoProductId())).variants[0]!.inventoryItemId;

  it("adjusts on hand, records a movement with the actor, and reports available", async () => {
    const itemId = await itemFor();
    const res = await owner.request("POST", `/v1/admin/inventory/${itemId}/adjustments`, { field: "on_hand", delta: 12, reason: "received", note: "PO-1" });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ onHand: 12, committed: 0, unavailable: 0, available: 12 });

    await owner.request("POST", `/v1/admin/inventory/${itemId}/adjustments`, { field: "unavailable", delta: 2, reason: "damaged" });
    const movements = (await owner.request("GET", `/v1/admin/inventory/${itemId}/movements`)).json().data;
    expect(movements).toHaveLength(2);
    expect(movements[1]).toMatchObject({ reason: "received", onHandDelta: 12, note: "PO-1", actorName: "Test owner" });

    const list = (await owner.request("GET", "/v1/admin/inventory")).json().data;
    const item = list.find((row: { id: string }) => row.id === itemId);
    expect(item).toMatchObject({ onHand: 12, unavailable: 2, available: 10 });
    expect(item.skus.map((sku: { sku: string }) => sku.sku)).toEqual(["TEST-TL-1", "TEST-TL-2"]);
  });

  it("refuses to make stock negative and requires a note for Other", async () => {
    const itemId = await itemFor();
    const negative = await owner.request("POST", `/v1/admin/inventory/${itemId}/adjustments`, { field: "on_hand", delta: -1, reason: "count_correction" });
    expect(problem(negative).errors![0]).toMatchObject({ path: "delta", code: "negative_available" });
    const noNote = await owner.request("POST", `/v1/admin/inventory/${itemId}/adjustments`, { field: "on_hand", delta: 1, reason: "other" });
    expect(problem(noNote).errors![0]!.path).toBe("note");
  });

  it("applies concurrent adjustments without losing any", async () => {
    const itemId = await itemFor();
    await Promise.all(
      Array.from({ length: 10 }, () => owner.request("POST", `/v1/admin/inventory/${itemId}/adjustments`, { field: "on_hand", delta: 1, reason: "received" })),
    );
    const list = (await owner.request("GET", "/v1/admin/inventory")).json().data;
    expect(list.find((row: { id: string }) => row.id === itemId).onHand).toBe(10);
  });

  it("only lets inventory roles adjust", async () => {
    const itemId = await itemFor();
    await createStaff(ctx.db, "catalogue_manager");
    await createStaff(ctx.db, "operations");
    const catalogue = await signIn(ctx.app, "catalogue_manager@kleawip.test");
    const operations = await signIn(ctx.app, "operations@kleawip.test");
    const body = { field: "on_hand", delta: 1, reason: "received" };
    expect((await catalogue.request("POST", `/v1/admin/inventory/${itemId}/adjustments`, body)).statusCode).toBe(403);
    expect((await operations.request("POST", `/v1/admin/inventory/${itemId}/adjustments`, body)).statusCode).toBe(201);
  });
});

describe("timeline", () => {
  it("records edits with before/after and accepts staff comments", async () => {
    const id = await demoProductId();
    await owner.request("PATCH", `/v1/admin/products/${id}`, { title: "Twisted Loop Drying Towel (edited)" });
    await owner.request("POST", `/v1/admin/timeline/product/${id}/comments`, { comment: "Checked copy with client." });
    const events = (await owner.request("GET", `/v1/admin/timeline/product/${id}`)).json().data;
    expect(events[0]).toMatchObject({ action: "comment", comment: "Checked copy with client.", actorName: "Test owner" });
    expect(events[1]).toMatchObject({ action: "product.updated", after: { title: "Twisted Loop Drying Towel (edited)" } });
    expect(events[1].before.title).toBe("Twisted Loop Drying Towel");
  });
});
