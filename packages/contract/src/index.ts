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
