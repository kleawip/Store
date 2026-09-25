# Kleawip admin: screen brief for Stitch (Milestone 1)

Status: **Proposed**, by Claude Code (backend), 25 September 2026. For Codex, who owns the admin UI and runs Stitch. Codex is free to change layout and composition. The **fields, states and rules** below come from the real backend model (`services/commerce-api/src/db/schema.ts`), so the designs match data that will actually exist.

Sources: `docs/research/SHOPIFY_ADMIN_REFERENCE.md` (workflows and patterns), `docs/design/PRODUCT_PAGE_ADMIN_MAPPING_SPEC.md`, `docs/design/HOMEPAGE_CAMPAIGNS_SPEC.md`, and `docs/api/API_CONTRACT.md`.

**Scope rule: Kleawip only.**
- One brand, INR, India, Asia/Kolkata time.
- No store switcher, plans, billing, apps, themes, markets or multi-currency.
- Staff are Kleawip employees only.

**Content rule:**
- Designs use real Kleawip product names and photos.
- Prices, SKUs, stock numbers and discounts in mock-ups must be visibly labelled placeholders, e.g. "₹ — (pending)" and "DEMO-SKU-A". Never use plausible-looking invented values.
- No invented reviews, client logos or claims.

---

## 0. Shared shell (every admin screen)

| Element | Requirement |
| --- | --- |
| Left nav (desktop) / drawer (tablet and phone) | Dashboard · Orders (All, Drafts, Returns) · Products (All, Collections, Inventory) · Customers (Customers, Bulk enquiries) · Discounts · Content (Homepage campaigns, Media, Pages & policies, Blog) · Reports · Settings. **For Milestone 1, only Products and Content are active.** The other items show as disabled with the label "Coming in a later milestone", or are hidden (Codex decides). |
| Top bar | Kleawip logo, global search (products and collections in Milestone 1), signed-in staff name and role, sign out. Light theme is primary; dark theme is supported. |
| Role-aware controls | Hide or disable actions the role cannot perform, and always explain why ("Only Owner can publish campaigns"). The backend enforces this too: a `403 FORBIDDEN` must render an "access denied" state, not a crash. |
| Unsaved-changes bar | A sticky bar with "Unsaved changes · Discard · Save" appears on the first edit. The browser warns before navigating away. |
| Save errors | A summary banner listing every problem ("2 problems to fix before publishing"), each linking to its field, plus an inline error under the field. Drive this from the API `errors[]` `path` values. |
| Success | A short toast ("Product saved", "Published"). |
| Timeline panel | On every editable record: system events (who, what, when, in IST) and internal staff comments. Visible to staff only. |
| Global states | Loading skeletons; empty states with one clear next action; offline/server-error state with retry; session expired → sign in, then return to the same screen. |

**Roles (proposed, TBC):**

| Role | Can do |
| --- | --- |
| Owner | Everything |
| Catalogue manager | Products, variants, media, collections |
| Marketing editor | Campaigns, ribbon, media |
| Operations | Inventory adjustments; orders later |
| Viewer | Read only |

---

## 1. Staff sign-in

- Email + password, then a second-step verification code (proposed). Also "Forgot password".
- States: wrong credentials (generic message; never reveal whether the email exists), locked after repeated attempts (show the wait time), expired session notice, 2FA code wrong or expired.
- No sign-up link. Staff are invited by the Owner (Settings → Staff, a later milestone).

## 2. Dashboard (Milestone 1 version)

Cards, each linking to a filtered list:
- **Products needing attention:** drafts missing required data, count.
- **Low / out of stock SKUs:** count, only when thresholds are set.
- **Scheduled campaigns:** next start/end in IST.
- **Recent activity:** the last 10 audit events.

Order and revenue cards come in Milestone 2. Leave room for them, but don't show fake numbers.

## 3. Products: list

- **Columns:** thumbnail · title · category · status badge (**Draft / Published / Archived**) · variants count · stock summary ("32 available across 3 SKUs", or "Not tracked") · price range ("₹ — (pending)" when there is no approved price) · updated at.
- **Filters and tabs:** All · Published · Draft · Archived; category; stock status (in stock / low / out); "Missing price"; "Missing images"; plus search by title or SKU.
- **Bulk actions** (role-gated): publish, unpublish, archive, add to collection. Show a result summary ("8 published, 2 blocked: see why").
- **Empty state:** "No products yet · Add product · Import CSV".
- Import CSV opens the import flow (§5).

## 4. Product editor (create / edit)

Main column cards, top to bottom:

