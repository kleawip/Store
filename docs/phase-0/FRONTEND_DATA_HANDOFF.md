# Frontend data handoff for Claude Code

Status: Codex frontend requirements, 25 September 2026. **This is not an API contract or approval of product data.** Claude Code should propose the actual routes and response shapes; Codex will review them before either side wires up live commerce. Read `FRONTEND_BACKEND_TASKS.md` and `docs/design/PRODUCT_PAGE_ADMIN_MAPPING_SPEC.md` first.

## Existing preview sources to replace gradually

| Current local source | What it drives | Live data needed |
| --- | --- | --- |
| `apps/storefront/src/data/catalogue.json` and `products.ts` | Home products, listings, PDP, search, related items | Published categories/products with stable IDs, valid variants, ordered images, approved copy and availability |
| `apps/storefront/src/data/home-campaigns.ts` | Device-specific hero slides and announcement ribbon | Protected draft/publish campaign records with desktop/tablet/mobile images, alt text, dates, priority, target product/collection/page and active state |
| `apps/storefront/src/lib/search.ts` | Local suggestions and results for ten products | Search across published products/categories, ranking, limited suggestions, paged results and an honest empty state |
| `apps/storefront/src/components/store-provider.tsx` | Browser-local preview bag/wishlist/theme/sound | Customer-bound bag and wishlist after approved login; theme and sound can remain local preferences |
| Twisted Loop sample selectors | Visual review of pack, size and colour controls | Only approved option groups, valid SKU combinations and SKU-specific image/price/stock; never use current dummy values as seed data |

## Data the frontend must be able to display

### Product discovery

- Product ID/slug, title, category/collection, short approved summary, ordered images with alt text, technical attributes and publish status.
- Listing image, optional approved badge, filter values, sort options, result count and pagination/cursor if needed.
- Search suggestion kind (product or category), label, image where relevant, safe destination and no-result feedback.
- Only published, customer-visible products should appear in public responses. The admin needs drafts and validation errors separately.

### Product detail and selection

- Option groups and **valid combinations**, each mapping to one stable sellable SKU; never infer a SKU by joining free-text option labels.
- Selected SKU's current price, MRP/compare-at price when approved, tax presentation, availability, orderable quantity and image association.
- Approved specifications, care/FAQ/return-policy references, genuine review summary only when reviews exist, and related-product links.
- Pincode serviceability, COD eligibility, delivery charge and ETA only after provider/rules are selected and tested. Return a clear unavailable/unknown state otherwise.
- Applicable offers for the selected SKU/cart, with eligibility and actual discount calculated by the server. A campaign banner is not proof that a discount is active.

### Bag, identity and orders

- Bag line uses exact SKU and quantity, not just base product ID; response includes any changed price, out-of-stock or unavailable-line warning.
- Server-calculated subtotal, tax, discount, shipping and total with currency, plus explicit reasons when a coupon or offer fails.
- Customer session state and safe return path after sign-in; address list and validation; order/payment state that distinguishes pending, successful and failed.
- Order confirmation, tracking and refund status must come from the backend, not optimistic browser text.

### Protected admin interface

- Product draft and publish validation, media ordering, SKU/price/stock editor, audit history and role-dependent controls.
- Campaign and ribbon drafts/previews, per-device crop/image, target validation, schedule and publish state.
- Order/fulfilment/refund/support lists with status, filters, detail and permission-denied states; label printing only after carrier specifications are confirmed.

## Contract questions Claude Code should answer before implementation

1. What are the canonical ID and URL/slug rules for products, categories, variants and campaigns?
2. Which values are nullable/unknown, and what exact error is returned for unavailable price, stock, shipping or an invalid option combination?
3. How are authenticated customer requests and protected admin requests distinguished? Which roles may draft, publish, refund or edit stock?
4. How are media URLs delivered, ordered, cached and invalidated after an admin edit?
5. What are the pagination, search-ranking and filter semantics? How do we avoid exposing drafts in search?
6. How will the server prevent duplicate cart/order/payment actions and handle a price or stock change between PDP and checkout?
7. Which provider and policy decisions are still blocked by the client? Mark those fields unimplemented; do not invent defaults.

## First integration test gate

With approved **test fixtures**, verify one category listing, one product with at least two **real approved** SKUs, one unavailable SKU, a search match and no-match, one scheduled/draft campaign versus a published one, and a bag line whose stock changed. For each, check loading, success and failure UI at phone/tablet/desktop widths in light and dark mode. No checkout or admin publishing gate passes until backend authorization and validation tests also pass.
