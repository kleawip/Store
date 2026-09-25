// Returns (Milestone 3 step 3). Flow: the customer asks (within the return window after delivery) → staff approve
// or reject → the parcel arrives and staff inspect it, choosing what goes back on the shelf → staff refund (online or
// cash, reusing the refund rules) and a GST credit note is issued against the invoice. Staff can also record a
// return themselves (e.g. an RTO parcel), which starts approved. Reverse pickup is arranged by staff for now.
import { and, asc, count, desc, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { recordAudit, type DbOrTx } from "../audit";
import type { CommerceSettings } from "../checkout/settings";
import type { Database } from "../db/client";
import { creditNotes, customers, inventoryItems, inventoryMovements, invoices, orderLines, orders, refunds, returnLines, returns, shipments, staffUsers } from "../db/schema";
import { splitGst } from "../domain/tax";
import { notFound } from "../errors";
import { nextInFinancialYear, type InvoiceDocument } from "../invoices/service";
import { invalid, lockedOrder, recordRefunds, sendPendingRefunds } from "../orders/lifecycle";
import type { Tx } from "../orders/service";
import type { PaymentGateway } from "../payments/gateway";

type ReturnRow = typeof returns.$inferSelect;
type OrderLineRow = typeof orderLines.$inferSelect;
type Reason = ReturnRow["reason"];

const inr = (amount: number) => ({ amount, currency: "INR" as const });
const UUID = /^[0-9a-f-]{36}$/i;
/** Returns that no longer hold any quantity. */
const RELEASED: ReturnRow["status"][] = ["rejected", "cancelled"];

/** Value of `quantity` units of a line at the price actually paid (line totals are GST-inclusive). */
const unitsValue = (line: OrderLineRow, quantity: number) => Math.round((line.lineTotalPaise * quantity) / line.quantity);

async function returnableLines(db: DbOrTx, orderId: string) {
  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, orderId)).orderBy(asc(orderLines.sku));
  const taken = await db
    .select({ orderLineId: returnLines.orderLineId, quantity: sql<number>`sum(${returnLines.quantity})::int` })
    .from(returnLines)
    .innerJoin(returns, eq(returns.id, returnLines.returnId))
    .where(and(eq(returns.orderId, orderId), notInArray(returns.status, RELEASED)))
    .groupBy(returnLines.orderLineId);
  const used = new Map(taken.map((row) => [row.orderLineId, row.quantity]));
  return lines.map((line) => ({ line, returnable: line.quantity - (used.get(line.id) ?? 0) }));
}

async function deliveredAt(db: DbOrTx, orderId: string) {
  const [row] = await db.select({ deliveredAt: shipments.deliveredAt }).from(shipments).where(and(eq(shipments.orderId, orderId), eq(shipments.status, "delivered")));
  return row?.deliveredAt ?? null;
}

// ---- Customer side ----

async function customerOrderRow(db: DbOrTx, customerId: string, orderId: string) {
  if (!UUID.test(orderId)) throw notFound("Order not found.");
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.customerId, customerId)));
  if (!order) throw notFound("Order not found.");
  return order;
}

async function eligibilityFor(db: DbOrTx, settings: CommerceSettings, order: typeof orders.$inferSelect, now: Date) {
  const lines = await returnableLines(db, order.id);
  const view = lines.map(({ line, returnable }) => ({ sku: line.sku, productTitle: line.productTitle, optionsLabel: line.optionsLabel, returnableQuantity: returnable }));
  const delivered = order.fulfilmentStatus === "delivered" ? await deliveredAt(db, order.id) : null;
  if (order.status !== "confirmed" || !delivered) return { eligible: false, reason: "Returns open once your order has been delivered.", returnBy: null, lines: view, lineRows: lines };
  const returnBy = new Date(delivered.getTime() + settings.returnWindowDays * 24 * 60 * 60 * 1000);
  if (now > returnBy) return { eligible: false, reason: `The ${settings.returnWindowDays}-day return window for this order has closed.`, returnBy: returnBy.toISOString(), lines: view, lineRows: lines };
  if (!lines.some((row) => row.returnable > 0)) return { eligible: false, reason: "Everything in this order already has a return.", returnBy: returnBy.toISOString(), lines: view, lineRows: lines };
  return { eligible: true, reason: null, returnBy: returnBy.toISOString(), lines: view, lineRows: lines };
}

