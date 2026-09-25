# Kleawip build — frontend / backend task split

Status: working handoff for review, 25 September 2026. This is a task list, not approval to launch commerce. **Codex owns the frontend; Claude Code owns the backend.** All work and new files stay inside `WEBSITE DATA/project`.

## Where we are today

The local `apps/storefront` is a responsive review preview. It has the Kleawip logo, home and collection pages, one reusable product-page template, search suggestions, a preview bag and wishlist, bulk enquiry and clients pages, light/dark modes, and mobile/tablet/desktop layouts. It does **not** have a production API, database, customer login, protected admin, real cart, checkout, payment, shipping, or orders. The Twisted Loop pack/size/colour choices and offer examples are **dummy UI**, not approved sellable variants. See `docs/phase-1/STOREFRONT_PREVIEW_STATUS.md` for the verified details.

### Progress log

- **25 September — Codex frontend preparation:** browser-local preview bag and wishlist now discard unknown/stale products and duplicate saved entries; bag quantities stay within the preview limit. Typecheck, 17 tests and production build pass. The current Twisted Loop page opens in the local browser; 320, 375, 768 and 1440 px viewport checks found no horizontal overflow. Frontend data needs for Claude Code are in `docs/phase-0/FRONTEND_DATA_HANDOFF.md`. This is a reliability fix and handoff, **not** completion of Milestone 0: client decisions and the shared API contract remain open. Physical iOS/Android checks remain for later release QA.
- **25 September — Claude Code backend:** API contract proposal is at `docs/api/API_CONTRACT.md`. Its §11 answers every question in `FRONTEND_DATA_HANDOFF.md`, and **Codex review is requested**. Backend scaffold is in `services/commerce-api` (Fastify + Postgres 16 + Drizzle), with shared Zod types in `packages/contract` and migrations and demo seed in `database/`. Implemented against demo fixtures only: `GET /health`, `GET /v1/store/categories`, `GET /v1/store/products`. Typecheck and 14 backend tests pass on a real Postgres test database. Nothing is purchasable (`priceStatus: pending`, `availability: not_for_sale`). `apps/storefront` was not modified. Coordination protocol: `docs/coordination/HANDOFF_LOG.md`. Milestone 0 is **not** complete; the contract and client decisions are still open.

## Ownership — avoid editing each other's work

| Owner | Builds | Primary area | Delivers to the other side |
| --- | --- | --- | --- |
| Codex (frontend) | Customer-facing screens and the future admin **interface**; responsive light/dark styling; accessibility; client-side interactions; loading, empty and error states; frontend tests | Existing `apps/storefront`; a separate admin frontend location only after structure is agreed | Screens that consume documented APIs, UI test results, and any data fields the interface needs |
| Claude Code (backend) | Database and migrations; server APIs; authentication/roles; pricing, offers and inventory rules; orders, payments, shipping, notifications and support workflows; backend tests | New backend-owned area agreed before scaffolding; **do not modify** `apps/storefront` | Versioned API contract, test fixtures, migration/seed instructions, and passing backend test results |
| Both, reviewed together | API contract, data definitions, acceptance criteria and integration tests | This task list plus a dedicated contract file when agreed | Written approval before breaking fields, routes or business rules change |

Claude may describe an admin API and Codex may build its UI, but an attractive admin screen alone is not an operating admin system. Do not expose admin actions until the backend enforces authentication, roles, validation and audit history. Neither side should put secrets, customer data, or API keys in the repository or Graphify.

## Rules for both builders

- [ ] Read `AGENTS.md` (and Claude Code also `CLAUDE.md`), `IMPLEMENTATION_PLAN.md`, the Phase 0 client checklist, and the current preview status before changing the project. For a new screen, follow `docs/design/STITCH_MCP_FOR_KLEAWIP.md`: first-pass Stitch design, review, then local build.
- [ ] Treat the client-approved catalogue and policy documents as the source of truth. Never turn dummy packs, prices, discounts, ratings, delivery promises or client logos into live claims.
- [ ] Finish and test one milestone before beginning the next. Record the result and remaining issues; a visual demo is not a passed backend workflow.
- [ ] Keep demo fixtures visibly separate from production data. Use test payments and test orders only until launch approval.
- [ ] Agree any shared-file change before editing it. If an API field changes, update the contract and both sides' tests in the same milestone.

## Milestone 0 — decisions and contract (first, before real commerce)

**Client / project owner**

- [ ] Approve product SKUs and valid pack, size, GSM and colour combinations; selling price, MRP, tax and stock source.
- [ ] Decide login method, payment/COD rules, shipping provider and serviceability rules, returns/refunds, bulk-purchase flow, and permission to display named clients/logos.
- [ ] Approve final copy, claims, offer rules and owned imagery. Until then, keep neutral preview copy.

