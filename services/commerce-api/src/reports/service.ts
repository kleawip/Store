// Reports (Milestone 4). Dates are calendar days in India time, inclusive. Sales count an order on the day it was
// confirmed (paid), even if it's later cancelled; the cancellation's refund shows up as a refund on its own day,
// so any past period's figures never change. GST figures come only from issued invoices and credit notes (the
// frozen documents), which is what the GST returns are filed from; cancelled invoices are listed but not counted.
import { and, asc, eq, gte, inArray, isNotNull, lt, ne, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { creditNotes, invoices, orderLines, orders, refunds, returnLines, returns } from "../db/schema";
import { ApiError } from "../errors";
import type { InvoiceDocument } from "../invoices/service";

const inr = (amount: number) => ({ amount, currency: "INR" as const });
const DAY = 24 * 60 * 60 * 1000;

/** "2026-09-01".."2026-09-30" (IST, inclusive) → [start, end) instants. At most 366 days. */
export function istRange(from: string, to: string) {
  const start = new Date(`${from}T00:00:00+05:30`);
  const end = new Date(new Date(`${to}T00:00:00+05:30`).getTime() + DAY);
  const bad = (message: string) => new ApiError(422, "VALIDATION_FAILED", "Invalid date range", message, [{ path: "from", code: "invalid_range", message }]);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw bad("Use dates like 2026-09-01.");
  if (end <= start) throw bad("The end date must be on or after the start date.");
  if (end.getTime() - start.getTime() > 366 * DAY) throw bad("Choose a range of at most one year.");
  return { start, end };
}

const istDay = (column: unknown, unit: "day" | "month") =>
  sql<string>`to_char(date_trunc(${sql.raw(`'${unit}'`)}, ${column} AT TIME ZONE 'Asia/Kolkata'), ${sql.raw(unit === "day" ? "'YYYY-MM-DD'" : "'YYYY-MM'")})`;

// ---- Sales ----

export async function salesReport(db: Database, query: { from: string; to: string; groupBy: "day" | "month" }) {
  const { start, end } = istRange(query.from, query.to);
  const period = istDay(orders.confirmedAt, query.groupBy);
  const sold = await db
    .select({
      period,
      orders: sql<number>`count(*)::int`,
      // Written out with table names: inside a correlated subquery unqualified columns would resolve to the inner table.
      units: sql<number>`coalesce(sum((SELECT sum(ol.quantity) FROM order_lines ol WHERE ol.order_id = "orders"."id")), 0)::int`,
      gross: sql<number>`coalesce(sum(${orders.merchandisePaise}), 0)::int`,
      discounts: sql<number>`coalesce(sum(${orders.discountPaise} + ${orders.shippingDiscountPaise}), 0)::int`,
      shipping: sql<number>`coalesce(sum(${orders.shippingPaise}), 0)::int`,
      total: sql<number>`coalesce(sum(${orders.totalPaise}), 0)::int`,
      cod: sql<number>`coalesce(sum(${orders.codBalancePaise}), 0)::int`,
    })
    .from(orders)
    .where(and(isNotNull(orders.confirmedAt), gte(orders.confirmedAt, start), lt(orders.confirmedAt, end)))
    .groupBy(period)
    .orderBy(asc(period));
  const refundPeriod = istDay(refunds.createdAt, query.groupBy);
  const refunded = await db
    .select({ period: refundPeriod, amount: sql<number>`coalesce(sum(${refunds.amountPaise}), 0)::int` })
    .from(refunds)
    .where(and(ne(refunds.status, "failed"), gte(refunds.createdAt, start), lt(refunds.createdAt, end)))
    .groupBy(refundPeriod);
  const refundBy = new Map(refunded.map((row) => [row.period, row.amount]));

  const periods = [...new Set([...sold.map((row) => row.period), ...refunded.map((row) => row.period)])].sort();
  const rows = periods.map((key) => {
    const s = sold.find((row) => row.period === key);
    const refundsPaise = refundBy.get(key) ?? 0;
    return {
      period: key,
      orders: s?.orders ?? 0,
      units: s?.units ?? 0,
      grossSales: inr(s?.gross ?? 0),
      discounts: inr(s?.discounts ?? 0),
      shipping: inr(s?.shipping ?? 0),
      totalSales: inr(s?.total ?? 0),
      codToCollect: inr(s?.cod ?? 0),
      refunds: inr(refundsPaise),
      netSales: inr((s?.total ?? 0) - refundsPaise),
    };
  });
  const sum = (pick: (row: (typeof rows)[number]) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const orderCount = sum((row) => row.orders);
  const totalSales = sum((row) => row.totalSales.amount);
  return {
    from: query.from,
    to: query.to,
    groupBy: query.groupBy,
    rows,
    totals: {
      orders: orderCount,
      units: sum((row) => row.units),
      grossSales: inr(sum((row) => row.grossSales.amount)),
      discounts: inr(sum((row) => row.discounts.amount)),
      shipping: inr(sum((row) => row.shipping.amount)),
      totalSales: inr(totalSales),
      codToCollect: inr(sum((row) => row.codToCollect.amount)),
      refunds: inr(sum((row) => row.refunds.amount)),
      netSales: inr(sum((row) => row.netSales.amount)),
      averageOrderValue: inr(orderCount ? Math.round(totalSales / orderCount) : 0),
    },
  };
}

// ---- Products ----

export async function productReport(db: Database, query: { from: string; to: string; limit: number }) {
  const { start, end } = istRange(query.from, query.to);
  const sold = await db
    .select({
      sku: orderLines.sku,
      productTitle: sql<string>`max(${orderLines.productTitle})`,
      optionsLabel: sql<string>`max(${orderLines.optionsLabel})`,
      units: sql<number>`sum(${orderLines.quantity})::int`,
      revenue: sql<number>`sum(${orderLines.lineTotalPaise} - ${orderLines.discountPaise})::int`,
      orders: sql<number>`count(DISTINCT ${orderLines.orderId})::int`,
    })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .where(and(isNotNull(orders.confirmedAt), gte(orders.confirmedAt, start), lt(orders.confirmedAt, end)))
    .groupBy(orderLines.sku)
    .orderBy(sql`sum(${orderLines.lineTotalPaise} - ${orderLines.discountPaise}) DESC`)
    .limit(query.limit);
  const returned = sold.length
    ? await db
        .select({ sku: orderLines.sku, units: sql<number>`sum(${returnLines.quantity})::int` })
        .from(returnLines)
        .innerJoin(returns, eq(returns.id, returnLines.returnId))
        .innerJoin(orderLines, eq(orderLines.id, returnLines.orderLineId))
        .where(and(inArray(returns.status, ["received", "refunded", "closed"]), gte(returns.createdAt, start), lt(returns.createdAt, end), inArray(orderLines.sku, sold.map((row) => row.sku))))
        .groupBy(orderLines.sku)
    : [];
  return {
    from: query.from,
    to: query.to,
    rows: sold.map((row) => ({ ...row, revenue: inr(row.revenue), returnedUnits: returned.find((r) => r.sku === row.sku)?.units ?? 0 })),
  };
}

// ---- GST ----

type DocRow = {
  kind: "invoice" | "credit_note";
  number: string;
  date: string;
  orderNumber: string;
  againstInvoice: string | null;
  buyerName: string;
  placeOfSupply: string;
  status: "issued" | "cancelled";
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
};

export async function gstReport(db: Database, query: { from: string; to: string }) {
  const { start, end } = istRange(query.from, query.to);
  const invoiceRows = await db.select().from(invoices).where(and(gte(invoices.issuedAt, start), lt(invoices.issuedAt, end))).orderBy(asc(invoices.issuedAt));
  const noteRows = await db.select().from(creditNotes).where(and(gte(creditNotes.issuedAt, start), lt(creditNotes.issuedAt, end))).orderBy(asc(creditNotes.issuedAt));

  const documents: DocRow[] = [];
  const hsn = new Map<string, { hsnCode: string; gstRatePercent: number; quantity: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number }>();
  const states = new Map<string, { placeOfSupply: string; taxablePaise: number; taxPaise: number }>();

  const add = (doc: InvoiceDocument, sign: 1 | -1) => {
    for (const line of doc.lines) {
      const key = `${line.hsnCode ?? "—"}|${line.gstRateBasisPoints}`;
      const entry = hsn.get(key) ?? { hsnCode: line.hsnCode ?? "—", gstRatePercent: line.gstRateBasisPoints / 100, quantity: 0, taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 };
      entry.quantity += sign * line.quantity;
      entry.taxablePaise += sign * line.taxablePaise;
      entry.cgstPaise += sign * line.cgstPaise;
      entry.sgstPaise += sign * line.sgstPaise;
      entry.igstPaise += sign * line.igstPaise;
      hsn.set(key, entry);
    }
    const place = `${doc.placeOfSupply.stateName} (${doc.placeOfSupply.gstStateNumber})`;
    const state = states.get(place) ?? { placeOfSupply: place, taxablePaise: 0, taxPaise: 0 };
    state.taxablePaise += sign * doc.totals.taxablePaise;
    state.taxPaise += sign * (doc.totals.cgstPaise + doc.totals.sgstPaise + doc.totals.igstPaise);
    states.set(place, state);
  };
  const docRow = (doc: InvoiceDocument, kind: DocRow["kind"], status: DocRow["status"], issuedAt: Date): DocRow => ({
    kind,
    number: doc.number,
    date: new Date(issuedAt.getTime() + 330 * 60_000).toISOString().slice(0, 10),
    orderNumber: doc.orderNumber,
    againstInvoice: doc.againstInvoice?.number ?? null,
    buyerName: doc.buyer.name,
    placeOfSupply: `${doc.placeOfSupply.stateName} (${doc.placeOfSupply.gstStateNumber})`,
    status,
    taxablePaise: doc.totals.taxablePaise,
    cgstPaise: doc.totals.cgstPaise,
    sgstPaise: doc.totals.sgstPaise,
    igstPaise: doc.totals.igstPaise,
    totalPaise: doc.totals.grandTotalPaise,
  });

  for (const row of invoiceRows) {
    const doc = row.document as InvoiceDocument;
    documents.push(docRow(doc, "invoice", row.status, row.issuedAt));
    if (row.status === "issued") add(doc, 1);
  }
  for (const row of noteRows) {
    const doc = row.document as InvoiceDocument;
    documents.push(docRow(doc, "credit_note", "issued", row.issuedAt));
    add(doc, -1);
  }
  documents.sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));

  const counted = documents.filter((doc) => doc.status === "issued");
  const total = (key: "taxablePaise" | "cgstPaise" | "sgstPaise" | "igstPaise" | "totalPaise") =>
    counted.reduce((sum, doc) => sum + (doc.kind === "credit_note" ? -doc[key] : doc[key]), 0);
  return {
    from: query.from,
    to: query.to,
    totals: {
      invoices: invoiceRows.filter((row) => row.status === "issued").length,
      cancelledInvoices: invoiceRows.filter((row) => row.status === "cancelled").length,
      creditNotes: noteRows.length,
      taxable: inr(total("taxablePaise")),
      cgst: inr(total("cgstPaise")),
      sgst: inr(total("sgstPaise")),
      igst: inr(total("igstPaise")),
      total: inr(total("totalPaise")),
    },
    hsnSummary: [...hsn.values()]
      .sort((a, b) => a.hsnCode.localeCompare(b.hsnCode) || a.gstRatePercent - b.gstRatePercent)
      .map((row) => ({ hsnCode: row.hsnCode, gstRatePercent: row.gstRatePercent, quantity: row.quantity, taxable: inr(row.taxablePaise), cgst: inr(row.cgstPaise), sgst: inr(row.sgstPaise), igst: inr(row.igstPaise) })),
    stateSummary: [...states.values()].sort((a, b) => a.placeOfSupply.localeCompare(b.placeOfSupply)).map((row) => ({ placeOfSupply: row.placeOfSupply, taxable: inr(row.taxablePaise), tax: inr(row.taxPaise) })),
    documents: documents.map((doc) => ({
      kind: doc.kind,
      number: doc.number,
      date: doc.date,
      orderNumber: doc.orderNumber,
      againstInvoice: doc.againstInvoice,
      buyerName: doc.buyerName,
      placeOfSupply: doc.placeOfSupply,
      status: doc.status,
      taxable: inr(doc.taxablePaise),
      cgst: inr(doc.cgstPaise),
      sgst: inr(doc.sgstPaise),
      igst: inr(doc.igstPaise),
      total: inr(doc.totalPaise),
    })),
  };
}

