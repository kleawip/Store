import { AdminProduct, ImportReport, Problem } from "@kleawip/contract";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { catalogueImports, inventoryMovements, products } from "../src/db/schema";
import { seedDemoCatalogue } from "../src/db/seed-demo";
import { parseRupees, planImport } from "../src/imports/catalogue-import";
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
  await ctx.db.delete(catalogueImports);
  await seedDemoCatalogue(ctx.db);
  await createStaff(ctx.db, "owner");
  owner = await signIn(ctx.app, "owner@kleawip.test");
});

const HEADER = "product_slug,product_title,category,spec,option1_name,option1_value,sku,price_inr,mrp_inr,gst_percent,hsn,pack_quantity,stock_source,opening_stock";

async function upload(csv: string, filename = "catalogue.csv", session = owner) {
  const boundary = "----kleawipcsv";
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/csv\r\n\r\n`),
    Buffer.from(csv),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return ctx.app.inject({
    method: "POST",
    url: "/v1/admin/imports/catalogue",
    cookies: { klw_admin: session.cookie.value },
    headers: { "content-type": `multipart/form-data; boundary=${boundary}`, "x-csrf-token": session.session.csrfToken },
    payload,
  });
}

const report = (res: { json: () => unknown }) => ImportReport.parse(res.json());
const commit = (id: string) => owner.request("POST", `/v1/admin/imports/catalogue/${id}/commit`);
const productBySlug = async (slug: string) => (await ctx.db.select().from(products).where(eq(products.slug, slug)))[0];

const NEW_PRODUCT = [
  HEADER,
  "loop-towel-xl,Loop Towel XL,automotive,1200 GSM,Pack,Single,TEST-XL-P1,499,599,12,63079090,1,own,20",
  "loop-towel-xl,,,,Pack,Pack of 2,TEST-XL-P2,949,,12,63079090,2,shared:TEST-XL-P1,",
].join("\n");

describe("cell parsing", () => {
  it("converts rupees to paise exactly", () => {
    expect(parseRupees("499")).toBe(49900);
    expect(parseRupees("499.5")).toBe(49950);
    expect(parseRupees("1,299.00")).toBe(129900);
    expect(parseRupees("₹ 10.05")).toBe(1005);
    expect(parseRupees("10.005")).toBeNull();
    expect(parseRupees("abc")).toBeNull();
  });

  it("reports header problems before reading rows", () => {
    const { errors } = planImport("product_slug,colour\nx,blue");
    expect(errors.map((e) => e.code)).toEqual(["unknown_column", "missing_column"]);
  });
});

describe("validate", () => {
  it("validates a new product with a shared-stock pack and writes nothing", async () => {
    const res = await upload(NEW_PRODUCT);
    expect(res.statusCode).toBe(201);
    const body = report(res);
    expect(body).toMatchObject({
      status: "validated",
      canCommit: true,
      rowCount: 2,
      summary: { productsCreated: 1, productsUpdated: 0, variantsCreated: 2, variantsUpdated: 0 },
      errors: [],
    });
    expect(await productBySlug("loop-towel-xl")).toBeUndefined();
  });

  it("reports every row problem with its row number and column", async () => {
    const csv = [
      HEADER,
      "Bad Slug,Title,automotive,,,,SKU-1,,,,,,,",
      "towel-a,,nope,,,,SKU-2,12.345,,,,,,",
      "towel-b,Towel B,bath,,,,SKU-2,100,50,,,,,",
      "towel-c,Towel C,bath,,Pack,,SKU-3,,,,,,,",
      "towel-d,Towel D,bath,,,,SKU-4,,,,,,shared:SKU-4,",
    ].join("\n");
    const body = report(await upload(csv));
    expect(body.status).toBe("failed");
    expect(body.canCommit).toBe(false);
    expect(body.errors.map((e) => [e.row, e.column, e.code])).toEqual([
      [2, "product_slug", "invalid"],
      [3, "price_inr", "invalid"],
      [4, "sku", "duplicate_in_file"],
      [5, "option1_value", "incomplete_option"],
    ]);
  });

  it("checks the catalogue: unknown category, MRP below price, bad shared source, published product", async () => {
    const published = [
      HEADER,
      "twisted-loop-1200,,,,,,TEST-PUB,100,,,,,,",
    ].join("\n");
    expect(report(await upload(published)).errors[0]).toMatchObject({ row: 2, code: "product_published" });

    const csv = [
      HEADER,
      "new-a,New A,nope,,,,TEST-A,100,50,,,,,",
      "new-b,New B,bath,,Pack,Single,TEST-B1,100,,,,2,own,",
      "new-b,,,,Pack,Pack of 3,TEST-B3,250,,,,3,shared:TEST-B1,",
    ].join("\n");
    const body = report(await upload(csv));
    expect(body.errors.map((e) => [e.row, e.code])).toEqual([
      [2, "unknown"],
      [2, "mrp_below_price"],
      [4, "invalid_source"],
    ]);
  });

  it("warns about SKUs without a price but still allows the import", async () => {
    const csv = [HEADER, "draft-towel,Draft Towel,bath,,,,TEST-DRAFT,,,,,,,"].join("\n");
    const body = report(await upload(csv));
    expect(body.canCommit).toBe(true);
    expect(body.warnings).toEqual([expect.objectContaining({ row: 2, code: "price_pending" })]);
  });

  it("rejects an unreadable or empty file with a file-level error", async () => {
    expect(report(await upload("")).errors[0]).toMatchObject({ row: null, code: "empty_file" });
    expect(report(await upload(`${HEADER}\n"unclosed,x`)).errors[0]).toMatchObject({ code: "csv_syntax" });
  });
});

