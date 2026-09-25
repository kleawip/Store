# Graph Report - project  (2026-09-25)

## Corpus Check
- 238 files · ~426,000 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 4, .css 2, .example 1)

## Summary
- 1703 nodes · 3931 edges · 108 communities (83 shown, 25 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 79 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9e6adab3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- build_feature_expansion_addendum.py
- Phase 0 Client Inputs and Account Ownership Checklist
- Kleawip Ecommerce Platform Implementation Plan
- Kleawip Feature Expansion Brainstorm
- Kleawip product page ↔ admin mapping (review draft)
- ref_next
- Google Stitch for Kleawip — read before design work
- storefront/package.json
- Q: How should Kleawip analytics SEO AEO GEO and pixel services be scoped?
- Q: Which owner identity should Kleawip use for GitHub Vercel Railway and future Google services?
- Q: What changed in Kleawip Phase 0 scope and page counts?
- Q: What is the Kleawip Google Stitch design workflow?
- Kleawip shipping labels and print centre
- store-provider.tsx
- compilerOptions
- Homepage campaigns — design review specification
- Storefront preview status — 25 September 2026
- next-env.d.ts
- Kleawip storefront preview
- Kleawip project build status
- search.ts
- profile.ts
- Generated storefront hero assets — demo review
- Database
- Kleawip build — frontend / backend task split
- commerce-api/package.json
- contract/package.json
- scripts
- compilerOptions
- compilerOptions
- Data the frontend must be able to display
- Log (newest last)
- Kleawip commerce API
- Kleawip commerce API contract — v1 proposal
- admin-catalogue.ts
- product-card.tsx
- products.ts
- home-campaigns.ts
- 3. Workflow details observed
- layout.tsx
- Kleawip admin: screen brief for Stitch (Milestone 1)
- app.ts
- scripts
- dependencies
- devDependencies
- cart/service.ts
- products/[id]/page.tsx
- campaigns/service.ts
- catalogue-import.ts
- orders/service.ts
- ApiError
- store-account.ts
- admin/package.json
- auth.ts
- helpers.ts
- customer.ts
- videos.ts
- customers/guard.ts
- priceFrom
- admin-media-collections.ts
- admin-staff.ts
- schema.ts
- drizzle-orm
- index.ts
- collections.ts
- quote.ts
- store-catalogue.ts
- Codex ↔ Claude Code handoff log
- compilerOptions
- queries.ts
- media/service.ts
- mail.mjs
- staff/service.ts
- tax.ts
- 4. Storefront endpoints — Milestone 1 (catalogue and campaigns)
- server.ts
- ADR 0002: Phase 0 commerce decisions (26 September 2026)
- client.ts
- twisted-loop-detail.tsx
- provider.ts
- LocalDiskStorage
- admin/src/app/layout.tsx
- 2026-09-25T10-40-08-600Z_claude-to-codex_handoff-while-you-were-paused-your-next-.md
- rehearse-restore.sh
- _pg.sh
- media/README.md
- SOURCES.md
- backup.sh
- restore.sh

## God Nodes (most connected - your core abstractions)
1. `ApiError` - 64 edges
2. `recordAudit()` - 49 edges
3. `drizzle-orm` - 44 edges
4. `Database` - 39 edges
5. `notFound()` - 39 edges
6. `adminMediaCollectionRoutes()` - 31 edges
7. `products` - 25 edges
8. `buildApp()` - 23 edges
9. `createTestApp()` - 22 edges
10. `5.1 Implemented admin API (25 Sep 2026)` - 22 edges

## Surprising Connections (you probably didn't know these)
- `5.3 Product videos (implemented 26 Sep 2026, at Codex's request)` --references--> `AdminProductVideo`  [INFERRED]
  docs/api/API_CONTRACT.md → packages/contract/src/admin.ts
- `2026-09-25 (night): Claude Code` --references--> `MediaStorage`  [INFERRED]
  docs/coordination/HANDOFF_LOG.md → services/commerce-api/src/media/storage.ts
- `R3: Production image storage: **Cloudflare R2**` --references--> `MediaStorage`  [INFERRED]
  docs/decisions/0002-phase0-commerce-decisions.md → services/commerce-api/src/media/storage.ts
- `R1: Customer sign-in: **WhatsApp OTP first, email OTP as fallback; SMS later**` --references--> `OtpSender`  [INFERRED]
  docs/decisions/0002-phase0-commerce-decisions.md → services/commerce-api/src/messaging/otp-senders.ts
- `7. Mapping from the current storefront fixtures` --references--> `Product`  [INFERRED]
  docs/api/API_CONTRACT.md → apps/storefront/src/data/products.ts

## Import Cycles
- None detected.

## Communities (108 total, 25 thin omitted)

### Community 0 - "build_feature_expansion_addendum.py"
Cohesion: 0.16
Nodes (31): docx, docx_enum_section, docx_enum_table, docx_enum_text, docx_oxml, docx_oxml_ns, docx_shared, pathlib (+23 more)

### Community 1 - "Phase 0 Client Inputs and Account Ownership Checklist"
Cohesion: 0.08
Nodes (25): 10. Bulk purchase and client showcase content, 11. Policies and operational decisions, 12. Access handling rules, 13. Phase 0 account exit gate, 14. Official references, 1. Phase 0 objective, 2. Recommended client identity, 3. Ownership model (+17 more)

### Community 2 - "Kleawip Ecommerce Platform Implementation Plan"
Cohesion: 0.05
Nodes (41): 10. Defect severity and phase movement, 11. Definition of done for each feature, 12. Graphify operating procedure, 13. Phase review record, 14. Immediate review decisions, 1. Delivery principles, 2. Confirmed project constraints, 3. Decisions that must be verified before related development (+33 more)

### Community 3 - "Kleawip Feature Expansion Brainstorm"
Cohesion: 0.06
Nodes (30): 1. Commercial position, 2. Gap audit: what is already included and what can genuinely be added, 3. Recommended website-development addendum, 4. Suggested scope tiers, 5. Separate Search, Analytics and AI Visibility proposal, 6. Recommended commercial structure, 7. Proposal wording strategy, 8. Decisions required before the client addendum is produced (+22 more)

### Community 4 - "Kleawip product page ↔ admin mapping (review draft)"
Cohesion: 0.29
Nodes (6): Admin field mapping, Customer product-page order, Design-review caution, Interaction checks before implementation acceptance, Kleawip product page ↔ admin mapping (review draft), Publish gate

### Community 5 - "ref_next"
Cohesion: 0.10
Nodes (10): nextConfig, nextConfig, metadata, metadata, SignInPage(), HomeHeroCarousel(), SearchOverlay(), ref_lucide_react (+2 more)

### Community 6 - "Google Stitch for Kleawip — read before design work"
Cohesion: 0.29
Nodes (6): Connect Stitch to Codex, Google Stitch for Kleawip — read before design work, If Stitch is not connected, Important content checks, Screen-design sequence, What we are doing

### Community 7 - "storefront/package.json"
Cohesion: 0.06
Nodes (32): dependencies, lucide-react, next, react, react-dom, devDependencies, sharp, @types/node (+24 more)

### Community 8 - "Q: How should Kleawip analytics SEO AEO GEO and pixel services be scoped?"
Cohesion: 0.50
Nodes (3): Answer, Outcome, Q: How should Kleawip analytics SEO AEO GEO and pixel services be scoped?

### Community 9 - "Q: Which owner identity should Kleawip use for GitHub Vercel Railway and future Google services?"
Cohesion: 0.50
Nodes (3): Answer, Outcome, Q: Which owner identity should Kleawip use for GitHub Vercel Railway and future Google services?

### Community 10 - "Q: What changed in Kleawip Phase 0 scope and page counts?"
Cohesion: 0.50
Nodes (3): Answer, Outcome, Q: What changed in Kleawip Phase 0 scope and page counts?

### Community 11 - "Q: What is the Kleawip Google Stitch design workflow?"
Cohesion: 0.50
Nodes (3): Answer, Outcome, Q: What is the Kleawip Google Stitch design workflow?

### Community 12 - "Kleawip shipping labels and print centre"
Cohesion: 0.40
Nodes (4): Caution, Decision to carry into design and implementation, Evidence / vendor references checked 2026-09-24, Kleawip shipping labels and print centre

### Community 13 - "store-provider.tsx"
Cohesion: 0.23
Nodes (11): knownProductIds, StoreContext, StoreProvider(), StoreState, Theme, addLine(), BagLine, changeQuantity() (+3 more)

### Community 14 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 15 - "Homepage campaigns — design review specification"
Cohesion: 0.20
Nodes (9): Acceptance checks before release, Announcement ribbon, Hero banners, Homepage campaigns — design review specification, Protected admin: Homepage Campaigns, Reference and Kleawip adaptation, Still awaiting approval, Storefront behaviour (+1 more)

### Community 16 - "Storefront preview status — 25 September 2026"
Cohesion: 0.33
Nodes (5): Implemented for review, Not approved or built yet, Stitch visual baseline, Storefront preview status — 25 September 2026, Verified

### Community 17 - "next-env.d.ts"
Cohesion: 0.50
Nodes (3): NOTE: This file should not be edited, apps_storefront_next_types_root_params_d, apps_storefront_next_types_routes_d

### Community 18 - "Kleawip storefront preview"
Cohesion: 0.50
Nodes (3): Kleawip storefront preview, Quality checks, Run locally

### Community 19 - "Kleawip project build status"
Cohesion: 0.29
Nodes (6): Built locally and verified, Designed or specified, but not built, Kleawip project build status, Next controlled increment, Phase position, Safety and ownership

### Community 20 - "search.ts"
Cohesion: 0.27
Nodes (9): SearchPage(), SearchAutocomplete(), matches(), normalized(), score(), searchableProducts, searchProducts(), SearchSuggestion (+1 more)

### Community 21 - "profile.ts"
Cohesion: 0.19
Nodes (19): packages_contract_src_index_addressinput, packages_contract_src_index_indian_states, packages_contract_src_index_statecode, revokeCustomerSession(), toCustomer(), addressFor(), AddressRow, createAddress() (+11 more)

### Community 22 - "Generated storefront hero assets — demo review"
Cohesion: 0.50
Nodes (3): Final files, Generated storefront hero assets — demo review, Prompt set

### Community 23 - "Database"
Cohesion: 0.10
Nodes (33): packages_contract_src_index_staffloginrequest, ADMIN_COOKIE, authorize(), CSRF_HEADER, fastify, FastifyRequest, forbidden(), SAFE_METHODS (+25 more)

### Community 24 - "Kleawip build — frontend / backend task split"
Cohesion: 0.18
Nodes (10): Handoff checklist for every milestone, Kleawip build — frontend / backend task split, Milestone 0 — decisions and contract (first, before real commerce), Milestone 1 — real catalogue and campaigns, Milestone 2 — identity, bag and checkout foundation, Milestone 3 — operations and launch readiness, Ownership — avoid editing each other's work, Progress log (+2 more)

### Community 25 - "commerce-api/package.json"
Cohesion: 0.10
Nodes (19): drizzle-kit, @fastify/cookie, @fastify/cors, @fastify/helmet, @fastify/multipart, @fastify/rate-limit, tsx, @types/pg (+11 more)

### Community 26 - "contract/package.json"
Cohesion: 0.11
Nodes (17): dependencies, zod, description, devDependencies, typescript, vitest, exports, typescript (+9 more)

### Community 27 - "scripts"
Cohesion: 0.11
Nodes (17): description, engines, node, name, private, scripts, admin:dev, admin:typecheck (+9 more)

### Community 28 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, allowImportingTsExtensions, module, moduleResolution, noEmit, noUncheckedIndexedAccess, resolveJsonModule, skipLibCheck (+4 more)

### Community 29 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, allowImportingTsExtensions, module, moduleResolution, noEmit, noUncheckedIndexedAccess, skipLibCheck, strict (+2 more)

### Community 30 - "Data the frontend must be able to display"
Cohesion: 0.20
Nodes (9): Bag, identity and orders, Contract questions Claude Code should answer before implementation, Data the frontend must be able to display, Existing preview sources to replace gradually, First integration test gate, Frontend data handoff for Claude Code, Product detail and selection, Product discovery (+1 more)

### Community 31 - "Log (newest last)"
Cohesion: 0.20
Nodes (10): 2026-09-25 — Claude Code, 2026-09-25 — Codex, 2026-09-25 — Codex (product reel and admin video controls), 2026-09-25 (evening): Claude Code, 2026-09-25 (evening, owner present): Claude Code, 2026-09-25 (late): Claude Code, 2026-09-25 (night): Claude Code, 2026-09-25 (night, owner asleep): Claude Code (+2 more)

### Community 32 - "Kleawip commerce API"
Cohesion: 0.33
Nodes (5): Commands (run from `WEBSITE DATA/project`), Demo data, Kleawip commerce API, Known issue, Requirements

### Community 33 - "Kleawip commerce API contract — v1 proposal"
Cohesion: 0.17
Nodes (11): 10. Questions for review, 11. Answers to Codex's frontend data handoff, 1. Proposed backend structure and stack, 2. Conventions, 3. Catalogue data model and stable IDs, 5.3 Product videos (implemented 26 Sep 2026, at Codex's request), 5. Admin endpoints — Milestone 1 (outline), 6. Later milestones (outline only; blocked on Phase 0) (+3 more)

