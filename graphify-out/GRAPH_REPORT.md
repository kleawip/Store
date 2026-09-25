# Graph Report - project  (2026-09-25)

## Corpus Check
- 290 files · ~518,438 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 4, .css 2, .example 1)

## Summary
- 2131 nodes · 5297 edges · 127 communities (93 shown, 34 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 99 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9f7033c9`
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
- store-account.ts
- Generated storefront hero assets — demo review
- admin-auth.ts
- Kleawip build — frontend / backend task split
- admin-reports.ts
- contract/package.json
- scripts
- compilerOptions
- compilerOptions
- Data the frontend must be able to display
- Log (newest last)
- Kleawip commerce API
- admin-campaigns.test.ts
- app.ts
- twisted-loop-detail.tsx
- products.ts
- storage.ts
- 3. Workflow details observed
- SiteHeader
- Kleawip admin: screen brief for Stitch (Milestone 1)
- commerce-api/package.json
- client.ts
- MediaStorage
- video.ts
- cart/service.ts
- products/[id]/page.tsx
- campaigns/service.ts
- invoices/service.ts
- orders/service.ts
- store-cart.ts
- store-account.test.ts
- admin/package.json
- ApiError
- drizzle-orm
- customer.ts
- videos.ts
- admin-orders.ts
- mail.mjs
- src/admin.ts
- render.ts
- schema.ts
- db/seed-demo.ts
- index.ts
- collections.ts
- quote.ts
- gateway.ts
- recordAudit
- compilerOptions
- admin-shipments.test.ts
- media/service.ts
- admin-staff.ts
- catalogue-import.ts
- otp-senders.ts
- ADR 0002: Phase 0 commerce decisions (26 September 2026)
- returns/service.ts
- product-video-feature.tsx
- admin-media-collections.ts
- Database
- admin-catalogue.ts
- helpers.ts
- shipments.ts
- admin/src/app/layout.tsx
- discounts/service.ts
- rehearse-restore.sh
- _pg.sh
- provider.ts
- media/README.md
- SOURCES.md
- backup.sh
- restore.sh
- r2.ts
- catalogue-api.ts
- deliverDueNotifications
- server.ts
- ADR 0001: Backend stack and core conventions
- packages_contract_src_index_adminrefund
- home-campaigns.ts
- ref_instagram_feature
- 5. Admin endpoints — Milestone 1 (outline)

## God Nodes (most connected - your core abstractions)
1. `recordAudit()` - 77 edges
2. `ApiError` - 77 edges
3. `drizzle-orm` - 59 edges
4. `notFound()` - 55 edges
5. `Database` - 51 edges
6. `adminMediaCollectionRoutes()` - 31 edges
7. `buildApp()` - 30 edges
8. `authorize()` - 28 edges
9. `createTestApp()` - 28 edges
10. `products` - 25 edges

## Surprising Connections (you probably didn't know these)
- `5.4 Milestone 4: discount codes and reports (implemented 25 Sep 2026)` --references--> `state()`  [INFERRED]
  docs/api/API_CONTRACT.md → services/commerce-api/src/discounts/service.ts
- ``GET /v1/store/products`` --references--> `priceFrom()`  [INFERRED]
  docs/api/API_CONTRACT.md → services/commerce-api/src/domain/availability.ts
- `2026-09-25 (later): Claude Code` --references--> `priceFrom()`  [INFERRED]
  docs/coordination/HANDOFF_LOG.md → services/commerce-api/src/domain/availability.ts
- `Decision` --references--> `MediaStorage`  [INFERRED]
  docs/decisions/0001-backend-stack-and-core-conventions.md → services/commerce-api/src/media/storage.ts
- `R3: Production image storage: **Cloudflare R2**` --references--> `MediaStorage`  [INFERRED]
  docs/decisions/0002-phase0-commerce-decisions.md → services/commerce-api/src/media/storage.ts

## Import Cycles
- None detected.

## Communities (127 total, 34 thin omitted)

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
Cohesion: 0.08
Nodes (14): nextConfig, nextConfig, metadata, metadata, apps_storefront_src_app_globals, inter, manrope, metadata (+6 more)

### Community 6 - "Google Stitch for Kleawip — read before design work"
Cohesion: 0.29
Nodes (6): Connect Stitch to Codex, Google Stitch for Kleawip — read before design work, If Stitch is not connected, Important content checks, Screen-design sequence, What we are doing

### Community 7 - "storefront/package.json"
Cohesion: 0.06
Nodes (34): dependencies, @kleawip/contract, lucide-react, next, react, react-dom, devDependencies, sharp (+26 more)

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

### Community 21 - "store-account.ts"
Cohesion: 0.13
Nodes (28): Customer, CustomerUpdate, OtpRequest, OtpVerify, packages_contract_src_index_addressinput, packages_contract_src_index_customer, packages_contract_src_index_customerupdate, packages_contract_src_index_otprequest (+20 more)

### Community 22 - "Generated storefront hero assets — demo review"
Cohesion: 0.50
Nodes (3): Final files, Generated storefront hero assets — demo review, Prompt set

### Community 23 - "admin-auth.ts"
Cohesion: 0.08
Nodes (39): StaffLoginRequest, packages_contract_src_index_staffloginrequest, ADMIN_COOKIE, authorize(), CSRF_HEADER, fastify, FastifyRequest, forbidden() (+31 more)

### Community 24 - "Kleawip build — frontend / backend task split"
Cohesion: 0.18
Nodes (10): Handoff checklist for every milestone, Kleawip build — frontend / backend task split, Milestone 0 — decisions and contract (first, before real commerce), Milestone 1 — real catalogue and campaigns, Milestone 2 — identity, bag and checkout foundation, Milestone 3 — operations and launch readiness, Ownership — avoid editing each other's work, Progress log (+2 more)

### Community 25 - "admin-reports.ts"
Cohesion: 0.13
Nodes (18): GstReport, GstReportQuery, ProductReport, ProductReportQuery, SalesReport, SalesReportQuery, packages_contract_src_index_gstreport, packages_contract_src_index_gstreportquery (+10 more)

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
Cohesion: 0.09
Nodes (21): 2026-09-25 — Claude Code, 2026-09-25 — Claude Code (Milestone 3 step 2: shipments, tracking, GST invoices), 2026-09-25 — Claude Code (Milestone 3 step 3: returns, credit notes; dormant R2 adapter), 2026-09-25 — Claude Code (Milestone 3 step 4: customer notifications — Milestone 3 backend complete), 2026-09-25 — Claude Code (Milestone 4: discount codes and reports), 2026-09-25 — Codex, 2026-09-25 — Codex (product reel and admin video controls), 2026-09-25 (evening): Claude Code (+13 more)

### Community 32 - "Kleawip commerce API"
Cohesion: 0.33
Nodes (5): Commands (run from `WEBSITE DATA/project`), Demo data, Kleawip commerce API, Known issue, Requirements

### Community 33 - "admin-campaigns.test.ts"
Cohesion: 0.15
Nodes (11): MediaAsset, HomeResponse, packages_contract_src_index_mediaasset, completeSlide(), productId(), uploadBanner(), uploadImage(), box() (+3 more)

### Community 37 - "app.ts"
Cohesion: 0.19
Nodes (18): fastify, ref_zod, AppOptions, buildApp(), errorHandler(), FieldError, notFoundHandler(), send() (+10 more)

### Community 38 - "twisted-loop-detail.tsx"
Cohesion: 0.16
Nodes (16): CartPage(), WishlistPage(), ProductCard(), LegacyProductDetail(), ProductVideos(), useStore(), previewColours, previewPacks (+8 more)

### Community 39 - "products.ts"
Cohesion: 0.23
Nodes (7): CategoryPage(), metadata, Listing(), apps_storefront_src_data_catalogue, categories, categoryById(), products

### Community 40 - "storage.ts"
Cohesion: 0.15
Nodes (10): ref_node_stream, config, { db, close }, Config, Env, loadConfig(), ADR-0002, storageFromConfig() (+2 more)

### Community 41 - "3. Workflow details observed"
Cohesion: 0.14
Nodes (13): 1. Navigation map, and what Kleawip keeps, 2. How the sections connect, 3.1 Product editor (observed), 3.2 Inventory (observed), 3.3 Discounts (observed), 3.4 Draft / manual order (observed), 3.5 Order lifecycle (known behaviour; not observed, because the dev store blocks orders), 3.6 Notifications (observed) (+5 more)

### Community 42 - "SiteHeader"
Cohesion: 0.50
Nodes (3): SiteHeader(), closeMenu(), openSearch()

### Community 43 - "Kleawip admin: screen brief for Stitch (Milestone 1)"
Cohesion: 0.15
Nodes (12): 0. Shared shell (every admin screen), 1. Staff sign-in, 2. Dashboard (Milestone 1 version), 3. Products: list, 4. Product editor (create / edit), 5. Catalogue import (CSV), 6. Inventory, 7. Collections (+4 more)

### Community 44 - "commerce-api/package.json"
Cohesion: 0.04
Nodes (47): drizzle-kit, @fastify/cookie, @fastify/cors, @fastify/helmet, @fastify/multipart, @fastify/rate-limit, tsx, @types/pg (+39 more)

### Community 45 - "client.ts"
Cohesion: 0.16
Nodes (14): StaffRole, packages_contract_src_index_staffrole, ref_node_util, pg, { db, close }, input, password, { values } (+6 more)

### Community 46 - "MediaStorage"
Cohesion: 0.16
Nodes (11): 2026-09-25 (night): Claude Code, deliveryKey(), FORMATS, MAX_UPLOAD_BYTES, MIN_DIMENSION, originalKey(), ProcessedImage, processImage() (+3 more)

### Community 47 - "video.ts"
Cohesion: 0.23
Nodes (11): MAX_VIDEO_BYTES, MP4_AUDIO, MP4_VIDEO, mp4Codecs(), rejected(), sha256Of(), sniffVideo(), videoKey() (+3 more)

### Community 48 - "cart/service.ts"
Cohesion: 0.20
Nodes (17): packages_contract_src_index_cart, packages_contract_src_index_cartline, CartOwner, clearCart(), findCart(), findOrCreateCart(), getCart(), inr() (+9 more)

### Community 54 - "products/[id]/page.tsx"
Cohesion: 0.06
Nodes (45): LoginForm(), submit(), AddVariant(), CATEGORIES, Form, formOf(), MediaTab(), MobilePreview() (+37 more)

### Community 55 - "campaigns/service.ts"
Cohesion: 0.08
Nodes (53): HeroSlide, HeroSlideInput, RibbonMessage, RibbonMessageInput, packages_contract_src_index_campaignorder, packages_contract_src_index_campaigntargetinput, packages_contract_src_index_heroslide, packages_contract_src_index_heroslideinput (+45 more)

### Community 56 - "invoices/service.ts"
Cohesion: 0.11
Nodes (20): INDIAN_STATES, packages_contract_src_index_indian_states, creditNotes, invoices, invoiceSequences, orderLines, refunds, returnLines (+12 more)

### Community 57 - "orders/service.ts"
Cohesion: 0.10
Nodes (33): PaymentSession, PaymentVerifyRequest, PlaceOrderRequest, packages_contract_src_index_order, packages_contract_src_index_paymentsession, packages_contract_src_index_paymentverifyrequest, packages_contract_src_index_placeorderrequest, orderNumberSeq (+25 more)

### Community 58 - "store-cart.ts"
Cohesion: 0.14
Nodes (20): CartLineUpdate, WishlistItem, WishlistMerge, WishlistPut, packages_contract_src_index_cartlineupdate, packages_contract_src_index_wishlistitem, packages_contract_src_index_wishlistmerge, packages_contract_src_index_wishlistput (+12 more)

### Community 59 - "store-account.test.ts"
Cohesion: 0.15
Nodes (14): Address, CustomerSession, IndianMobile, OtpChallenge, packages_contract_src_index_address, packages_contract_src_index_customersession, packages_contract_src_index_indianmobile, packages_contract_src_index_otpchallenge (+6 more)

### Community 60 - "admin/package.json"
Cohesion: 0.06
Nodes (31): dependencies, @kleawip/contract, lucide-react, next, react, react-dom, zod, description (+23 more)

### Community 61 - "ApiError"
Cohesion: 0.11
Nodes (27): ErrorCode, codeHash(), CUSTOMER_SESSION_ABSOLUTE_MS, CUSTOMER_SESSION_IDLE_MS, CustomerContext, CustomerRow, invalid(), maskEmail() (+19 more)

### Community 62 - "drizzle-orm"
Cohesion: 0.11
Nodes (22): DashboardResponse, CheckoutQuote, PlaceOrderResponse, packages_contract_src_index_checkoutquote, packages_contract_src_index_dashboardresponse, drizzle-orm, ref_node_crypto, DEFAULT_COMMERCE_SETTINGS (+14 more)

### Community 63 - "customer.ts"
Cohesion: 0.10
Nodes (21): 5.2 Milestone 2: customer accounts (implemented 26 Sep 2026), 2026-09-25 — Claude Code (Milestone 3 step 1: order actions and refunds), AddressInput, AppliedDiscountView, Cart, CartLine, CartLineWarning, CustomerReturn (+13 more)

### Community 64 - "videos.ts"
Cohesion: 0.22
Nodes (20): videoAssets, parseInstagramUrl(), checklist(), checkReferences(), createProductVideo(), deleteVideoAsset(), invalid(), isUuid() (+12 more)

### Community 65 - "admin-orders.ts"
Cohesion: 0.07
Nodes (41): AdminNotification, AdminNotificationListQuery, AdminOrderDetail, AdminOrderListItem, AdminOrderListQuery, AdminOrderPayment, AttentionResolve, FulfilmentStep (+33 more)

### Community 66 - "mail.mjs"
Cohesion: 0.07
Nodes (28): 10. Questions for review, 11. Answers to Codex's frontend data handoff, 1. Proposed backend structure and stack, 2. Conventions, 3. Catalogue data model and stable IDs, 4. Storefront endpoints — Milestone 1 (catalogue and campaigns), 6. Later milestones (outline only; blocked on Phase 0), 7. Mapping from the current storefront fixtures (+20 more)

### Community 67 - "src/admin.ts"
Cohesion: 0.06
Nodes (32): AdminInventoryMovement, AdminInvoiceSummary, AdminMoney, AdminProductListItem, AdminRefund, AdminShipment, AdminVariant, CAMPAIGN_PAGES (+24 more)

### Community 68 - "render.ts"
Cohesion: 0.33
Nodes (9): amountInWords(), belowThousand(), escape(), istDate(), ONES, percent(), renderInvoiceHtml(), rupees() (+1 more)

### Community 69 - "schema.ts"
Cohesion: 0.06
Nodes (32): campaignTarget, campaignTargetType, customerStatus, discountKind, discountStatus, fulfilmentStatus, importStatus, inventoryReason (+24 more)

### Community 70 - "db/seed-demo.ts"
Cohesion: 0.09
Nodes (21): destination, products, root, ref_node_fs, ref_node_path, ref_node_url, ref_sharp, DEMO_BANNER_SOURCES (+13 more)

### Community 71 - "index.ts"
Cohesion: 0.09
Nodes (32): RFC-9457, Category, CategoryListResponse, CollectionSummary, Facet, Image, Money, OptionGroup (+24 more)

### Community 72 - "collections.ts"
Cohesion: 0.19
Nodes (19): packages_contract_src_index_admincollection, slugify(), adminCollection(), collectionRow(), createCollection(), invalid(), isUuid(), listAdminCollections() (+11 more)

### Community 73 - "quote.ts"
Cohesion: 0.13
Nodes (22): CheckoutQuoteRequest, Serviceability, ServiceabilityQuery, packages_contract_src_index_checkoutquoterequest, packages_contract_src_index_serviceability, packages_contract_src_index_serviceabilityquery, blocked(), checkServiceability() (+14 more)

### Community 74 - "gateway.ts"
Cohesion: 0.17
Nodes (7): DevGateway, Fetch, GatewayOrder, hmacHex(), PaymentGatewayError, RazorpayGateway, safeEqualHex()

### Community 75 - "recordAudit"
Cohesion: 0.14
Nodes (36): recordAudit(), payments, cancelInvoice(), assertNoLiveShipment(), CANCELLABLE_FULFILMENT, clearAttention(), createRefund(), invalid() (+28 more)

### Community 76 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 77 - "admin-shipments.test.ts"
Cohesion: 0.08
Nodes (20): packages_contract_src_index_placeorderresponse, notifications, financialYear(), paidOrder(), placeOrder(), paidOrder(), SELLER, customerSignIn() (+12 more)

### Community 78 - "media/service.ts"
Cohesion: 0.25
Nodes (17): productVideos, AssetRow, attachProductMedia(), deleteAsset(), getAsset(), invalid(), isUuid(), listAssets() (+9 more)

### Community 80 - "admin-staff.ts"
Cohesion: 0.09
Nodes (33): ActivityEvent, ActivityQuery, PasswordChange, StaffInvite, StaffMember, StaffSetupLink, StaffSetupRequest, StaffUpdate (+25 more)

### Community 82 - "catalogue-import.ts"
Cohesion: 0.07
Nodes (44): RFC-4180, IMPORT_COLUMNS, ImportReport, packages_contract_src_index_import_columns, packages_contract_src_index_importreport, catalogueImports, productOptions, productOptionValues (+36 more)

### Community 83 - "otp-senders.ts"
Cohesion: 0.12
Nodes (10): ChannelOtpSender, Fetch, FileOutboxOtpSender, MemoryOtpSender, OtpDeliveryError, OtpMessage, OtpSender, ResendEmailOtpSender (+2 more)

### Community 84 - "ADR 0002: Phase 0 commerce decisions (26 September 2026)"
Cohesion: 0.22
Nodes (8): ADR 0002: Phase 0 commerce decisions (26 September 2026), Decided by the owner, Partial COD details to confirm (proposed defaults), R1: Customer sign-in: **WhatsApp OTP first, email OTP as fallback; SMS later**, R2: Shipping: **Shiprocket**, R3: Production image storage: **Cloudflare R2**, Recommended, awaiting the owner's OK, Still open (not answered yet)

### Community 85 - "returns/service.ts"
Cohesion: 0.07
Nodes (47): AdminReturn, AdminReturnListQuery, ReturnClose, ReturnDecision, ReturnReceive, ReturnRefund, ReturnReject, StaffReturnCreate (+39 more)

### Community 86 - "product-video-feature.tsx"
Cohesion: 0.18
Nodes (7): ProductVideo, ProductVideoFeature(), catalogue, video, timeLabel(), kleawipInstagram, ref_react_dom

### Community 87 - "admin-media-collections.ts"
Cohesion: 0.08
Nodes (24): AdminCollectionCreate, AdminCollectionProducts, AdminCollectionUpdate, MediaAssetUpdate, MediaListQuery, ProductMediaAttach, ProductMediaOrder, ProductMediaUpdate (+16 more)

### Community 88 - "Database"
Cohesion: 0.22
Nodes (15): 5.2.2 Milestone 3 step 2: shipments, courier tracking, GST invoices (implemented 25 Sep 2026), SellerDetails, packages_contract_src_index_sellerdetails, staffOf(), Database, siteSettings, adminSettingsRoutes(), SettingsSchema (+7 more)

### Community 89 - "admin-catalogue.ts"
Cohesion: 0.06
Nodes (69): 5.1 Implemented admin API (25 Sep 2026), 9. Change process, Changelog, AdminCollection, AdminInventoryAdjustment, AdminInventoryItem, AdminOptionsReplace, AdminProductCreate (+61 more)

### Community 90 - "helpers.ts"
Cohesion: 0.09
Nodes (19): AdminProduct, packages_contract_src_index_adminproduct, CollectionDetail, CollectionListResponse, Problem, packages_contract_src_index_staffsession, ref_node_os, ref_vitest (+11 more)

### Community 91 - "shipments.ts"
Cohesion: 0.08
Nodes (31): AuditEntry, DbOrTx, listAudit(), auditEvents, shipmentEvents, shipments, rupees(), ShippingProvider (+23 more)

### Community 92 - "admin/src/app/layout.tsx"
Cohesion: 0.33
Nodes (4): apps_admin_src_app_globals, inter, manrope, metadata

### Community 94 - "discounts/service.ts"
Cohesion: 0.11
Nodes (31): Rules (unchanged), What changed, Your next work (the owner says: start per scope), AdminDiscount, AdminDiscountListQuery, DiscountInput, packages_contract_src_index_admindiscount, packages_contract_src_index_admindiscountlistquery (+23 more)

### Community 95 - "rehearse-restore.sh"
Cohesion: 0.83
Nodes (3): counts(), migrations(), rehearse-restore.sh script

### Community 97 - "provider.ts"
Cohesion: 0.11
Nodes (11): Fetch, istDateTime(), MockShippingProvider, ServiceabilityQuery, ServiceabilityResult, ShipmentRequest, ShippingRejectedError, ShippingUnavailableError (+3 more)

### Community 113 - "r2.ts"
Cohesion: 0.19
Nodes (10): RFC-3986, encodeKey(), Fetch, hmac(), MediaStorageError, R2Config, R2Storage, sha256() (+2 more)

### Community 114 - "catalogue-api.ts"
Cohesion: 0.29
Nodes (9): dynamic, ProductPage(), ProductDetail(), productById(), apiOrigin, loadProductPage(), productPageRecord, publicMediaUrl() (+1 more)

### Community 120 - "deliverDueNotifications"
Cohesion: 0.21
Nodes (7): deliverDueNotifications(), NotificationSender, OutgoingMessage, ChannelNotificationSender, MemoryNotificationSender, notificationTimer, deliver()

### Community 121 - "server.ts"
Cohesion: 0.17
Nodes (13): ChannelSender, Fetch, fileOutboxChannel(), resendEmailChannel(), whatsAppCloudChannel(), expireUnpaidOrders(), commerce, config (+5 more)

### Community 122 - "ADR 0001: Backend stack and core conventions"
Cohesion: 0.33
Nodes (5): ADR 0001: Backend stack and core conventions, Consequences, Context, Conventions that follow from this, Decision

### Community 126 - "home-campaigns.ts"
Cohesion: 0.24
Nodes (9): AnnouncementRibbon(), HomeHeroCarousel(), campaignHref(), CampaignTarget, HeroSlide, heroSlides, RibbonMessage, ribbonMessages (+1 more)

### Community 134 - "5. Admin endpoints — Milestone 1 (outline)"
Cohesion: 0.22
Nodes (8): 5.2.1 Milestone 3 step 1: fulfilment steps, cancellations, refunds (implemented 25 Sep 2026), 5.2.3 Milestone 3 step 3: returns and GST credit notes (implemented 25 Sep 2026), 5.2.4 Milestone 3 step 4: customer notifications (implemented 25 Sep 2026), 5.3 Product videos (implemented 26 Sep 2026, at Codex's request), 5.4 Milestone 4: discount codes and reports (implemented 25 Sep 2026), 5. Admin endpoints — Milestone 1 (outline), AdminProductVideo, FulfilmentStatus

## Knowledge Gaps
- **685 isolated node(s):** `nextConfig`, `name`, `version`, `private`, `description` (+680 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 945 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **34 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `drizzle-orm` connect `drizzle-orm` to `store-account.ts`, `admin-auth.ts`, `admin-campaigns.test.ts`, `app.ts`, `commerce-api/package.json`, `client.ts`, `cart/service.ts`, `campaigns/service.ts`, `invoices/service.ts`, `orders/service.ts`, `store-cart.ts`, `store-account.test.ts`, `ApiError`, `videos.ts`, `admin-orders.ts`, `schema.ts`, `db/seed-demo.ts`, `index.ts`, `collections.ts`, `quote.ts`, `recordAudit`, `admin-shipments.test.ts`, `media/service.ts`, `admin-staff.ts`, `catalogue-import.ts`, `returns/service.ts`, `Database`, `admin-catalogue.ts`, `helpers.ts`, `shipments.ts`, `discounts/service.ts`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Why does `Database` connect `Database` to `store-account.ts`, `admin-auth.ts`, `admin-reports.ts`, `app.ts`, `client.ts`, `cart/service.ts`, `campaigns/service.ts`, `invoices/service.ts`, `orders/service.ts`, `store-cart.ts`, `ApiError`, `drizzle-orm`, `videos.ts`, `admin-orders.ts`, `db/seed-demo.ts`, `index.ts`, `collections.ts`, `quote.ts`, `recordAudit`, `media/service.ts`, `admin-staff.ts`, `catalogue-import.ts`, `returns/service.ts`, `admin-media-collections.ts`, `admin-catalogue.ts`, `helpers.ts`, `shipments.ts`, `discounts/service.ts`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `notFound()` connect `admin-catalogue.ts` to `videos.ts`, `admin-orders.ts`, `app.ts`, `index.ts`, `collections.ts`, `recordAudit`, `media/service.ts`, `admin-staff.ts`, `catalogue-import.ts`, `store-account.ts`, `returns/service.ts`, `campaigns/service.ts`, `orders/service.ts`, `ApiError`, `discounts/service.ts`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `nextConfig`, `name`, `version` to the rest of the system?**
  _685 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Phase 0 Client Inputs and Account Ownership Checklist` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._
- **Should `Kleawip Ecommerce Platform Implementation Plan` be split into smaller, more focused modules?**
  _Cohesion score 0.047619047619047616 - nodes in this community are weakly interconnected._
- **Should `Kleawip Feature Expansion Brainstorm` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._