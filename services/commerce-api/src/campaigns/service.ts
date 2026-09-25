// Homepage campaigns: hero slides and the announcement ribbon (HOMEPAGE_CAMPAIGNS_SPEC).
import type {
  CampaignTargetInput,
  HeroSlide,
  HeroSlideInput,
  HomeResponse,
  ProductListItem,
  RibbonMessage,
  RibbonMessageInput,
} from "@kleawip/contract";
import { and, asc, eq, inArray, max } from "drizzle-orm";
import { recordAudit } from "../audit";
import { productSummaries } from "../catalogue/queries";
import type { Database } from "../db/client";
import { categories, collections, heroSlides, mediaAssets, productMedia, products, ribbonMessages, collectionProducts } from "../db/schema";
import { ApiError, notFound } from "../errors";

type FieldError = { path: string; code: string; message: string };
const invalid = (errors: FieldError[]) => new ApiError(422, "VALIDATION_FAILED", "Validation failed", "One or more fields are invalid.", errors);
const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

// ---- Rules ----

/** Working image slots (HOMEPAGE_CAMPAIGNS_SPEC). Uploads must reach 75% of the slot size and be within 12% of its shape. */
export const SLOTS = {
  desktop: { width: 1920, height: 680 },
  tablet: { width: 1200, height: 700 },
  mobile: { width: 750, height: 900 },
} as const;
type Device = keyof typeof SLOTS;
const DEVICES = Object.keys(SLOTS) as Device[];
const MIN_SCALE = 0.75;
const ASPECT_TOLERANCE = 0.12;

export function imageFitsSlot(device: Device, image: { width: number; height: number }) {
  const slot = SLOTS[device];
  const bigEnough = image.width >= slot.width * MIN_SCALE && image.height >= slot.height * MIN_SCALE;
  const aspect = image.width / image.height / (slot.width / slot.height);
  return bigEnough && Math.abs(aspect - 1) <= ASPECT_TOLERANCE;
}

/**
 * Offers are not built yet (Milestone 2), so no campaign text may promise one. When the offer engine
 * exists, this becomes "must match an active offer rule" instead of "must not mention an offer".
 */
const OFFER_CLAIM = /(\d+\s?%|\bper\s?cent\b|\b\d+\s?% off\b|\boff\b|\bdiscount|\bsale\b|\boffer|\bdeal\b|\bbuy\s+\d+|\bget\s+\d+\s+free|\bfree\s+(shipping|delivery|gift)|\bsave\b|\bcashback|\bcoupon|\bcode\b|₹\s?\d)/i;

export function mentionsOffer(...texts: string[]) {
  return texts.some((text) => OFFER_CLAIM.test(text));
}

export type CampaignStateName = "draft" | "scheduled" | "live" | "expired" | "archived";

export function campaignState(
  row: { status: "draft" | "published" | "archived"; startsAt: Date | null; endsAt: Date | null },
  now = new Date(),
): CampaignStateName {
  if (row.status !== "published") return row.status;
  if (row.startsAt && now < row.startsAt) return "scheduled";
  if (row.endsAt && now >= row.endsAt) return "expired";
  return "live";
}

// ---- Targets ----

type TargetColumns = {
  targetType: "product" | "collection" | "category" | "page" | null;
  targetProductId: string | null;
  targetCollectionId: string | null;
  targetCategoryId: string | null;
  targetPage: string | null;
};

const NO_TARGET: TargetColumns = { targetType: null, targetProductId: null, targetCollectionId: null, targetCategoryId: null, targetPage: null };