export async function returnEligibility(db: Database, settings: CommerceSettings, customerId: string, orderId: string, now = new Date()) {
  const { lineRows: _rows, ...result } = await eligibilityFor(db, settings, await customerOrderRow(db, customerId, orderId), now);
  return result;
}

/** Validates requested SKUs/quantities against what's still returnable and returns the order lines to use. */
function pickLines(available: Awaited<ReturnType<typeof returnableLines>>, requested: { sku: string; quantity: number }[]) {
  const seen = new Set<string>();
  return requested.map((item, index) => {
    if (seen.has(item.sku)) throw invalid(`lines.${index}.sku`, "duplicate_sku", `${item.sku} is listed twice.`);
    seen.add(item.sku);
    const match = available.find((row) => row.line.sku === item.sku);
    if (!match) throw invalid(`lines.${index}.sku`, "not_in_order", `${item.sku} isn't part of this order.`);
    if (item.quantity > match.returnable) {
      throw invalid(`lines.${index}.quantity`, "exceeds_returnable", match.returnable === 0 ? `${match.line.productTitle} already has a return.` : `Only ${match.returnable} of ${match.line.productTitle} can be returned.`);
    }
    return { line: match.line, quantity: item.quantity };
  });
}

async function insertReturn(tx: Tx, orderId: string, input: { source: ReturnRow["source"]; status: ReturnRow["status"]; reason: Reason; note: string; staffId: string | null }, picked: { line: OrderLineRow; quantity: number }[]) {
  const [{ next }] = (await tx.execute<{ next: string }>(sql`SELECT nextval('return_number_seq')::text AS next`)).rows as [{ next: string }];
  const now = new Date();
  const [created] = await tx
    .insert(returns)
    .values({
      number: `RET${next}`,
      orderId,
      source: input.source,
      status: input.status,
      reason: input.reason,
      customerNote: input.source === "customer" ? input.note : "",
      staffNote: input.source === "customer" ? null : input.note || null,
      decidedByStaffId: input.status === "approved" ? input.staffId : null,
      decidedAt: input.status === "approved" ? now : null,
    })
    .returning();
  await tx.insert(returnLines).values(picked.map(({ line, quantity }) => ({ returnId: created!.id, orderLineId: line.id, quantity })));
  return created!;
}

export async function requestReturn(
  db: Database,
  settings: CommerceSettings,
  customerId: string,
  orderId: string,
  input: { lines: { sku: string; quantity: number }[]; reason: Exclude<Reason, "undelivered">; note: string },
  now = new Date(),
) {
  const id = await db.transaction(async (tx) => {
    await customerOrderRow(tx, customerId, orderId);
    const order = await lockedOrder(tx, orderId);
    const eligibility = await eligibilityFor(tx, settings, order, now);
    if (!eligibility.eligible) throw invalid("orderId", "not_returnable", eligibility.reason!);
    const created = await insertReturn(tx, order.id, { source: "customer", status: "requested", reason: input.reason, note: input.note, staffId: null }, pickLines(eligibility.lineRows, input.lines));
    await recordAudit(tx, { entityType: "order", entityId: order.id, action: "return.requested", actorStaffId: null, after: { returnId: created.id, number: created.number, reason: input.reason } });
    return created.id;
  });
  return customerReturn(db, id);
}

export async function customerReturns(db: Database, customerId: string, orderId: string) {
  await customerOrderRow(db, customerId, orderId);
  const rows = await db.select({ id: returns.id }).from(returns).where(eq(returns.orderId, orderId)).orderBy(desc(returns.createdAt));
  const out = [];
  for (const row of rows) out.push(await customerReturn(db, row.id));
  return out;
}

