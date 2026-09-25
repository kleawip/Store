# Kleawip Ecommerce Platform Implementation Plan

Status: Draft for review

Owner: MarketiX Studio

Last updated: 24 September 2026

This document defines how the Kleawip ecommerce platform will be planned, built, verified and released. It is an internal delivery plan, not a client quotation. The current verified build position is recorded in `docs/PROJECT_BUILD_STATUS.md`. Reversible UX previews may be explored while Phase 0 is open, but production commerce workflows must not begin until their business-critical decisions are approved and every applicable To be confirmed item has an accepted answer.

## 1. Delivery principles

1. No silent assumptions. Every material product, commercial, operational, security or integration decision must be recorded as Confirmed, Proposed or To be confirmed with its source and approval date.
2. One phase at a time. A phase begins only when the previous phase passes its exit gate.
3. Tests are written from approved workflows. Happy paths, failure paths, retries, duplicates, timeouts and recovery paths are specified before implementation.
4. Production is never the first test environment. Work moves through local development, automated CI, preview or test environments, staging, user acceptance testing and production.
5. Critical commerce events are idempotent. Duplicate payment, shipping and notification webhooks must not create duplicate orders, stock deductions, refunds, labels or messages.
6. State changes are explicit. Orders, payments, fulfilments, returns, refunds and inventory movements use documented state machines and audit history.
7. Security and accessibility are built into each phase. They are not postponed until launch.
8. Every release is reversible. Database migrations, configuration changes and deployments require a tested rollback path.
9. All project files created by MarketiX Studio, Codex, Claude or another coding assistant must remain inside `WEBSITE DATA/project`.
10. Graphify is the shared project memory. Its graph must be refreshed after meaningful code and documentation changes.

## 2. Confirmed project constraints

The following requirements are confirmed from the existing discussions and proposal. Phase 0 will validate their exact acceptance criteria.

- A custom ecommerce platform rather than Shopify or a ready-made WordPress template.
- A fast customer storefront with a separate administration experience.
- Light mode as the primary experience and user-selectable dark mode.
- An initial catalogue of 10 base products.
- Product variations can include size, GSM, colour and pack configuration.
- A customer must create or access an account before purchasing.
- Customer account features include profile, addresses, cart, wishlist, order history, order detail and tracking.
- Administration covers products, variants, inventory, orders, customers, offers, coupons, payments, shipping, returns, refunds, reports and content.
- Razorpay is the preferred payment gateway.
- COD and partial COD are required.
- Shiprocket and DTDC are under consideration for shipping and fulfilment.
- The proposed hosting direction is Vercel for the storefront and Railway for backend services.
- Source control and review will use a Git repository supplied or approved by the project owner.
- The original proposal baseline is 67 customer-facing pages or states and 44+ administration views, using reusable templates rather than separately coded static pages.
- The Feature Expansion Addendum updates the agreed planning inventory to 82 customer-facing pages/screens and 73+ administration views (155+ combined major destinations/views); exact selected scope is confirmed in Phase 0.
- Bulk / Wholesale Enquiry already exists in the original 67-page inventory. Phase 0 must decide whether it remains a quote request or expands to minimum quantities, tiered pricing and online bulk checkout. Do not count it as a second page.
- A new “Clients We Work With” page is included in the expansion inventory. Publication depends on written permission and approved names, logos, testimonials or case-study claims.
- Product detail pages use one reusable product template populated by product and variant data.

## 3. Decisions that must be verified before related development

No item below may be converted into production behaviour without written approval.

### Commercial and catalogue

- Final product spreadsheet, SKU rules and variant combinations.
- MRP, selling price, GST rate, HSN code and tax-inclusive or tax-exclusive display.
- Inventory source of truth and whether Amazon or Flipkart stock must synchronize at launch.
- Overselling policy and safety stock rules.
- Low-stock thresholds and back-order policy.
- Bundle, free-gift and coupon rules.

### Customer identity

- Email OTP, mobile OTP, password, social login or an approved combination.
- Whether browsing and cart creation are allowed before login.
- Account recovery, phone or email change and duplicate-account policy.
- Saved payment method requirements and provider support.
- Account deletion and personal-data export process.

### Checkout and payment

- Razorpay merchant account readiness, KYC and test credentials.
- Accepted payment methods and payment capture timing.
- Payment retry and abandoned-payment behaviour.
- Refund approval rules and partial-refund support.
- Invoice numbering and financial reconciliation requirements.

### COD and partial COD

