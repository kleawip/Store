# Codex ↔ Claude Code handoff log

Codex (frontend) and Claude Code (backend) talk through two channels:

1. **Mailbox: direct messages, delivered automatically.** Each message is a Markdown file in `docs/coordination/messages/`. A `SessionStart` and `UserPromptSubmit` hook in both agents (`.claude/settings.json`, `.codex/hooks.json`) runs `tools/agent-mail/mail.mjs hook`. When the owner sends either agent a prompt, that agent automatically receives any unread messages from the other.
   - Send: `node tools/agent-mail/mail.mjs send --from codex --to claude --subject "..." --body "..."` (use `--from claude --to codex` from the other side, add `--reply-to <id>` when answering, or pipe a long body on stdin). The tool refuses messages that look like they contain a secret.
   - Read: `node tools/agent-mail/mail.mjs inbox --for codex` shows unread messages; `list --for codex` shows everything.
   - The owner can post to either agent with `--from owner --to codex|claude|all`, or just read the files.
2. **This file: the durable record.** The Open requests table and the session log below. Mailbox messages are for conversation. Anything that is agreed, or still waiting on someone, is recorded here as well.

Neither agent can wake the other up. A message is delivered the next time the owner prompts the receiving agent.

## Protocol — both agents follow this every session

1. **At the start of every session**, read the **Open requests** table, the latest 5 log entries and any mailbox messages the hook delivered, before touching anything.
2. **Stay inside your own paths** (see below). If you need a change in the other side's path, do **not** make it yourself. Add an Open request instead.
3. **To change a shared file**, add an Open request first. Make the change only after the other side (or the project owner) has answered "agreed" in the table. The one exception: each side may append its own dated line to the progress log in `FRONTEND_BACKEND_TASKS.md` and to this file's log.
4. **Before you finish a session**, run your own side's checks. Then append one log entry that says what changed, which files, the test results, and what you need from the other side.
5. **Never** put secrets, API keys, customer data or credentials here, in Graphify, or anywhere else in the repo.
6. The project owner has final say. When an instruction from the owner conflicts with this file, follow the owner and record that you did.

### Path ownership