export async function cancelReturnByCustomer(db: Database, customerId: string, returnId: string) {
  const row = await ownReturn(db, customerId, returnId);
  await db.transaction(async (tx) => {
    const locked = await lockedReturn(tx, row.id);
    if (locked.status !== "requested") throw invalid("status", "not_cancellable", "This return is already being handled. Contact us to change it.");
    await tx.update(returns).set({ status: "cancelled", closedAt: new Date(), updatedAt: new Date() }).where(eq(returns.id, locked.id));
    await recordAudit(tx, { entityType: "order", entityId: locked.orderId, action: "return.cancelled_by_customer", actorStaffId: null, after: { returnId: locked.id } });
  });
  return customerReturn(db, row.id);
}

async function ownReturn(db: DbOrTx, customerId: string, returnId: string) {
  if (!UUID.test(returnId)) throw notFound("Return not found.");
  const [row] = await db.select({ id: returns.id }).from(returns).innerJoin(orders, eq(orders.id, returns.orderId)).where(and(eq(returns.id, returnId), eq(orders.customerId, customerId)));
  if (!row) throw notFound("Return not found.");
  return row;
}

async function refundedFor(db: DbOrTx, returnId: string) {
  const [row] = await db.select({ total: sql<number>`coalesce(sum(${refunds.amountPaise}), 0)::int` }).from(refunds).where(and(eq(refunds.returnId, returnId), ne(refunds.status, "failed")));
  return row?.total ?? 0;
}

async function linesFor(db: DbOrTx, returnId: string) {
  return db
    .select({ returnLine: returnLines, line: orderLines })
    .from(returnLines)
    .innerJoin(orderLines, eq(orderLines.id, returnLines.orderLineId))
    .where(eq(returnLines.returnId, returnId))
    .orderBy(asc(orderLines.sku));
}

async function customerReturn(db: DbOrTx, returnId: string) {
  const [row] = await db.select().from(returns).where(eq(returns.id, returnId));
  const lines = await linesFor(db, returnId);
  return {
    id: row!.id,
    number: row!.number,
    orderId: row!.orderId,
    status: row!.status,
    reason: row!.reason,
    note: row!.customerNote,
    rejectionReason: row!.rejectionReason,
    lines: lines.map(({ returnLine, line }) => ({ sku: line.sku, productTitle: line.productTitle, optionsLabel: line.optionsLabel, quantity: returnLine.quantity })),
    refundedTotal: inr(await refundedFor(db, returnId)),
    requestedAt: row!.createdAt.toISOString(),
  };
}

// ---- Staff side ----

async function lockedReturn(tx: Tx, returnId: string) {
  if (!UUID.test(returnId)) throw notFound("Return not found.");
  const [row] = await tx.select().from(returns).where(eq(returns.id, returnId)).for("update");
  if (!row) throw notFound("Return not found.");
  return row;
}

/** Locks the order first, then the return (the same order as every other order action, so no deadlocks). */
async function lockForAction(tx: Tx, returnId: string) {
  if (!UUID.test(returnId)) throw notFound("Return not found.");
  const [found] = await tx.select({ orderId: returns.orderId }).from(returns).where(eq(returns.id, returnId));
  if (!found) throw notFound("Return not found.");
  const order = await lockedOrder(tx, found.orderId);
  return { order, ret: await lockedReturn(tx, returnId) };
}

const requireStatus = (ret: ReturnRow, allowed: ReturnRow["status"][], message: string) => {
  if (!allowed.includes(ret.status)) throw invalid("status", "invalid_transition", message);
};

