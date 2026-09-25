# Shopify admin: reference for the Kleawip admin

Status: research note by Claude Code, 25 September 2026. It is **input** to the admin design, not an approved specification.

**Purpose:** learn how a mature commerce admin organises its pages and how its workflows connect, then keep only what **Kleawip** needs. The Kleawip admin is **single-tenant**: one brand, one store, INR, India, and our own staff. It is not a platform that will be resold. Every multi-merchant or platform feature in Shopify is deliberately dropped.

**Method:** navigated a throwaway Shopify development store (the owner confirmed it will not be used). Test records created there: product "TEST Twisted Loop Drying Towel" (variants Single / Pack of 2), customer "Test Customer" (`test.customer@example.com`), draft order #D1.
- **Observed:** everything seen live in that store.
- **Known behaviour:** order detail, fulfilment and refund screens could not be reached, because development stores block order creation without a test payment gateway. Those parts are written from Shopify's documented behaviour.

We copy **concepts and workflows**, not Shopify's visual design, wording or branding.

---

## 1. Navigation map, and what Kleawip keeps

| Shopify section → submenus (observed) | Kleawip decision | Why |
| --- | --- | --- |
| **Home** (setup checklist, Sidekick AI) | **Adapt**: dashboard of today's orders, pending fulfilments, low stock, failed payments, open returns | Staff need a work queue, not onboarding |
| **Orders** → Drafts | **Keep** both. Drafts are needed for phone and WhatsApp orders and bulk quotes | Core |
| (Abandoned checkouts, a Shopify Orders submenu) | **Later**: recovery list once checkout exists | Nice to have |
| **Products** → Collections, Inventory, Purchase orders, Transfers, Gift cards | **Keep** Products, Collections, Inventory. **Later:** Purchase orders (if Kleawip restocks from suppliers through the system). **Drop:** Transfers (single warehouse, TBC). **Drop for now:** Gift cards | One location, 10 base products |
| **Customers** → Segments, Companies | **Keep** Customers. **Later:** simple segments (e.g. "bought automotive"). **Adapt** Companies into **Bulk / B2B enquiries** if Phase 0 approves bulk buying | B2B is a Phase 0 decision |
| **Growth** → Attribution, Autopilot, Campaigns | **Drop.** Use GA4 / Meta pixels instead. Our "campaigns" are the homepage banners (Content) | Platform marketing suite |
| **Discounts** | **Keep**: the core promotions engine | Core |
| **Content** → Metaobjects, Files, Menus, Blog posts | **Adapt** into **Homepage campaigns** (hero + ribbon), **Media library**, **Pages & policies**, and **Blog** (if SEO content is approved). **Drop** generic metaobjects | Replaced by fixed Kleawip content types |
| **Markets** → Catalogs, Rollouts | **Drop.** India-only, INR-only | Multi-country platform feature |
| **Analytics** → Reports, Live View | **Keep** a small reports set: sales, orders, top products, stock, GST summary, COD/RTO | Operations need these |
| **Sales channels** (Online Store themes), **Agentic**, **Apps** | **Drop.** Our storefront is the only channel, and integrations are built in | Platform features |
| **Settings** (see §6) | **Keep ~10 of 20 pages** | See §6 |
| Plan, Billing, trial banner | **Drop** | Kleawip owns the platform |

**Resulting Kleawip admin menu (proposal):**

- Dashboard
- Orders (All orders · Drafts · Returns)
- Products (All products · Collections · Inventory)
- Customers (Customers · Bulk enquiries)
- Discounts
- Content (Homepage campaigns · Media · Pages & policies · Blog)
- Reports
- Settings

That is 8 top-level items instead of Shopify's 14.

---

## 2. How the sections connect

```text
          Settings (store, tax/GST, shipping rules, payments, staff roles, notifications, policies)
                  │ configures ▼
 Collections ◀── Products ──▶ Variants (SKU, price, compare-at, weight) ──▶ Inventory item (per location)
      │              │                         │                                   ▲
      │              │                         ▼                                   │ commit / release / restock
      └──▶ Discounts (apply to products/collections/customers)                     │
                                    │                                              │
Customers ──▶ Cart / Draft order ──▶ totals: subtotal − discounts + shipping, GST included ──▶ Order
      ▲                                                                              │
      └──────────── order history, lifetime spend ◀──────────────────────────────────┤
                                                                                     ▼
                              Payment status · Fulfilment (label/AWB, tracking) · Returns/Refunds
                                                                                     │
                                          Notifications (email/SMS) ◀── every state change
                                          Timeline (audit + staff comments) ◀── every state change
                                          Reports ◀── aggregate of orders/inventory/customers
```

