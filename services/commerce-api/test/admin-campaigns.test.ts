import { HeroSlide, HomeResponse, MediaAsset, Problem, RibbonMessage } from "@kleawip/contract";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { campaignState, imageFitsSlot, mentionsOffer } from "../src/campaigns/service";
import { seedDemoCampaigns } from "../src/campaigns/seed-demo";
import { products } from "../src/db/schema";
import { seedDemoCatalogue } from "../src/db/seed-demo";
import { createStaff, createTestApp, resetStaffAndAudit, signIn, uploadImage } from "./helpers";

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let owner: Awaited<ReturnType<typeof signIn>>;
let images: { desktop: string; tablet: string; mobile: string };
let seed = 0;

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
  images = {
    desktop: await uploadBanner(1920, 680),
    tablet: await uploadBanner(1200, 700),
    mobile: await uploadBanner(750, 900),
  };
});

async function uploadBanner(width: number, height: number) {
  seed++;
  const buffer = await sharp({ create: { width, height, channels: 3, background: { r: seed % 255, g: 90, b: 160 } } }).jpeg().toBuffer();
  return MediaAsset.parse((await uploadImage(ctx.app, owner, buffer, `banner-${seed}.jpg`)).json()).id;
}

const problem = (res: { json: () => unknown }) => Problem.parse(res.json());
const productId = async (slug: string) => (await ctx.db.select({ id: products.id }).from(products).where(eq(products.slug, slug)))[0]!.id;
const home = async () => HomeResponse.parse((await ctx.app.inject({ method: "GET", url: "/v1/store/home" })).json());
const inHours = (hours: number) => new Date(Date.now() + hours * 3600_000).toISOString();

async function completeSlide(overrides: Record<string, unknown> = {}) {
  const res = await owner.request("POST", "/v1/admin/campaigns/slides", {
    internalTitle: "Automotive",
    eyebrow: "AUTOMOTIVE CARE",
    headline: "For every detail of the drive.",
    description: "Discover the drying towel.",
    ctaLabel: "Explore",
    target: { type: "product", productId: await productId("twisted-loop-1200") },
    desktopAssetId: images.desktop,
    tabletAssetId: images.tablet,
    mobileAssetId: images.mobile,
    desktopAlt: "Teal towels, desktop",
    tabletAlt: "Teal towels, tablet",
    mobileAlt: "Teal towels, mobile",
    ...overrides,
  });
  expect(res.statusCode, res.body).toBe(201);
  return HeroSlide.parse(res.json());
}

describe("campaign rules", () => {
  it("computes the display state from status and schedule", () => {
    const now = new Date("2026-10-01T06:00:00Z"); // 11:30 IST
    const at = (iso: string) => new Date(iso);
    expect(campaignState({ status: "draft", startsAt: null, endsAt: null }, now)).toBe("draft");
    expect(campaignState({ status: "published", startsAt: null, endsAt: null }, now)).toBe("live");
    // Starts at 12:00 IST on the same day → still scheduled at 11:30 IST.
    expect(campaignState({ status: "published", startsAt: at("2026-10-01T12:00:00+05:30"), endsAt: null }, now)).toBe("scheduled");
    // Ended at 11:30 IST exactly → expired.
    expect(campaignState({ status: "published", startsAt: null, endsAt: at("2026-10-01T11:30:00+05:30") }, now)).toBe("expired");
    expect(campaignState({ status: "archived", startsAt: null, endsAt: null }, now)).toBe("archived");
  });

  it("flags offer and discount claims but not ordinary product copy", () => {
    for (const text of ["Buy 2, get 1 free", "20% off towels", "Flat ₹100 off", "Festive sale", "Use code KLEAN", "Free shipping this week"]) {
      expect(mentionsOffer(text), text).toBe(true);
    }
    for (const text of ["For every detail of the drive.", "Lint-free microfiber cloths", "Explore bath towels", "1200 GSM twisted loop"]) {
      expect(mentionsOffer(text), text).toBe(false);
    }
  });

  it("accepts images close to each slot and rejects small or wrongly shaped ones", () => {
    expect(imageFitsSlot("desktop", { width: 1920, height: 680 })).toBe(true);
    expect(imageFitsSlot("desktop", { width: 1440, height: 510 })).toBe(true);
    expect(imageFitsSlot("desktop", { width: 1000, height: 354 })).toBe(false); // too small
    expect(imageFitsSlot("desktop", { width: 1920, height: 1080 })).toBe(false); // 16:9, wrong shape
    expect(imageFitsSlot("mobile", { width: 750, height: 900 })).toBe(true);
    expect(imageFitsSlot("mobile", { width: 900, height: 750 })).toBe(false);
  });
});