export async function staffCreateReturn(
  db: Database,
  orderId: string,
  input: { lines: { sku: string; quantity: number }[]; reason: Reason; source: "staff" | "rto"; note: string },
  actorStaffId: string,
) {
  return db.transaction(async (tx) => {
    const order = await lockedOrder(tx, orderId);
    const shipped = ["shipped", "out_for_delivery", "delivered", "rto_initiated", "returned_to_origin"];
    if (order.status !== "confirmed" || !shipped.includes(order.fulfilmentStatus)) {
      throw invalid("orderId", "not_returnable", "Only orders that have left the warehouse can have a return. Cancel unshipped orders instead.");
    }
    const created = await insertReturn(tx, order.id, { source: input.source, status: "approved", reason: input.reason, note: input.note, staffId: actorStaffId }, pickLines(await returnableLines(tx, order.id), input.lines));
    await recordAudit(tx, { entityType: "order", entityId: order.id, action: "return.recorded_by_staff", actorStaffId, after: { returnId: created.id, number: created.number, source: input.source } });
    return created.id;
  });
}

export async function approveReturn(db: Database, returnId: string, note: string | null, actorStaffId: string) {
  await db.transaction(async (tx) => {
    const { ret } = await lockForAction(tx, returnId);
    requireStatus(ret, ["requested"], "Only new return requests can be approved.");
    await tx.update(returns).set({ status: "approved", staffNote: note, decidedByStaffId: actorStaffId, decidedAt: new Date(), updatedAt: new Date() }).where(eq(returns.id, ret.id));
    await recordAudit(tx, { entityType: "order", entityId: ret.orderId, action: "return.approved", actorStaffId, after: { returnId: ret.id }, comment: note ?? undefined });
  });
}

export async function rejectReturn(db: Database, returnId: string, reason: string, actorStaffId: string) {
  await db.transaction(async (tx) => {
    const { ret } = await lockForAction(tx, returnId);
    requireStatus(ret, ["requested"], "Only new return requests can be rejected.");
    const now = new Date();
    await tx.update(returns).set({ status: "rejected", rejectionReason: reason, decidedByStaffId: actorStaffId, decidedAt: now, closedAt: now, updatedAt: now }).where(eq(returns.id, ret.id));
    await recordAudit(tx, { entityType: "order", entityId: ret.orderId, action: "return.rejected", actorStaffId, after: { returnId: ret.id }, comment: reason });
  });
}

/** The parcel is back: staff say how many of each line go back on the shelf (default: all). */
export async function receiveReturn(db: Database, returnId: string, input: { lines: { sku: string; restockQuantity: number }[]; note: string | null }, actorStaffId: string) {
  await db.transaction(async (tx) => {
    const { order, ret } = await lockForAction(tx, returnId);
    requireStatus(ret, ["approved"], "Approve the return before receiving it.");
    const lines = await linesFor(tx, ret.id);
    for (const [index, item] of input.lines.entries()) {
      const match = lines.find(({ line }) => line.sku === item.sku);
      if (!match) throw invalid(`lines.${index}.sku`, "not_in_return", `${item.sku} isn't part of this return.`);
      if (item.restockQuantity > match.returnLine.quantity) throw invalid(`lines.${index}.restockQuantity`, "exceeds_returned", `Only ${match.returnLine.quantity} of ${item.sku} were returned.`);
    }
    for (const { returnLine, line } of lines) {
      const restock = input.lines.find((item) => item.sku === line.sku)?.restockQuantity ?? returnLine.quantity;
      await tx.update(returnLines).set({ restockedQuantity: restock }).where(eq(returnLines.id, returnLine.id));
      if (restock === 0) continue;
      const [item] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, line.inventoryItemId)).for("update");
      if (!item?.tracked) continue;
      const units = (line.inventoryUnits / line.quantity) * restock;
      await tx.update(inventoryItems).set({ onHand: sql`${inventoryItems.onHand} + ${units}`, updatedAt: new Date() }).where(eq(inventoryItems.id, item.id));
      await tx.insert(inventoryMovements).values({ inventoryItemId: item.id, reason: "returned_restock", onHandDelta: units, sourceRef: `return:${ret.id}`, note: `Return ${ret.number} (${order.number})`, actorStaffId });
    }
    await tx.update(returns).set({ status: "received", receivedAt: new Date(), staffNote: input.note ?? ret.staffNote, updatedAt: new Date() }).where(eq(returns.id, ret.id));
    await recordAudit(tx, { entityType: "order", entityId: order.id, action: "return.received", actorStaffId, after: { returnId: ret.id, restock: input.lines } });
  });
}

