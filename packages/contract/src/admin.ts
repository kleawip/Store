// Admin API schemas (API_CONTRACT §5, ADMIN_SCREENS_BRIEF). Kleawip staff only.
// SHARED FILE: frontend (Codex) and backend (Claude Code). Change via the contract change process.
import { z } from "zod";
import { Order, OrderTracking, ReturnReason, ReturnRequest, ReturnStatus, ShipmentStatus, StateCodeSchema } from "./customer";

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

// ---- Catalogue CSV import ----

export const IMPORT_COLUMNS = [
  "product_slug", "product_title", "category", "detail", "spec", "summary",
  "option1_name", "option1_value", "option2_name", "option2_value", "option3_name", "option3_value",
  "sku", "price_inr", "mrp_inr", "gst_percent", "hsn", "pack_quantity", "stock_source", "opening_stock",
  "max_order_quantity", "weight_grams",
] as const;

export const ImportIssue = z.object({
  row: z.number().int().nullable(), // spreadsheet row number (header = 1); null for file-level issues
  column: z.string().nullable(),
  code: z.string(),
  message: z.string(),
});

export const ImportReport = z.object({
  importId: z.string().nullable(), // null when the file could not be read at all
  filename: z.string(),
  status: z.enum(["validated", "committed", "failed"]),
  rowCount: z.number().int(),
  summary: z.object({
    productsCreated: z.number().int(),
    productsUpdated: z.number().int(),
    variantsCreated: z.number().int(),
    variantsUpdated: z.number().int(),
  }),
  errors: z.array(ImportIssue),
  warnings: z.array(ImportIssue),
  canCommit: z.boolean(),
  createdAt: z.string(),
  committedAt: z.string().nullable(),
});
export type ImportReport = z.infer<typeof ImportReport>;

// ---- Staff management (Settings → Staff; owner only) ----