// ---- CSV (for the accountant; opens in Excel/Sheets) ----

const cell = (value: string | number | null) => {
  const text = value === null ? "" : String(value);
  // Quote everything and neutralise spreadsheet formulas (CSV injection) from customer-typed names.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};
const money = (paise: number) => (paise / 100).toFixed(2);

export function gstCsv(report: Awaited<ReturnType<typeof gstReport>>, section: "documents" | "hsn") {
  const lines: (string | number | null)[][] =
    section === "hsn"
      ? [["HSN", "GST rate %", "Quantity", "Taxable value", "CGST", "SGST", "IGST"],
        ...report.hsnSummary.map((row) => [row.hsnCode, row.gstRatePercent, row.quantity, money(row.taxable.amount), money(row.cgst.amount), money(row.sgst.amount), money(row.igst.amount)])]
      : [["Type", "Number", "Date", "Order", "Against invoice", "Buyer", "Place of supply", "Status", "Taxable value", "CGST", "SGST", "IGST", "Total"],
        ...report.documents.map((doc) => [doc.kind === "invoice" ? "Invoice" : "Credit note", doc.number, doc.date, doc.orderNumber, doc.againstInvoice, doc.buyerName, doc.placeOfSupply, doc.status,
          money(doc.taxable.amount), money(doc.cgst.amount), money(doc.sgst.amount), money(doc.igst.amount), money(doc.total.amount)])];
  // BOM so Excel reads ₹/UTF-8 names correctly.
  return `﻿${lines.map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;
}
