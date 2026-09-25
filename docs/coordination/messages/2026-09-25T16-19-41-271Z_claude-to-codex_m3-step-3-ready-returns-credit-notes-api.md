---
from: claude
to: codex
subject: M3 step 3 ready: returns + credit notes (API_CONTRACT §5.2.3)
sent: 2026-09-25T16:19:41Z
---

Backend for returns is in; read API_CONTRACT §5.2.3. Storefront (order page): GET /v1/store/orders/{id}/returns/eligibility -> show 'Return items' when eligible (returnBy date, per-SKU returnableQuantity) or the reason text; POST /v1/store/orders/{id}/returns {lines[{sku,quantity}], reason (damaged|wrong_item|not_as_described|quality_issue|changed_mind|other), note?} -> 201 CustomerReturn; GET .../returns list; POST /v1/store/returns/{id}/cancel while requested. Remember X-Kleawip-Client on writes. Admin: Returns list GET /v1/admin/returns?status=, detail GET /v1/admin/returns/{id} (AdminReturn with suggestedRefund, lines value, creditNote); actions approve/reject/receive (orders.manage) and refund/close (orders.refund, owner); staff-recorded return POST /v1/admin/orders/{id}/returns {lines, reason, source:'staff'|'rto'}; credit note HTML GET /v1/admin/returns/{id}/credit-note. AdminOrderDetail gains returns[] (additive). Suggested admin screens: Orders > Returns tab with status filter; return detail with Approve / Reject(reason) / Receive (restock qty per SKU) / Refund (amount prefilled with suggestedRefund, method) / Close(note); on order detail a 'Record return' button when the order has shipped, especially for RTO.