describe("hero slides", () => {
  it("creates a draft and blocks publishing with every missing item listed", async () => {
    const res = await owner.request("POST", "/v1/admin/campaigns/slides", { internalTitle: "Empty" });
    const slide = HeroSlide.parse(res.json());
    expect(slide).toMatchObject({ status: "draft", state: "draft", target: null, images: { desktop: null, tablet: null, mobile: null } });
    const publish = await owner.request("POST", `/v1/admin/campaigns/slides/${slide.id}/publish`);
    expect(problem(publish).code).toBe("PUBLISH_BLOCKED");
    expect(problem(publish).errors!.map((e) => e.code)).toEqual([
      "target_set", "cta_label", "desktop_image", "tablet_image", "mobile_image", "desktop_alt_text", "tablet_alt_text", "mobile_alt_text",
    ]);
  });

  it("publishes a complete slide and shows it on the homepage with the resolved link", async () => {
    const slide = await completeSlide();
    expect(slide.publishChecklist.every((check) => check.ok)).toBe(true);
    const published = HeroSlide.parse((await owner.request("POST", `/v1/admin/campaigns/slides/${slide.id}/publish`)).json());
    expect(published.state).toBe("live");
    const body = await home();
    expect(body.heroSlides).toEqual([
      expect.objectContaining({ id: slide.id, href: "/product/twisted-loop-1200", cta: "Explore", alt: "Teal towels, desktop" }),
    ]);
    expect(body.heroSlides[0]!.images.mobile).toMatchObject({ width: 750, height: 900, alt: "Teal towels, mobile" });
  });

  it("never shows drafts, scheduled or expired slides to customers", async () => {
    await completeSlide({ internalTitle: "Draft" });
    const scheduled = await completeSlide({ internalTitle: "Later", startsAt: inHours(2) });
    await owner.request("POST", `/v1/admin/campaigns/slides/${scheduled.id}/publish`);
    expect(HeroSlide.parse((await owner.request("GET", `/v1/admin/campaigns/slides/${scheduled.id}`)).json()).state).toBe("scheduled");
    expect((await home()).heroSlides).toEqual([]);
  });

  it("rejects an end before the start, and blocks publishing a slide whose end has passed", async () => {
    const bad = await owner.request("POST", "/v1/admin/campaigns/slides", { internalTitle: "X", startsAt: inHours(5), endsAt: inHours(1) });
    expect(problem(bad).errors![0]).toMatchObject({ path: "endsAt", code: "before_start" });
    const noOffset = await owner.request("POST", "/v1/admin/campaigns/slides", { internalTitle: "X", startsAt: "2026-10-01T09:00:00" });
    expect(noOffset.statusCode).toBe(422);

    const past = await completeSlide({ endsAt: inHours(-1) });
    const publish = await owner.request("POST", `/v1/admin/campaigns/slides/${past.id}/publish`);
    expect(problem(publish).errors!.map((e) => e.code)).toEqual(["schedule_valid"]);
  });

  it("blocks offer claims and wrongly sized images", async () => {
    const wrongSize = await uploadBanner(1920, 1080);
    const slide = await completeSlide({ headline: "Buy 2, get 1 free", desktopAssetId: wrongSize });
    const publish = await owner.request("POST", `/v1/admin/campaigns/slides/${slide.id}/publish`);
    expect(problem(publish).errors!.map((e) => e.code)).toEqual(["desktop_image_fit", "no_offer_claim"]);
  });

  it("hides a live slide whose target becomes unpublished, and flags it in the admin", async () => {
    const slide = await completeSlide();
    await owner.request("POST", `/v1/admin/campaigns/slides/${slide.id}/publish`);
    await owner.request("POST", `/v1/admin/products/${await productId("twisted-loop-1200")}/unpublish`);
    expect((await home()).heroSlides).toEqual([]);
    const admin = HeroSlide.parse((await owner.request("GET", `/v1/admin/campaigns/slides/${slide.id}`)).json());
    expect(admin.target).toMatchObject({ available: false });
    expect(admin.publishChecklist.find((c) => c.code === "target_available")!.ok).toBe(false);
  });

  it("links to categories, collections-by-id and approved pages only", async () => {
    const category = await completeSlide({ target: { type: "category", categorySlug: "bath" } });
    expect(category.target).toMatchObject({ href: "/shop/bath", available: true });
    const page = await completeSlide({ target: { type: "page", path: "/bulk" } });
    expect(page.target).toMatchObject({ href: "/bulk" });
    expect((await owner.request("POST", "/v1/admin/campaigns/slides", { internalTitle: "X", target: { type: "page", path: "/admin" } })).statusCode).toBe(422);
    const unknown = await owner.request("POST", "/v1/admin/campaigns/slides", { internalTitle: "X", target: { type: "category", categorySlug: "nope" } });
    expect(problem(unknown).errors![0]).toMatchObject({ path: "target.categorySlug", code: "unknown" });
  });

  it("lets marketing editors draft and take down slides, but only the owner publishes", async () => {
    await createStaff(ctx.db, "marketing_editor");
    const editor = await signIn(ctx.app, "marketing_editor@kleawip.test");
    const created = await editor.request("POST", "/v1/admin/campaigns/slides", { internalTitle: "Editor draft" });
    expect(created.statusCode).toBe(201);
    const slide = await completeSlide();
    expect((await editor.request("POST", `/v1/admin/campaigns/slides/${slide.id}/publish`)).statusCode).toBe(403);
    await owner.request("POST", `/v1/admin/campaigns/slides/${slide.id}/publish`);
    expect((await editor.request("POST", `/v1/admin/campaigns/slides/${slide.id}/unpublish`)).statusCode).toBe(200);

    await createStaff(ctx.db, "operations");
    const operations = await signIn(ctx.app, "operations@kleawip.test");
    expect((await operations.request("POST", "/v1/admin/campaigns/slides", { internalTitle: "No" })).statusCode).toBe(403);
  });

  it("reorders slides and marks their images as in use", async () => {
    const first = await completeSlide({ internalTitle: "First" });
    const second = await completeSlide({ internalTitle: "Second" });
    const reordered = (await owner.request("PUT", "/v1/admin/campaigns/slides/order", { ids: [second.id, first.id] })).json();
    expect(reordered.data.map((s: { internalTitle: string }) => s.internalTitle)).toEqual(["Second", "First"]);

    const asset = MediaAsset.parse((await owner.request("GET", `/v1/admin/media/${images.desktop}`)).json());
    expect(asset.usedBy.map((use) => use.type)).toEqual(["hero_slide", "hero_slide"]);
    expect(problem(await owner.request("DELETE", `/v1/admin/media/${images.desktop}`)).errors![0]!.code).toBe("in_use");
  });
});