async function targetColumns(db: Database, target: CampaignTargetInput | null): Promise<TargetColumns> {
  if (!target) return NO_TARGET;
  switch (target.type) {
    case "product": {
      const [row] = await db.select({ id: products.id }).from(products).where(eq(products.id, target.productId));
      if (!row) throw invalid([{ path: "target.productId", code: "unknown", message: "That product does not exist." }]);
      return { ...NO_TARGET, targetType: "product", targetProductId: row.id };
    }
    case "collection": {
      const [row] = await db.select({ id: collections.id }).from(collections).where(eq(collections.id, target.collectionId));
      if (!row) throw invalid([{ path: "target.collectionId", code: "unknown", message: "That collection does not exist." }]);
      return { ...NO_TARGET, targetType: "collection", targetCollectionId: row.id };
    }
    case "category": {
      const [row] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, target.categorySlug));
      if (!row) throw invalid([{ path: "target.categorySlug", code: "unknown", message: "That category does not exist." }]);
      return { ...NO_TARGET, targetType: "category", targetCategoryId: row.id };
    }
    case "page":
      return { ...NO_TARGET, targetType: "page", targetPage: target.path };
  }
}

type TargetView = NonNullable<HeroSlide["target"]>;

async function resolveTargets(db: Database, rows: TargetColumns[]): Promise<(TargetView | null)[]> {
  const ids = (key: keyof TargetColumns) => [...new Set(rows.map((row) => row[key]).filter((id): id is string => !!id))];
  const [productRows, collectionRows, categoryRows] = await Promise.all([
    ids("targetProductId").length ? db.select().from(products).where(inArray(products.id, ids("targetProductId"))) : Promise.resolve([]),
    ids("targetCollectionId").length ? db.select().from(collections).where(inArray(collections.id, ids("targetCollectionId"))) : Promise.resolve([]),
    ids("targetCategoryId").length ? db.select().from(categories).where(inArray(categories.id, ids("targetCategoryId"))) : Promise.resolve([]),
  ]);
  return rows.map((row): TargetView | null => {
    switch (row.targetType) {
      case "product": {
        const product = productRows.find((p) => p.id === row.targetProductId);
        return product
          ? { type: "product", id: product.id, label: product.title, href: `/product/${product.slug}`, available: product.status === "published" }
          : { type: "product", id: null, label: "Deleted product", href: "", available: false };
      }
      case "collection": {
        const collection = collectionRows.find((c) => c.id === row.targetCollectionId);
        return collection
          ? { type: "collection", id: collection.id, label: collection.title, href: `/collections/${collection.slug}`, available: collection.status === "published" }
          : { type: "collection", id: null, label: "Deleted collection", href: "", available: false };
      }
      case "category": {
        const category = categoryRows.find((c) => c.id === row.targetCategoryId);
        return category
          ? { type: "category", id: category.id, label: category.title, href: `/shop/${category.slug}`, available: true }
          : { type: "category", id: null, label: "Deleted category", href: "", available: false };
      }
      case "page":
        return { type: "page", id: null, label: row.targetPage!, href: row.targetPage!, available: true };
      default:
        return null;
    }
  });
}

const scheduleChecks = (row: { startsAt: Date | null; endsAt: Date | null }, now: Date) => [
  {
    code: "schedule_valid",
    ok: !(row.startsAt && row.endsAt && row.endsAt <= row.startsAt) && !(row.endsAt && row.endsAt <= now),
    message: "The end time must be after the start time and in the future.",
  },
];

// ---- Hero slides ----

type SlideRow = typeof heroSlides.$inferSelect;