1. **Details:** title (required), slug (auto-filled from the title, editable until first publish, then locked with an explanation), category (one of 5), short detail line, spec line (e.g. "1200 GSM"), description (rich text: headings, lists, bold, links only).
2. **Media:** drag-to-reorder grid, upload (JPEG/PNG/WebP), **alt text required** per image, optional "show for option value" (e.g. show this image when Colour = Blue). States: uploading, failed upload, too small.
3. **Options & variants:**
   - Up to 3 option groups (examples: Size, GSM, Colour, Pack). Each group has values; colour values have an optional swatch.
   - The UI proposes the combination grid. Staff **remove combinations that don't exist**; only rows kept become SKUs. It must be obvious that removed combinations cannot be bought.
   - Variant grid columns:
     - SKU (unique; an error if duplicated anywhere)
     - Price ₹ (blank = "pending approval")
     - MRP ₹ (optional; must be ≥ price)
     - GST %
     - HSN
     - Pack quantity (e.g. 2)
     - **Stock source** (see below)
     - Available
     - Weight (g)
     - Status (Active / Archived)
   - **Stock source**, per variant. It controls how the pack draws stock, and the UI must make it clear:
     - *"Uses single-unit stock"*: a Pack of 2 draws 2 units from the Single's stock. Available packs = floor(units ÷ 2), shown read-only.
     - *"Own stock"*: the pack is physically pre-packed and has its own count.
4. **Specifications:** label/value rows (e.g. GSM = 1200), reorderable.
5. **Content sections:** Care, FAQ, Returns reference; rich text each.
6. **Search listing:** SEO title, meta description, preview.

Sidebar cards:
- **Status:** Draft / Published / Archived, plus a **publish checklist** that shows what blocks publishing. Items: ≥1 image with alt text; ≥1 active SKU; every active SKU has a price, GST and HSN; stock source set; approved copy.
- **Organisation:** collections (multi-select), merchandising position.
- **Timeline** (shared shell).

States to design:
- a new empty product;
- a draft with blocking checklist items;
- a publish attempt blocked (banner listing items);
- a published product being edited (a warning that changes go live on save);
- an archived product (read-only with "Restore");
- a duplicate SKU error;
- an MRP lower than price error;
- a removed combination.

## 5. Catalogue import (CSV)

1. **Upload** the file. The downloadable template columns match the variant grid.
2. **Validation report:** rows OK / rows with errors (row number, column, message). Nothing is written yet.
3. **Confirm** creates or updates products as **Draft**. The import never publishes.
4. **Result summary** with links.

States: wrong file type, empty file, all rows invalid, partial success.

## 6. Inventory

- One row per **inventory item** (a SKU, or the shared single-unit stock that several pack SKUs draw from; show which SKUs draw from it).
- **Columns, as in Shopify:** Unavailable · Committed · **Available** · On hand · Incoming. Available = On hand − Committed − Unavailable, shown read-only.
- **Adjust stock** drawer: choose On hand / Unavailable, enter +/− quantity, **reason is required** (Received, Count correction, Damaged, Returned-restock, Other + note), then preview the new numbers and save. Every adjustment appears in a movement history for that item: date, staff, change, reason, resulting on-hand.
- Low-stock threshold per item (optional).
- Filters: low, out, not tracked. Export CSV.
- States: negative result blocked ("Cannot reduce on hand below committed + unavailable"), and the role cannot adjust.

## 7. Collections

- **List:** title · products count · status · updated.
- **Editor:** title, slug (same locking rule as products), description, banner image and alt text (optional), **manual product list** with drag-to-reorder and add/remove via a product picker (search, thumbnails, status shown; drafts can be added but are flagged "won't show until published"). Status: Draft / Published.
- Rule-based ("smart") collections are **out of scope** unless requested.

## 8. Homepage campaigns

Two tabs, per `HOMEPAGE_CAMPAIGNS_SPEC.md`.

**Hero slides:**
- A list you can drag to reorder, with status badges: **Draft / Scheduled / Live / Expired / Archived** (computed in IST).
- Each slide: internal title, eyebrow, headline, description, CTA label; **one target** (product, collection/category, or internal page) chosen from a picker that lists only published targets; **three images** (desktop 1920×680, tablet 1200×700, mobile 750×900), each with its own alt text and crop preview; start/end date-time (IST).
- A **device preview switcher** (desktop / tablet / phone) shows exactly what customers will see.
- Publish is blocked (banner plus checklist) when any device image, alt text or target is missing, the target is unpublished, the end is before the start, or text mentions an offer with no active offer rule.

**Announcement ribbon:** a list of short messages you can drag to reorder, each with text (length counter; show mobile truncation), optional link target (same picker), active toggle and schedule.

States: no slides; target was unpublished after scheduling (warning: "Slide hidden: target no longer published"); role may draft but not publish.

## 9. Media library

- A grid of all uploaded images: filename, dimensions, size, alt text, **used by** (which products, slides and collections).
- Upload, edit alt text, replace file (a new URL is generated automatically), delete. Delete is blocked while the image is in use, and the screen lists where it is used.

---

## Handoff

- Admin endpoints for these screens are listed in `API_CONTRACT.md` §5. Detailed request and response schemas will be added to `packages/contract` as each backend piece lands, and the mailbox will say when.
- Please design **phone, tablet and desktop** for the list screens and the product editor. Staff will use tablets in the warehouse for inventory.
- If a screen needs a field that isn't here, message me before designing it so the backend can add it.