- Deposit type: fixed amount, percentage or rule-based amount.
- Minimum and maximum order value for COD.
- COD fee, if any.
- Product, pincode, customer or risk restrictions.
- Treatment of deposit when an order is cancelled, refused or returned.
- Remaining amount transmitted to the courier.
- Repeat-COD-failure policy and customer communication.

### Shipping and fulfilment

- Final shipping aggregator or direct courier agreement.
- Origin warehouses and pickup addresses.
- Package dimensions and dead or volumetric weight rules.
- Serviceability, courier selection and rate-display rules.
- Free-shipping thresholds and remote-area charges.
- AWB generation, label size, manifest and pickup workflow.
- Printable fulfilment documents: carrier-issued shipping label PDF with provider-supplied AWB barcode/QR when available, customer invoice, packing slip, return label where approved, pick list and pickup manifest. Support bulk download/print and audited reprint history.
- Print output options (such as 4×6 in / 100×150 mm thermal, A6 and A4) must follow the selected courier/provider output and be validated against a sample shipment before being fixed as defaults. Preserve barcode quiet zones and output scale; include a scan/readability test in QA.
- Keep carrier-generated labels authoritative for Kleawip website shipments. Do not invent AWB/QR/barcode values or redraw Amazon/Flipkart marketplace labels. Confirm separately whether marketplace order/label integration is in scope; marketplace documents must remain as issued by the marketplace/carrier.
- NDR, RTO, cancellation, return and damaged-shipment processes.
- Tracking event mapping and customer-facing status language.

### Operations and administration

- Admin roles and permissions.
- Order edit, cancellation, return, replacement and refund authority.
- Inventory adjustment reasons and approval rules.
- Required reports, exports and dashboard metrics.
- Customer support notes and audit-log retention.
- Which homepage, menu, banner and campaign sections the client may edit.
- Whether bulk purchase is quote-only or a complete bulk-order checkout, including minimum quantity, quantity tiers, GST and fulfilment rules.
- Which client organisations may be shown on the “Clients We Work With” page and written permission for each name, logo, quote and case study.

### Legal, communication and analytics

- Approved shipping, cancellation, return, refund, privacy and terms policies.
- Transactional email provider and sending domain.
- SMS and WhatsApp provider, templates and consent requirements.
- Analytics and advertising tools, consent banner and retention requirements.
- SEO migration rules from the current website.

## 4. Proposed architecture subject to Phase 0 approval

The hosting providers below are confirmed preferences. Framework and database choices remain proposed until an Architecture Decision Record is approved.

| Layer | Proposed responsibility | Verification required |
| --- | --- | --- |
| Storefront | Server-rendered, mobile-first ecommerce interface deployed on Vercel | Framework benchmark, preview workflow, image strategy and Core Web Vitals budget |
| Administration | Separate protected web application or protected application area | Role model, workflow density, audit requirements and deployment boundary |
| Backend API | Commerce rules, authentication, catalogue, checkout, orders, integrations and reporting on Railway | Language and framework decision, runtime cost, queue support and team maintainability |
| Primary database | Transactional relational database | Railway region, backups, recovery objective, connection limits and migration process |
| Cache and queue | Sessions, rate limits, background jobs and temporary commerce data | Confirm whether a separate Redis-compatible service is required at launch |
| Object storage | Product media, invoices, exports and generated labels where permitted | Provider, retention, access control and delivery performance |
| Payments | Razorpay API, hosted payment surface where appropriate and verified webhooks | Merchant configuration, capture and refund workflows, signature verification and reconciliation |
| Shipping | Shiprocket or DTDC integration for serviceability, AWB, labels, pickup and tracking | Commercial account, API capability, sandbox access, COD and partial-COD support |
| Messaging | Transactional email with optional SMS and WhatsApp | Provider approval, domain authentication, templates and delivery monitoring |
| Observability | Application errors, performance, structured logs, job health and business alerts | Provider selection, data retention, alert ownership and incident response |

### Architecture boundaries

- Pricing, promotion eligibility, stock reservation and order totals are calculated on the server.
- The browser never decides the payable amount, COD eligibility or inventory availability.
- Razorpay and courier secrets remain only in protected server environments.
- The application stores provider identifiers and verified state, not sensitive card information.
- Background jobs process email, shipping callbacks, report generation and recoverable integration work.
- Every external integration is wrapped behind an internal adapter so a provider can be replaced without rewriting the complete order system.
- Admin actions that affect money, inventory or customer orders are authorized and audited.

## 5. Planned repository structure

