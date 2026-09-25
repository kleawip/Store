// GST tax invoices. One consecutive number series per financial year (April–March, India time), e.g.
// KLW/26-27/00001 (≤ 16 characters, as GST rules require). The whole document is frozen when issued.
// Issued when a shipment is booked (the invoice travels with the goods). Cancelled, never deleted or renumbered,
// if the order is cancelled before dispatch. Credit notes for returns come with returns (Milestone 3 step 3).
import type { SellerDetails } from "@kleawip/contract";
import { INDIAN_STATES } from "@kleawip/contract";
import { asc, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "../audit";
import { invoices, invoiceSequences, orderLines, orders, payments } from "../db/schema";
import { GST_STATE_NUMBERS } from "../domain/gst-states";
import { splitGst } from "../domain/tax";
import type { Tx } from "../orders/service";

const PREFIX = "KLW";

type OrderRow = typeof orders.$inferSelect;
type Address = { name: string; phone: string; line1: string; line2: string; landmark: string; city: string; stateCode: string; stateName: string; pincode: string };

export type InvoiceDocument = {
  /** Absent on invoices issued before credit notes existed. */
  kind?: "invoice" | "credit_note";
  /** Credit notes: the invoice they adjust. */
  againstInvoice?: { number: string; issuedAt: string };
  number: string;
  issuedAt: string;
  orderNumber: string;
  orderDate: string;
  seller: SellerDetails;
  buyer: Address;
  placeOfSupply: { stateCode: string; stateName: string; gstStateNumber: string };
  intraState: boolean;
  lines: {
    description: string;
    sku: string;
    hsnCode: string | null;
    quantity: number;
    unitPricePaise: number;
    /** Share of a discount code (absent on older invoices). */
    discountPaise?: number;
    gstRateBasisPoints: number;
    taxablePaise: number;
    cgstPaise: number;
    sgstPaise: number;
    igstPaise: number;
    totalPaise: number;
  }[];
  shippingPaise: number;
  totals: { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; grandTotalPaise: number };
  payment: { method: "prepaid" | "partial_cod"; paidOnlinePaise: number; codBalancePaise: number };
};

/** Financial year label in India time: 25 Sep 2026 → "26-27"; 10 Mar 2027 → "26-27". */
/** Next number in a per-financial-year series (row-locked, gapless). `series` separates invoices from credit notes. */
export async function nextInFinancialYear(tx: Tx, series: string, now: Date) {
  const fy = financialYear(now);
  const [counter] = await tx
    .insert(invoiceSequences)
    .values({ financialYear: series ? `${series}:${fy}` : fy, lastNumber: 1 })
    .onConflictDoUpdate({ target: invoiceSequences.financialYear, set: { lastNumber: sql`${invoiceSequences.lastNumber} + 1` } })
    .returning();
  return { fy, sequence: counter!.lastNumber };
}

export function financialYear(date: Date) {
  const ist = new Date(date.getTime() + 330 * 60_000);
  const start = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${String(start % 100).padStart(2, "0")}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Issues the order's invoice if it has none (idempotent). Call inside the transaction holding the order lock. */
export async function issueInvoice(tx: Tx, order: OrderRow, seller: SellerDetails, now = new Date()) {
  const [existing] = await tx.select().from(invoices).where(eq(invoices.orderId, order.id));
  if (existing) return existing;

  // Row-locked counter in the same transaction: gapless and never reused, even under concurrent bookings.
  const { fy, sequence } = await nextInFinancialYear(tx, "", now);
  const number = `${PREFIX}/${fy}/${String(sequence).padStart(5, "0")}`;

  const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, order.id)).orderBy(asc(orderLines.sku));
  const paid = await tx.select({ amountPaise: payments.amountPaise }).from(payments).where(sql`${payments.orderId} = ${order.id} AND ${payments.status} = 'captured'`);
  const buyer = order.shippingAddress as Address;
  const intraState = (order.gst as { intraState: boolean }).intraState;

  const docLines = lines.map((line) => {
    const net = line.lineTotalPaise - line.discountPaise;
    const split = splitGst(net, line.taxRateBasisPoints, intraState);
    return {
      description: line.optionsLabel ? `${line.productTitle} (${line.optionsLabel})` : line.productTitle,
      sku: line.sku,
      hsnCode: line.hsnCode,
      quantity: line.quantity,
      unitPricePaise: line.unitPricePaise,
      discountPaise: line.discountPaise,
      gstRateBasisPoints: line.taxRateBasisPoints,
      ...split,
      totalPaise: net,
    };
  });
  const sum = (key: "taxablePaise" | "cgstPaise" | "sgstPaise" | "igstPaise") => docLines.reduce((total, line) => total + line[key], 0);
  const document: InvoiceDocument = {
    kind: "invoice",
    number,
    issuedAt: now.toISOString(),
    orderNumber: order.number,
    orderDate: order.createdAt.toISOString(),
    seller,
    buyer,
    placeOfSupply: { stateCode: buyer.stateCode, stateName: INDIAN_STATES[buyer.stateCode as keyof typeof INDIAN_STATES] ?? buyer.stateName, gstStateNumber: GST_STATE_NUMBERS[buyer.stateCode] ?? "" },
    intraState,
    lines: docLines,
    shippingPaise: order.shippingPaise,
    totals: { taxablePaise: sum("taxablePaise"), cgstPaise: sum("cgstPaise"), sgstPaise: sum("sgstPaise"), igstPaise: sum("igstPaise"), grandTotalPaise: order.totalPaise },
    payment: { method: order.paymentMethod, paidOnlinePaise: paid.reduce((total, payment) => total + payment.amountPaise, 0), codBalancePaise: order.codBalancePaise },
  };
  const [invoice] = await tx.insert(invoices).values({ orderId: order.id, number, financialYear: fy, document, issuedAt: now }).returning();
  return invoice!;
}

/** Marks the invoice cancelled (goods never left). The number stays used, as GST requires. */
export async function cancelInvoice(tx: Tx, orderId: string, now = new Date()) {
  await tx.update(invoices).set({ status: "cancelled", cancelledAt: now }).where(sql`${invoices.orderId} = ${orderId} AND ${invoices.status} = 'issued'`);
}

export async function invoiceFor(db: DbOrTx, orderId: string) {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.orderId, orderId));
  return invoice ?? null;
}
