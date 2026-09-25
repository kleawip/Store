# ADR 0002: Phase 0 commerce decisions (26 September 2026)

- **Status:** Partly decided by the owner. Items marked **Recommended** need the owner's written OK before they become production behaviour.
- **Source:** owner reply to Claude Code, 26 September 2026.
- **Prices quoted are approximate** and must be re-checked on each provider's pricing page at sign-up.

## Decided by the owner

| # | Topic | Decision | Effect on the build |
| --- | --- | --- | --- |
| D1 | GST display | **Prices are GST-inclusive.** | The storefront shows one price including GST. Invoices and checkout split out the GST portion: CGST + SGST within the seller's state, IGST otherwise. This is how Shopify displayed it in the research. |
| D2 | Partial COD | **30% paid online at checkout; 70% collected as COD** on delivery. | Order state: deposit payment created → deposit verified (Razorpay) → order confirmed with a fixed COD balance → shipment booked with that exact balance. The order is **not** confirmed until the deposit is verified (IMPLEMENTATION_PLAN §7). |
| D3 | Campaign publishing | **Owner-only for now**, revisit before production. | Already implemented: marketing editors draft and take down; only the Owner publishes. |

## Recommended, awaiting the owner's OK

### R1: Customer sign-in: **WhatsApp OTP first, email OTP as fallback; SMS later**

| Option | Rough cost in India | Set-up burden | Notes |
| --- | --- | --- | --- |
| **WhatsApp OTP** (Meta WhatsApp Cloud API, "authentication" template) | about ₹0.12–0.15 per OTP message | Meta Business verification, a dedicated phone number, one approved OTP template. **No DLT registration.** | High delivery and read rates in India, with one-tap copy-code buttons. The phone number is also what COD and courier delivery need. |
| **Email OTP** | Free at low volume (e.g. Resend's free tier, about 3,000 emails/month; Brevo's free tier, about 300/day) | A verified sending domain (SPF/DKIM) | Cheapest, but Indian shoppers check email less. Good as a fallback, and needed anyway for order emails. |
| **SMS OTP** | about ₹0.15–0.25 per SMS via MSG91 / 2Factor-style providers | **TRAI DLT registration** of the business, sender ID and each template (a one-time fee and a few days to weeks) | The most universal, but the paperwork is the bottleneck. Add it after launch if WhatsApp delivery issues appear. |
| Password | Free | None | Weak for commerce (reused passwords, "forgot password" support load). Not recommended. |

**Recommendation:**
- The phone number (+91) is the customer identity. Verify it with a **WhatsApp OTP**. If WhatsApp fails or the customer chooses it, send an **email OTP** instead.
- Build it behind an `OtpSender` interface so SMS can be added without changing the sign-in flow.
- OTP rules: 6 digits, 5-minute expiry, at most 5 attempts, resend after 30 s, per-number and per-IP rate limits, and only the hash stored.

### R2: Shipping: **Shiprocket**

- Shiprocket is an aggregator. One API gives serviceability by pincode, rates, AWB, labels, pickups, tracking webhooks and COD remittance across many couriers, **including DTDC**.
- Using DTDC directly means one courier, a separate commercial contract and a separate integration.
- Shiprocket has no minimum commitment on its basic plans, and you pay per shipment.
- **Check at sign-up:** that **partial COD with a custom COD amount** (the 70% balance) is supported on the account. It's needed for D2.

### R3: Production image storage: **Cloudflare R2**

- R2's free tier includes about **10 GB of storage** and a generous monthly number of reads and writes. It charges **no egress (download) fees**.
- AWS S3 charges for data transfer out, which grows with every image view.
- For an image-heavy storefront, R2 plus Cloudflare's CDN is the cheaper and faster choice.
- The backend already stores media behind a `MediaStorage` interface, so only the R2 adapter needs to be added.

## Partial COD details to confirm (proposed defaults)

| Question | Proposed default |
| --- | --- |
| What is the 30% calculated on? | The **order total including GST and shipping**, rounded **up** to the nearest rupee online. The COD balance is the exact remainder. |
| Who can use partial COD? | Any serviceable pincode where the courier supports COD. |
| COD value limits | Min ₹0 / max **₹50,000** COD balance per order, subject to the courier limit. |
| Is full COD (0% online) offered? | **No.** Only partial COD (30/70) or full prepaid. **Confirm.** |
| If the customer refuses delivery (RTO) | The 30% deposit is **not refunded automatically**. It covers return shipping, and the Owner decides refunds case by case in the admin. **Confirm.** This must match the published refund policy. |
| If the order is cancelled before dispatch | Refund the 30% deposit to the original payment method via Razorpay. |

## Still open (not answered yet)

- SKU format, and the pack stock model per product (shared single units or pre-packed stock).
- Razorpay merchant account ownership (it must be the client's).
- The WhatsApp Business number and Meta Business verification (the client's own accounts).
