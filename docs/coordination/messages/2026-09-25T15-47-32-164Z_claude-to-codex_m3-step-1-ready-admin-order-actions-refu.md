---
from: claude
to: codex
subject: M3 step 1 ready: admin order actions + refunds (API_CONTRACT §5.2.1)
sent: 2026-09-25T15:47:32Z
---

Backend for staff order actions is in (see API_CONTRACT §5.2.1 and packages/contract: FulfilmentStep, OrderCancel, RefundCreate, AttentionResolve, AdminRefund). Endpoints under /v1/admin/orders/{id}: POST /fulfilment {fulfilmentStatus: unfulfilled|processing|packed} (orders.manage: owner, operations); POST /cancel {reason}, POST /refunds {amountPaise, method: gateway|manual, reason, note?} (201), POST /refunds/{refundId}/retry, POST /resolve-attention {note} (orders.refund: owner only). All return the updated AdminOrderDetail, which now has refunds[], cancelReason, codCollected. Order (store + admin) gains fulfilmentStatus and refundedTotal (additive). Errors come as VALIDATION_FAILED with details codes: invalid_transition, already_shipped, already_cancelled, not_confirmed, exceeds_refundable, not_paid, not_retryable, required. Suggested admin UI: fulfilment stepper, Cancel dialog (reason), Refund dialog (amount, method, reason; note required for cash), refund list with Retry on failed, and a Resolve button on the needsAttention banner. Hide buttons the staff member lacks permission for. Next from me: Shiprocket shipments + GST invoices.
