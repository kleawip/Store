# Graph Report - project  (2026-09-25)

## Corpus Check
- 62 files · ~527,700 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 3, .css 1)

## Summary
- 407 nodes · 620 edges · 25 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- build_feature_expansion_addendum.py
- Phase 0 Client Inputs and Account Ownership Checklist
- Kleawip Ecommerce Platform Implementation Plan
- Kleawip Feature Expansion Brainstorm
- Kleawip product page ↔ admin mapping (review draft)
- products.ts
- Google Stitch for Kleawip — read before design work
- package.json
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
- home-campaigns.ts
- Generated storefront hero assets — demo review
- Kleawip commerce API contract — v1 proposal
- Kleawip build — frontend / backend task split

## God Nodes (most connected - your core abstractions)
1. `next` - 23 edges
2. `lucide-react` - 18 edges
3. `compilerOptions` - 16 edges
4. `Kleawip Ecommerce Platform Implementation Plan` - 15 edges
5. `Phase 0 Client Inputs and Account Ownership Checklist` - 15 edges
6. `set_repeatable_font()` - 14 edges
7. `8. Phase plan and quality gates` - 14 edges
8. `useStore()` - 13 edges
9. `react` - 12 edges
10. `products` - 12 edges

## Surprising Connections (you probably didn't know these)
- `7. Mapping from the current storefront fixtures` --references--> `Product`  [INFERRED]
  docs/api/API_CONTRACT.md → apps/storefront/src/data/products.ts
- `CartPage()` --calls--> `useStore()`  [EXTRACTED]
  apps/storefront/src/app/cart/page.tsx → apps/storefront/src/components/store-provider.tsx
- `SearchPage()` --calls--> `searchProducts()`  [EXTRACTED]
  apps/storefront/src/app/search/page.tsx → apps/storefront/src/lib/search.ts
- `CategoryPage()` --calls--> `categoryById()`  [EXTRACTED]
  apps/storefront/src/app/shop/[category]/page.tsx → apps/storefront/src/data/products.ts
- `WishlistPage()` --calls--> `useStore()`  [EXTRACTED]
  apps/storefront/src/app/wishlist/page.tsx → apps/storefront/src/components/store-provider.tsx

## Import Cycles
- None detected.

## Communities (25 total, 0 thin omitted)

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

### Community 5 - "products.ts"
Cohesion: 0.07
Nodes (31): nextConfig, metadata, CartPage(), metadata, ProductPage(), CategoryPage(), metadata, SignInPage() (+23 more)

### Community 6 - "Google Stitch for Kleawip — read before design work"
Cohesion: 0.29
Nodes (6): Connect Stitch to Codex, Google Stitch for Kleawip — read before design work, If Stitch is not connected, Important content checks, Screen-design sequence, What we are doing

### Community 7 - "package.json"
Cohesion: 0.06
Nodes (34): dependencies, lucide-react, next, react, react-dom, devDependencies, sharp, @types/node (+26 more)

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
Cohesion: 0.12
Nodes (17): apps_storefront_src_app_globals, inter, manrope, metadata, SiteFooter(), SiteHeader(), knownProductIds, StoreContext (+9 more)

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
Cohesion: 0.44
Nodes (8): SearchPage(), matches(), normalized(), score(), searchableProducts, searchProducts(), SearchSuggestion, searchSuggestions()

### Community 21 - "home-campaigns.ts"
Cohesion: 0.29
Nodes (8): AnnouncementRibbon(), campaignHref(), CampaignTarget, HeroSlide, heroSlides, RibbonMessage, ribbonMessages, CategoryId

### Community 22 - "Generated storefront hero assets — demo review"
Cohesion: 0.50
Nodes (3): Final files, Generated storefront hero assets — demo review, Prompt set

### Community 23 - "Kleawip commerce API contract — v1 proposal"
Cohesion: 0.11
Nodes (17): 10. Questions for review, 1. Proposed backend structure and stack, 2. Conventions, 3. Catalogue data model and stable IDs, 4. Storefront endpoints — Milestone 1 (catalogue and campaigns), 5. Admin endpoints — Milestone 1 (outline), 6. Later milestones (outline only; blocked on Phase 0), 7. Mapping from the current storefront fixtures (+9 more)

### Community 24 - "Kleawip build — frontend / backend task split"
Cohesion: 0.20
Nodes (9): Handoff checklist for every milestone, Kleawip build — frontend / backend task split, Milestone 0 — decisions and contract (first, before real commerce), Milestone 1 — real catalogue and campaigns, Milestone 2 — identity, bag and checkout foundation, Milestone 3 — operations and launch readiness, Ownership — avoid editing each other's work, Rules for both builders (+1 more)

## Knowledge Gaps
- **206 isolated node(s):** `nextConfig`, `name`, `version`, `private`, `dev` (+201 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 255 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `products.ts` to `home-campaigns.ts`, `store-provider.tsx`, `package.json`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `Product` connect `products.ts` to `search.ts`, `Kleawip commerce API contract — v1 proposal`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `7. Mapping from the current storefront fixtures` connect `Kleawip commerce API contract — v1 proposal` to `products.ts`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **What connects `nextConfig`, `name`, `version` to the rest of the system?**
  _206 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Phase 0 Client Inputs and Account Ownership Checklist` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._
- **Should `Kleawip Ecommerce Platform Implementation Plan` be split into smaller, more focused modules?**
  _Cohesion score 0.047619047619047616 - nodes in this community are weakly interconnected._
- **Should `Kleawip Feature Expansion Brainstorm` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._