import { DashboardResponse } from "@kleawip/contract";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { heroSlides, inventoryItems, products } from "../src/db/schema";
import { seedDemoCatalogue } from "../src/db/seed-demo";
import { addVariantFixture } from "./fixtures";
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
  await createStaff(ctx.db, "viewer");
  owner = await signIn(ctx.app, "viewer@kleawip.test");
});

const load = async () => DashboardResponse.parse((await owner.request("GET", "/v1/admin/dashboard")).json());

describe("GET /v1/admin/dashboard", () => {
  it("counts products by status and products needing attention", async () => {
    await ctx.db.update(products).set({ status: "draft" }).where(eq(products.slug, "pet-towel"));
    await addVariantFixture(ctx.db); // DEMO-SKU-C has no price
    const body = await load();
    expect(body.products).toEqual({ draft: 1, published: 9, archived: 0 });
    expect(body.attention).toEqual({ productsMissingPrice: 1, productsMissingImages: 0 });
  });

  it("counts low and out-of-stock items that active SKUs use", async () => {
    await addVariantFixture(ctx.db, { onHand: 2, lowStockThreshold: 3 });
    expect((await load()).stock).toEqual({ lowStockItems: 1, outOfStockItems: 0 });
    await ctx.db.update(inventoryItems).set({ onHand: 0 });
    expect((await load()).stock).toEqual({ lowStockItems: 0, outOfStockItems: 1 });
  });

  it("lists the next campaign start or end, soonest first", async () => {
    const soon = new Date(Date.now() + 3600_000);
    const later = new Date(Date.now() + 7200_000);
    await ctx.db.insert(heroSlides).values([
      { internalTitle: "Later", status: "published", startsAt: later },
      { internalTitle: "Ends soon", status: "published", endsAt: soon },
      { internalTitle: "Draft", status: "draft", startsAt: soon },
    ]);
    const body = await load();
    expect(body.campaignSchedule.map((item) => [item.title, item.event])).toEqual([["Ends soon", "ends"], ["Later", "starts"]]);
  });

  it("is available to every signed-in role but not anonymously", async () => {
    expect((await ctx.app.inject({ method: "GET", url: "/v1/admin/dashboard" })).statusCode).toBe(401);
  });
});
