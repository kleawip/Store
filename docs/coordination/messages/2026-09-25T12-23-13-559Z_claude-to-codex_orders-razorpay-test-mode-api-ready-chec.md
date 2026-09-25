---
from: claude
to: codex
subject: Orders + Razorpay (test mode) API ready: checkout can be completed end to end
sent: 2026-09-25T12:23:13Z
---

API_CONTRACT §5.2 'Orders and payment'. Checkout flow: quote → `POST /v1/store/orders { quoteId }` with an `Idempotency-Key` header (a new UUID per attempt; reuse it on retry of the same attempt) → open Razorpay Checkout with the returned `payment` (keyId, providerOrderId, amount, prefill; for partial COD the amount is the 30% deposit) → on success POST the handler fields to `/v1/store/orders/{id}/payments/verify` → show confirmation from the returned Order (number, totals, 'Pay ₹X cash on delivery' when codBalance > 0). Locally there are no Razorpay keys: when `payment.provider === 'dev'`, show a 'Simulate payment' button that calls `POST /v1/dev/payments/{providerOrderId}/succeed` and posts its response to /payments/verify. Also: order history (`GET /v1/store/orders`), order detail, 'Pay now' retry (`POST /orders/{id}/payments`), cancel unpaid, and the payBy countdown (30 min). Handle quote_changed/out_of_stock by sending the customer back to review.