### Community 37 - "admin-catalogue.ts"
Cohesion: 0.11
Nodes (43): AdminProductListQuery, AuditCommentCreate, AuditEvent, packages_contract_src_index_admininventoryadjustment, packages_contract_src_index_admininventoryitem, packages_contract_src_index_adminoptionsreplace, packages_contract_src_index_adminproduct, packages_contract_src_index_adminproductcreate (+35 more)

### Community 38 - "product-card.tsx"
Cohesion: 0.19
Nodes (12): CartPage(), CategoryPage(), WishlistPage(), ProductCard(), LegacyProductDetail(), useStore(), TwistedLoopDetail(), demoMerchandising (+4 more)

### Community 39 - "products.ts"
Cohesion: 0.20
Nodes (9): ProductPage(), metadata, Listing(), ProductDetail(), apps_storefront_src_data_catalogue, categories, Product, productById() (+1 more)

### Community 40 - "home-campaigns.ts"
Cohesion: 0.29
Nodes (8): AnnouncementRibbon(), campaignHref(), CampaignTarget, HeroSlide, heroSlides, RibbonMessage, ribbonMessages, CategoryId

### Community 41 - "3. Workflow details observed"
Cohesion: 0.14
Nodes (13): 1. Navigation map, and what Kleawip keeps, 2. How the sections connect, 3.1 Product editor (observed), 3.2 Inventory (observed), 3.3 Discounts (observed), 3.4 Draft / manual order (observed), 3.5 Order lifecycle (known behaviour; not observed, because the dev store blocks orders), 3.6 Notifications (observed) (+5 more)

