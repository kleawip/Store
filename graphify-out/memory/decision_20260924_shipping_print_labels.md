# Kleawip shipping labels and print centre

## Decision to carry into design and implementation

- Add a custom admin “Packing & Print” workflow for first-party Kleawip website orders.
- Request and store the carrier-issued shipping-label PDF after shipment/AWB creation; do not invent AWBs or encode fake QR/barcodes. Print the provider’s authoritative code(s) and shipment fields.
- Include print/download for shipping label, tax invoice, packing slip, approved return label, pick list and pickup manifest; support single and batch actions plus an auditable reprint history.
- Treat thermal 4×6 in / 100×150 mm, A6 and A4 as candidate output presets only. Confirm exact supported sizes, PDF scaling, label fields and scan requirements using DTDC/Shiprocket account documents and sample shipments before implementation defaults are fixed.
- Distinguish first-party site shipments from Amazon/Flipkart marketplace orders. Do not redraw, crop, alter or recreate marketplace-generated documents without explicit integration requirements. Confirm whether marketplace-order/label integration is in scope during Phase 0.
- Any Stitch mock label must use conspicuous sample placeholders, never real customer details, AWBs, QR codes or barcodes.

## Evidence / vendor references checked 2026-09-24

- Shiprocket support explains single and bulk download of shipping labels from Ready to Ship orders: https://support.shiprocket.in/support/solutions/articles/43000661613-how-to-download-shipping-invoices-and-labels-
- Shiprocket API helpsheet describes generating a label PDF URL after creating a shipment/AWB: https://support.shiprocket.in/support/solutions/articles/43000337456-shiprocket-api-document-helpsheet
- Shiprocket describes configurable label fields including AWB barcode, order barcode, payment mode and routing codes: https://www.shiprocket.in/blog/product-highlights-from-august-2025/
- Flipkart Seller API documentation identifies a label-generation endpoint that generates invoice and shipping labels and marks order items packed: https://seller.flipkart.com/api-docs/order-api-docs/LabelGenRef.html
- Amazon India FBA preparation manual recommends 4×6 in / 10.2×15.2 cm carton labels, but this is not evidence that every Amazon outbound shipping label uses one universal format: https://images-na.ssl-images-amazon.com/images/G/31/rainier/help/Seller-Shipment-Preparation-and-Transportation-Manual-India.pdf

## Caution

Provider terms, marketplace APIs and actual PDF layouts can change. Treat actual account/API responses and written provider confirmation as authoritative at Phase 0 and before print implementation.
