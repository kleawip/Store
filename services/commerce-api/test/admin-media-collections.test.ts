import { AdminCollection, AdminProduct, CollectionDetail, CollectionListResponse, MediaAsset, Problem, ProductDetail } from "@kleawip/contract";
import { eq } from "drizzle-orm";
import { existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
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

const problem = (res: { json: () => unknown }) => Problem.parse(res.json());
const productId = async (slug: string) => (await ctx.db.select({ id: products.id }).from(products).where(eq(products.slug, slug)))[0]!.id;

/** A real image of the given size; `seed` changes the pixels so each call is a distinct file. */
function image(width: number, height: number, format: "jpeg" | "png" | "webp" = "jpeg", seed = 0) {
  return sharp({ create: { width, height, channels: 3, background: { r: (seed * 37) % 255, g: 120, b: 200 } } })[format]().toBuffer();
}

function multipart(file: Buffer, filename: string, alt?: string) {
  const boundary = "----kleawiptest";
  const parts: Buffer[] = [];
  if (alt !== undefined) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="alt"\r\n\r\n${alt}\r\n`));
  }
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`));
  parts.push(file, Buffer.from(`\r\n--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

async function upload(file: Buffer, filename = "photo.jpg", alt?: string, session = owner) {
  const body = multipart(file, filename, alt);
  return ctx.app.inject({
    method: "POST",
    url: "/v1/admin/media",
    cookies: { klw_admin: session.cookie.value },
    headers: { ...body.headers, "x-csrf-token": session.session.csrfToken },
    payload: body.payload,
  });
}

describe("media upload", () => {
  it("stores a normalised WebP, keeps the original privately, and serves the delivery file", async () => {
    const res = await upload(await image(3000, 2000), "big.jpg", "Folded blue towel");
    expect(res.statusCode).toBe(201);
    const asset = MediaAsset.parse(res.json());
    expect(asset).toMatchObject({ width: 2400, height: 1600, alt: "Folded blue towel", originalFilename: "big.jpg", usedBy: [] });
    expect(asset.url).toMatch(/\/media\/media\/[0-9a-f]{2}\/[0-9a-f]{64}\.webp$/);

    const key = asset.url.split("/media/")[1]!;
    const served = await ctx.app.inject({ method: "GET", url: `/media/${key}` });
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toBe("image/webp");
    expect(served.headers["cache-control"]).toContain("immutable");
    expect((await sharp(served.rawPayload).metadata()).format).toBe("webp");

    // The original exists on disk but is never served over HTTP.
    const sha = key.split("/").pop()!.replace(".webp", "");
    expect(existsSync(join(ctx.mediaDir, "originals", sha.slice(0, 2), `${sha}.jpg`))).toBe(true);
    expect((await ctx.app.inject({ method: "GET", url: `/media/originals/${sha.slice(0, 2)}/${sha}.jpg` })).statusCode).toBe(404);
  });

  it("strips camera metadata such as GPS from the delivery file", async () => {
    const withExif = await sharp(await image(800, 600, "jpeg", 7))
      .withExif({ IFD0: { Make: "TestCam" }, IFD3: { GPSLatitude: "19/1 4/1 0/1", GPSLatitudeRef: "N" } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const asset = MediaAsset.parse((await upload(withExif)).json());
    const served = await ctx.app.inject({ method: "GET", url: `/media/${asset.url.split("/media/")[1]}` });
    expect((await sharp(served.rawPayload).metadata()).exif).toBeUndefined();
  });

  it("returns the existing asset for identical bytes instead of storing a copy", async () => {
    const file = await image(800, 600, "png", 3);
    const first = MediaAsset.parse((await upload(file, "a.png")).json());
    const again = await upload(file, "copy.png");
    expect(again.statusCode).toBe(200);
    expect(MediaAsset.parse(again.json()).id).toBe(first.id);
    const list = (await owner.request("GET", "/v1/admin/media")).json();
    expect(list.totalCount).toBe(1);
  });

  it("decides the type from the file's bytes and rejects bad uploads with field errors", async () => {
    const cases: [Buffer, string, string][] = [
      [Buffer.from("%PDF-1.4 not an image"), "fake.jpg", "unsupported_type"],
      [await image(200, 800), "narrow.jpg", "too_small"],
      [Buffer.alloc(0), "empty.jpg", "empty_file"],
    ];
    for (const [file, name, code] of cases) {
      const res = await upload(file, name);
      expect(res.statusCode, name).toBe(422);
      expect(problem(res).errors![0], name).toMatchObject({ path: "file", code });
    }
    const noFile = await owner.request("POST", "/v1/admin/media", { alt: "x" });
    expect(problem(noFile).errors![0]).toMatchObject({ path: "file", code: "required" });
  });

  it("requires the media permission", async () => {
    await createStaff(ctx.db, "operations");
    const operations = await signIn(ctx.app, "operations@kleawip.test");
    expect((await upload(await image(800, 600), "x.jpg", undefined, operations)).statusCode).toBe(403);
  });

  it("edits alt text and refuses to delete an image that is in use", async () => {
    const asset = MediaAsset.parse((await upload(await image(800, 600, "webp", 5))).json());
    const edited = MediaAsset.parse((await owner.request("PATCH", `/v1/admin/media/${asset.id}`, { alt: "Coral cloth, folded" })).json());
    expect(edited.alt).toBe("Coral cloth, folded");

    const id = await productId("coral-cloth");
    await owner.request("POST", `/v1/admin/products/${id}/media`, { assetId: asset.id });
    const blocked = await owner.request("DELETE", `/v1/admin/media/${asset.id}`);
    expect(problem(blocked).errors![0]).toMatchObject({ code: "in_use" });
    expect(problem(blocked).detail).toContain("Coral Microfiber Cleaning Cloth");

    const product = AdminProduct.parse((await owner.request("GET", `/v1/admin/products/${id}`)).json());
    const attached = product.media.find((m) => m.assetId === asset.id)!;
    await owner.request("DELETE", `/v1/admin/products/${id}/media/${attached.id}`);
    expect((await owner.request("DELETE", `/v1/admin/media/${asset.id}`)).statusCode).toBe(204);
    expect((await ctx.app.inject({ method: "GET", url: `/media/${asset.url.split("/media/")[1]}` })).statusCode).toBe(404);
  });
});

describe("product images", () => {
  it("attaches, links to an option value, reorders and shows on the storefront", async () => {
    const id = await productId("twisted-loop-1200");
    await owner.request("POST", `/v1/admin/products/${id}/unpublish`);
    await owner.request("PUT", `/v1/admin/products/${id}/options`, {
      groups: [{ code: "colour", label: "Colour", values: [{ code: "blue", label: "Blue" }, { code: "grey", label: "Grey" }] }],
    });
    const asset = MediaAsset.parse((await upload(await image(1200, 1200, "jpeg", 9), "blue.jpg", "Blue towel")).json());
    const attached = AdminProduct.parse((await owner.request("POST", `/v1/admin/products/${id}/media`, { assetId: asset.id, optionValue: "colour:blue" })).json());
    const added = attached.media.at(-1)!;
    expect(added).toMatchObject({ assetId: asset.id, alt: "Blue towel", optionValue: "colour:blue", width: 1200 });

    const reversed = attached.media.map((m) => m.id).reverse();
    const reordered = AdminProduct.parse((await owner.request("PUT", `/v1/admin/products/${id}/media/order`, { mediaIds: reversed })).json());
    expect(reordered.media.map((m) => m.id)).toEqual(reversed);

    const wrongOrder = await owner.request("PUT", `/v1/admin/products/${id}/media/order`, { mediaIds: reversed.slice(1) });
    expect(problem(wrongOrder).errors![0]).toMatchObject({ code: "mismatch" });

    const badOption = await owner.request("PATCH", `/v1/admin/products/${id}/media/${added.id}`, { optionValue: "colour:red" });
    expect(problem(badOption).errors![0]).toMatchObject({ path: "optionValue", code: "unknown" });

    await owner.request("POST", `/v1/admin/products/${id}/variants`, {
      sku: "TEST-BLUE", options: { colour: "blue" }, pricePaise: 49900, taxRateBasisPoints: 1200, hsnCode: "63079090",
    });
    expect((await owner.request("POST", `/v1/admin/products/${id}/publish`)).statusCode).toBe(200);
    const store = ProductDetail.parse((await ctx.app.inject({ method: "GET", url: "/v1/store/products/twisted-loop-1200" })).json());
    expect(store.images[0]!.url).toBe(asset.url);
    expect(store.variants[0]!.imageIds).toEqual([added.id]);
  });

  it("blocks publishing when an image lacks alt text", async () => {
    const id = await productId("twisted-loop-1200");
    await owner.request("POST", `/v1/admin/products/${id}/unpublish`);
    const asset = MediaAsset.parse((await upload(await image(800, 800, "jpeg", 11))).json());
    await owner.request("POST", `/v1/admin/products/${id}/media`, { assetId: asset.id, alt: "" });
    await owner.request("POST", `/v1/admin/products/${id}/variants`, { sku: "TEST-ONE", options: {}, pricePaise: 100, taxRateBasisPoints: 500, hsnCode: "6307" });
    const res = await owner.request("POST", `/v1/admin/products/${id}/publish`);
    expect(problem(res).errors!.map((e) => e.code)).toEqual(["image_alt_text"]);
  });
});

describe("collections", () => {
  async function createCollection(title = "Car Care Essentials") {
    return AdminCollection.parse((await owner.request("POST", "/v1/admin/collections", { title, description: "Everything to wash and dry a car." })).json());
  }

  it("creates a draft with a unique slug, sets an ordered product list and publishes", async () => {
    const first = await createCollection();
    const second = await createCollection();
    expect([first.slug, second.slug]).toEqual(["car-care-essentials", "car-care-essentials-2"]);

    const ids = [await productId("twisted-loop-800"), await productId("twisted-loop-1200")];
    const withProducts = AdminCollection.parse((await owner.request("PUT", `/v1/admin/collections/${first.id}/products`, { productIds: ids })).json());
    expect(withProducts.products.map((p) => p.id)).toEqual(ids);

    // Not visible until published.
    expect((await ctx.app.inject({ method: "GET", url: "/v1/store/collections/car-care-essentials" })).statusCode).toBe(404);
    const published = AdminCollection.parse((await owner.request("POST", `/v1/admin/collections/${first.id}/publish`)).json());
    expect(published).toMatchObject({ status: "published", slugLocked: true });

    const detail = CollectionDetail.parse((await ctx.app.inject({ method: "GET", url: "/v1/store/collections/car-care-essentials" })).json());
    expect(detail.products.map((p) => p.slug)).toEqual(["twisted-loop-800", "twisted-loop-1200"]);
    const list = CollectionListResponse.parse((await ctx.app.inject({ method: "GET", url: "/v1/store/collections" })).json());
    expect(list.data).toEqual([expect.objectContaining({ slug: "car-care-essentials", productCount: 2, banner: null })]);
  });

  it("keeps draft products out of the storefront collection", async () => {
    const collection = await createCollection();
    const draftId = await productId("pet-towel");
    await ctx.db.update(products).set({ status: "draft" }).where(eq(products.id, draftId));
    await owner.request("PUT", `/v1/admin/collections/${collection.id}/products`, { productIds: [draftId, await productId("coral-cloth")] });
    await owner.request("POST", `/v1/admin/collections/${collection.id}/publish`);
    const detail = CollectionDetail.parse((await ctx.app.inject({ method: "GET", url: `/v1/store/collections/${collection.slug}` })).json());
    expect(detail.products.map((p) => p.slug)).toEqual(["coral-cloth"]);
    expect(detail.productCount).toBe(1);
  });

  it("blocks publishing without a published product, or with a banner lacking alt text", async () => {
    const collection = await createCollection();
    const empty = await owner.request("POST", `/v1/admin/collections/${collection.id}/publish`);
    expect(problem(empty).code).toBe("PUBLISH_BLOCKED");
    expect(problem(empty).errors!.map((e) => e.code)).toEqual(["has_published_product"]);

    const banner = MediaAsset.parse((await upload(await image(1920, 680, "jpeg", 13), "banner.jpg")).json());
    await owner.request("PATCH", `/v1/admin/collections/${collection.id}`, { bannerAssetId: banner.id });
    await owner.request("PUT", `/v1/admin/collections/${collection.id}/products`, { productIds: [await productId("coral-cloth")] });
    const noAlt = await owner.request("POST", `/v1/admin/collections/${collection.id}/publish`);
    expect(problem(noAlt).errors!.map((e) => e.code)).toEqual(["banner_alt_text"]);

    await owner.request("PATCH", `/v1/admin/collections/${collection.id}`, { bannerAlt: "Car care towels" });
    expect((await owner.request("POST", `/v1/admin/collections/${collection.id}/publish`)).statusCode).toBe(200);
    const detail = CollectionDetail.parse((await ctx.app.inject({ method: "GET", url: `/v1/store/collections/${collection.slug}` })).json());
    expect(detail.banner).toMatchObject({ url: banner.url, alt: "Car care towels", width: 1920, height: 680 });

    // The banner now counts as "in use" in the media library.
    const asset = MediaAsset.parse((await owner.request("GET", `/v1/admin/media/${banner.id}`)).json());
    expect(asset.usedBy).toEqual([{ type: "collection", id: collection.id, title: "Car Care Essentials" }]);
  });

  it("rejects duplicate or unknown products and locks the slug after publishing", async () => {
    const collection = await createCollection();
    const id = await productId("coral-cloth");
    expect(problem(await owner.request("PUT", `/v1/admin/collections/${collection.id}/products`, { productIds: [id, id] })).errors![0]!.code).toBe("duplicate");
    expect(problem(await owner.request("PUT", `/v1/admin/collections/${collection.id}/products`, { productIds: ["00000000-0000-0000-0000-000000000000"] })).errors![0]!.code).toBe("unknown");

    await owner.request("PUT", `/v1/admin/collections/${collection.id}/products`, { productIds: [id] });
    await owner.request("POST", `/v1/admin/collections/${collection.id}/publish`);
    const rename = await owner.request("PATCH", `/v1/admin/collections/${collection.id}`, { slug: "renamed" });
    expect(problem(rename).errors![0]).toMatchObject({ path: "slug", code: "slug_locked" });
  });

  it("records collection changes on the timeline", async () => {
    const collection = await createCollection();
    await owner.request("PATCH", `/v1/admin/collections/${collection.id}`, { title: "Car Care" });
    const events = (await owner.request("GET", `/v1/admin/timeline/collection/${collection.id}`)).json().data;
    expect(events.map((e: { action: string }) => e.action)).toEqual(["collection.updated", "collection.created"]);
  });
});
