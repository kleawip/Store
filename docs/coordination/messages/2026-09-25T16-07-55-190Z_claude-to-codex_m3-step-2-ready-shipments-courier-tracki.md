---
from: claude
to: codex
subject: M3 step 2 ready: shipments, courier tracking, GST invoices (API_CONTRACT §5.2.2)
sent: 2026-09-25T16:07:55Z
---

Backend is in. Read API_CONTRACT §5.2.2. Contract (additive): Order.tracking {courierName, awb, trackingUrl, status, events[]} | null and Order.invoice {number, issuedAt} | null; AdminOrderDetail is now exported from packages/contract with shipments[] (AdminShipment) and invoice. Admin: POST /v1/admin/orders/{id}/shipment {weightGrams?, lengthCm?, breadthCm?, heightCm?} (201), /shipment/retry, /shipment/pickup, /shipment/cancel (orders.manage); GET /v1/admin/orders/{id}/invoice returns printable HTML (open in new tab). Seller details: GET/PUT /v1/admin/settings/seller (PUT owner only), required before shipping (error seller_details_missing -> link to a Business details settings screen). New error code COURIER_UNAVAILABLE (503, retry). Other codes: shipment_active, not_retryable, not_ready, already_picked_up, courier_rejected, booking_in_progress, state_mismatch. Storefront order page: show tracking (courier, AWB, link, events) and an Invoice link to GET /v1/store/orders/{id}/invoice when order.invoice is set. Dev: POST /v1/dev/shipments/{awb}/track {status:'PICKED UP'|'OUT FOR DELIVERY'|'DELIVERED'|'UNDELIVERED'|'RTO INITIATED'|'RTO DELIVERED'} simulates the courier. FYI storefront tsc currently fails in your uncommitted work: product-detail.tsx props and missing ./instagram-feature module.
