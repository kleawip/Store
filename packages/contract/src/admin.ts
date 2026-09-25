// Admin API schemas (API_CONTRACT §5, ADMIN_SCREENS_BRIEF). Kleawip staff only.
// SHARED FILE: frontend (Codex) and backend (Claude Code). Change via the contract change process.
import { z } from "zod";

const Slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens.").max(80);
const Code = z.string().regex(/^[a-z0-9]+([_-][a-z0-9]+)*$/, "Use lowercase letters, numbers, - or _.").max(40);
export const Sku = z.string().regex(/^[A-Z0-9][A-Z0-9-]{1,63}$/, "Use 2–64 uppercase letters, numbers and hyphens.");
const Paise = z.number().int().positive();

export const StaffRole = z.enum(["owner", "catalogue_manager", "marketing_editor", "operations", "support", "viewer"]);
export type StaffRole = z.infer<typeof StaffRole>;

// ---- Auth ----

export const StaffLoginRequest = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(256),
});

export const StaffSession = z.object({
  staff: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    role: StaffRole,
    permissions: z.array(z.string()),
  }),
  // Send back as the X-CSRF-Token header on every non-GET admin request.
  csrfToken: z.string(),
});
export type StaffSession = z.infer<typeof StaffSession>;

// ---- Products ----

export const PublishStatus = z.enum(["draft", "published", "archived"]);

const Specification = z.object({ label: z.string().trim().min(1).max(60), value: z.string().trim().min(1).max(200) });
const ContentSection = z.object({ code: Code, title: z.string().trim().min(1).max(80), bodyHtml: z.string().max(20000) });

export const AdminProductCreate = z.object({
  title: z.string().trim().min(1).max(160),
  slug: Slug.optional(),
  categorySlug: z.string(),
  detail: z.string().trim().max(200).default(""),
  spec: z.string().trim().max(120).default(""),
  summary: z.string().trim().max(2000).default(""),
  specifications: z.array(Specification).max(40).default([]),
  contentSections: z.array(ContentSection).max(20).default([]),
  seoTitle: z.string().trim().max(70).nullable().default(null),
  seoDescription: z.string().trim().max(160).nullable().default(null),
});
export type AdminProductCreate = z.infer<typeof AdminProductCreate>;

// Every field optional. `slug` is rejected once the product has ever been published.
export const AdminProductUpdate = z.object({
  title: z.string().trim().min(1).max(160),
  slug: Slug,
  categorySlug: z.string(),
  detail: z.string().trim().max(200),
  spec: z.string().trim().max(120),
  summary: z.string().trim().max(2000),
  specifications: z.array(Specification).max(40),
  contentSections: z.array(ContentSection).max(20),
  seoTitle: z.string().trim().max(70).nullable(),
  seoDescription: z.string().trim().max(160).nullable(),
  position: z.number().int().min(0),
}).partial();
export type AdminProductUpdate = z.infer<typeof AdminProductUpdate>;

// Replaces the full option set. Values still used by a variant cannot be removed.
export const AdminOptionsReplace = z.object({
  groups: z.array(z.object({
    code: Code,
    label: z.string().trim().min(1).max(40),
    values: z.array(z.object({
      code: Code,
      label: z.string().trim().min(1).max(60),
      swatch: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().default(null),
    })).min(1).max(30),
  })).max(3),
});
export type AdminOptionsReplace = z.infer<typeof AdminOptionsReplace>;

// Stock source (ADMIN_SCREENS_BRIEF §4):
//   own    — this SKU has its own inventory item (pre-packed stock, or a single-unit SKU)
//   shared — draw on another SKU's inventory item; each sale consumes packQuantity units
export const StockSource = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("own"), tracked: z.boolean().default(true), lowStockThreshold: z.number().int().min(0).nullable().default(null) }),
  z.object({ mode: z.literal("shared"), fromSku: Sku }),
]);

