# Kleawip product page ↔ admin mapping (review draft)

Status: design review only. Do not enable checkout or publish product claims from this document. The only confirmed data for the example is **Twisted Loop Drying Towel**, **Automotive Care**, **1200 GSM**. Prices, SKUs, packs, sizes, colours, stock, shipping, offers, reviews, care and return terms require Kleawip approval.

## Customer product-page order

Mobile first: gallery → product title and confirmed attributes → price/availability → pack, size and colour choices (only when approved for live commerce) → quantity → primary purchase action → pincode/serviceability → eligible offers → specification/care/returns accordions → genuine reviews → related products and bulk enquiry. On mobile, a compact Add to Cart / Buy Now bar is visible whenever the full inline actions are outside the viewport, including above them; it hides while those actions are visible. Light mode is primary; the same component states must work in dark mode.

Current local review screen: the Twisted Loop page includes clearly marked **dummy** pack, size and colour choices to assess the selector layout. They are UI-only and do not change price, image, stock, SKU or the preview bag. Add to Cart gives visual feedback and an optional short synthesized chime with a mute control. Buy Now currently adds to the local preview bag and opens that bag; it does not start checkout. Do not treat any sample option as a confirmed Kleawip product variant.

## Admin field mapping

| Customer surface | Admin owner and fields | Rule before publishing |
| --- | --- | --- |
| Title, category, concise summary | Product editor: identity and taxonomy | Approved copy; no unsupported performance claim |
| Gallery, thumbnails and zoom | Media: ordered images/video, alt text, variant association | Use Kleawip-owned assets; at least one valid image |
| Pack / size / GSM / colour selection | Variants: option groups, valid combinations and stable SKU for each purchasable combination | No invented option; unavailable combinations cannot be selected |
| Price, MRP, tax and per-unit comparison | Variant pricing: selling price, compare-at price, tax treatment, pack unit count | Approved price and tax treatment; no false savings |
| Availability | Inventory: stock source, reservation and bundle/pack deduction rule | Variant-specific stock; never promise an unavailable pack |
| Add to bag / Buy now | Commerce configuration: selected SKU, quantity, login hand-off | Checkout remains disabled until order, payment and security gates pass; preserve selection through sign-in |
| Pincode, delivery, COD / partial COD | Shipping rules: provider serviceability, charge, ETA and payment eligibility | Show live result only after courier integration and rules are tested; otherwise show a neutral unavailable state |
| Offer cards and coupon message | Promotions: eligibility, threshold, dates, priority, exclusions, maximum discount and budget | Show only active offers applicable to the selected SKU/cart; calculate server-side |
| Specifications, care, FAQ, returns | Product content modules and approved policy references | Versioned, approved copy; policy links must agree with checkout |
| Ratings and reviews | Review moderation: source, verification status, consent, publication and removal | No fabricated stars, counts, marketplace aggregation or purchaser badge |
| Related products | Merchandising: explicit product links and fallback category rule | Linked products must be published and in scope |
| Bulk enquiry | B2B settings: destination and product prefill | No invented wholesale terms or client claims |

## Publish gate

Admin may save an incomplete draft and preview it, but must prevent publishing a purchasable product until the required SKU, valid option combinations, approved prices/taxes, stock/pack deduction rules, owned media, policy copy and commerce integrations pass validation. In the current local preview, the purchase state stays explicitly non-live.

## Interaction checks before implementation acceptance

1. Changing an approved option updates image, price, stock state, URL selection and per-unit information consistently.
2. Quantity cannot go below one or exceed confirmed available inventory.
3. A pack deducts the correct underlying inventory and uses its actual packed weight for shipping.
4. Wishlist and bag preserve the exact selected SKU; login preserves the intended checkout selection.
5. Offer eligibility recalculates when variant, quantity or postcode changes; no ineligible discount is shown as applicable.
6. Mobile sticky action never hides option validation, errors or navigation; keyboard and screen-reader controls remain usable.
7. Light and dark modes, narrow phones, tablets and desktop are checked visually; no horizontal overflow or clipped labels.
8. Missing admin data renders a neutral state, never an invented claim or a broken purchase flow.

## Design-review caution

Google Stitch generated first-pass mobile PDP and desktop product-editor screens. It also generated unsupported sample text in places despite explicit instructions. The implementation must follow this verified mapping and source catalogue, **not** copy unverified Stitch copy, values, filenames or claims.