**Claude Code (backend lead for contract)**

- [ ] Propose the backend folder structure and an API contract before implementing endpoints. Include request/response examples, field types, validation, authentication/roles, error format, pagination and version/change process.
- [ ] Define stable IDs for products and **purchasable SKUs**. Distinguish product, variant, inventory, price, offer and campaign data; document how pack quantity affects stock.
- [ ] Define safe server-side handling for cart totals, tax, discounts, stock checks and eventual order creation. No price or discount may be trusted from the browser.

**Codex (frontend)**

- [ ] Review the contract against home, search, collection, product page, bag, checkout and admin screen needs; list missing fields before backend code begins.
- [ ] Keep the current preview working while replacing local fixtures incrementally. Do not build screens against undocumented response shapes.

**Gate:** both builders and the project owner approve the relevant business decisions and contract. Anything unresolved remains clearly marked “not live”.

## Milestone 1 — real catalogue and campaigns

**Claude Code**

- [ ] Build database migrations and validated import/seed tooling for approved categories, products, media, SKUs, prices and stock.
- [ ] Provide read APIs for published collections/products/variants/search and protected write APIs for product and inventory administration.
- [ ] Provide protected banner, per-device image, click-target, featured-product and announcement-ribbon publishing APIs, including draft/publish controls.
- [ ] Test invalid combinations, duplicate SKUs, unpublished items, missing images, stock changes, permissions and audit records.

**Codex**

- [ ] Connect home, search suggestions/results, listings and the product template to those APIs; show loading, empty, unavailable and error states.
- [ ] Build the admin catalogue, media and campaign interfaces from reviewed screen designs. Desktop/tablet/mobile banner assets and ribbon text must be editable there, not hard-coded in production.
- [ ] Make product option selection update the correct image, price, availability and SKU; keep gallery controls subtle and responsive.
- [ ] Test 320/375 px phones, tablet and desktop in both themes, keyboard use and screen-reader labels. Check actual Safari/iOS and Chrome/Android before release.

**Gate:** approved products and campaigns can be published through protected admin actions and appear correctly on the storefront; invalid or missing data never becomes a false claim.

## Milestone 2 — identity, bag and checkout foundation

**Claude Code**

- [ ] Implement the approved customer sign-in/session method, address book and per-customer authorization.
- [ ] Implement a persistent cart keyed by exact SKU and quantity, with server-side availability, tax, shipping and offer calculation.
- [ ] After the client selects providers and policies, implement checkout, payment/webhook handling, order state, shipping/serviceability, notifications and refund rules. Make payment/order callbacks safe to retry.
- [ ] Test cross-account access, expired sessions, simultaneous stock changes, failed/duplicate payments and failed provider responses.

**Codex**

- [ ] Connect the existing bag and account UI to real session/cart APIs; preserve selected SKU through sign-in and handle changed stock or price honestly.
- [ ] Build reviewed checkout, payment-status, confirmation, order-history, tracking and support-entry screens only as the corresponding backend flows become testable.
- [ ] Keep Add to Cart and Buy Now visible and usable on mobile without covering validation or navigation. Sound remains optional and user-triggered.
- [ ] Test complete happy paths and failure/retry paths at phone, tablet and desktop sizes.

**Gate:** a test customer can place a test order with the exact approved SKU and correct server total; failed payment does not create a false success or duplicate order.

## Milestone 3 — operations and launch readiness

**Claude Code**

- [ ] Implement role-secured order, fulfilment, label/print-data, refunds, support-ticket and reporting APIs, each with validation and audit trails.
- [ ] Implement backups, restore rehearsal, logs/monitoring and environment separation. Carrier label size/barcode/QR requirements must be verified against the selected provider's actual specification.

**Codex**

- [ ] Build admin screens for order handling, fulfilment/labels, returns/refunds, support and basic reports from reviewed flows. Show role-denied, empty and error states.
- [ ] Run end-to-end UI checks for product publishing, campaign editing, order fulfilment and refunds using backend test data.

**Gate:** client operator completes the workflows in staging; accessibility/responsive checks, automated tests, security checks, backup/restore and release rollback are documented. Production requires separate approval.

## Handoff checklist for every milestone

1. Claude supplies the contract change, test fixtures, backend run command and passing backend tests.
2. Codex connects the UI, runs frontend typecheck/tests/build and checks responsive and keyboard behaviour.
3. Both run one integrated workflow against the same test environment and record failures.
4. The project owner reviews the visible result and explicitly approves moving to the next milestone.

**Immediate next action:** close the blocking Phase 0 choices and agree the first catalogue/campaign API contract. Do not implement production pack pricing, checkout or shipping from the current demo examples.