export const PASSWORD_MIN_LENGTH = 12;
const NewPassword = z.string().min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`).max(256);

export const StaffMember = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: StaffRole,
  status: z.enum(["invited", "active", "disabled"]),
  lockedUntil: z.string().nullable(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});
export type StaffMember = z.infer<typeof StaffMember>;

export const StaffInvite = z.object({ email: z.email().max(254), name: z.string().trim().min(1).max(80), role: StaffRole });

export const StaffUpdate = z.object({
  name: z.string().trim().min(1).max(80),
  role: StaffRole,
  status: z.enum(["active", "disabled"]),
}).partial();

// Returned once when inviting or resetting. The link is the only way to set the password; share it privately.
export const StaffSetupLink = z.object({
  staff: StaffMember,
  setupToken: z.string(),
  setupPath: z.string(), // e.g. "/setup?token=…" on the admin app
  expiresAt: z.string(),
});

export const StaffSetupRequest = z.object({ token: z.string().min(20).max(200), password: NewPassword });
export const PasswordChange = z.object({ currentPassword: z.string().min(1).max(256), newPassword: NewPassword });

export const ActivityQuery = z.object({
  entityType: z.enum(["product", "inventory_item", "collection", "hero_slide", "ribbon_message", "staff", "order"]).optional(),
  actorId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.iso.datetime({ offset: true }).optional(),
});

export const ActivityEvent = z.object({
  id: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  action: z.string(),
  actorName: z.string().nullable(),
  comment: z.string().nullable(),
  createdAt: z.string(),
});

// ---- Dashboard (Overview, Milestone 1: work queues only; no order or revenue numbers yet) ----

export const DashboardResponse = z.object({
  products: z.object({ draft: z.number().int(), published: z.number().int(), archived: z.number().int() }),
  attention: z.object({ productsMissingPrice: z.number().int(), productsMissingImages: z.number().int() }),
  stock: z.object({ lowStockItems: z.number().int(), outOfStockItems: z.number().int() }),
  orders: z.object({ confirmedToday: z.number().int(), awaitingPayment: z.number().int(), needsAttention: z.number().int() }),
  campaignSchedule: z.array(z.object({
    id: z.string(),
    kind: z.enum(["hero_slide", "ribbon_message"]),
    title: z.string(),
    event: z.enum(["starts", "ends"]),
    at: z.string(),
  })),
  recentActivity: z.array(ActivityEvent),
});
export type DashboardResponse = z.infer<typeof DashboardResponse>;

// ---- Product videos ----

export const VideoAsset = z.object({
  id: z.string(),
  url: z.string(),
  mimeType: z.string(),
  bytes: z.number().int(),
  originalFilename: z.string(),
  createdAt: z.string(),
  usedBy: z.array(z.object({ productId: z.string(), productTitle: z.string() })),
});

export const ProductVideoInput = z.object({
  sourceType: z.enum(["upload", "instagram"]),
  playback: z.enum(["hosted", "embed"]).default("hosted"),
  videoAssetId: z.uuid().nullable().default(null),
  posterAssetId: z.uuid().nullable().default(null),
  instagramUrl: z.string().max(300).nullable().default(null),
  caption: z.string().trim().max(300).default(""),
  // Staff confirm an Instagram post is Kleawip's own content; recorded with who and when.
  rightsConfirmed: z.boolean().default(false),
});

export const ProductVideoUpdate = z.object({
  playback: z.enum(["hosted", "embed"]),
  videoAssetId: z.uuid().nullable(),
  posterAssetId: z.uuid().nullable(),
  instagramUrl: z.string().max(300).nullable(),
  caption: z.string().trim().max(300),
  rightsConfirmed: z.boolean(),
}).partial();

export const AdminProductVideo = z.object({
  id: z.string(),
  sourceType: z.enum(["upload", "instagram"]),
  playback: z.enum(["hosted", "embed"]),
  video: z.object({ id: z.string(), url: z.string(), mimeType: z.string() }).nullable(),
  poster: z.object({ id: z.string(), url: z.string(), width: z.number(), height: z.number() }).nullable(),
  instagramUrl: z.string().nullable(),
  caption: z.string(),
  rightsConfirmed: z.object({ at: z.string(), byName: z.string().nullable() }).nullable(),
  status: PublishStatus,
  position: z.number().int(),
  publishChecklist: z.array(PublishCheck),
});
export type AdminProductVideo = z.infer<typeof AdminProductVideo>;

// ---- Orders (staff, read-only in Milestone 2; fulfilment and refunds arrive in Milestone 3) ----

const AdminMoney = z.object({ amount: z.number().int(), currency: z.literal("INR") });

export const AdminOrderListQuery = z.object({
  status: z.enum(["pending_payment", "confirmed", "expired", "cancelled"]).optional(),
  needsAttention: z.enum(["true"]).optional(),
  q: z.string().trim().min(1).max(40).optional(), // order number or customer phone
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const AdminOrderListItem = z.object({
  id: z.string(),
  number: z.string(),
  status: z.enum(["pending_payment", "confirmed", "expired", "cancelled"]),
  paymentMethod: z.enum(["prepaid", "partial_cod"]),
  paymentStatus: z.enum(["awaiting", "paid", "failed"]),
  total: AdminMoney,
  payNow: AdminMoney,
  codBalance: AdminMoney,
  customer: z.object({ id: z.string(), name: z.string(), phone: z.string() }),
  itemCount: z.number().int(),
  placedAt: z.string(),
  needsAttention: z.string().nullable(),
});

export const AdminOrderPayment = z.object({
  provider: z.string(),
  purpose: z.enum(["full", "deposit"]),
  providerOrderId: z.string(),
  providerPaymentId: z.string().nullable(),
  amount: AdminMoney,
  status: z.enum(["created", "captured", "failed"]),
  failureReason: z.string().nullable(),
  createdAt: z.string(),
  capturedAt: z.string().nullable(),
});

export const AdminRefund = z.object({
  id: z.string(),
  method: z.enum(["gateway", "manual"]),
  amount: AdminMoney,
  reason: z.string(),
  note: z.string().nullable(),
  status: z.enum(["pending", "processed", "failed"]),
  providerRefundId: z.string().nullable(),
  failureReason: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  processedAt: z.string().nullable(),
});

export const RefundCreate = z.object({
  amountPaise: z.number().int().positive(),
  // gateway = back to the original online payment (Razorpay); manual = cash already returned by staff (COD).
  method: z.enum(["gateway", "manual"]),
  reason: z.string().trim().min(3).max(300),
  note: z.string().trim().max(300).nullable().default(null),
});

export const OrderCancel = z.object({ reason: z.string().trim().min(3).max(300) });
export const FulfilmentStep = z.object({ fulfilmentStatus: z.enum(["unfulfilled", "processing", "packed"]) });
export const AttentionResolve = z.object({ note: z.string().trim().min(3).max(500) });

// ---- Milestone 3 step 2: shipments, tracking, GST invoices ----

export const ShipmentBook = z.object({
  // Parcel as packed. Weight defaults to the product weights; dimensions to the standard box.
  weightGrams: z.number().int().min(1).max(30_000).optional(),
  lengthCm: z.number().int().min(1).max(200).optional(),
  breadthCm: z.number().int().min(1).max(200).optional(),
  heightCm: z.number().int().min(1).max(200).optional(),
});

export const AdminShipment = z.object({
  id: z.string(),
  provider: z.string(),
  status: ShipmentStatus,
  awb: z.string().nullable(),
  courierName: z.string().nullable(),
  labelUrl: z.string().nullable(),
  trackingUrl: z.string().nullable(),
  weightGrams: z.number().int(),
  dimensionsCm: z.object({ length: z.number().int(), breadth: z.number().int(), height: z.number().int() }),
  // Why booking stopped half-way (retry with …/shipment/retry).
  lastError: z.string().nullable(),
  events: OrderTracking.shape.events,
  pickupRequestedAt: z.string().nullable(),
  shippedAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  createdAt: z.string(),
});

export const AdminInvoiceSummary = z.object({ number: z.string(), issuedAt: z.string(), status: z.enum(["issued", "cancelled"]) });

export const AdminOrderDetail = z.object({
  order: Order,
  customer: z.object({ id: z.string(), name: z.string(), phone: z.string(), email: z.string().nullable() }),
  payments: z.array(AdminOrderPayment),
  refunds: z.array(AdminRefund),
  cancelReason: z.string().nullable(),
  codCollected: AdminMoney,
  needsAttention: z.string().nullable(),
  shipments: z.array(AdminShipment),
  invoice: AdminInvoiceSummary.nullable(),
  returns: z.array(z.lazy(() => AdminReturn)),
  notifications: z.array(z.lazy(() => AdminNotification)),
});

const Gstin = z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Enter a valid 15-character GSTIN.");

/** Printed on every tax invoice. Owner only. */
export const SellerDetails = z.object({
  legalName: z.string().trim().min(2).max(120),
  tradeName: z.string().trim().max(120).default(""),
  gstin: Gstin,
  line1: z.string().trim().min(3).max(120),
  line2: z.string().trim().max(120).default(""),
  city: z.string().trim().min(2).max(60),
  stateCode: StateCodeSchema,
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/),
  email: z.string().trim().email().max(120).nullable().default(null),
  phone: z.string().trim().max(20).nullable().default(null),
});
export type SellerDetails = z.infer<typeof SellerDetails>;

// ---- Milestone 3 step 3: returns ----

export const AdminReturn = z.object({
  id: z.string(),
  number: z.string(),
  orderId: z.string(),
  orderNumber: z.string(),
  customer: z.object({ id: z.string(), name: z.string(), phone: z.string() }),
  source: z.enum(["customer", "staff", "rto"]),
  status: ReturnStatus,
  reason: ReturnReason,
  customerNote: z.string(),
  staffNote: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  lines: z.array(z.object({
    orderLineId: z.string(),
    sku: z.string(),
    productTitle: z.string(),
    optionsLabel: z.string(),
    quantity: z.number().int(),
    restockedQuantity: z.number().int().nullable(),
    // Value of the returned units at the price paid (GST-inclusive).
    value: AdminMoney,
  })),
  // Goods value of the returned units: the default refund. Shipping isn't included.
  suggestedRefund: AdminMoney,
  refundedTotal: AdminMoney,
  creditNote: z.object({ number: z.string(), issuedAt: z.string() }).nullable(),
  decidedBy: z.string().nullable(),
  decidedAt: z.string().nullable(),
  receivedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const AdminReturnListQuery = z.object({
  status: ReturnStatus.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Staff-recorded return (e.g. a parcel back from RTO, or a return agreed on the phone). Starts approved. */
export const StaffReturnCreate = z.object({
  lines: ReturnRequest.shape.lines,
  reason: ReturnReason,
  source: z.enum(["staff", "rto"]).default("staff"),
  note: z.string().trim().max(1000).default(""),
});
export const ReturnDecision = z.object({ note: z.string().trim().max(500).nullable().default(null) });
export const ReturnReject = z.object({ reason: z.string().trim().min(3).max(500) });
export const ReturnReceive = z.object({
  // Per SKU: how many returned units go back on the shelf. Omitted SKUs are restocked in full.
  lines: z.array(z.object({ sku: z.string(), restockQuantity: z.number().int().min(0) })).default([]),
  note: z.string().trim().max(500).nullable().default(null),
});
export const ReturnRefund = z.object({
  // Defaults to suggestedRefund.
  amountPaise: z.number().int().positive().optional(),
  method: z.enum(["gateway", "manual"]),
  note: z.string().trim().max(300).nullable().default(null),
});
export const ReturnClose = z.object({ note: z.string().trim().min(3).max(500) });

// ---- Milestone 3 step 4: customer notifications ----

export const NotificationStatus = z.enum(["pending", "sent", "failed", "skipped"]);
export const AdminNotification = z.object({
  id: z.string(),
  orderId: z.string().nullable(),
  event: z.string(),
  channel: z.enum(["whatsapp", "email"]),
  // Masked (last 4 digits / first letter of the email).
  recipient: z.string(),
  status: NotificationStatus,
  attempts: z.number().int(),
  lastError: z.string().nullable(),
  sentAt: z.string().nullable(),
  createdAt: z.string(),
});
export const AdminNotificationListQuery = z.object({
  status: NotificationStatus.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