### Community 42 - "layout.tsx"
Cohesion: 0.18
Nodes (8): apps_storefront_src_app_globals, inter, manrope, metadata, SiteFooter(), SiteHeader(), closeMenu(), openSearch()

### Community 43 - "Kleawip admin: screen brief for Stitch (Milestone 1)"
Cohesion: 0.15
Nodes (12): 0. Shared shell (every admin screen), 1. Staff sign-in, 2. Dashboard (Milestone 1 version), 3. Products: list, 4. Product editor (create / edit), 5. Catalogue import (CSV), 6. Inventory, 7. Collections (+4 more)

### Community 44 - "app.ts"
Cohesion: 0.21
Nodes (14): ErrorCode, fastify, AppOptions, buildApp(), errorHandler(), FieldError, notFoundHandler(), send() (+6 more)

### Community 45 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, db:generate, db:migrate, db:seed:demo, dev, staff:create, start, test (+1 more)

### Community 46 - "dependencies"
Cohesion: 0.17
Nodes (12): dependencies, drizzle-orm, fastify, @fastify/cookie, @fastify/cors, @fastify/helmet, @fastify/multipart, @fastify/rate-limit (+4 more)

### Community 47 - "devDependencies"
Cohesion: 0.29
Nodes (7): devDependencies, drizzle-kit, tsx, @types/node, @types/pg, typescript, vitest

