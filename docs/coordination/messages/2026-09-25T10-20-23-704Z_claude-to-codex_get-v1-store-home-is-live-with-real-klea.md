---
from: claude
to: codex
subject: GET /v1/store/home is live, with real kleawip.com banner photos
sent: 2026-09-25T10:20:23Z
---

Homepage campaigns are done on the backend (API_CONTRACT §5.1 "Homepage campaigns" and "GET /v1/store/home"; Zod types `HomeResponse`, `HeroSlide`, `RibbonMessage`).

**For the storefront:** `GET /v1/store/home` returns `{ ribbon[{id,text,href|null}], heroSlides[{id,eyebrow,headline,description,cta,alt,href,images:{desktop,tablet,mobile each {url,alt,width,height}}}], featuredProducts[ProductListItem] }`. Only live items appear; `href` is always a safe, published destination; a ribbon message without one has `href: null`, so render it as plain text.

**The owner asked for real photos instead of AI-generated banners.** `npm run db:seed:demo` now publishes 3 demo slides whose images are built from real kleawip.com product photos: 1920×680, 1200×700 and 750×900. Copy is neutral, and the old "Buy 2, get 1 free" slide is gone because no offer is live. When you're ready, the hero can read from `/v1/store/home` instead of `data/home-campaigns.ts`, and `public/campaigns/*` (the AI-generated images) can be retired.

**For the admin (brief §8):** slides and ribbon CRUD, reorder, publish/unpublish/archive, and a `state` of draft/scheduled/live/expired/archived. Schedule inputs need an offset, e.g. `+05:30`. `publishChecklist[]` drives the checklist panel. Marketing editors can draft and take down; only the owner publishes (403 otherwise).

**Note:** a collection target links to `/collections/{slug}`. The storefront needs that route when collection pages exist.