describe("announcement ribbon", () => {
  it("publishes messages, links them, and turns a link into plain text if its target is unpublished", async () => {
    const plain = RibbonMessage.parse((await owner.request("POST", "/v1/admin/campaigns/ribbon", { text: "Explore the collection" })).json());
    const linked = RibbonMessage.parse((await owner.request("POST", "/v1/admin/campaigns/ribbon", {
      text: "Meet the Twisted Loop towel",
      target: { type: "product", productId: await productId("twisted-loop-1200") },
    })).json());
    for (const message of [plain, linked]) await owner.request("POST", `/v1/admin/campaigns/ribbon/${message.id}/publish`);

    expect((await home()).ribbon).toEqual([
      { id: plain.id, text: "Explore the collection", href: null },
      { id: linked.id, text: "Meet the Twisted Loop towel", href: "/product/twisted-loop-1200" },
    ]);
    await owner.request("POST", `/v1/admin/products/${await productId("twisted-loop-1200")}/unpublish`);
    expect((await home()).ribbon[1]).toEqual({ id: linked.id, text: "Meet the Twisted Loop towel", href: null });
  });

  it("blocks offer claims and enforces the length limit", async () => {
    const offer = RibbonMessage.parse((await owner.request("POST", "/v1/admin/campaigns/ribbon", { text: "Flat 20% off today" })).json());
    expect(problem(await owner.request("POST", `/v1/admin/campaigns/ribbon/${offer.id}/publish`)).errors!.map((e) => e.code)).toEqual(["no_offer_claim"]);
    expect((await owner.request("POST", "/v1/admin/campaigns/ribbon", { text: "x".repeat(121) })).statusCode).toBe(422);
  });
});

describe("GET /v1/store/home", () => {
  it("falls back to the first eight published products when no home-featured collection exists", async () => {
    const body = await home();
    expect(body.featuredProducts).toHaveLength(8);
    expect(body.featuredProducts.every((product) => product.priceStatus === "pending")).toBe(true);
  });

  it("uses the published home-featured collection's order when it exists", async () => {
    const collection = (await owner.request("POST", "/v1/admin/collections", { title: "Home featured", slug: "home-featured" })).json();
    await owner.request("PUT", `/v1/admin/collections/${collection.id}/products`, { productIds: [await productId("pet-towel"), await productId("coral-cloth")] });
    expect((await home()).featuredProducts).toHaveLength(8); // still a draft collection
    await owner.request("POST", `/v1/admin/collections/${collection.id}/publish`);
    expect((await home()).featuredProducts.map((p) => p.slug)).toEqual(["pet-towel", "coral-cloth"]);
  });

  it("serves the seeded demo campaigns built from real kleawip.com photos", async () => {
    const result = await seedDemoCampaigns(ctx.db, ctx.storage);
    expect(result).toEqual({ slides: 3, ribbon: 2 });
    const body = await home();
    expect(body.heroSlides.map((slide) => slide.href)).toEqual(["/product/twisted-loop-1200", "/shop/bath", "/product/cleaning-gloves"]);
    expect(body.ribbon.map((message) => message.href)).toEqual(["/shop", "/product/twisted-loop-1200"]);
    for (const slide of body.heroSlides) {
      expect(mentionsOffer(slide.eyebrow, slide.headline, slide.description, slide.cta)).toBe(false);
      expect(slide.images.desktop).toMatchObject({ width: 1920, height: 680 });
    }
  });
});