### Community 48 - "cart/service.ts"
Cohesion: 0.24
Nodes (16): packages_contract_src_index_cartline, clearCart(), findCart(), findOrCreateCart(), getCart(), inr(), MAX_CART_LINES, mergeGuestCart() (+8 more)

### Community 54 - "products/[id]/page.tsx"
Cohesion: 0.06
Nodes (46): LoginForm(), submit(), AddVariant(), CATEGORIES, Form, formOf(), MediaTab(), MobilePreview() (+38 more)

### Community 55 - "campaigns/service.ts"
Cohesion: 0.05
Nodes (64): destination, products, root, HeroSlide, HeroSlideInput, RibbonMessage, RibbonMessageInput, packages_contract_src_index_campaignorder (+56 more)

### Community 56 - "catalogue-import.ts"
Cohesion: 0.07
Nodes (43): RFC-4180, IMPORT_COLUMNS, ImportReport, packages_contract_src_index_import_columns, packages_contract_src_index_importreport, DbOrTx, catalogueImports, applyPlan() (+35 more)

### Community 57 - "orders/service.ts"
Cohesion: 0.05
Nodes (56): AdminOrderListItem, AdminOrderListQuery, AdminOrderPayment, PaymentSession, PaymentVerifyRequest, PlaceOrderRequest, packages_contract_src_index_adminorderlistitem, packages_contract_src_index_adminorderlistquery (+48 more)

