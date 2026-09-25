# Storefront preview status — 25 September 2026

## Implemented for review

- Responsive storefront shell with the real Kleawip logo, desktop navigation, a centered-logo mobile/tablet header based on the Car101 layout pattern, mobile drawer/quick navigation, search, wishlist, bag and persisted light/dark preference.
- Home, shop-all, five collection routes, one reusable product detail template for ten catalogue items, search results, preview bag, sign-in gate, account overview, order-history empty state, wishlist, bulk-enquiry and clients pages.
- Product-card image switching without opening the product, now with smaller centered arrows that fade and disable at gallery edges, plus subtle direct-select dots shown in a moving four-image window for larger future galleries; product detail gallery, specification filtering, local preview-bag quantity controls and wishlist toggle.
- 30 optimized WebP catalogue images imported from the existing Kleawip site. The homepage uses a full-width, clickable, automatically rotating image carousel with nine generated campaign images in separate desktop/tablet/mobile compositions, an automatically changing announcement ribbon without arrows, and clean featured products directly below. The generated campaign image set and prompt summary are recorded in `docs/design/GENERATED_HERO_BANNERS.md`.
- Search-as-you-type suggestions match categories and real catalogue products, with thumbnails and a view-all results link. On mobile/tablet, the header and bottom Search buttons now open an in-place search overlay; neither opening nor typing changes the page. The full results page is reached only on explicit submit or “View all results”. Desktop header search retains inline suggestions.
- The preview bag now plays an original short two-note add-to-bag sound on user-triggered adds, controlled by the product-page sound setting and never on page load.
- No invented prices, reviews, customer endorsements, shipping promises or production transactions.

## Stitch visual baseline

This first pass adapts the approved Stitch mobile home, automotive listing, product detail, cart/sign-in, search and account screens. Navigation, responsive behaviour and desktop layouts were then connected into one coherent local preview. See `docs/design/STITCH_MCP_FOR_KLEAWIP.md` for the design workflow. The Stitch project is `projects/18338494338797426087`; no API key is stored in the project.

## Verified

- TypeScript typecheck, 14 unit/data tests and optimized production build. The earlier npm dependency audit found no moderate-or-higher issues.
- Browser visual pass at 320 px and 375 px phones, 768 px tablet, 1024 px compact desktop and 1440 px desktop on the current home and product layouts. No horizontal overflow was observed at those widths. The 375 px check caught a logo/search overlap; the compact header now hides the theme icon below 421 px (the theme toggle remains in the mobile menu) and reduces the logo at 360 px and below.
- Mobile search overlay checked against Car101's live search behaviour: opening and typing `towel` kept the current URL, showed a category plus four matching catalogue products with thumbnails, and Escape closed the panel and returned focus to the trigger. Centered logo confirmed at narrow phone and tablet widths.
- Product-card image switch (including direct dot selection), add-to-bag, cart-to-sign-in gate, mobile drawer and both themes interacted with in the local browser.

## Not approved or built yet

- Final SKU/variant matrix, sizes, GSM/colours/packs, price list, tax treatment and stock source.
- Real customer authentication/OTP, addresses, checkout, payments, shipping, COD/partial COD, refunds and notifications.
- Separate protected administration application, product/inventory/order workflows, real banner/ribbon publishing controls and shipping-label print station. The campaign assets and inactive demo offer are local preview content only.
- Bulk quote versus online checkout rules and permitted client names/logos.
- Legal policies, final merchandising copy, accessibility audit and production performance budget.

This preview is a Phase 1 UX slice. Phase 0 remains open; production commerce implementation must wait for the relevant client decisions and provider access. Review and approve this screen group before expanding the next group.

Responsive viewport checks are not a substitute for final hands-on testing in Safari on iOS and Chrome on Android before launch.
