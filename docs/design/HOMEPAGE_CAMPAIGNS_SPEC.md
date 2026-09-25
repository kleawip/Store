# Homepage campaigns — design review specification

Status: **storefront preview implemented for review; protected admin and final campaign artwork not built**. This updates the approved storefront preview direction and does not make a banner editor live.

## Reference and Kleawip adaptation

The Minimalist reference shows an image-led carousel followed immediately by uncluttered product cards. Kleawip will use that content sequence, not Minimalist's visuals, sales language, badges, reviews or exact design. Only Kleawip-owned photography and the supplied real logo may appear in the storefront. No discount, delivery promise, performance claim or bestseller label goes live without approval and a valid commercial rule.

Stitch layout drafts (composition references; the generated content was not adopted):

- Mobile consumer homepage: `projects/18338494338797426087/screens/ad9f16c60a1e4558b77ff73c47559285`
- Desktop consumer homepage: `projects/18338494338797426087/screens/22b70a49ec0840ce93245d89d3ef54fa`
- Desktop Homepage Campaigns admin: `projects/18338494338797426087/screens/6762d62ce8244dd185edcfd4aa5c6333`

The Stitch imagery and copy are *composition references only*. The drafts contain generated imagery and unverified copy; the admin draft also contains unrelated industrial/cleanroom labels. None of those were copied into the local preview. The current banner images are real Kleawip-site assets selected for layout testing, not approved final campaign artwork.

## Storefront behaviour

1. A compact announcement ribbon sits above the header. It may contain one or more approved messages. The whole visible message can link to an approved internal destination. Previous/next controls rotate messages without navigating.
2. The hero directly below the header is one image-led carousel. Use distinct image files for desktop, tablet and mobile rather than cropping a desktop image on a phone. Keep important product details and text inside a safe area on each device.
3. A slide has one destination: a specific published product, a published category/product listing, or another approved internal page. The visible CTA and the rest of the slide lead to this *same* destination. Arrow and dot controls change slides and never trigger navigation.
4. The hero has keyboard-operable arrows/dots, a visible focus state, accessible names and descriptive alt text. If autoplay is approved later, it pauses on hover/focus and respects reduced-motion preferences. Manual movement is the safe default.
5. Below the carousel: a clean featured-products section appears immediately. Use verified names, GSM/size facts and real images. Card image switching remains independent of the product link. Prices remain unshown or marked pending until the signed price list is available. Then category discovery follows.

## Working image slots for review

| Slot | Working source target | Ratio | Storefront breakpoint |
| --- | ---: | ---: | --- |
| Desktop | 1920 × 680 px | ~2.82:1 | 1200 px and wider |
| Tablet | 1200 × 700 px | ~1.71:1 | 768–1199 px |
| Mobile | 750 × 900 px | 5:6 | Up to 767 px |

These are design/crop targets, not permission to distort imagery. The admin shows a per-device crop preview and rejects files too small for the selected slot. Exact final aspect ratios are confirmed during visual approval and can be adjusted without changing the content model. Optimized derivatives are generated for delivery; the original upload is retained in controlled storage.

## Protected admin: Homepage Campaigns

### Hero banners

- List and reorder slides; create, edit, duplicate, archive and preview drafts.
- Fields: internal title, optional visible headline/subtext, CTA label, one link type (`product`, `category/listing`, `internal page`), and searchable target selector. Only existing published targets are selectable for publishing.
- Separate desktop, tablet and mobile image uploads, individual focal/crop previews, mandatory alt text and file-size/dimension checks.
- Start/end schedule in Asia/Kolkata, visibility toggle, Draft/Scheduled/Live/Expired status, and audit history (editor, timestamp, previous/new value).
- Preview the exact desktop, tablet and mobile render before Publish. Do not publish a slide missing a required device image, target, alt text or approved claim.
- A target removed or unpublished after scheduling must automatically unpublish the slide or fall back to a safe published listing; it must never lead to a 404.

### Announcement ribbon

- Manage multiple short messages, order, active state and start/end dates in Asia/Kolkata.
- Optional internal link type/target; if no link is set, the message is plain text, not a dead link.
- Select only approved brand tokens for background/text; preview contrast and mobile wrapping/truncation before publishing.
- If an offer is mentioned, require a matching active offer/coupon rule and approved validity dates. No misleading permanent discount text.

## Acceptance checks before release

- On phone, tablet and desktop, each slide shows the intended distinct image/crop and remains readable in light and dark modes.
- Every slide's image and CTA reach the same correct product or listing; carousel controls only change slides.
- An admin edit to banner image, ordering, target or ribbon text is visible after publish without code deployment; draft changes do not leak publicly.
- Scheduled content starts and ends at the correct India time and expired content disappears from the storefront.
- Missing/invalid image, unpublished destination, invalid time range, unsupported file or offer without a matching rule fails validation with a clear message.
- Admin actions require permission and are auditable; storefront visitors cannot reach campaign editing APIs.

## Still awaiting approval

- Final artwork for each device slot, live banner text, actual product/category targets and whether autoplay is wanted.
- Whether banners can link to campaign landing pages beyond products and listings.
- Which staff roles may draft versus publish campaigns and announcement offers.

No extra customer-facing page is required for this change; it updates the homepage. The protected admin gains one Homepage Campaigns destination with banner and ribbon tabs plus edit/preview states. Reconcile this with the 73+ admin-view planning count after scope sign-off.