Rules seen or confirmed in Shopify that we should keep:
- **A variant is the unit of sale and of stock.** Products group variants; orders and inventory reference variants (observed: the draft-order picker lists variants with their own price and availability).
- **Discounts target products, collections or customers**, never free-typed prices.
- **Orders snapshot everything** (price, tax, discount, address) at creation, so later product edits don't change past orders.
- **Every record has a timeline**: system events plus internal staff comments (observed on draft #D1: "You created this draft order", with a comment box visible only to staff).

---

## 3. Workflow details observed

### 3.1 Product editor (observed)

A single page. Main column:
- Title, rich-text description, media (images, video, 3D), category (which drives tax and attributes).
- Price block: price, compare-at, unit price, charge tax (Y/N), cost per item.
- Inventory block: "tracked" toggle, quantity per location, SKU, barcode, "sell when out of stock".
- Shipping block: physical-product toggle, package preset, weight, country of origin, HS code.
- Variants block, custom fields (metafields), and SEO listing preview.

Sidebar: Status (Active / Draft / Unlisted), Publishing, Organisation (type, vendor, collections, tags), Template.

**Variants:** add up to 3 option groups (e.g. Pack: Single, Pack of 2). Shopify generates the full combination grid, and each row gets its own price, available stock and image. Invalid combinations are removed by deleting rows.

**Save behaviour:**
- A sticky "Unsaved product — Discard / Save" bar appears on any edit, and the browser warns before you leave with unsaved changes.
- On failure there is a red banner listing *every* error ("There is 1 error with this product: Title can't be blank") and each field is highlighted inline.
- On success a toast appears ("Product created") and the URL changes to the product's permanent page.

**⚠ Pack stock:** Shopify gives "Pack of 2" its **own** stock count (observed: Single = 20, Pack of 2 = 10, independent). It cannot express "a pack of 2 uses 2 single towels" without apps. Our contract (API_CONTRACT §3) supports both *shared units* and *pre-packed stock*. That is a deliberate improvement for Kleawip, pending the client's answer.

### 3.2 Inventory (observed)

A table with one row per variant and these columns:

| Column | Meaning |
| --- | --- |
| **Unavailable** | Damaged, quality-control or safety stock; not sellable |
| **Committed** | Reserved by orders not yet fulfilled |
| **Available** | Sellable now |
| **On hand** | Physically present (= available + committed + unavailable) |
| **Incoming** | Expected from purchase orders |

Other features: inline editing, CSV import and export, filter by location.

Kleawip keeps these five states. They map directly onto our inventory ledger (Available → Reserved → Committed → Fulfilled, plus adjustments with a reason).

### 3.3 Discounts (observed)

"Create discount" asks for one of four types:
1. **Amount off products**
2. **Buy X get Y**
3. **Amount off order**
4. **Free shipping**

The form then has these sections:
- **Method:** a discount code (typed or randomly generated) or an automatic discount.
- **Value:** percentage or fixed ₹ amount.
- **Applies to:** specific collections or specific products.
- **Eligibility:** all customers, segments, or specific customers.
- **Minimum requirement:** none, a minimum ₹ amount, or a minimum quantity.
- **Maximum uses:** total uses and/or one per customer.
- **Combinations:** whether it may stack with other product, order or shipping discounts.
- **Active dates:** start date/time (IST) and an optional end date.
- A live **summary card** restating the rule in plain words ("All customers · No minimum · Can't combine · Active from today").

Kleawip keeps all four types. For "Buy 2 get 1" on mitts, Buy X get Y covers it. The server does every calculation (API_CONTRACT §6). The plain-language summary card is worth copying: it stops staff from publishing a rule they misread.

### 3.4 Draft / manual order (observed)

"Create order" is how staff record phone, WhatsApp or bulk orders:
1. **Products:** pick variants from a searchable list that shows stock and price, or add a custom item.
2. **Customer:** search, or "Create a new customer" inline (first/last name, email, phone with country code, marketing consent checkboxes for email/SMS/WhatsApp, default address, tax exemption, notes, tags). The draft then shows contact details and shipping and billing addresses.
3. **Payment summary:** subtotal, add discount, add shipping, estimated tax, total. Observed: "₹78.36 · 9% CGST · **Included**" on ₹949, so GST is included in the price and split CGST/SGST for intra-state sales.
4. **Actions:** **Send invoice** (the customer pays through a link), **Mark as paid** (money was received another way, and this creates the order), or **Payment due later** (payment terms, e.g. net 15).
5. Draft number `#D1`, a timeline with staff comments, tags, notes, and "More actions" (duplicate, share).

For Kleawip this is the right place to **record COD or bank-transfer bulk orders**. "Send invoice" maps to a Razorpay payment link.

### 3.5 Order lifecycle (known behaviour; not observed, because the dev store blocks orders)

- The order page shows two independent badges:
  - **Payment:** Pending, Authorized, Paid, Partially paid, Partially refunded, Refunded, Voided.
  - **Fulfilment:** Unfulfilled, Partially fulfilled, Fulfilled, Restocked.
- Staff actions: **Fulfil items**, where you pick lines and quantities, enter a tracking number or buy a label, and choose whether to notify the customer. Also: **Refund** (by line, with restock toggle and shipping refund), **Return** (request, then receive, then restock or dispose), **Cancel** (reason, refund, restock), **Edit order** (add or remove items with a price difference), **Print** (packing slip, invoice) and **Archive**.
- The **timeline** records every event and notification sent, and holds staff comments.
- The orders list has saved filter tabs (Unfulfilled, Unpaid, Open, Archived), bulk actions (fulfil, print packing slips) and export.

Kleawip needs all of this. It also adds **COD / partial-COD states**, courier **NDR / RTO** handling for Shiprocket or DTDC, and **GST invoices**. Shopify's basic admin lacks these for India.

### 3.6 Notifications (observed)

The notification settings are split into these groups:
- **Customer notifications** (order and account events).
- **Staff notifications** (new orders).
- **Fulfilment-request notifications** (to a warehouse).
- **Webhooks**.

Observed warning: sending from a Gmail address is not allowed, and a custom domain is required for branded email. That matches our need for a verified Kleawip sending domain (Phase 0).

---

## 4. Settings: Shopify's 20 pages vs Kleawip

| Shopify settings page (observed) | Kleawip |
| --- | --- |
| General (store details, contact, address, currency, units, time zone, activity log) | **Keep**: store profile, IST, INR fixed, **activity log** (our audit) |
| Plan, Billing | Drop |
| Users (staff and permissions) | **Keep**: staff accounts and roles (API_CONTRACT §11 Q3) |
| Payments | **Keep**: Razorpay (keys stored server-side only), COD / partial-COD rules |
| Checkout | **Keep**: login-required rule, required fields, order notes, policy links |
| Customer accounts | **Keep**: login method (OTP), TBC |
| Shipping and delivery | **Keep**: Shiprocket/DTDC connection, rates, free-shipping threshold, pincode serviceability, package presets |
| Taxes and duties | **Keep**: GSTIN, HSN defaults, inclusive/exclusive display |
| Locations | **Keep** (1 warehouse, with multiple later if needed) |
| Notifications | **Keep**: email/SMS/WhatsApp templates |
| Policies | **Keep**: returns, refund, shipping, privacy, terms |
| Domains, Customer privacy | **Keep minimal**: domain lives in Vercel; cookie/consent settings |
| Apps, Sales channels, Customer events (pixels), Metafields/metaobjects, Languages, Markets | Drop, or hard-code in the product (e.g. pixels are configured in code) |

---

## 5. Patterns worth copying in our admin UI (for Codex)

1. A sticky **unsaved-changes bar** (Discard / Save) and a browser warning before leaving with unsaved edits.
2. **Error summary banner plus inline field errors** on save. Our API already returns every field error in `errors[]` with a `path`.
3. **Toasts** for success ("Product created").
4. A **right-hand summary card** on complex forms (discounts, orders), written in plain language.
5. **Inline creation** from within another flow (create a customer inside a draft order) without leaving the page.
6. **Searchable variant picker** showing stock and price.
7. A **timeline with internal staff comments** on orders, customers, products and drafts.
8. **Saved filter tabs, bulk actions and CSV import/export** on list pages.
9. **Status badges** as the first scan point on lists (payment and fulfilment side by side).

---

## 6. Implications for the backend (Claude Code)

Order of work, still subject to the milestone gates:

1. Catalogue (Milestone 1): products, variants with option groups, inventory items with the five states, media, collections (manual lists first; rule-based smart collections only if needed).
2. Audit/timeline table shared by every entity (actor, event, before/after, staff comment).
3. Staff users + roles, activity log.
4. Discount engine covering the four types above, with code or automatic method, eligibility, minimums, usage limits, combination rules and IST schedule.
5. Draft orders, then orders with separate payment and fulfilment states, plus COD / partial COD, returns and refunds, GST invoice numbering.
6. Notifications and reports.

**No multi-store, multi-currency, multi-market, app platform or plan/billing tables** will be created. The schema stays single-tenant for Kleawip.