The final structure may be adjusted by the approved framework, but every path remains under the project root.

```text
WEBSITE DATA/project/
├── AGENTS.md
├── CLAUDE.md
├── IMPLEMENTATION_PLAN.md
├── README.md
├── apps/
│   ├── storefront/
│   └── admin/
├── services/
│   └── commerce-api/
├── packages/
│   ├── design-system/
│   ├── domain/
│   ├── configuration/
│   └── test-support/
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── schema/
├── docs/
│   ├── decisions/
│   ├── requirements/
│   ├── workflows/
│   ├── integrations/
│   ├── testing/
│   ├── security/
│   └── operations/
├── tests/
│   ├── contract/
│   ├── integration/
│   ├── end-to-end/
│   ├── performance/
│   └── security/
├── scripts/
├── infrastructure/
├── .github/
├── .codex/
├── .claude/
├── .agents/
└── graphify-out/
```

## 6. Environments and release path

| Environment | Purpose | Data rule | Deployment rule |
| --- | --- | --- | --- |
| Local | Developer implementation and unit tests | Generated fixtures only | Manual local start |
| CI | Automated checks for every proposed change | Ephemeral test database | Created and destroyed automatically |
| Preview | UI and integration review for a branch | Synthetic or sanitized data | Automatic branch deployment |
| Staging | Production-like end-to-end and client acceptance testing | Controlled test catalogue and provider sandboxes | Only after CI passes |
| Production | Live customer and operations traffic | Real data | Approved release only |

No production secrets or customer data may be copied into source control, local fixtures or public preview environments.

## 7. Workflow specifications required before coding

Each workflow receives a written state diagram, allowed transitions, permissions, events, failure handling and test cases.

### Order lifecycle

Draft cart → Checkout started → Payment pending or COD selected → Confirmed → Processing → Packed → Shipped → Out for delivery → Delivered

Alternative branches include payment failed, payment expired, customer cancelled, merchant cancelled, shipment cancelled, NDR, RTO, return requested, return approved, return received, replacement and partially or fully refunded.

### Payment lifecycle

Created → Attempted → Authorized or captured → Verified → Reconciled

Alternative branches include failed, abandoned, pending, late success, duplicate callback, signature failure, partially refunded, fully refunded and chargeback or dispute if supported.

### Partial COD lifecycle

Eligibility evaluated → Deposit quoted → Deposit payment created → Deposit verified → Order confirmed with remaining COD amount → Shipping booking created with exact balance → Courier remittance reconciled

The order must not be confirmed when the deposit is unverified. Repeated callbacks must not change the remaining COD amount twice.

### Inventory lifecycle

Available → Reserved → Committed → Fulfilled

Alternative transitions include reservation expiry, cancellation release, return inspection, restock, damage, manual adjustment and reconciliation correction. Every movement records SKU, quantity, reason, actor, source order and timestamp.

### Fulfilment lifecycle

Serviceability checked → Courier selected → AWB created → Label generated → Pickup scheduled → In transit → Delivered

Provider events must map to a stable internal status model so changing courier terminology does not break customer communication.

## 8. Phase plan and quality gates

### Phase 0 Requirements and decision freeze

Objective: replace assumptions with an approved source of truth.

Deliverables:

- Confirmed scope and out-of-scope list.
- Product and variant data template.
- Bulk purchase workflow, minimum order rules, quote/order decision and B2B terms.
- “Clients We Work With” content inventory with permission status for every named client, logo and reference.
- Customer, admin and integration workflow specifications.
- Decision register and Architecture Decision Records.
- Updated page, state and reusable-template inventory (82 customer pages/screens and 73+ administration views, subject to approved modules).
- Acceptance criteria for every critical workflow.
- Risk register, launch success metrics and support ownership.

Verification:

- Walk through every customer and admin workflow with the project owner.
- Resolve contradictions between the proposal, client messages and provider capabilities.
- Obtain written answers for every item that blocks database or integration design.
- Confirm sandbox and documentation access for selected providers.

Exit gate: no unresolved item marked To be confirmed may affect Phase 1 or Phase 2. The project owner approves the requirements baseline.

### Phase 1 Information architecture and UX validation

Objective: prove the complete experience before production code.

Deliverables:

- Sitemap and navigation model.
- Customer journey maps.
- Desktop and mobile wireframes.
- Clickable flows for sign-in, discovery, cart, checkout, payment, partial COD, account, tracking and returns.
- Admin workflows for product setup, inventory, order processing, shipping, refunds, offers and reports.
- Empty, loading, validation, error, offline and permission-denied states.
- Light and dark mode design-system foundations.

