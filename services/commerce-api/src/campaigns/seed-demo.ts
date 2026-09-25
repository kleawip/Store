import { eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Database } from "../db/client";
import { categories, heroSlides, products, ribbonMessages } from "../db/schema";
import { uploadAsset } from "../media/service";
import type { MediaStorage } from "../media/storage";

const DIR = fileURLToPath(new URL("../../../../database/seeds/demo/campaigns/", import.meta.url));

// Neutral, factual copy only: no offers, prices or performance claims (none are approved).
const SLIDES = [
  {
    key: "automotive",
    internalTitle: "DEMO · Automotive drying towel",
    eyebrow: "AUTOMOTIVE CARE",
    headline: "For every detail of the drive.",
    description: "Discover Kleawip's twisted-loop microfiber drying towel.",
    ctaLabel: "Explore the drying towel",
    alt: "Folded teal twisted-loop microfiber drying towels on a dark surface",
    target: { productSlug: "twisted-loop-1200" },
  },
  {
    key: "bath",
    internalTitle: "DEMO · Bath towels",
    eyebrow: "BATH TOWELS",
    headline: "Bring colour to everyday care.",
    description: "Discover Kleawip's microfiber bath towel collection.",
    ctaLabel: "Explore bath towels",
    alt: "Stacked navy, light blue and green Kleawip microfiber bath towels in a bright bathroom",
    target: { categorySlug: "bath" },
  },
  {
    key: "mitts",
    internalTitle: "DEMO · Cleaning mitts",
    eyebrow: "CLEANING MITTS",
    headline: "Chenille mitts for a gentle wash.",
    description: "Discover Kleawip's microfiber cleaning mitts.",
    ctaLabel: "Explore cleaning mitts",
    alt: "Stacked blue, grey and orange chenille microfiber cleaning mitts",
    target: { productSlug: "cleaning-gloves" },
  },
] as const;

/** Seeds published DEMO slides and ribbon messages from the real-photo banners in database/seeds/demo/campaigns. */
export async function seedDemoCampaigns(db: Database, storage: MediaStorage) {
  await db.delete(heroSlides);
  await db.delete(ribbonMessages);

  for (const [position, slide] of SLIDES.entries()) {
    const assetIds: Record<string, string> = {};
    for (const device of ["desktop", "tablet", "mobile"] as const) {
      const filename = `${slide.key}-${device}.jpg`;
      const { asset } = await uploadAsset(db, storage, { buffer: await readFile(DIR + filename), filename }, slide.alt, null);
      assetIds[device] = asset.id;
    }
    const target =
      "productSlug" in slide.target
        ? { targetType: "product" as const, targetProductId: (await db.select({ id: products.id }).from(products).where(eq(products.slug, slide.target.productSlug)))[0]?.id }
        : { targetType: "category" as const, targetCategoryId: (await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slide.target.categorySlug)))[0]?.id };

    await db.insert(heroSlides).values({
      internalTitle: slide.internalTitle,
      eyebrow: slide.eyebrow,
      headline: slide.headline,
      description: slide.description,
      ctaLabel: slide.ctaLabel,
      ...target,
      desktopAssetId: assetIds.desktop,
      tabletAssetId: assetIds.tablet,
      mobileAssetId: assetIds.mobile,
      desktopAlt: slide.alt,
      tabletAlt: slide.alt,
      mobileAlt: slide.alt,
      status: "published",
      position,
      isDemo: true,
    });
  }

  const [twistedLoop] = await db.select({ id: products.id }).from(products).where(eq(products.slug, "twisted-loop-1200"));
  await db.insert(ribbonMessages).values([
    { text: "Explore the Kleawip microfiber collection", targetType: "page", targetPage: "/shop", status: "published", position: 0, isDemo: true },
    { text: "Discover the Twisted Loop Drying Towel", targetType: "product", targetProductId: twistedLoop?.id, status: "published", position: 1, isDemo: true },
  ]);
  return { slides: SLIDES.length, ribbon: 2 };
}
