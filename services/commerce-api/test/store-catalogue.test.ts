import { CategoryListResponse, Problem, ProductListResponse } from "@kleawip/contract";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { products } from "../src/db/schema";
import { seedDemoCatalogue } from "../src/db/seed-demo";
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

describe("GET /health", () => {
  it("responds ok with a request id", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    expect(res.headers["x-request-id"]).toMatch(/^req_/);
  });
});

describe("GET /v1/store/categories", () => {
  it("lists the five categories in order with published product counts", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/v1/store/categories" });
    expect(res.statusCode).toBe(200);
    const body = CategoryListResponse.parse(res.json());
    expect(body.data.map((category) => category.slug)).toEqual(["automotive", "bath", "household", "personal", "pet"]);
    expect(body.data.reduce((total, category) => total + category.productCount, 0)).toBe(10);
    expect(res.headers["cache-control"]).toContain("public");
  });

  it("does not count unpublished products", async () => {
    await ctx.db.update(products).set({ status: "draft" }).where(eq(products.slug, "twisted-loop-1200"));
    const res = await ctx.app.inject({ method: "GET", url: "/v1/store/categories" });
    const total = CategoryListResponse.parse(res.json()).data.reduce((sum, category) => sum + category.productCount, 0);
    expect(total).toBe(9);
  });
});

describe("GET /v1/store/products", () => {
  it("returns demo products with images and no price or purchasability", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/v1/store/products" });
    expect(res.statusCode).toBe(200);
    const body = ProductListResponse.parse(res.json());
    expect(body.data).toHaveLength(10);
    expect(body.page.nextCursor).toBeNull();
    for (const product of body.data) {
      expect(product.isDemo).toBe(true);
      expect(product.priceFrom).toBeNull();
      expect(product.priceStatus).toBe("pending");
      expect(product.availability).toBe("not_for_sale");
      expect(product.images.length).toBeGreaterThan(0);
    }
  });

  it("filters by category", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/v1/store/products?category=automotive" });
    const body = ProductListResponse.parse(res.json());
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every((product) => product.category === "automotive")).toBe(true);
  });

  it("searches title, detail and category title case-insensitively", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/v1/store/products?q=TWISTED" });
    const slugs = ProductListResponse.parse(res.json()).data.map((product) => product.slug);
    expect(slugs).toEqual(expect.arrayContaining(["twisted-loop-1200", "twisted-loop-800"]));
  });

  it("treats LIKE wildcards in the search term literally", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/v1/store/products?q=%25" });
    expect(ProductListResponse.parse(res.json()).data).toHaveLength(0);
  });

  it("hides unpublished products", async () => {
    await ctx.db.update(products).set({ status: "draft" }).where(eq(products.slug, "twisted-loop-1200"));
    const res = await ctx.app.inject({ method: "GET", url: "/v1/store/products" });
    const slugs = ProductListResponse.parse(res.json()).data.map((product) => product.slug);
    expect(slugs).not.toContain("twisted-loop-1200");
  });

  it("pages with a cursor without skipping or repeating products", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const url: string = `/v1/store/products?limit=3${cursor ? `&cursor=${cursor}` : ""}`;
      const body = ProductListResponse.parse((await ctx.app.inject({ method: "GET", url })).json());
      seen.push(...body.data.map((product) => product.slug));
      cursor = body.page.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(10);
    expect(new Set(seen).size).toBe(10);
  });

  it("rejects an invalid limit and a malformed cursor as problem+json", async () => {
    for (const url of ["/v1/store/products?limit=500", "/v1/store/products?cursor=not-a-cursor"]) {
      const res = await ctx.app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(422);
      expect(res.headers["content-type"]).toContain("application/problem+json");
      expect(Problem.parse(res.json()).code).toBe("VALIDATION_FAILED");
    }
  });
});

describe("unknown routes", () => {
  it("return a NOT_FOUND problem", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/v1/store/nope" });
    expect(res.statusCode).toBe(404);
    expect(Problem.parse(res.json()).code).toBe("NOT_FOUND");
  });
});