Testing:

- Task-based usability review on mobile and desktop.
- Content-completeness review against the approved screen inventory.
- Keyboard path and contrast review.
- Workflow review by the person who will operate the admin panel.

Exit gate: all critical flows are understandable without explanation, all states are designed and the client approves the UX baseline.

### Phase 2 Engineering foundation and continuous integration

Objective: create a safe, repeatable development system.

Deliverables:

- Approved monorepo or repository structure.
- Storefront, admin and API application foundations.
- Environment validation and typed configuration.
- Database migration framework and seed data.
- Authentication boundary, permission framework and audit-log foundation.
- Automated linting, formatting, type checks, unit tests, integration tests and production builds.
- Preview and staging deployment pipelines.
- Error monitoring, structured logging and health endpoints.
- Secret-management and backup plan.

Testing:

- Clean-machine setup test using the README only.
- Pull-request pipeline failure and success tests.
- Database migrate, rollback and restore rehearsal.
- Unauthorized admin and API access tests.
- Staging deployment and rollback smoke test.

Exit gate: a clean checkout of the repository builds, tests and deploys to staging without undocumented manual steps.

### Phase 3 Catalogue variants and inventory domain

Objective: create a correct product and stock foundation.

Deliverables:

- Categories, collections, products, variants, media, attributes and SEO fields.
- SKU uniqueness and valid size, GSM, colour and pack combinations.
- Price, MRP, tax and availability rules.
- Inventory ledger, reservations, adjustments and low-stock alerts.
- Admin catalogue and inventory workflows.
- Import validation for the initial 10 products.

Testing:

- Unit tests for every variant, price and stock rule.
- Database constraints for duplicate and impossible records.
- Concurrent stock reservation tests.
- Import rejection report for malformed product data.
- Admin permission and audit-history tests.

Exit gate: the 10 approved products import without manual database edits, every valid variant is purchasable and invalid combinations cannot be created.

### Phase 4 Customer identity and account

Objective: establish secure account-first purchasing.

Deliverables:

- Approved registration and sign-in method.
- Session management, logout and account recovery.
- Profile, address book, wishlist and account preferences.
- Order list, order detail and tracking surfaces using test orders.
- Account rate limits and suspicious-login controls.

Testing:

- New, returning, expired-session and recovery journeys.
- Duplicate phone or email and account-change scenarios.
- Cross-account authorization tests.
- Session expiry, concurrent-device and logout tests.
- Keyboard, screen-size and accessibility tests.

Exit gate: one customer cannot access or modify another customer’s data, account recovery is verified and all approved account states pass end-to-end tests.

### Phase 5 Cart pricing and promotion engine

Objective: make every displayed and charged total deterministic.

Deliverables:

- Persistent authenticated cart.
- Variant availability and quantity validation.
- Server-side subtotal, discount, shipping and tax calculation.
- Coupon, automatic offer, bundle and free-shipping foundations.
- Promotion priority, combination and usage-limit rules.
- Cart expiry and stock-reservation behaviour.

Testing:

- Pricing truth-table tests from approved commercial examples.
- Boundary tests for dates, quantities, minimum spend and usage limits.
- Concurrent inventory and price-change tests.
- Tampered browser price and coupon requests.
- Time-zone and promotion-expiry tests.

Exit gate: the server independently reproduces every approved pricing example and rejects altered totals from the browser.

### Phase 6 Checkout and Razorpay

Objective: create a recoverable and auditable prepaid checkout.

Deliverables:

- Address selection, pincode validation and order summary.
- Server-created payment orders.
- Razorpay checkout integration.
- Signature-verified webhook processing.
- Pending, failed, abandoned, late-success and retry handling.
- Full and partial refund workflow.
- Daily reconciliation report and mismatch queue.

Testing:

- Razorpay sandbox success and all documented failure cases.
- Invalid signature and forged-payment tests.
- Duplicate, delayed and out-of-order webhook tests.
- Browser closed before redirect and callback-loss recovery tests.
- Refund, partial refund and reconciliation tests.

Exit gate: verified payments create one order only, unverified payments create no confirmed order and every mismatch is visible to an authorized administrator.

### Phase 7 Shipping COD and partial COD

Objective: connect verified orders to a dependable fulfilment workflow.

Deliverables:

- Courier adapter and sandbox integration.
- Pincode serviceability and shipping quote rules.
- COD eligibility and partial-COD deposit calculation.
- AWB, label, manifest, pickup, cancellation and tracking workflows.
- Label/print centre for provider-generated shipping labels and invoices, packing slips, approved return labels, pick lists and manifests; single-order and batch print/download; format selection only where supported; reprint audit trail.
- Verify carrier output dimensions, actual-size printing, address/data handling and barcode/QR scan reliability using provider sandbox/sample documents before launch.
- Stable internal tracking statuses.
- NDR, RTO and return-shipment foundations.
- Shipping reconciliation and exception queue.

Testing:

- Serviceable and unserviceable pincode cases.
- Dead-weight and volumetric-weight examples for 0.5 to 0.7 kg products.
- Prepaid, COD and partial-COD order booking.
- Exact remaining-COD amount transmitted to the provider.
- Duplicate AWB prevention and booking-retry tests.
- Delayed, duplicated and unknown tracking-event tests.
- Provider timeout and temporary-outage recovery tests.

Exit gate: test shipments can be booked, cancelled and tracked without duplicate labels or incorrect COD amounts, and all provider errors produce an actionable admin state.

### Phase 8 Administration and operations

Objective: let the client operate the business without developer assistance for routine work.

Deliverables:

- Role-based dashboard and navigation.
- Product, variant, collection and media management.
- Inventory ledger, adjustments and alerts.
- Order review, payment state, fulfilment and customer communication.
- Coupons, offers and campaign scheduling.
- Returns, replacements and refunds.
- Reports, filters and controlled CSV exports.
- Homepage, banner, menu and selected content management, including per-device banner artwork, validated product/collection links and the editable announcement ribbon (see `docs/design/HOMEPAGE_CAMPAIGNS_SPEC.md`).
- Immutable audit history for sensitive actions.

Testing:

- Task-based operations rehearsal with client representatives.
- Permission matrix tests for every role.
- Large-list filter, search, pagination and export tests.
- Concurrent edit and stale-data tests.
- Audit completeness and destructive-action confirmation tests.

Exit gate: the designated client user completes the daily operations checklist in staging without database access or undocumented workarounds.

### Phase 9 Notifications analytics and SEO

Objective: provide dependable customer communication and measurable growth foundations.

Deliverables:

- Approved transactional email templates and sending-domain authentication.
- Event-driven confirmation, payment, packing, shipment, delivery, cancellation, return and refund messages.
- Optional approved SMS and WhatsApp templates.
- GA4 ecommerce events and approved advertising pixels.
- Consent handling where required.
- Metadata, canonical URLs, product structured data, sitemap and robots rules.
- Redirect plan from the current website.

Testing:

- Event-to-template contract tests.
- Duplicate-message prevention and retry tests.
- Inbox rendering and delivery checks for major email clients.
- Analytics event validation without personal-data leakage.
- SEO crawl for broken links, duplicate metadata and redirect chains.

Exit gate: every approved order event produces the correct message once, analytics totals reconcile with test orders and the SEO migration checklist passes.

### Phase 10 System hardening

Objective: verify the complete platform under realistic failure and traffic conditions.

Deliverables:

- Full regression suite.
- Performance budgets and load-test results.
- Security review and dependency audit.
- Backup restoration and disaster-recovery rehearsal.
- Operational alerts and incident runbooks.
- Browser and device compatibility report.
- Accessibility audit and remediation report.

Testing:

- End-to-end tests for all critical customer and admin journeys.
- Load profile based on approved expected traffic, with burst testing.
- Stock-race and duplicate-checkout testing.
- OWASP-focused authentication, authorization, injection, rate-limit and webhook tests.
- Core Web Vitals measurements using production-like content.
- Controlled dependency, database and provider failure drills.

Exit gate: no unresolved critical or high-severity defect, agreed performance objectives pass and backup restoration is demonstrated.

### Phase 11 User acceptance migration and launch

Objective: release with verified data, ownership and rollback readiness.

Deliverables:

- Client UAT script and signed result.
- Final catalogue, inventory and content migration.
- Production provider credentials and domain configuration.
- Admin training and operating guide.
- Launch checklist, rollback checklist and support contacts.
- Final data, payment, shipping and analytics reconciliation.

Testing:

- Production smoke test using controlled orders.
- Prepaid, COD and partial-COD live verification using approved low-value transactions.
- Email and tracking verification.
- Redirect, indexing and analytics verification.
- Rollback decision rehearsal.

Exit gate: client signs UAT, production smoke tests pass and the release owner explicitly approves launch.