export const AdminVariantCreate = z.object({
  sku: Sku,
  // { optionCode: valueCode } — exactly one value for every option group of the product.
  options: z.record(z.string(), z.string()),
  pricePaise: Paise.nullable().default(null),
  mrpPaise: Paise.nullable().default(null),
  taxRateBasisPoints: z.number().int().min(0).max(10000).nullable().default(null),
  hsnCode: z.string().regex(/^[0-9]{4,8}$/).nullable().default(null),
  packQuantity: z.number().int().min(1).max(100).default(1),
  maxOrderQuantity: z.number().int().min(1).max(999).default(10),
  weightGrams: z.number().int().min(1).max(100000).nullable().default(null),
  stock: StockSource.default({ mode: "own", tracked: true, lowStockThreshold: null }),
});
export type AdminVariantCreate = z.infer<typeof AdminVariantCreate>;

export const AdminVariantUpdate = z.object({
  pricePaise: Paise.nullable(),
  mrpPaise: Paise.nullable(),
  taxRateBasisPoints: z.number().int().min(0).max(10000).nullable(),
  hsnCode: z.string().regex(/^[0-9]{4,8}$/).nullable(),
  maxOrderQuantity: z.number().int().min(1).max(999),
  weightGrams: z.number().int().min(1).max(100000).nullable(),
  position: z.number().int().min(0),
  status: z.enum(["active", "archived"]),
}).partial();
export type AdminVariantUpdate = z.infer<typeof AdminVariantUpdate>;

export const PublishCheck = z.object({ code: z.string(), ok: z.boolean(), message: z.string() });

export const AdminVariant = z.object({
  sku: z.string(),
  options: z.record(z.string(), z.string()),
  status: z.enum(["active", "archived"]),
  pricePaise: z.number().int().nullable(),
  mrpPaise: z.number().int().nullable(),
  taxRateBasisPoints: z.number().int().nullable(),
  hsnCode: z.string().nullable(),
  packQuantity: z.number().int(),
  inventoryUnitsPerSale: z.number().int(),
  maxOrderQuantity: z.number().int(),
  weightGrams: z.number().int().nullable(),
  inventoryItemId: z.string(),
  stockMode: z.enum(["own", "shared"]),
  sellableQuantity: z.number().int().nullable(), // null when stock is not tracked
});

export const AdminProduct = z.object({
  id: z.string(),
  slug: z.string(),
  slugLocked: z.boolean(),
  title: z.string(),
  categorySlug: z.string(),
  status: PublishStatus,
  detail: z.string(),
  spec: z.string(),
  summary: z.string(),
  specifications: z.array(Specification),
  contentSections: z.array(ContentSection),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  position: z.number().int(),
  optionGroups: z.array(z.object({
    code: z.string(),
    label: z.string(),
    values: z.array(z.object({ code: z.string(), label: z.string(), swatch: z.string().nullable() })),
  })),
  variants: z.array(AdminVariant),
  media: z.array(z.object({
    id: z.string(),
    assetId: z.string().nullable(),
    url: z.string(),
    alt: z.string(),
    width: z.number(),
    height: z.number(),
    position: z.number(),
    optionValue: z.string().nullable(), // "optionCode:valueCode"
  })),
  publishChecklist: z.array(PublishCheck),
  isDemo: z.boolean(),
  updatedAt: z.string(),
});
export type AdminProduct = z.infer<typeof AdminProduct>;

