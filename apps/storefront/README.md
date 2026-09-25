# Kleawip storefront preview

This is the first local, reviewable storefront slice. It lives wholly inside `WEBSITE DATA/project` and is **not connected to live orders or customer accounts**.

## Run locally

From this folder:

```bash
npm ci
npm run dev
```

Open the local URL printed by Next.js (normally `http://localhost:3000`). If that port is occupied, Next.js selects another port.

## Quality checks

```bash
npm run typecheck
npm test
npm run build
npm audit --audit-level=moderate
```

The 10 catalogue items and image galleries were transcribed from the public Kleawip website on 24 September 2026. Images were imported and optimized into `public/products`. The full-size website logo and automotive category photograph were sourced from the existing site and optimized into `public/brand`. `npm run images:import` refreshes the 30 catalogue images from the current site if needed; run only after checking source ownership and availability.

Prices, discounts, inventory, variants, OTP, checkout, payments, shipping, delivery estimates, orders and customer data are deliberately not fabricated. The bag and wishlist persist only in this browser's local storage for UX review. The account screens are clearly marked as previews.

The current local app is a UX implementation slice, not the approved production commerce architecture. Provider and business-rule decisions remain in Phase 0.