### Phase 12 Stabilization and handover

Objective: detect real-world issues quickly and transfer stable operations.

Deliverables:

- Daily review of errors, failed jobs, payment mismatches, shipping exceptions and slow pages during the agreed stabilization window.
- Prioritized defect log with severity and ownership.
- Updated operations documentation and known limitations.
- Final source, environment and access handover.
- Maintenance and enhancement backlog.

Exit gate: no unresolved critical defect, reconciliation is stable and ongoing support responsibilities are accepted.

## 9. Mandatory automated checks

Every pull request must pass the checks relevant to the files it changes.

- Formatting and linting.
- Static types or equivalent compile-time checks.
- Unit tests for business rules.
- Database migration validation.
- API and provider contract tests.
- Integration tests against an isolated database.
- Component tests for interactive UI states.
- End-to-end tests for critical workflows.
- Accessibility checks.
- Production build.
- Dependency and secret scanning.
- Graphify update and graph consistency where project structure changed.

Critical money, inventory, authorization and order-state modules require exhaustive rule coverage. A numeric coverage target will be approved during Phase 0; coverage percentage alone cannot replace workflow testing.

## 10. Defect severity and phase movement

| Severity | Meaning | Phase gate rule |
| --- | --- | --- |
| Critical | Security exposure, incorrect charge, data loss, duplicate financial action or platform unavailable | Phase stops immediately |
| High | Core purchase or operations workflow cannot complete or produces incorrect state | Must be fixed before exit |
| Medium | Important non-core behaviour is incorrect with a viable workaround | Fix before exit or obtain written deferment |
| Low | Cosmetic or minor usability issue with no data or workflow risk | May be scheduled with owner approval |

A test passes only when the expected result is documented. “It appears to work” is not acceptance evidence.

## 11. Definition of done for each feature

A feature is complete only when all applicable items are true.

- Requirement and acceptance criteria are approved.
- Normal, empty, loading, error, retry and permission states are defined.
- Implementation follows an approved architecture decision.
- Unit, integration and end-to-end tests pass.
- Security and accessibility implications are reviewed.
- Light and dark mode are verified where the feature is visible.
- Mobile and desktop behaviour are verified.
- Logging and monitoring exist for operational failure.
- Documentation and Graphify are updated.
- Staging review passes.
- No unresolved critical or high-severity defect remains.
- The phase owner records acceptance.

## 12. Graphify operating procedure

Graphify 0.9.17 is installed using the official `graphifyy` package with Office and SQL support. Project-scoped support is registered for Codex, Claude Code and generic Agent Skills.

Current rules:

1. Keep `AGENTS.md`, `CLAUDE.md`, `.codex`, `.claude`, `.agents` and `graphify-out` inside the project root.
2. Build the initial graph after the planning documents exist.
3. For codebase questions, query Graphify before broad raw-source searches when a graph exists.
4. Run `graphify update .` after meaningful code or documentation changes.
5. Rebuild or validate the graph before phase review and release.
6. Install the Git post-commit hook only after the owner supplies or approves the final Git repository.
7. Treat graph output as navigational evidence, not as approval to invent missing requirements.

## 13. Phase review record

At the end of every phase, add a review record containing:

- Phase and version.
- Approved requirements.
- Build or deployment identifier.
- Automated test summary.
- Manual and UAT test evidence.
- Open defects by severity.
- Security and accessibility result.
- Performance result where applicable.
- Rollback result where applicable.
- Decision: Pass, Pass with approved deferrals or Fail.
- Approver name and date.

The next phase begins only after a Pass or an explicitly documented Pass with approved deferrals.

## 14. Immediate review decisions

Before Phase 0 can close, the project owner and client must approve or provide:

1. The final commercial scope and explicit exclusions.
2. The initial product and variant spreadsheet.
3. Razorpay account readiness and sandbox access.
4. The shipping provider to test first and its API or sandbox access.
5. The partial-COD commercial rules.
6. Customer login and OTP method.
7. GST, invoice and policy requirements.
8. Admin roles and approval authority.
9. Notification channels and providers.
10. Expected launch traffic, traffic bursts and performance objectives.
11. The Git repository and access model.
12. The staging and production ownership model.
13. Bulk purchase: quote-only or online order, MOQ, quantity breaks, business verification, tax and shipping terms.
14. “Clients We Work With”: approved organisation names, logo files, attribution and written permissions.

Until these decisions are confirmed, work is limited to approved planning, design exploration and reversible project foundations.
