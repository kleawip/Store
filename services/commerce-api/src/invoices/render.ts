// Printable HTML tax invoice (staff print it into the parcel; customers download it). Self-contained: no
// external fonts, scripts or images, so it prints the same everywhere. Every value is HTML-escaped.
import type { InvoiceDocument } from "./service";

const escape = (value: string | number | null | undefined) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const percent = (basisPoints: number) => `${basisPoints / 100}%`;
const istDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const restWords = rest < 20 ? ONES[rest]! : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? ` ${ONES[rest % 10]}` : ""}`;
  return [hundreds ? `${ONES[hundreds]} Hundred` : "", restWords].filter(Boolean).join(" ");
}

/** Indian numbering: 123456789 paise → "Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven Rupees and Eighty Nine Paise". */
export function amountInWords(paise: number) {
  let rupeesPart = Math.floor(paise / 100);
  const paisePart = paise % 100;
  const parts: string[] = [];
  for (const [unit, size] of [["Crore", 10_000_000], ["Lakh", 100_000], ["Thousand", 1000]] as const) {
    const count = Math.floor(rupeesPart / size);
    if (count) parts.push(`${count >= 1000 ? amountInWords(count * 100).replace(/ Rupees.*$/, "") : belowThousand(count)} ${unit}`);
    rupeesPart %= size;
  }
  if (rupeesPart) parts.push(belowThousand(rupeesPart));
  const words = `${parts.join(" ") || "Zero"} Rupees`;
  return paisePart ? `${words} and ${belowThousand(paisePart)} Paise` : words;
}

export function renderInvoiceHtml(doc: InvoiceDocument, status: "issued" | "cancelled") {
  const { seller, buyer } = doc;
  const taxHead = doc.intraState ? "<th>CGST</th><th>SGST</th>" : "<th>IGST</th>";
  const taxCells = (line: { cgstPaise: number; sgstPaise: number; igstPaise: number }) =>
    doc.intraState ? `<td>${rupees(line.cgstPaise)}</td><td>${rupees(line.sgstPaise)}</td>` : `<td>${rupees(line.igstPaise)}</td>`;
  const rows = doc.lines
    .map(
      (line, index) => `<tr><td>${index + 1}</td><td>${escape(line.description)}<div class="muted">SKU ${escape(line.sku)}</div></td><td>${escape(line.hsnCode ?? "—")}</td>` +
        `<td>${line.quantity}</td><td>${rupees(line.unitPricePaise)}</td><td>${rupees(line.taxablePaise)}</td><td>${percent(line.gstRateBasisPoints)}</td>${taxCells(line)}<td>${rupees(line.totalPaise)}</td></tr>`,
    )
    .join("");
  const span = doc.intraState ? 10 : 9;
  const shippingRow = doc.shippingPaise > 0 ? `<tr><td colspan="${span - 1}">Delivery charges</td><td>${rupees(doc.shippingPaise)}</td></tr>` : "";
  const payment = doc.payment.method === "partial_cod"
    ? `Paid online ${rupees(doc.payment.paidOnlinePaise)} · To pay on delivery ${rupees(doc.payment.codBalancePaise)}`
    : `Paid online ${rupees(doc.payment.paidOnlinePaise)}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tax invoice ${escape(doc.number)}</title>
<style>
  body { font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #111; margin: 24px; }
  h1 { font-size: 20px; margin: 0; } .muted { color: #555; font-size: 11px; }
  .head, .parties { display: flex; justify-content: space-between; gap: 24px; flex-wrap: wrap; margin-bottom: 16px; }
  .parties > div { flex: 1 1 240px; border: 1px solid #ccc; padding: 10px; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; } th, td { border: 1px solid #ccc; padding: 6px; text-align: left; vertical-align: top; }
  th { background: #f3f3f3; font-size: 12px; } td:nth-child(n+4) { text-align: right; white-space: nowrap; }
  .totals td { font-weight: 600; } .cancelled { color: #b00020; border: 2px solid #b00020; padding: 4px 10px; display: inline-block; font-weight: 700; }
  @media print { body { margin: 0; } .noprint { display: none; } }
</style></head><body>
<div class="head"><div><h1>Tax Invoice</h1>${status === "cancelled" ? '<div class="cancelled">CANCELLED</div>' : ""}
<div>Invoice no. <strong>${escape(doc.number)}</strong> · Date ${istDate(doc.issuedAt)}</div>
<div>Order ${escape(doc.orderNumber)} · placed ${istDate(doc.orderDate)}</div></div>
<div><strong>${escape(seller.tradeName || seller.legalName)}</strong>${seller.tradeName ? `<div>${escape(seller.legalName)}</div>` : ""}
<div>${escape(seller.line1)}${seller.line2 ? `, ${escape(seller.line2)}` : ""}</div><div>${escape(seller.city)} ${escape(seller.pincode)}</div>
<div>GSTIN <strong>${escape(seller.gstin)}</strong></div>${seller.email ? `<div>${escape(seller.email)}</div>` : ""}${seller.phone ? `<div>${escape(seller.phone)}</div>` : ""}</div></div>
<div class="parties"><div><strong>Bill to / Ship to</strong><div>${escape(buyer.name)}</div><div>${escape(buyer.line1)}${buyer.line2 ? `, ${escape(buyer.line2)}` : ""}</div>
${buyer.landmark ? `<div>${escape(buyer.landmark)}</div>` : ""}<div>${escape(buyer.city)}, ${escape(buyer.stateName)} ${escape(buyer.pincode)}</div><div>${escape(buyer.phone)}</div></div>
<div><strong>Place of supply</strong><div>${escape(doc.placeOfSupply.stateName)} (${escape(doc.placeOfSupply.gstStateNumber)})</div><div class="muted">${doc.intraState ? "Intra-state supply: CGST + SGST" : "Inter-state supply: IGST"}</div></div></div>
<table><thead><tr><th>#</th><th>Item</th><th>HSN</th><th>Qty</th><th>Rate (incl. GST)</th><th>Taxable value</th><th>GST</th>${taxHead}<th>Amount</th></tr></thead>
<tbody>${rows}${shippingRow}
<tr class="totals"><td colspan="5">Total</td><td>${rupees(doc.totals.taxablePaise)}</td><td></td>${taxCells(doc.totals)}<td>${rupees(doc.totals.grandTotalPaise)}</td></tr></tbody></table>
<p><strong>Amount in words:</strong> ${amountInWords(doc.totals.grandTotalPaise)} only</p>
<p>${payment}</p>
<p class="muted">Prices are inclusive of GST. Tax is not payable on reverse charge. This is a computer-generated invoice.</p>
</body></html>`;
}
