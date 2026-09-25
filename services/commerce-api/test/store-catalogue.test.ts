import { CategoryListResponse, Problem, ProductListResponse, SearchSuggestResponse } from "@kleawip/contract";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { products } from "../src/db/schema";
import { DEMO_SEEDABLE_DATABASE, seedDemoCatalogue } from "../src/db/seed-demo";
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

const list = async (url: string) => {
  const res = await ctx.app.inject({ method: "GET", url });
  return { res, body: res.statusCode === 200 ? ProductListResponse.parse(res.json()) : null };
};

describe("product list: totals, facets and badges", () => {
  it("reports totalCount across pages and a null badge", async () => {
    const { body } = await list("/v1/store/products?limit=3");
    expect(body!.data).toHaveLength(3);
    expect(body!.totalCount).toBe(10);
    expect(body!.data.every((product) => product.badge === null)).toBe(true);
  });

  it("returns category facet counts that ignore the category filter itself", async () => {
    const all = (await list("/v1/store/products")).body!;
    const filtered = (await list("/v1/store/products?category=automotive")).body!;
    expect(filtered.facets).toEqual(all.facets);
    const automotive = all.facets[0]!.values.find((value) => value.value === "automotive")!;
    expect(automotive.count).toBe(filtered.totalCount);
  });

  it("narrows facet counts by the search term", async () => {
    const { body } = await list("/v1/store/products?q=twisted");
    expect(body!.facets[0]!.values).toEqual([{ value: "automotive", label: "Automotive Care", count: 2 }]);
  });
});

describe("product list: sort and cursor rules", () => {
  it("rejects sorts that are not implemented yet", async () => {
    for (const sort of ["price_asc", "price_desc", "newest", "bogus"]) {
      const { res } = await list(`/v1/store/products?sort=${sort}`);
      expect(res.statusCode).toBe(422);
      expect(Problem.parse(res.json()).errors?.[0]?.path).toBe("sort");
    }
    expect((await list("/v1/store/products?sort=featured")).res.statusCode).toBe(200);
  });

  it("rejects a cursor reused with different filters", async () => {
    const first = (await list("/v1/store/products?limit=2")).body!;
    const { res } = await list(`/v1/store/products?limit=2&category=automotive&cursor=${first.page.nextCursor}`);
    expect(res.statusCode).toBe(422);
    expect(Problem.parse(res.json()).errors?.[0]?.code).toBe("cursor_filter_mismatch");
  });

  it("pages through ranked search results without gaps or repeats", async () => {
    const all = (await list("/v1/store/products?q=towel&limit=100")).body!;
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const url: string = `/v1/store/products?q=towel&limit=2${cursor ? `&cursor=${cursor}` : ""}`;
      const body = (await list(url)).body!;
      seen.push(...body.data.map((product) => product.slug));
      cursor = body.page.nextCursor;
    } while (cursor);
    expect(seen).toEqual(all.data.map((product) => product.slug));
    expect(seen.length).toBe(all.totalCount);
  });
});

describe("search ranking", () => {
  it("orders results by exact title, title prefix, title contains, then other fields", async () => {
    const rank = (title: string, q: string) => {
      const t = title.toLowerCase();
      if (t === q) return 0;
      if (t.startsWith(q)) return 1;
      if (t.includes(q)) return 2;
      return 3;
    };
    for (const q of ["towel", "micro", "care", "cloth"]) {
      const titles = (await list(`/v1/store/products?q=${q}`)).body!.data.map((product) => product.title);
      const ranks = titles.map((title) => rank(title, q));
      expect(ranks, `q=${q}: ${titles.join(" | ")}`).toEqual([...ranks].sort((a, b) => a - b));
    }
  });

  it("matches the spec line", async () => {
    const slugs = (await list("/v1/store/products?q=1200")).body!.data.map((product) => product.slug);
    expect(slugs).toContain("twisted-loop-1200");
  });
});

describe("GET /v1/store/search/suggest", () => {
  const suggest = async (q: string, limit?: number) => {
    const res = await ctx.app.inject({ method: "GET", url: `/v1/store/search/suggest?q=${encodeURIComponent(q)}${limit ? `&limit=${limit}` : ""}` });
    return SearchSuggestResponse.parse(res.json());
  };

  it("returns categories first, then ranked products, with server-built hrefs", async () => {
    const body = await suggest("bath");
    expect(body.suggestions[0]).toEqual({ kind: "category", label: "Bath Towels", href: "/shop/bath", thumbnail: null });
    const products = body.suggestions.filter((suggestion) => suggestion.kind === "product");
    expect(products.length).toBeGreaterThan(0);
    expect(products.every((suggestion) => suggestion.href.startsWith("/product/") && suggestion.thumbnail !== null)).toBe(true);
  });

  it("returns nothing for terms shorter than two characters", async () => {
    expect((await suggest("b")).suggestions).toEqual([]);
  });

  it("returns an empty list for no match and respects the limit", async () => {
    expect((await suggest("zzzz-no-match")).suggestions).toEqual([]);
    expect((await suggest("towel", 2)).suggestions).toHaveLength(2);
  });

  it("never suggests unpublished products", async () => {
    await ctx.db.update(products).set({ status: "draft" }).where(eq(products.slug, "pet-towel"));
    const labels = (await suggest("pet")).suggestions.map((suggestion) => suggestion.href);
    expect(labels).not.toContain("/product/pet-towel");
  });
});

describe("demo seed guard", () => {
  it("only accepts *_dev and *_test database names", () => {
    expect(DEMO_SEEDABLE_DATABASE.test("kleawip_dev")).toBe(true);
    expect(DEMO_SEEDABLE_DATABASE.test("kleawip_test")).toBe(true);
    expect(DEMO_SEEDABLE_DATABASE.test("kleawip")).toBe(false);
    expect(DEMO_SEEDABLE_DATABASE.test("societyos")).toBe(false);
    expect(DEMO_SEEDABLE_DATABASE.test("kleawip_test_backup")).toBe(false);
  });
});
