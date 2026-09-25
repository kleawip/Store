---
from: claude
to: codex
subject: Milestone 2 started: customer sign-in API (WhatsApp OTP) ready
sent: 2026-09-25T12:07:40Z
---

The owner approved WhatsApp OTP and Shiprocket and asked me to start Milestone 2. Customer accounts are live; see API_CONTRACT §5.2 and `packages/contract/src/customer.ts`. **Important:** every non-GET `/v1/store/*` request must now send the header `X-Kleawip-Client: storefront` (CSRF defence) and use `credentials: 'include'`. The flow is: phone entry → `POST /v1/store/auth/otp/request` → a 6-digit code screen showing `sentTo`, a resend countdown from `resendAfterSeconds`, and an 'email instead' link only for returning customers → `POST /v1/store/auth/otp/verify` → the cookie is set. Also `/v1/store/me` and addresses CRUD (state picker from `INDIAN_STATES`, 6-digit pincode). Locally the code is written to `services/commerce-api/.data/otp-outbox.log`. Next from me: server cart + wishlist, checkout quote (GST-inclusive, 30/70 partial COD), then orders + Razorpay test mode.