describe("commit", () => {
  it("creates the product as a draft with options, shared stock, opening stock movement and audit", async () => {
    const validated = report(await upload(NEW_PRODUCT));
    const res = await commit(validated.importId!);
    expect(res.statusCode).toBe(200);
    expect(report(res)).toMatchObject({ status: "committed", canCommit: false });

    const created = (await productBySlug("loop-towel-xl"))!;
    expect(created.status).toBe("draft");
    const admin = AdminProduct.parse((await owner.request("GET", `/v1/admin/products/${created.id}`)).json());
    expect(admin.optionGroups).toEqual([{ code: "pack", label: "Pack", values: [
      { code: "single", label: "Single", swatch: null },
      { code: "pack-of-2", label: "Pack of 2", swatch: null },
    ] }]);
    const [single, pack] = admin.variants;
    expect(single).toMatchObject({ sku: "TEST-XL-P1", pricePaise: 49900, mrpPaise: 59900, taxRateBasisPoints: 1200, stockMode: "own", sellableQuantity: 20 });
    expect(pack).toMatchObject({ sku: "TEST-XL-P2", pricePaise: 94900, stockMode: "shared", inventoryUnitsPerSale: 2, sellableQuantity: 10 });
    expect(pack!.inventoryItemId).toBe(single!.inventoryItemId);

    const movements = await ctx.db.select().from(inventoryMovements).where(eq(inventoryMovements.inventoryItemId, single!.inventoryItemId));
    expect(movements).toEqual([expect.objectContaining({ reason: "received", onHandDelta: 20, sourceRef: `import:${validated.importId}` })]);

    const timeline = (await owner.request("GET", `/v1/admin/timeline/product/${created.id}`)).json().data;
    expect(timeline[0]).toMatchObject({ action: "product.import_created", after: { skus: ["TEST-XL-P1", "TEST-XL-P2"] } });
  });

  it("updates prices of an existing draft product's SKU; blank cells change nothing", async () => {
    await commit(report(await upload(NEW_PRODUCT)).importId!);
    const update = [HEADER, "loop-towel-xl,,,,Pack,Single,TEST-XL-P1,549,,,,,,"].join("\n");
    const validated = report(await upload(update));
    expect(validated.summary).toEqual({ productsCreated: 0, productsUpdated: 1, variantsCreated: 0, variantsUpdated: 1 });
    await commit(validated.importId!);
    const created = (await productBySlug("loop-towel-xl"))!;
    const admin = AdminProduct.parse((await owner.request("GET", `/v1/admin/products/${created.id}`)).json());
    expect(admin.variants[0]).toMatchObject({ pricePaise: 54900, mrpPaise: 59900, taxRateBasisPoints: 1200 });
    expect(admin.title).toBe("Loop Towel XL");
  });

  it("refuses to change an existing SKU's options, stock source or opening stock", async () => {
    await commit(report(await upload(NEW_PRODUCT)).importId!);
    const csv = [HEADER, "loop-towel-xl,,,,Pack,Pack of 2,TEST-XL-P1,,,,,,,5"].join("\n");
    expect(report(await upload(csv)).errors.map((e) => e.code)).toEqual(["options_changed", "existing_sku"]);
  });

  it("applies nothing if the catalogue changed after validation", async () => {
    const validated = report(await upload(NEW_PRODUCT));
    // Someone creates the same SKU on another product in the meantime.
    const other = (await productBySlug("twisted-loop-800"))!;
    await owner.request("POST", `/v1/admin/products/${other.id}/unpublish`);
    await owner.request("POST", `/v1/admin/products/${other.id}/variants`, { sku: "TEST-XL-P1", options: {} });

    const res = await commit(validated.importId!);
    expect(res.statusCode).toBe(422);
    expect(Problem.parse(res.json()).errors![0]!.code).toBe("catalogue_changed");
    expect(await productBySlug("loop-towel-xl")).toBeUndefined();
  });

  it("cannot be applied twice, and failed imports cannot be applied", async () => {
    const validated = report(await upload(NEW_PRODUCT));
    const results = await Promise.all([commit(validated.importId!), commit(validated.importId!)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 422]);

    const failed = report(await upload([HEADER, "x,,,,,,,,,,,,,"].join("\n")));
    expect(Problem.parse((await commit(failed.importId!)).json()).errors![0]!.code).toBe("has_errors");
  });

  it("expires a validation after an hour", async () => {
    const validated = report(await upload(NEW_PRODUCT));
    await ctx.db.update(catalogueImports).set({ createdAt: new Date(Date.now() - 61 * 60_000) }).where(eq(catalogueImports.id, validated.importId!));
    expect(Problem.parse((await commit(validated.importId!)).json()).errors![0]!.code).toBe("expired");
  });
});

describe("template and permissions", () => {
  it("serves a CSV template whose demo rows validate", async () => {
    const res = await owner.request("GET", "/v1/admin/imports/catalogue/template");
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("kleawip-catalogue-template.csv");
    const body = report(await upload(res.body));
    expect(body.errors).toEqual([]);
    expect(body.summary.variantsCreated).toBe(2);
  });

  it("requires the catalogue write permission", async () => {
    await createStaff(ctx.db, "viewer");
    const viewer = await signIn(ctx.app, "viewer@kleawip.test");
    expect((await upload(NEW_PRODUCT, "x.csv", viewer)).statusCode).toBe(403);
  });
});
