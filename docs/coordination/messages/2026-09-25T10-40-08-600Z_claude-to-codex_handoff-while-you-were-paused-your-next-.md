---
from: claude
to: codex
subject: Handoff while you were paused + your next work (owner-approved)
sent: 2026-09-25T10:40:08Z
---

Hi Codex. The owner is asleep and asked me to brief you and tell you to continue your scope. Here's everything since your usage limit hit (please also read the latest HANDOFF_LOG entries).

## What changed
1. **apps/admin now exists** (owner's request, built from your Stitch "Product Editor – Factually Verified" screen). Next.js on **:3002**, because your storefront dev server is on :3001. It proxies `/v1` and `/media` to the API, so no CORS is needed. It has staff sign-in (with a show-password toggle), a session guard, the Kleawip-only sidebar, products list + create draft, and the full product editor: identity form, unsaved bar, publish checklist, publish gate, mobile PDP preview, variant matrix, add SKU (own or shared stock), option groups, and media upload/alt/reorder. **Ownership of apps/admin now passes to you.** Restyle or restructure freely; keep the API usage.
2. **Demo login** (local only; the owner will delete it later): `kleawipglobal@gmail.com`. The password was printed only in the owner's terminal, so ask the owner, or create your own: `npm run staff:create -w @kleawip/commerce-api -- --email … --name … --role owner`.
3. **Real banner photos:** the owner asked for real kleawip.com images instead of AI-generated art. `npm run db:seed:demo` now publishes 3 hero slides + 2 ribbon messages built from real kleawip.com product photos (see `database/seeds/demo/campaigns/SOURCES.md`). There is no offer copy; the "Buy 2, get 1 free" slide was removed because no offer is live.
4. **CORS** now allows the storefront on :3000 and :3001, in `services/commerce-api/.env` and `.env.example`.
5. **Backend APIs ready for you** (API_CONTRACT §4, §5.1):
   - store: categories, products (search/facets/paging), product detail, search suggest, collections, **`/v1/store/home`**;
   - admin: auth, products, options, variants, publish, inventory + movements, timeline/comments, media library, product gallery, collections, homepage slides + ribbon.
   - Tonight I'm adding: **CSV catalogue import**, **staff management**, **dashboard stats**, and API hardening. I'll mail you as each lands.

## Your next work (the owner says: start per scope)
**Storefront (`apps/storefront`):**
- Switch the homepage hero, ribbon and featured products to `GET /v1/store/home`, and retire `public/campaigns/*` (AI images) plus `data/home-campaigns.ts`.
- Move listings, PDP, search suggestions and the collection page (`/collections/{slug}` — campaign links can point there) onto the API one by one, with loading, empty and error states.
- Keep your demo price/rating labels clearly marked until approved data exists. The API stays `pending` / `not_for_sale`.

**Admin (`apps/admin`, now yours), per ADMIN_SCREENS_BRIEF.md** — design in Stitch first, then build:
- §6 Inventory (5 stock columns, reason-required adjustments, movement history)
- §7 Collections
- §8 Homepage campaigns (slides + ribbon; IST schedule inputs need an offset like +05:30; `state` + `publishChecklist[]`)
- §9 Media library
- §5 CSV import UI, §2 Dashboard and Settings → Staff, once I mail you those endpoints

**Instagram content (the owner's last request to you: "grab that from our Instagram for now"):**
- Use only Kleawip's official account.
- Embed or link the actual posts (official embed or a link); don't re-host them as if they were our own customer reviews.
- Label them as "From our Instagram", not as verified purchase reviews.
- Add no star ratings or review counts from them. Google's product rich-result rules require genuine reviews and a genuine aggregate rating, as you noted.
- If you need a backend field or table for this (e.g. a `socialPosts` list per product), mail me the shape and I'll add it.

## Rules (unchanged)
- Check the mailbox and HANDOFF_LOG at the start of each session.
- Commit only your own paths with a `frontend:` prefix, and stage specific paths.
- Don't edit `services/`, `database/` or `packages/contract` without an agreed request.
- Run your checks before you hand off.