/** Refunds a received return and issues the GST credit note against the order's invoice. */
export async function refundReturn(
  db: Database,
  gateway: PaymentGateway,
  returnId: string,
  input: { amountPaise?: number; method: "gateway" | "manual"; note: string | null },
  actorStaffId: string,
) {
  const refundIds = await db.transaction(async (tx) => {
    const { order, ret } = await lockForAction(tx, returnId);
    requireStatus(ret, ["received"], "Receive and inspect the returned items before refunding.");
    const lines = await linesFor(tx, ret.id);
    const amountPaise = input.amountPaise ?? lines.reduce((sum, { returnLine, line }) => sum + unitsValue(line, returnLine.quantity), 0);
    const ids = await recordRefunds(tx, order, { amountPaise, method: input.method, reason: `Return ${ret.number}`, note: input.note, returnId: ret.id }, actorStaffId);
    await issueCreditNote(tx, order, ret, lines);
    await tx.update(returns).set({ status: "refunded", closedAt: new Date(), updatedAt: new Date() }).where(eq(returns.id, ret.id));
    await recordAudit(tx, { entityType: "order", entityId: order.id, action: "return.refunded", actorStaffId, after: { returnId: ret.id, amountPaise, method: input.method } });
    return ids;
  });
  await sendPendingRefunds(db, gateway, refundIds);
}

/** Closes a received return without a refund (e.g. replaced, or the goods weren't eligible after inspection). */
export async function closeReturn(db: Database, returnId: string, note: string, actorStaffId: string) {
  await db.transaction(async (tx) => {
    const { ret } = await lockForAction(tx, returnId);
    requireStatus(ret, ["received"], "Only received returns can be closed without a refund.");
    await tx.update(returns).set({ status: "closed", staffNote: note, closedAt: new Date(), updatedAt: new Date() }).where(eq(returns.id, ret.id));
    await recordAudit(tx, { entityType: "order", entityId: ret.orderId, action: "return.closed", actorStaffId, after: { returnId: ret.id }, comment: note });
  });
}

// ---- GST credit note ----

async function issueCreditNote(tx: Tx, order: typeof orders.$inferSelect, ret: ReturnRow, lines: Awaited<ReturnType<typeof linesFor>>, now = new Date()) {
  const [invoice] = await tx.select().from(invoices).where(and(eq(invoices.orderId, order.id), eq(invoices.status, "issued")));
  if (!invoice) return null; // No invoice (e.g. shipped before invoicing existed): nothing to adjust.
  const source = invoice.document as InvoiceDocument;
  const { fy, sequence } = await nextInFinancialYear(tx, "CN", now);
  const number = `CN/${fy}/${String(sequence).padStart(5, "0")}`;
  const docLines = lines.map(({ returnLine, line }) => {
    const value = unitsValue(line, returnLine.quantity);
    return {
      description: line.optionsLabel ? `${line.productTitle} (${line.optionsLabel})` : line.productTitle,
      sku: line.sku,
      hsnCode: line.hsnCode,
      quantity: returnLine.quantity,
      unitPricePaise: line.unitPricePaise,
      gstRateBasisPoints: line.taxRateBasisPoints,
      ...splitGst(value, line.taxRateBasisPoints, source.intraState),
      totalPaise: value,
    };
  });
  const sum = (key: "taxablePaise" | "cgstPaise" | "sgstPaise" | "igstPaise" | "totalPaise") => docLines.reduce((total, line) => total + line[key], 0);
  const document: InvoiceDocument = {
    ...source,
    kind: "credit_note",
    againstInvoice: { number: invoice.number, issuedAt: invoice.issuedAt.toISOString() },
    number,
    issuedAt: now.toISOString(),
    lines: docLines,
    shippingPaise: 0,
    totals: { taxablePaise: sum("taxablePaise"), cgstPaise: sum("cgstPaise"), sgstPaise: sum("sgstPaise"), igstPaise: sum("igstPaise"), grandTotalPaise: sum("totalPaise") },
  };
  const [note] = await tx.insert(creditNotes).values({ returnId: ret.id, invoiceId: invoice.id, number, document, issuedAt: now }).returning();
  return note!;
}