async function slideViews(db: Database, rows: SlideRow[], now = new Date()): Promise<HeroSlide[]> {
  const assetIds = [...new Set(rows.flatMap((row) => [row.desktopAssetId, row.tabletAssetId, row.mobileAssetId]).filter((id): id is string => !!id))];
  const [assets, targets] = await Promise.all([
    assetIds.length ? db.select().from(mediaAssets).where(inArray(mediaAssets.id, assetIds)) : Promise.resolve([]),
    resolveTargets(db, rows),
  ]);
  return rows.map((row, index) => {
    const image = (device: Device) => {
      const asset = assets.find((a) => a.id === row[`${device}AssetId`]);
      return asset ? { assetId: asset.id, url: asset.url, width: asset.width, height: asset.height, alt: row[`${device}Alt`] } : null;
    };
    const images = { desktop: image("desktop"), tablet: image("tablet"), mobile: image("mobile") };
    const target = targets[index] ?? null;
    const checklist = [
      { code: "target_set", ok: target !== null, message: "Choose where the slide links to." },
      { code: "target_available", ok: target === null || target.available, message: "The link target must be published." },
      { code: "cta_label", ok: row.ctaLabel.trim().length > 0, message: "Add a button label." },
      ...DEVICES.map((device) => ({ code: `${device}_image`, ok: images[device] !== null, message: `Add the ${device} image.` })),
      ...DEVICES.map((device) => ({
        code: `${device}_image_fit`,
        ok: images[device] === null || imageFitsSlot(device, images[device]!),
        message: `The ${device} image must be about ${SLOTS[device].width} × ${SLOTS[device].height} px (at least ${Math.round(SLOTS[device].width * MIN_SCALE)} × ${Math.round(SLOTS[device].height * MIN_SCALE)}, same shape).`,
      })),
      ...DEVICES.map((device) => ({ code: `${device}_alt_text`, ok: row[`${device}Alt`].trim().length > 0, message: `Add alt text for the ${device} image.` })),
      ...scheduleChecks(row, now),
      {
        code: "no_offer_claim",
        ok: !mentionsOffer(row.eyebrow, row.headline, row.description, row.ctaLabel),
        message: "The text mentions an offer or discount, but offers are not live yet. Remove the claim, or wait for the offer engine (Milestone 2).",
      },
    ];
    return {
      id: row.id,
      internalTitle: row.internalTitle,
      eyebrow: row.eyebrow,
      headline: row.headline,
      description: row.description,
      ctaLabel: row.ctaLabel,
      target,
      images,
      startsAt: row.startsAt?.toISOString() ?? null,
      endsAt: row.endsAt?.toISOString() ?? null,
      status: row.status,
      state: campaignState(row, now),
      position: row.position,
      publishChecklist: checklist,
      isDemo: row.isDemo,
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

async function slideRow(db: Database, id: string) {
  if (!isUuid(id)) throw notFound("Slide not found.");
  const [row] = await db.select().from(heroSlides).where(eq(heroSlides.id, id));
  if (!row) throw notFound("Slide not found.");
  return row;
}

async function assetsExist(db: Database, input: HeroSlideInput) {
  const errors: FieldError[] = [];
  for (const device of DEVICES) {
    const assetId = input[`${device}AssetId`];
    if (!assetId) continue;
    const [asset] = await db.select({ id: mediaAssets.id }).from(mediaAssets).where(eq(mediaAssets.id, assetId));
    if (!asset) errors.push({ path: `${device}AssetId`, code: "unknown", message: "That image is not in the media library." });
  }
  if (errors.length) throw invalid(errors);
}

function slideColumns(input: HeroSlideInput) {
  const { target: _target, startsAt, endsAt, ...rest } = input;
  return {
    ...rest,
    ...(startsAt !== undefined ? { startsAt: startsAt === null ? null : new Date(startsAt) } : {}),
    ...(endsAt !== undefined ? { endsAt: endsAt === null ? null : new Date(endsAt) } : {}),
  };
}

function scheduleOrderCheck(startsAt: Date | null, endsAt: Date | null) {
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw invalid([{ path: "endsAt", code: "before_start", message: "The end time must be after the start time." }]);
  }
}

export async function listSlides(db: Database) {
  return slideViews(db, await db.select().from(heroSlides).orderBy(asc(heroSlides.position), asc(heroSlides.createdAt)));
}

export async function getSlide(db: Database, id: string) {
  return (await slideViews(db, [await slideRow(db, id)]))[0]!;
}

export async function createSlide(db: Database, input: HeroSlideInput & { internalTitle: string }, actorStaffId: string) {
  await assetsExist(db, input);
  const target = input.target !== undefined ? await targetColumns(db, input.target) : NO_TARGET;
  const columns = slideColumns(input);
  scheduleOrderCheck(columns.startsAt ?? null, columns.endsAt ?? null);
  return db.transaction(async (tx) => {
    const [{ value: last } = { value: null }] = await tx.select({ value: max(heroSlides.position) }).from(heroSlides);
    const [row] = await tx
      .insert(heroSlides)
      .values({ ...columns, ...target, internalTitle: input.internalTitle, position: (last ?? -1) + 1 })
      .returning();
    await recordAudit(tx, { entityType: "hero_slide", entityId: row!.id, action: "slide.created", actorStaffId, after: input });
    return row!.id;
  });
}

export async function updateSlide(db: Database, id: string, input: HeroSlideInput, actorStaffId: string) {
  const current = await slideRow(db, id);
  await assetsExist(db, input);
  const target = input.target !== undefined ? await targetColumns(db, input.target) : {};
  const columns = slideColumns(input);
  scheduleOrderCheck(columns.startsAt !== undefined ? columns.startsAt : current.startsAt, columns.endsAt !== undefined ? columns.endsAt : current.endsAt);
  await db.transaction(async (tx) => {
    await tx.update(heroSlides).set({ ...columns, ...target, updatedAt: new Date() }).where(eq(heroSlides.id, id));
    await recordAudit(tx, { entityType: "hero_slide", entityId: id, action: "slide.updated", actorStaffId, after: input });
  });
}

async function blockIfFailing(checklist: { code: string; ok: boolean; message: string }[]) {
  const blocking = checklist.filter((check) => !check.ok);
  if (blocking.length) {
    throw new ApiError(
      422,
      "PUBLISH_BLOCKED",
      "Cannot publish yet",
      `${blocking.length} item(s) must be fixed before publishing.`,
      blocking.map((check) => ({ path: `publishChecklist.${check.code}`, code: check.code, message: check.message })),
    );
  }
}

export async function setSlideStatus(db: Database, id: string, status: "published" | "draft" | "archived", actorStaffId: string) {
  const current = await slideRow(db, id);
  if (status === "published") await blockIfFailing((await getSlide(db, id)).publishChecklist);
  if (current.status === status) return;
  await db.transaction(async (tx) => {
    await tx.update(heroSlides).set({ status, updatedAt: new Date() }).where(eq(heroSlides.id, id));
    await recordAudit(tx, { entityType: "hero_slide", entityId: id, action: `slide.${status}`, actorStaffId, before: { status: current.status }, after: { status } });
  });
}

async function reorder(db: Database, table: typeof heroSlides | typeof ribbonMessages, ids: string[], entityType: "hero_slide" | "ribbon_message", actorStaffId: string) {
  const current = await db.select({ id: table.id }).from(table).where(inArray(table.status, ["draft", "published"]));
  const same = current.length === ids.length && new Set(ids).size === ids.length && current.every((row) => ids.includes(row.id));
  if (!same) throw invalid([{ path: "ids", code: "mismatch", message: "Send every non-archived item exactly once." }]);
  await db.transaction(async (tx) => {
    for (const [position, id] of ids.entries()) await tx.update(table).set({ position }).where(eq(table.id, id));
    await recordAudit(tx, { entityType, entityId: ids[0]!, action: "reordered", actorStaffId, after: { ids } });
  });
}

export const reorderSlides = (db: Database, ids: string[], actorStaffId: string) => reorder(db, heroSlides, ids, "hero_slide", actorStaffId);

// ---- Ribbon ----

type RibbonRow = typeof ribbonMessages.$inferSelect;

async function ribbonViews(db: Database, rows: RibbonRow[], now = new Date()): Promise<RibbonMessage[]> {
  const targets = await resolveTargets(db, rows);
  return rows.map((row, index) => {
    const target = targets[index] ?? null;
    return {
      id: row.id,
      text: row.text,
      target,
      startsAt: row.startsAt?.toISOString() ?? null,
      endsAt: row.endsAt?.toISOString() ?? null,
      status: row.status,
      state: campaignState(row, now),
      position: row.position,
      publishChecklist: [
        { code: "target_available", ok: target === null || target.available, message: "The link target must be published (or remove the link)." },
        ...scheduleChecks(row, now),
        {
          code: "no_offer_claim",
          ok: !mentionsOffer(row.text),
          message: "The text mentions an offer or discount, but offers are not live yet. Remove the claim, or wait for the offer engine (Milestone 2).",
        },
      ],
      isDemo: row.isDemo,
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

async function ribbonRow(db: Database, id: string) {
  if (!isUuid(id)) throw notFound("Message not found.");
  const [row] = await db.select().from(ribbonMessages).where(eq(ribbonMessages.id, id));
  if (!row) throw notFound("Message not found.");
  return row;
}

function ribbonColumns(input: RibbonMessageInput) {
  const { target: _target, startsAt, endsAt, ...rest } = input;
  return {
    ...rest,
    ...(startsAt !== undefined ? { startsAt: startsAt === null ? null : new Date(startsAt) } : {}),
    ...(endsAt !== undefined ? { endsAt: endsAt === null ? null : new Date(endsAt) } : {}),
  };
}

export async function listRibbon(db: Database) {
  return ribbonViews(db, await db.select().from(ribbonMessages).orderBy(asc(ribbonMessages.position), asc(ribbonMessages.createdAt)));
}

export async function getRibbon(db: Database, id: string) {
  return (await ribbonViews(db, [await ribbonRow(db, id)]))[0]!;
}

export async function createRibbon(db: Database, input: RibbonMessageInput & { text: string }, actorStaffId: string) {
  const target = input.target !== undefined ? await targetColumns(db, input.target) : NO_TARGET;
  const columns = ribbonColumns(input);
  scheduleOrderCheck(columns.startsAt ?? null, columns.endsAt ?? null);
  return db.transaction(async (tx) => {
    const [{ value: last } = { value: null }] = await tx.select({ value: max(ribbonMessages.position) }).from(ribbonMessages);
    const [row] = await tx.insert(ribbonMessages).values({ ...columns, ...target, text: input.text, position: (last ?? -1) + 1 }).returning();
    await recordAudit(tx, { entityType: "ribbon_message", entityId: row!.id, action: "ribbon.created", actorStaffId, after: input });
    return row!.id;
  });
}

export async function updateRibbon(db: Database, id: string, input: RibbonMessageInput, actorStaffId: string) {
  const current = await ribbonRow(db, id);
  const target = input.target !== undefined ? await targetColumns(db, input.target) : {};
  const columns = ribbonColumns(input);
  scheduleOrderCheck(columns.startsAt !== undefined ? columns.startsAt : current.startsAt, columns.endsAt !== undefined ? columns.endsAt : current.endsAt);
  await db.transaction(async (tx) => {
    await tx.update(ribbonMessages).set({ ...columns, ...target, updatedAt: new Date() }).where(eq(ribbonMessages.id, id));
    await recordAudit(tx, { entityType: "ribbon_message", entityId: id, action: "ribbon.updated", actorStaffId, before: { text: current.text }, after: input });
  });
}

export async function setRibbonStatus(db: Database, id: string, status: "published" | "draft" | "archived", actorStaffId: string) {
  const current = await ribbonRow(db, id);
  if (status === "published") await blockIfFailing((await getRibbon(db, id)).publishChecklist);
  if (current.status === status) return;
  await db.transaction(async (tx) => {
    await tx.update(ribbonMessages).set({ status, updatedAt: new Date() }).where(eq(ribbonMessages.id, id));
    await recordAudit(tx, { entityType: "ribbon_message", entityId: id, action: `ribbon.${status}`, actorStaffId, before: { status: current.status }, after: { status } });
  });
}

export const reorderRibbon = (db: Database, ids: string[], actorStaffId: string) => reorder(db, ribbonMessages, ids, "ribbon_message", actorStaffId);

// ---- Storefront home ----

/** Collection whose ordered products fill "featured products"; falls back to the first published products. */
export const FEATURED_COLLECTION_SLUG = "home-featured";
const FEATURED_FALLBACK_COUNT = 8;

async function featuredProducts(db: Database): Promise<ProductListItem[]> {
  const [featured] = await db
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.slug, FEATURED_COLLECTION_SLUG), eq(collections.status, "published")));

  const base = db
    .select({ id: products.id, slug: products.slug, title: products.title, detail: products.detail, spec: products.spec, isDemo: products.isDemo, category: categories.slug })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId));
  const rows = featured
    ? await base
        .innerJoin(collectionProducts, eq(collectionProducts.productId, products.id))
        .where(and(eq(collectionProducts.collectionId, featured.id), eq(products.status, "published")))
        .orderBy(asc(collectionProducts.position))
    : await base.where(eq(products.status, "published")).orderBy(asc(products.position), asc(products.slug)).limit(FEATURED_FALLBACK_COUNT);

  const ids = rows.map((row) => row.id);
  const [media, summaries] = await Promise.all([
    ids.length ? db.select().from(productMedia).where(inArray(productMedia.productId, ids)).orderBy(asc(productMedia.position)) : Promise.resolve([]),
    productSummaries(db, ids),
  ]);
  return rows.map((row) => {
    const summary = summaries.get(row.id)!;
    return {
      slug: row.slug,
      title: row.title,
      detail: row.detail,
      category: row.category,
      spec: row.spec,
      images: media.filter((image) => image.productId === row.id).map(({ url, alt, width, height }) => ({ url, alt, width, height })),
      priceFrom: summary.priceFrom,
      priceStatus: summary.priceFrom ? "approved" : "pending",
      availability: summary.availability,
      badge: null,
      isDemo: row.isDemo,
    };
  });
}

/**
 * Everything the homepage needs in one call. Only live items (published and inside their schedule)
 * appear. A slide whose target is unavailable is skipped; a ribbon message with an unavailable
 * target is shown as plain text.
 */
export async function storeHome(db: Database, now = new Date()): Promise<HomeResponse> {
  const [slides, ribbon, featured] = await Promise.all([
    db.select().from(heroSlides).where(eq(heroSlides.status, "published")).orderBy(asc(heroSlides.position)).then((rows) => slideViews(db, rows, now)),
    db.select().from(ribbonMessages).where(eq(ribbonMessages.status, "published")).orderBy(asc(ribbonMessages.position)).then((rows) => ribbonViews(db, rows, now)),
    featuredProducts(db),
  ]);

  const heroSlidesOut = slides
    .filter((slide) => slide.state === "live" && slide.target?.available && slide.images.desktop && slide.images.tablet && slide.images.mobile)
    .map((slide) => {
      const image = (device: Device) => {
        const { url, alt, width, height } = slide.images[device]!;
        return { url, alt, width, height };
      };
      return {
        id: slide.id,
        eyebrow: slide.eyebrow,
        headline: slide.headline,
        description: slide.description,
        cta: slide.ctaLabel,
        alt: slide.images.desktop!.alt,
        href: slide.target!.href,
        images: { desktop: image("desktop"), tablet: image("tablet"), mobile: image("mobile") },
      };
    });

  const ribbonOut = ribbon
    .filter((message) => message.state === "live")
    .map((message) => ({ id: message.id, text: message.text, href: message.target?.available ? message.target.href : null }));

  return { ribbon: ribbonOut, heroSlides: heroSlidesOut, featuredProducts: featured };
}