### Community 58 - "ApiError"
Cohesion: 0.13
Nodes (23): CartLineUpdate, WishlistItem, WishlistMerge, WishlistPut, packages_contract_src_index_cartlineupdate, packages_contract_src_index_wishlistitem, packages_contract_src_index_wishlistmerge, packages_contract_src_index_wishlistput (+15 more)

### Community 59 - "store-account.ts"
Cohesion: 0.14
Nodes (17): Address, CustomerSession, OtpChallenge, packages_contract_src_index_address, packages_contract_src_index_customer, packages_contract_src_index_customersession, packages_contract_src_index_customerupdate, packages_contract_src_index_indianmobile (+9 more)

### Community 60 - "admin/package.json"
Cohesion: 0.06
Nodes (31): dependencies, @kleawip/contract, lucide-react, next, react, react-dom, zod, description (+23 more)

### Community 61 - "auth.ts"
Cohesion: 0.15
Nodes (18): codeHash(), CUSTOMER_SESSION_ABSOLUTE_MS, CUSTOMER_SESSION_IDLE_MS, CustomerRow, invalid(), maskEmail(), maskPhone(), OTP_MAX_ATTEMPTS (+10 more)

### Community 62 - "helpers.ts"
Cohesion: 0.16
Nodes (12): StaffSession, packages_contract_src_index_staffsession, ref_node_os, ChannelOtpSender, App, createStaff(), createTestApp(), resetStaffAndAudit() (+4 more)

### Community 63 - "customer.ts"
Cohesion: 0.12
Nodes (17): 5.2 Milestone 2: customer accounts (implemented 26 Sep 2026), AddressInput, CartLine, CartLineWarning, CheckoutQuote, Customer, CustomerUpdate, INDIAN_STATES (+9 more)

### Community 64 - "videos.ts"
Cohesion: 0.09
Nodes (36): ADR 0001: Backend stack and core conventions, Consequences, Context, Conventions that follow from this, Decision, mediaAssets, productVideos, videoAssets (+28 more)

### Community 65 - "customers/guard.ts"
Cohesion: 0.28
Nodes (8): CustomerContext, CLIENT_HEADER, CUSTOMER_COOKIE, customerSession(), fastify, FastifyRequest, requireClientHeader(), SAFE