export const AdminProductListQuery = z.object({
  status: PublishStatus.optional(),
  category: z.string().optional(),
  q: z.string().trim().min(1).max(100).optional(),
  missing: z.enum(["price", "images"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const AdminProductListItem = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  categorySlug: z.string(),
  status: PublishStatus,
  thumbnailUrl: z.string().nullable(),
  variantCount: z.number().int(),
  minPricePaise: z.number().int().nullable(),
  maxPricePaise: z.number().int().nullable(),
  missingPrice: z.boolean(),
  updatedAt: z.string(),
});

export const AdminProductListResponse = z.object({
  data: z.array(AdminProductListItem),
  totalCount: z.number().int(),
});

// ---- Inventory ----

export const InventoryReason = z.enum(["received", "count_correction", "damaged", "returned_restock", "other"]);

export const AdminInventoryAdjustment = z.object({
  // Which bucket changes: on_hand (physical count) or unavailable (damaged / QC hold).
  field: z.enum(["on_hand", "unavailable"]),
  delta: z.number().int().refine((value) => value !== 0, "Delta cannot be zero.").refine((value) => Math.abs(value) <= 100000),
  reason: InventoryReason,
  note: z.string().trim().max(500).nullable().default(null),
}).refine((value) => value.reason !== "other" || (value.note?.length ?? 0) > 0, { path: ["note"], message: "A note is required when the reason is Other." });
export type AdminInventoryAdjustment = z.infer<typeof AdminInventoryAdjustment>;

export const AdminInventoryItem = z.object({
  id: z.string(),
  label: z.string(),
  tracked: z.boolean(),
  onHand: z.number().int(),
  committed: z.number().int(),
  unavailable: z.number().int(),
  available: z.number().int(),
  incoming: z.number().int(),
  lowStockThreshold: z.number().int().nullable(),
  skus: z.array(z.object({ sku: z.string(), productTitle: z.string(), inventoryUnitsPerSale: z.number().int() })),
});
export type AdminInventoryItem = z.infer<typeof AdminInventoryItem>;

export const AdminInventoryMovement = z.object({
  id: z.string(),
  reason: z.string(),
  onHandDelta: z.number().int(),
  committedDelta: z.number().int(),
  unavailableDelta: z.number().int(),
  note: z.string().nullable(),
  actorName: z.string().nullable(),
  createdAt: z.string(),
});

// ---- Timeline ----

export const AuditEvent = z.object({
  id: z.string(),
  action: z.string(),
  actorName: z.string().nullable(),
  comment: z.string().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  createdAt: z.string(),
});

export const AuditCommentCreate = z.object({ comment: z.string().trim().min(1).max(2000) });

// ---- Media library ----

export const MediaAsset = z.object({
  id: z.string(),
  url: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  bytes: z.number().int(),
  originalFilename: z.string(),
  alt: z.string(),
  createdAt: z.string(),
  // Where the file is used; deleting is blocked while this is non-empty.
  usedBy: z.array(z.object({ type: z.enum(["product", "collection", "hero_slide"]), id: z.string(), title: z.string() })),
});
export type MediaAsset = z.infer<typeof MediaAsset>;

export const MediaAssetUpdate = z.object({ alt: z.string().trim().max(250) });

export const MediaListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  unused: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(48),
  offset: z.coerce.number().int().min(0).default(0),
});

// Attach a library image to a product. `alt` falls back to the asset's alt text.
export const ProductMediaAttach = z.object({
  assetId: z.uuid(),
  alt: z.string().trim().max(250).optional(),
  // "optionCode:valueCode" to show only for that option value, or null for always.
  optionValue: z.string().regex(/^[a-z0-9_-]+:[a-z0-9_-]+$/).nullable().default(null),
});

export const ProductMediaUpdate = z.object({
  alt: z.string().trim().max(250),
  optionValue: z.string().regex(/^[a-z0-9_-]+:[a-z0-9_-]+$/).nullable(),
}).partial();

export const ProductMediaOrder = z.object({ mediaIds: z.array(z.uuid()).min(1).max(100) });

// ---- Collections (manual product lists) ----

export const AdminCollectionCreate = z.object({
  title: z.string().trim().min(1).max(120),
  slug: Slug.optional(),
  description: z.string().trim().max(2000).default(""),
});

export const AdminCollectionUpdate = z.object({
  title: z.string().trim().min(1).max(120),
  slug: Slug,
  description: z.string().trim().max(2000),
  bannerAssetId: z.uuid().nullable(),
  bannerAlt: z.string().trim().max(250),
  position: z.number().int().min(0),
}).partial();

export const AdminCollectionProducts = z.object({ productIds: z.array(z.uuid()).max(500) });