export async function creditNoteFor(db: DbOrTx, returnId: string) {
  if (!UUID.test(returnId)) return null;
  const [note] = await db.select().from(creditNotes).where(eq(creditNotes.returnId, returnId));
  return note ?? null;
}

// ---- Admin views ----

export async function adminReturn(db: DbOrTx, returnId: string) {
  if (!UUID.test(returnId)) throw notFound("Return not found.");
  const [row] = await db
    .select({ ret: returns, orderNumber: orders.number, customer: { id: customers.id, name: customers.name, phone: customers.phone }, decidedBy: staffUsers.name })
    .from(returns)
    .innerJoin(orders, eq(orders.id, returns.orderId))
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .leftJoin(staffUsers, eq(staffUsers.id, returns.decidedByStaffId))
    .where(eq(returns.id, returnId));
  if (!row) throw notFound("Return not found.");
  const lines = await linesFor(db, returnId);
  const note = await creditNoteFor(db, returnId);
  const { ret } = row;
  return {
    id: ret.id,
    number: ret.number,
    orderId: ret.orderId,
    orderNumber: row.orderNumber,
    customer: row.customer,
    source: ret.source,
    status: ret.status,
    reason: ret.reason,
    customerNote: ret.customerNote,
    staffNote: ret.staffNote,
    rejectionReason: ret.rejectionReason,
    lines: lines.map(({ returnLine, line }) => ({
      orderLineId: line.id,
      sku: line.sku,
      productTitle: line.productTitle,
      optionsLabel: line.optionsLabel,
      quantity: returnLine.quantity,
      restockedQuantity: returnLine.restockedQuantity,
      value: inr(unitsValue(line, returnLine.quantity)),
    })),
    suggestedRefund: inr(lines.reduce((sum, { returnLine, line }) => sum + unitsValue(line, returnLine.quantity), 0)),
    refundedTotal: inr(await refundedFor(db, returnId)),
    creditNote: note ? { number: note.number, issuedAt: note.issuedAt.toISOString() } : null,
    decidedBy: row.decidedBy,
    decidedAt: ret.decidedAt?.toISOString() ?? null,
    receivedAt: ret.receivedAt?.toISOString() ?? null,
    createdAt: ret.createdAt.toISOString(),
  };
}

export async function listAdminReturns(db: Database, query: { status?: ReturnRow["status"]; limit: number; offset: number }) {
  const where = query.status ? eq(returns.status, query.status) : undefined;
  const rows = await db.select({ id: returns.id }).from(returns).where(where).orderBy(desc(returns.createdAt)).limit(query.limit).offset(query.offset);
  const [total] = await db.select({ value: count() }).from(returns).where(where);
  const data = [];
  for (const row of rows) data.push(await adminReturn(db, row.id));
  return { data, totalCount: total?.value ?? 0 };
}

export async function orderReturns(db: DbOrTx, orderId: string) {
  const rows = await db.select({ id: returns.id }).from(returns).where(eq(returns.orderId, orderId)).orderBy(desc(returns.createdAt));
  const out = [];
  for (const row of rows) out.push(await adminReturn(db, row.id));
  return out;
}

export async function openReturnCount(db: DbOrTx) {
  const [row] = await db.select({ value: count() }).from(returns).where(inArray(returns.status, ["requested", "approved", "received"]));
  return row?.value ?? 0;
}
