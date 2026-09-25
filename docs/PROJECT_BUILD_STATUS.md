# Kleawip project build status

Last verified: 24 September 2026. This is the source-of-truth progress ledger for Graphify. It describes **local work actually present in `WEBSITE DATA/project`**, not the full proposal or a live ecommerce launch. Do not treat a design, mock interaction or planned integration as production-ready.

## Phase position

| Phase | Current position | Evidence / gate |
| --- | --- | --- |
| 0 — requirements and ownership | In progress; not approved | `docs/phase-0/CLIENT_INPUTS_AND_ACCOUNT_OWNERSHIP_CHECKLIST.md` lists missing client catalogue, commercial rules, provider access, policies, roles and account ownership. |
| 1 — information architecture and UX | Partial local preview; not signed off | Storefront screens, real-brand imagery and selected Stitch-derived layouts are reviewable. Full checkout, support, admin and edge-state flows are not approved. |
| 2 — engineering foundation | Storefront-only local foundation; phase not started/closed | One Next.js storefront app exists. No client-owned Git repository, staging deployment, protected admin, API, database, CI or backup/restore rehearsal is present. |
| 3–12 — commerce, operations and launch | Not built | No live catalogue variants, authentication, checkout, payment, shipping, orders, inventory, notifications, support, analytics or production deployment. |

## Built locally and verified

- `apps/storefront` contains a responsive, mobile-first light/dark storefront preview with the real Kleawip logo, desktop navigation and a compact centered-logo mobile/tablet header adapted from the Car101 navigation pattern, footer, catalogue search, wishlist and bag surfaces.
- The preview has **25 customer-facing URLs**: home, shop-all, five category listings, ten product detail URLs from one reusable product template, search, cart, wishlist, sign-in, account overview, account order-history empty state, bulk enquiry and clients showcase. These are **not** 25 independently engineered templates or 25 completed commerce workflows.
- The catalogue currently includes ten base-product records and 30 optimized product photographs imported from the existing Kleawip site. Final purchasable SKU combinations, sizes, GSM, colours, packs, prices, tax and stock still require a signed client source.
- Product cards can switch photographs without opening the product. Their image controls use smaller, softly faded circular arrows centered on the image; the previous/next button is disabled at the first/last image. Subtle direct-select dots display in a moving four-image window so future larger galleries do not crowd the photo. Product detail galleries, catalogue filtering, a browser-local preview bag with quantity controls, and a browser-local wishlist support UX review. None creates a real order or customer account.
- Real logo and existing-site product/category images are stored under `apps/storefront/public/brand` and `public/products`. The homepage now has a full-width manual carousel with separate desktop/tablet/mobile image files, internal click targets, a rotating neutral announcement ribbon and clean featured products directly below. Campaign records are local fixtures, **not admin-managed live content**; final art-directed banners need client approval.
- Search now gives matching category and real-catalogue product suggestions as users type, with thumbnails, a view-all action, keyboard selection and no-match feedback. This is local ten-product catalogue search, not a server-indexed production search service.
- Build quality rechecked on 24 September 2026: `npm run typecheck` passed; `npm test` passed (5 files, 13 tests); `npm run build` passed. Browser checks verified 320 px phone, 900 px tablet and 1440 px desktop header placement, mobile/desktop `bath` suggestions, banner/link flow and no 320 px horizontal overflow. Product-card dots changed the image without navigation; the smaller controls were visually checked on mobile and desktop. The earlier dependency audit found 0 moderate-or-higher vulnerabilities; rerun before release.

## Designed or specified, but not built

- `docs/design/HOMEPAGE_CAMPAIGNS_SPEC.md` defines the requested image-led hero carousel, device artwork, click-through targets, featured product order, editable top ribbon and future protected admin campaign controls. Only the storefront preview from that specification is present; it is **not a functioning content-management system**.
- Google Stitch produced mobile, desktop and admin layout drafts referenced in that specification. Those drafts include generated images and unsupported text, so they are composition references only and require correction and user review before implementation. Never use their invented claims or imagery as Kleawip facts.
- Shipping labels and barcode/QR print behaviour are requirements, not a working printer workflow. Carrier-issued templates, exact paper sizes and scan fields remain subject to the selected provider's samples and approval.
- The larger proposed page/view totals in the commercial scope are planning inventory, not completed screens. Do not use those totals as a development-complete metric.

## Next controlled increment

1. Review the centered mobile/tablet header, search dropdown and revised homepage on the local preview; record any visual changes before proceeding.
2. Obtain final Kleawip-owned banner artwork/crops and verified link targets for each device. Keep neutral copy until the client approves commercial claims.
3. Complete remaining interaction checks (dark mode, carousel keyboard operation, reduced motion and product-card image switching) and record a Phase 1 review decision.
4. Design and approve a protected Homepage Campaigns admin flow separately. Do not expose an unauthenticated “admin” editor or call local mock data live publishing.
5. Close the relevant Phase 0 business and provider decisions before production commerce modules proceed. Every phase needs its own evidence and explicit pass decision per `IMPLEMENTATION_PLAN.md`.

## Safety and ownership

All local website work stays under `WEBSITE DATA/project`. No Stitch key, provider credential, customer data, KYC record or recovery secret belongs in this ledger or Graphify. The client-owned GitHub/Vercel/Railway and provider accounts remain future setup tasks, not completed integrations.
