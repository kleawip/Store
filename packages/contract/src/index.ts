// Shared API contract for docs/api/API_CONTRACT.md (v1, Proposed).
// SHARED FILE: frontend (Codex) and backend (Claude Code) both depend on it.
// Change only through the contract change process (API_CONTRACT.md §9).
import { z } from "zod";

// §2 Money: integer paise, never floats.
export const Money = z.object({
  amount: z.number().int().nonnegative(),
  currency: z.literal("INR"),
});
export type Money = z.infer<typeof Money>;

export const PriceStatus = z.enum(["approved", "pending"]);
export const Availability = z.enum(["in_stock", "low_stock", "out_of_stock", "not_for_sale"]);

// §2 Errors: RFC 9457 problem+json with a stable machine code (§8).
export const ErrorCode = z.enum([
  "VALIDATION_FAILED",
  "NOT_FOUND",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "RATE_LIMITED",
  "IDEMPOTENCY_CONFLICT",
  "PUBLISH_BLOCKED",
  "SKU_UNAVAILABLE",
  "QUANTITY_EXCEEDS_STOCK",
  "QUANTITY_EXCEEDS_MAX",
  "PRICE_PENDING",
  "INVALID_OPTION_COMBINATION",
  "INTERNAL_ERROR",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const Problem = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: ErrorCode,
  detail: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), code: z.string(), message: z.string() })).optional(),
  requestId: z.string(),
});
export type Problem = z.infer<typeof Problem>;

export const Page = z.object({ nextCursor: z.string().nullable() });

export const Image = z.object({
  url: z.string(),
  alt: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type Image = z.infer<typeof Image>;

// §4 GET /v1/store/categories
export const Category = z.object({
  slug: z.string(),
  title: z.string(),
  note: z.string(),
  tone: z.string(),
  productCount: z.number().int().nonnegative(),
});
export type Category = z.infer<typeof Category>;
export const CategoryListResponse = z.object({ data: z.array(Category) });

// §4 GET /v1/store/products
export const ProductListItem = z.object({
  slug: z.string(),
  title: z.string(),
  detail: z.string(),
  category: z.string(),
  spec: z.string(),
  images: z.array(Image),
  priceFrom: Money.nullable(),
  priceStatus: PriceStatus,
  availability: Availability,
  isDemo: z.boolean(),
});
export type ProductListItem = z.infer<typeof ProductListItem>;
export const ProductListResponse = z.object({ data: z.array(ProductListItem), page: Page });

export const ProductListQuery = z.object({
  category: z.string().optional(),
  q: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(["featured", "newest", "price_asc", "price_desc"]).default("featured"),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  cursor: z.string().optional(),
});
export type ProductListQuery = z.infer<typeof ProductListQuery>;

// §4 GET /v1/store/products/{slug}
export const OptionValue = z.object({
  code: z.string(),
  label: z.string(),
  swatch: z.string().optional(),
});

export const OptionGroup = z.object({
  code: z.string(),
  label: z.string(),
  values: z.array(OptionValue),
});

export const ProductImage = Image.extend({
  id: z.string(),
  // The option value this image belongs to, as "optionCode:valueCode", or null when it always shows.
  optionValue: z.string().nullable(),
});

export const Variant = z.object({
  sku: z.string(),
  options: z.record(z.string(), z.string()),
  packQuantity: z.number().int().positive(),
  price: Money.nullable(),
  mrp: Money.nullable(),
  unitPrice: Money.nullable(),
  priceStatus: PriceStatus,
  availability: Availability,
  // Present only when availability is "low_stock".
  stockLeft: z.number().int().nonnegative().optional(),
  maxOrderQuantity: z.number().int().nonnegative(),
  imageIds: z.array(z.string()),
});
export type Variant = z.infer<typeof Variant>;

export const ProductDetail = z.object({
  slug: z.string(),
  title: z.string(),
  category: z.object({ slug: z.string(), title: z.string() }),
  detail: z.string(),
  spec: z.string(),
  summary: z.string(),
  images: z.array(ProductImage),
  optionGroups: z.array(OptionGroup),
  variants: z.array(Variant),
  defaultSku: z.string().nullable(),
  priceFrom: Money.nullable(),
  priceStatus: PriceStatus,
  availability: Availability,
  specifications: z.array(z.object({ label: z.string(), value: z.string() })),
  contentSections: z.array(z.object({ code: z.string(), title: z.string(), bodyHtml: z.string() })),
  related: z.array(z.string()),
  isDemo: z.boolean(),
});
export type ProductDetail = z.infer<typeof ProductDetail>;