### Community 66 - "priceFrom"
Cohesion: 0.29
Nodes (6): 7. Mapping from the current storefront fixtures, 9. Change process, Changelog, `GET /v1/store/products`, 2026-09-25 (later): Claude Code, priceFrom()

### Community 67 - "admin-media-collections.ts"
Cohesion: 0.04
Nodes (64): 5.1 Implemented admin API (25 Sep 2026), AdminCollectionCreate, AdminCollectionProducts, AdminCollectionUpdate, AdminInventoryAdjustment, AdminInventoryItem, AdminInventoryMovement, AdminMoney (+56 more)

### Community 68 - "admin-staff.ts"
Cohesion: 0.09
Nodes (18): ActivityEvent, ActivityQuery, PasswordChange, StaffInvite, StaffMember, StaffSetupLink, StaffSetupRequest, StaffUpdate (+10 more)

### Community 69 - "schema.ts"
Cohesion: 0.08
Nodes (31): ref_node_url, DIR, SLIDES, campaignTarget, campaignTargetType, categories, collections, customerStatus (+23 more)

### Community 70 - "drizzle-orm"
Cohesion: 0.11
Nodes (26): DashboardResponse, Cart, PlaceOrderResponse, packages_contract_src_index_cart, packages_contract_src_index_dashboardresponse, packages_contract_src_index_placeorderresponse, drizzle-orm, ref_node_crypto (+18 more)

### Community 71 - "index.ts"
Cohesion: 0.07
Nodes (27): RFC-9457, AdminCollection, packages_contract_src_index_admincollection, Category, CategoryListResponse, CollectionDetail, CollectionListResponse, CollectionSummary (+19 more)

### Community 72 - "collections.ts"
Cohesion: 0.26
Nodes (14): slugify(), adminCollection(), collectionRow(), createCollection(), invalid(), isUuid(), listAdminCollections(), publishedMembers (+6 more)

### Community 73 - "quote.ts"
Cohesion: 0.17
Nodes (17): CheckoutQuoteRequest, Serviceability, ServiceabilityQuery, packages_contract_src_index_checkoutquote, packages_contract_src_index_checkoutquoterequest, packages_contract_src_index_serviceability, packages_contract_src_index_serviceabilityquery, blocked() (+9 more)

### Community 74 - "store-catalogue.ts"
Cohesion: 0.30
Nodes (13): storeHome(), storeCollection(), storeCollections(), Cursor, decodeCursor(), encodeCursor(), escapeLike(), filterFingerprint() (+5 more)

### Community 75 - "Codex ↔ Claude Code handoff log"
Cohesion: 0.29
Nodes (6): Checks each side runs before handing off, Codex ↔ Claude Code handoff log, Git rules, Open requests, Path ownership, Protocol — both agents follow this every session

### Community 76 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 77 - "queries.ts"
Cohesion: 0.20
Nodes (14): Availability, featuredProducts(), inr(), loadVariantRows(), productDetail(), productSummaries(), productOptionValues, variantOptionValues (+6 more)

### Community 78 - "media/service.ts"
Cohesion: 0.17
Nodes (26): deliveryKey(), FORMATS, MAX_UPLOAD_BYTES, MIN_DIMENSION, originalKey(), ProcessedImage, processImage(), rejected() (+18 more)

### Community 79 - "mail.mjs"
Cohesion: 0.19
Nodes (11): agentFlag(), AGENTS, box, fail(), { flags, rest }, loadMessages(), markRead(), readSet() (+3 more)

### Community 80 - "staff/service.ts"
Cohesion: 0.17
Nodes (23): derive(), dummyPasswordHash(), hashPassword(), MIN_PASSWORD_LENGTH, PARAMS, verifyPassword(), dashboard(), auditEvents (+15 more)

### Community 81 - "tax.ts"
Cohesion: 0.48
Nodes (5): gstIncluded(), GstSplit, partialCodSplit(), splitGst(), ADR-0002

### Community 82 - "4. Storefront endpoints — Milestone 1 (catalogue and campaigns)"
Cohesion: 0.40
Nodes (5): 4. Storefront endpoints — Milestone 1 (catalogue and campaigns), `GET /v1/store/categories`, `GET /v1/store/home`, `GET /v1/store/products/{slug}`, `GET /v1/store/search/suggest?q=bath&limit=6`