| Path | Owner | Other side may |
| --- | --- | --- |
| `apps/storefront/**` | Codex | read only |
| `apps/admin/**` | Codex (first screens built by Claude on 25 Sep at the owner's request, handed back) | read only |
| `services/**`, `database/**` | Claude Code | read only |
| `packages/contract/**`, `docs/api/API_CONTRACT.md` | **Shared** | change only after an agreed Open request |
| `FRONTEND_BACKEND_TASKS.md`, `IMPLEMENTATION_PLAN.md`, `AGENTS.md`, `CLAUDE.md`, `docs/PROJECT_BUILD_STATUS.md` | **Shared** | append to the progress logs freely; any other edit needs an agreed Open request |
| `docs/design/**`, `docs/phase-1/**` | Codex | read only |
| `docs/research/**`, `docs/decisions/**` (backend ADRs) | Claude Code | read only |
| `docs/coordination/**`, `tools/agent-mail/**` | **Shared** | send/append freely; changes to the tool need an agreed Open request |
| `graphify-out/**` | Either | run `graphify update .` after your own changes |

### Checks each side runs before handing off

- **Codex:** in `apps/storefront`, `npm run typecheck && npm test && npm run build`.
- **Claude Code:** from the project root, `npm run api:typecheck && npm run api:test`.
- **Contract change:** both sides' checks must pass. `packages/contract` is the single source of the request and response types.

## Open requests

| # | From → To | Request | Status |
| --- | --- | --- | --- |
| 1 | Claude → Codex | Review `docs/api/API_CONTRACT.md`, especially §4 and §11, against the storefront's needs, and list missing or awkward fields. | Open |
| 2 | Claude → Codex | Decide where the admin frontend lives: `apps/admin` (separate app, recommended) or a protected area inside the storefront. | **Done**: `apps/admin` (Codex agreed; Claude built the first screens at the owner's request; ownership now Codex) |
| 3 | Claude → Owner | Approve or reject the proposed backend stack, now written up as `docs/decisions/0001-backend-stack-and-core-conventions.md`. | Open |
| 4 | Claude → Owner | Put the project under git (see the note below). | **Done 25 Sep**: local repo only, no remote yet |
| 5 | Codex → Claude | Add per-product video backend/API for admin upload or Instagram Reel URL, with a stable playable media asset, provenance, validation and publish-safe state. | **Done 26 Sep**: backend contract/endpoints and tests landed; Codex added admin controls. Full storefront API integration remains separate work. |

## Log (newest last)

### 2026-09-25 — Claude Code
- **Changed:**
  - Added `docs/api/API_CONTRACT.md` (v1 proposal, including §11 answering `docs/phase-0/FRONTEND_DATA_HANDOFF.md`).
  - Added `packages/contract`, `services/commerce-api`, `database/migrations/0000_init.sql` and `database/seeds/demo/catalogue.json`.
  - Added the root `package.json` (npm workspaces for `packages/*` and `services/*` only; `apps/storefront` is **not** a workspace member and keeps its own install) and a root `.gitignore`.
  - Added this file, the mailbox tool `tools/agent-mail/mail.mjs`, and `SessionStart`/`UserPromptSubmit` hooks for it in `.claude/settings.json` and `.codex/hooks.json`. The existing graphify hooks are unchanged.
  - Added a progress line to `FRONTEND_BACKEND_TASKS.md`.
  - Added a short Coordination section to `AGENTS.md` and `CLAUDE.md` pointing both agents here.
- **Tests:** `npm run api:typecheck` clean; `npm run api:test` 14/14 passing on Postgres 16 (`kleawip_test`).
- **Did not touch:** `apps/storefront`.
- **For Codex:** until you have reviewed the contract, keep building against the current local fixtures. When you are ready to try the API: from the project root run `npm install`, then `npm run db:migrate && npm run db:seed:demo && npm run api:dev`, then open `http://127.0.0.1:4000/v1/store/products`. CORS already allows `http://localhost:3000`.

### 2026-09-25 (later): Claude Code
- **Changed:** catalogue domain schema (migration `0001`): option groups/values, variants (SKU, price/MRP in paise, GST basis points, HSN, pack quantity, **inventory units per sale** for shared vs pre-packed stock), inventory items (on hand / committed / unavailable / incoming, DB-enforced non-negative available), inventory movement ledger, collections, audit events. Pure availability rules in `services/commerce-api/src/domain/availability.ts`. New endpoint `GET /v1/store/products/{slug}`; the product list now derives `priceFrom`/`availability` from variants. Added `docs/api/ADMIN_SCREENS_BRIEF.md` and `docs/research/SHOPIFY_ADMIN_REFERENCE.md`.
- **Tests:** typecheck clean; 43/43 passing (unit rules + Postgres integration, including duplicate SKU / duplicate combination / MRP < price / negative available all rejected by the database).
- **Demo data:** the seeded catalogue still has **no variants**, so every product stays `not_for_sale` with pending prices. The priced `DEMO-SKU-A/B/C` fixture exists **only inside tests** (`test/fixtures.ts`).
- **For Codex:** `ProductDetail` Zod type is exported from `packages/contract`. Try `GET /v1/store/products/twisted-loop-1200` after `npm run db:migrate && npm run db:seed:demo && npm run api:dev`.
- **Next (backend):** staff auth + roles, then admin catalogue write APIs with audit.

### 2026-09-25 (evening): Claude Code
- **Changed:**
  - Fixed Codex's contract review (see the mailbox).
  - Staff auth: scrypt passwords, hashed session tokens in the DB, `klw_admin` cookie, CSRF header, 30-min idle / 12-h absolute expiry, 5-strike lockout, roles and permissions.
  - Admin APIs: products, options, variants (own/shared stock), publish checklist, inventory adjustments (row-locked, ledger, audit), timeline and comments. Migration `0002`. Script `staff:create`.
  - Full endpoint list: API_CONTRACT §5.1.
- **Tests:** typecheck clean; 86 backend + 3 contract tests passing.
- **For Codex:**
  - `apps/admin` can now sign in and drive products, variants and inventory against the local API.
  - Create a local owner with `npm run staff:create -w @kleawip/commerce-api -- --email … --name … --role owner`.
  - The API origin must allow credentials from the admin origin. Tell me the admin dev port and I'll add it to CORS.
- **Next (backend):** media upload, collections, homepage campaigns, CSV import.

### 2026-09-25 — Codex
- **Changed:** `apps/storefront` only (commit `2451a6f`). Mobile menu now traps keyboard focus, restores focus on close, and locks background scrolling. Primary phone navigation controls have 44 px touch targets; the product sticky buy bar sits directly above the bottom navigation, including safe-area spacing. The Twisted Loop buying area is shorter: long placeholder copy moved below, while fixed sample price/rating are visibly labelled as **demo**. Other local product cards/details also show labelled demo values. These values are frontend-only and do not alter checkout, backend fixtures, or API contracts.
- **Verification:** `npm run typecheck`, `npm test` (20/20), and `npm run build` passed. Browser QA on storefront pages at 320–430 px phone and 768 px tablet widths found no horizontal overflow; menu focus/Escape and the 320 px sticky buy bar were exercised. This is viewport emulation, not physical iOS/Android testing. `graphify update .` completed after code changes.
- **For Claude:** keep pending prices, `not_for_sale`, and genuine-review rules authoritative in the backend. Frontend demo values must be removed/replaced when approved catalogue data is connected. Contract feedback and `apps/admin` recommendation were sent through the mailbox.

### 2026-09-25 (night): Claude Code
- **Changed:**
  - **Media library:** upload, dedupe, where-used, alt text, delete protection. Images are decoded server-side, re-encoded to WebP with metadata stripped, originals kept private. Local disk storage behind a `MediaStorage` interface.
  - **Product images:** attach, option-value link, reorder, remove.
  - **Collections:** admin CRUD, ordered product list, publish checklist, slug lock; storefront list and detail.
  - Migration `0003`; new permission `media.write` (owner, catalogue_manager, marketing_editor).
  - Full list in API_CONTRACT §5.1.
  - This commit also carries Codex's uncommitted 2026-09-25 log entry above, unchanged.
- **Tests:** typecheck clean; 99 backend + 3 contract passing.
- **For Codex:** the admin brief §7 (collections) and §9 (media library) now have working endpoints. Uploads are `multipart/form-data` with a `file` part.
- **Still waiting:** the `apps/admin` local port, for CORS.
- **Next (backend):** homepage campaigns (slides + ribbon, IST scheduling) and `GET /v1/store/home`, then CSV import.

### 2026-09-25 (late): Claude Code
- **Changed:**
  - Homepage campaigns backend: hero slides + announcement ribbon, IST scheduling, publish checklist (per-device image size/shape, alt text, published target, no offer wording), reorder, where-used. Marketing editors draft; the Owner publishes.
  - `GET /v1/store/home`. Migration `0004`.
  - **Demo banners now use real Kleawip photos from kleawip.com** (owner's request), not AI-generated images. Built by `services/commerce-api/scripts/build-demo-campaign-images.ts` into `database/seeds/demo/campaigns/` (see `SOURCES.md` there). `npm run db:seed:demo` publishes 3 demo slides (automotive → product, bath → category, mitts → product) and 2 ribbon messages, all neutral copy with no offers.
- **Tests:** typecheck clean; 116 backend + 3 contract passing. Also verified live against `kleawip_dev`: `/v1/store/home` returned 3 slides, 2 ribbon messages and 8 featured products, and the images serve as WebP.
- **For Codex:**
  - The storefront hero can switch from `data/home-campaigns.ts` (AI-generated art) to `GET /v1/store/home`.
  - Collection targets link to `/collections/{slug}`, which needs a storefront route when you build collection pages.
- **Next (backend):** CSV catalogue import, then staff management.

### 2026-09-25 (evening, owner present): Claude Code
- **Owner requests handled:**
  - Built `apps/admin` from Codex's Stitch product-editor design (sign-in, product list, product editor), then handed it back to Codex.
  - Created a local demo Owner account (`kleawipglobal@gmail.com`; password printed only in the owner's terminal; to be deleted later).
  - Added a show-password toggle.
- **CORS:** the API now allows storefront origins :3000 and :3001. The admin app on :3002 uses the same-origin proxy.
- **Owner is asleep; Claude continues backend scope overnight:**
  1. CSV import
  2. Staff management
  3. Dashboard stats
  4. API hardening, backups, CI, ADR
- **Codex told to resume** per scope: storefront → API integration, remaining admin screens, and the Instagram content task (with review-integrity rules). See the mailbox message.

### 2026-09-25 (night, owner asleep): Claude Code
- **Changed (all backend or shared infra; each item was mailed to Codex):**
  - CSV catalogue import: validate → review → all-or-nothing commit; drafts only.
  - Staff management: invite links, roles, disable, own password change, activity log.
  - `GET /v1/admin/dashboard`.
  - API hardening: helmet, per-IP rate limits (10/min on sign-in and setup), `/ready`, log redaction, trusted proxy hops.
  - `scripts/db` backup, restore and restore rehearsal. **Rehearsal PASSED** on kleawip_dev: 19 tables and the migration history match.
  - `.github/workflows/ci.yml`.
  - ADR 0001.
  - Migrations 0005–0006.
- **Tests:** API and admin typecheck clean; 154 backend + 3 contract tests passing; admin production build passes; `npm audit --omit=dev` finds 0 vulnerabilities.
- **Codex was NOT started.** The screen was locked, so the app couldn't be typed into, and launching Codex headless with full access unattended was blocked by the safety check. All instructions are waiting in Codex's mailbox and arrive with the owner's next prompt to Codex.
- **Still needs the owner / client (nothing blocked tonight's work):**
  - approve ADR 0001;
  - SKU format and pack stock model;
  - GST display;
  - customer login method;
  - payment/COD rules and shipping provider;
  - production media storage;
  - who may publish campaigns;
  - delete the demo account `kleawipglobal@gmail.com` when done.
- **Next (backend), once decisions arrive:** Milestone 2 (customer identity, cart, checkout quote, Razorpay adapter in sandbox, orders).

### 2026-09-26: Claude Code (Milestone 2 backend complete)
- **Owner decisions applied (ADR 0002):** GST-inclusive prices; partial COD at 30% online and 70% cash; WhatsApp OTP sign-in; Shiprocket; campaign publishing owner-only.
- **Built** (API_CONTRACT §5.2, §5.3):
  - customer sign-in (WhatsApp OTP, email fallback), sessions, profile, addresses;
  - server cart (guest + merge at sign-in) and wishlist;
  - pincode serviceability;
  - checkout quote (GST split, 30/70 COD);
  - orders with Razorpay (idempotent, stock reserved under row locks, signature-verified confirmation, webhooks once per event, 30-min expiry, late/duplicate payments flagged);
  - admin order list/detail;
  - product videos (Codex's request).
- **Migrations:** 0007–0011.
- **Tests:** typecheck clean; 225 backend + 3 contract passing. The order suite was run 3 extra times with no flakiness.
- **Adapters:** WhatsApp Cloud API, Resend, Shiprocket and Razorpay are real, and switch on when credentials are set. Development uses the file OTP outbox, a mock courier and the dev payment gateway with `/v1/dev/payments/{id}/succeed`. Production refuses to start without WhatsApp and Razorpay, and live Razorpay keys are refused outside production.
- **TBC defaults (configuration):**
  - seller state `MH`;
  - shipping flat ₹0 (set `SHIPPING_FLAT_PAISE` / `SHIPPING_FREE_ABOVE_PAISE`);
  - max COD balance ₹50,000;
  - no full COD;
  - default parcel weight 500 g;
  - GST on the shipping charge still to be confirmed with the client's accountant.
- **Next (Milestone 3, once the client's accounts exist):**
  - Shiprocket AWB, labels, pickup and tracking webhooks;
  - GST invoices;
  - returns and refunds;
  - order and payment notifications (WhatsApp/email);
  - staff order actions.

### 2026-09-25 — Codex (product reel and admin video controls)
- **Changed:** `apps/storefront` and `apps/admin` only (commit `9e6adab`). The official @kleawip 1200 GSM Twisted Loop reel plays on the local product page from a temporary hosted H.264/AAC copy, muted on entering view, with play/pause, seek, sound and an Instagram attribution footer. It is labelled brand content, not a buyer review. Other products do not inherit this specific reel. The admin product Media & Gallery tab now supports per-product uploaded video or Instagram Reel URL, optional hosted copy, poster selection/upload, rights confirmation, draft creation, ordering, preview, publish/unpublish and removal against API_CONTRACT §5.3.
- **Verification:** storefront typecheck, 20 tests and production build; admin typecheck and production build; backend typecheck, 225 tests and 3 contract tests all passed. Browser QA confirmed the reel plays, mutes/unmutes and seeks; 320 px phone, 390 px phone and 768 px tablet emulation had no horizontal overflow. This is not physical iOS/Android testing. Authenticated admin click-through is pending owner sign-in at :3002.
- **Limits / next:** the storefront still renders fixture products; it does not yet consume `ProductDetail.videos[]` for all published products. The local reel is a demo asset; client approval is required for hosting its soundtrack outside Instagram. The admin deliberately prevents publishing an unverified Instagram-only embed from its UI after local embedding rendered blank. Codec-validation and embed-gate QA notes were sent to Claude via mailbox. `graphify update .` ran after code changes.

### 2026-09-25 — Claude Code (Milestone 3 step 1: order actions and refunds)
- **Changed:** `services/`, `database/` (migration 0013), `packages/contract` (additive), API_CONTRACT §5.2.1. Staff can move confirmed orders unfulfilled → processing → packed; cancel before dispatch (stock released, online payments incl. partial-COD deposits refunded automatically); issue Razorpay or cash refunds within what is refundable; retry failed refunds; resolve `needsAttention` with a note. Razorpay `refund.*` webhooks update refunds (deduped). New permissions `orders.manage` (owner, operations) and `orders.refund` (owner only). `Order` gains `fulfilmentStatus` and `refundedTotal`.
- **Fixed:** queries no longer run in parallel on a transaction connection (cart pricing, order view, refunds); demo seed now clears customers/orders so test files are independent.
- **Verification:** backend typecheck, 236 tests and 3 contract tests passed; dev DB migrated.
- **Next:** step 2 Shiprocket shipments (AWB, label, pickup, tracking webhook → fulfilment statuses, COD collected on delivery) and GST invoices; step 3 returns; step 4 notifications.

## Git rules

`WEBSITE DATA/project` is a **local** git repository on branch `main`. There is no remote yet; the client's GitHub account will be added later and the full history pushed then.

- Commit only your own work, with a prefix: `frontend: …` (Codex), `backend: …` (Claude Code), `docs: …` / `chore: …` for shared files.
- Stage specific paths (`git add apps/storefront` or `git add services database`). Never `git add -A` while the other agent may have uncommitted work in progress.
- Commit after your checks pass, then append your log entry. Never rewrite history (`reset --hard`, `rebase`, `push --force`) and never discard the other agent's uncommitted changes. Ask through the mailbox instead.
- `.env` files, `node_modules`, build output and `tmp/` are ignored. Never commit secrets.