export const AdminCollection = z.object({
  id: z.string(),
  slug: z.string(),
  slugLocked: z.boolean(),
  title: z.string(),
  description: z.string(),
  status: PublishStatus,
  banner: z.object({ assetId: z.string(), url: z.string(), width: z.number(), height: z.number(), alt: z.string() }).nullable(),
  position: z.number().int(),
  products: z.array(z.object({ id: z.string(), title: z.string(), slug: z.string(), status: PublishStatus, thumbnailUrl: z.string().nullable() })),
  publishChecklist: z.array(PublishCheck),
  updatedAt: z.string(),
});
export type AdminCollection = z.infer<typeof AdminCollection>;

// ---- Homepage campaigns (HOMEPAGE_CAMPAIGNS_SPEC, ADMIN_SCREENS_BRIEF §8) ----

// Internal pages a campaign may link to. Extend only with approved, existing storefront routes.
export const CAMPAIGN_PAGES = ["/shop", "/bulk"] as const;

export const CampaignTargetInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("product"), productId: z.uuid() }),
  z.object({ type: z.literal("collection"), collectionId: z.uuid() }),
  z.object({ type: z.literal("category"), categorySlug: z.string() }),
  z.object({ type: z.literal("page"), path: z.enum(CAMPAIGN_PAGES) }),
]);
export type CampaignTargetInput = z.infer<typeof CampaignTargetInput>;

// ISO 8601 with an explicit offset, e.g. "2026-10-01T09:00:00+05:30". null = no limit.
const DateTimeWithOffset = z.iso.datetime({ offset: true });

export const CampaignState = z.enum(["draft", "scheduled", "live", "expired", "archived"]);

export const CampaignTargetView = z.object({
  type: z.enum(["product", "collection", "category", "page"]),
  id: z.string().nullable(),
  label: z.string(),
  href: z.string(),
  // False when the target is unpublished or deleted: the slide is hidden from customers until fixed.
  available: z.boolean(),
}).nullable();

const DeviceImageView = z.object({ assetId: z.string(), url: z.string(), width: z.number(), height: z.number(), alt: z.string() }).nullable();

export const HeroSlideInput = z.object({
  internalTitle: z.string().trim().min(1).max(120),
  eyebrow: z.string().trim().max(40),
  headline: z.string().trim().max(90),
  description: z.string().trim().max(200),
  ctaLabel: z.string().trim().max(40),
  target: CampaignTargetInput.nullable(),
  desktopAssetId: z.uuid().nullable(),
  tabletAssetId: z.uuid().nullable(),
  mobileAssetId: z.uuid().nullable(),
  desktopAlt: z.string().trim().max(250),
  tabletAlt: z.string().trim().max(250),
  mobileAlt: z.string().trim().max(250),
  startsAt: DateTimeWithOffset.nullable(),
  endsAt: DateTimeWithOffset.nullable(),
}).partial();
export type HeroSlideInput = z.infer<typeof HeroSlideInput>;

export const HeroSlide = z.object({
  id: z.string(),
  internalTitle: z.string(),
  eyebrow: z.string(),
  headline: z.string(),
  description: z.string(),
  ctaLabel: z.string(),
  target: CampaignTargetView,
  images: z.object({ desktop: DeviceImageView, tablet: DeviceImageView, mobile: DeviceImageView }),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  status: PublishStatus,
  state: CampaignState,
  position: z.number().int(),
  publishChecklist: z.array(PublishCheck),
  isDemo: z.boolean(),
  updatedAt: z.string(),
});
export type HeroSlide = z.infer<typeof HeroSlide>;

export const RibbonMessageInput = z.object({
  text: z.string().trim().min(1).max(120),
  target: CampaignTargetInput.nullable(),
  startsAt: DateTimeWithOffset.nullable(),
  endsAt: DateTimeWithOffset.nullable(),
}).partial();
export type RibbonMessageInput = z.infer<typeof RibbonMessageInput>;

export const RibbonMessage = z.object({
  id: z.string(),
  text: z.string(),
  target: CampaignTargetView,
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  status: PublishStatus,
  state: CampaignState,
  position: z.number().int(),
  publishChecklist: z.array(PublishCheck),
  isDemo: z.boolean(),
  updatedAt: z.string(),
});
export type RibbonMessage = z.infer<typeof RibbonMessage>;

export const CampaignOrder = z.object({ ids: z.array(z.uuid()).min(1).max(100) });