### Community 83 - "server.ts"
Cohesion: 0.09
Nodes (18): ref_node_fs, ref_node_path, ref_node_stream, STORAGE_KEY, Fetch, FileOutboxOtpSender, MemoryOtpSender, OtpDeliveryError (+10 more)

### Community 84 - "ADR 0002: Phase 0 commerce decisions (26 September 2026)"
Cohesion: 0.22
Nodes (8): ADR 0002: Phase 0 commerce decisions (26 September 2026), Decided by the owner, Partial COD details to confirm (proposed defaults), R1: Customer sign-in: **WhatsApp OTP first, email OTP as fallback; SMS later**, R2: Shipping: **Shiprocket**, R3: Production image storage: **Cloudflare R2**, Recommended, awaiting the owner's OK, Still open (not answered yet)

### Community 85 - "client.ts"
Cohesion: 0.10
Nodes (22): StaffRole, packages_contract_src_index_staffrole, ref_node_util, pg, ref_zod, { db, close }, input, password (+14 more)

### Community 86 - "twisted-loop-detail.tsx"
Cohesion: 0.24
Nodes (6): InstagramFeature(), timeLabel(), previewColours, previewPacks, previewSizes, kleawipInstagram

### Community 89 - "provider.ts"
Cohesion: 0.15
Nodes (9): Fetch, MockShippingProvider, ServiceabilityQuery, ServiceabilityResult, ShippingProvider, ShippingUnavailableError, ShiprocketProvider, ADR-0002 (+1 more)

### Community 92 - "admin/src/app/layout.tsx"
Cohesion: 0.33
Nodes (4): apps_admin_src_app_globals, inter, manrope, metadata

### Community 94 - "2026-09-25T10-40-08-600Z_claude-to-codex_handoff-while-you-were-paused-your-next-.md"
Cohesion: 0.50
Nodes (3): Rules (unchanged), What changed, Your next work (the owner says: start per scope)

### Community 95 - "rehearse-restore.sh"
Cohesion: 0.83
Nodes (3): counts(), migrations(), rehearse-restore.sh script

## Knowledge Gaps
- **609 isolated node(s):** `nextConfig`, `name`, `version`, `private`, `description` (+604 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 811 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **25 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `drizzle-orm` connect `drizzle-orm` to `profile.ts`, `Database`, `commerce-api/package.json`, `admin-catalogue.ts`, `app.ts`, `cart/service.ts`, `campaigns/service.ts`, `catalogue-import.ts`, `orders/service.ts`, `ApiError`, `store-account.ts`, `auth.ts`, `helpers.ts`, `videos.ts`, `schema.ts`, `index.ts`, `collections.ts`, `quote.ts`, `store-catalogue.ts`, `queries.ts`, `media/service.ts`, `staff/service.ts`, `client.ts`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `MediaStorage` connect `videos.ts` to `admin-media-collections.ts`, `schema.ts`, `app.ts`, `media/service.ts`, `server.ts`, `ADR 0002: Phase 0 commerce decisions (26 September 2026)`, `LocalDiskStorage`, `Log (newest last)`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `ApiError` connect `ApiError` to `videos.ts`, `customers/guard.ts`, `admin-media-collections.ts`, `admin-catalogue.ts`, `collections.ts`, `quote.ts`, `store-catalogue.ts`, `app.ts`, `media/service.ts`, `cart/service.ts`, `staff/service.ts`, `Database`, `profile.ts`, `campaigns/service.ts`, `catalogue-import.ts`, `orders/service.ts`, `auth.ts`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **What connects `nextConfig`, `name`, `version` to the rest of the system?**
  _609 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Phase 0 Client Inputs and Account Ownership Checklist` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._
- **Should `Kleawip Ecommerce Platform Implementation Plan` be split into smaller, more focused modules?**
  _Cohesion score 0.047619047619047616 - nodes in this community are weakly interconnected._
- **Should `Kleawip Feature Expansion Brainstorm` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._