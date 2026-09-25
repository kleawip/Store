// Milestone 3: what happens after an order is paid: fulfilment steps, staff cancellation, refunds.
// Money rule: a refund is first recorded as "pending" in the same transaction that locks the order (so two
// staff can't refund the same money twice), then sent to the gateway. A gateway failure marks the refund
// failed and flags the order: never silently lost, never double-sent.
import { and, desc, eq, ne } from "drizzle-orm";
import { recordAudit } from "../audit";
import type { Database } from "../db/client";
import { orders, payments, refunds, shipments, staffUsers } from "../db/schema";
import { cancelInvoice } from "../invoices/service";
import { ApiError, notFound } from "../errors";
import { PaymentGatewayError, type PaymentGateway } from "../payments/gateway";
import { release, type Tx } from "./service";

export const invalid = (path: string, code: string, message: string, status = 422) =>
  new ApiError(status, "VALIDATION_FAILED", "Not allowed", message, [{ path, code, message }]);

type OrderRow = typeof orders.$inferSelect;
type FulfilmentStatus = OrderRow["fulfilmentStatus"];

/** Steps staff may set by hand before a shipment exists. Shipped and later come from the courier. */
const MANUAL_STEPS: Partial<Record<FulfilmentStatus, FulfilmentStatus[]>> = {
  unfulfilled: ["processing"],
  processing: ["packed", "unfulfilled"],
  packed: ["processing"],
};
/** Before this point goods haven't left: cancelling is a simple stock release + refund. */
export const CANCELLABLE_FULFILMENT: FulfilmentStatus[] = ["unfulfilled", "processing", "packed"];

/** A live (not cancelled) shipment blocks manual steps and cancellation: cancel the shipment first. */
async function assertNoLiveShipment(tx: Tx, orderId: string) {
  const [live] = await tx.select({ id: shipments.id }).from(shipments).where(and(eq(shipments.orderId, orderId), ne(shipments.status, "cancelled")));
  if (live) throw invalid("shipment", "shipment_active", "This order has a courier booking. Cancel the shipment first.");
}

export async function lockedOrder(tx: Tx, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Order not found.");
  const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for("update");
  if (!order) throw notFound("Order not found.");
  return order;
}

// ---- Money ----

/** What has been paid and refunded, by channel. Failed refunds don't count. */
export async function moneySummary(db: Database | Tx, order: OrderRow) {
  // Sequential: called inside transactions (one connection).
  const paid = await db.select({ id: payments.id, providerPaymentId: payments.providerPaymentId, amountPaise: payments.amountPaise }).from(payments).where(and(eq(payments.orderId, order.id), eq(payments.status, "captured")));
  const refunded = await db.select().from(refunds).where(and(eq(refunds.orderId, order.id), ne(refunds.status, "failed")));
  const onlinePaid = paid.reduce((sum, p) => sum + p.amountPaise, 0);
  const onlineRefunded = refunded.filter((r) => r.method === "gateway").reduce((sum, r) => sum + r.amountPaise, 0);
  const cashRefunded = refunded.filter((r) => r.method === "manual").reduce((sum, r) => sum + r.amountPaise, 0);
  const refundedByPayment = new Map<string, number>();
  for (const refund of refunded) if (refund.paymentId) refundedByPayment.set(refund.paymentId, (refundedByPayment.get(refund.paymentId) ?? 0) + refund.amountPaise);
  return {
    onlinePaid,
    cashCollected: order.codCollectedPaise,
    onlineRefundable: onlinePaid - onlineRefunded,
    cashRefundable: order.codCollectedPaise - cashRefunded,
    refundedTotal: onlineRefunded + cashRefunded,
    capturedPayments: paid.map((p) => ({ ...p, remaining: p.amountPaise - (refundedByPayment.get(p.id) ?? 0) })),
  };
}

/** Records pending refund rows inside the caller's transaction. Gateway refunds are split across captured payments. */
export async function recordRefunds(
  tx: Tx,
  order: OrderRow,
  input: { amountPaise: number; method: "gateway" | "manual"; reason: string; note: string | null; returnId?: string },
  actorStaffId: string,
) {
  const money = await moneySummary(tx, order);
  if (input.method === "gateway") {
    if (input.amountPaise > money.onlineRefundable) {
      throw invalid("amountPaise", "exceeds_refundable", `Only ₹${(money.onlineRefundable / 100).toFixed(2)} paid online can still be refunded online.`);
    }
    let left = input.amountPaise;
    const ids: string[] = [];
    for (const payment of money.capturedPayments.filter((p) => p.remaining > 0)) {
      if (left === 0) break;
      const amount = Math.min(left, payment.remaining);
      const [row] = await tx.insert(refunds).values({ orderId: order.id, paymentId: payment.id, method: "gateway", amountPaise: amount, reason: input.reason, note: input.note, returnId: input.returnId ?? null, createdByStaffId: actorStaffId }).returning({ id: refunds.id });
      ids.push(row!.id);
      left -= amount;
    }
    return ids;
  }
  if (input.amountPaise > money.cashRefundable) {
    throw invalid("amountPaise", "exceeds_refundable", money.cashCollected === 0
      ? "No cash has been collected for this order yet, so there is nothing to refund manually."
      : `Only ₹${(money.cashRefundable / 100).toFixed(2)} collected in cash can still be refunded.`);
  }
  if (!input.note) throw invalid("note", "required", "Record how the money was returned (e.g. UPI reference).");
  // Manual refunds are money already sent by staff: recorded as processed immediately.
  const [row] = await tx
    .insert(refunds)
    .values({ orderId: order.id, method: "manual", amountPaise: input.amountPaise, reason: input.reason, note: input.note, returnId: input.returnId ?? null, status: "processed", processedAt: new Date(), createdByStaffId: actorStaffId })
    .returning({ id: refunds.id });
  return [row!.id];
}

/** Sends pending gateway refunds. Safe to call again: only rows still pending without a provider id are sent. */
export async function sendPendingRefunds(db: Database, gateway: PaymentGateway, refundIds: string[]) {
  for (const id of refundIds) {
    const [refund] = await db
      .select({ refund: refunds, providerPaymentId: payments.providerPaymentId, orderNumber: orders.number })
      .from(refunds)
      .innerJoin(payments, eq(payments.id, refunds.paymentId))
      .innerJoin(orders, eq(orders.id, refunds.orderId))
      .where(eq(refunds.id, id));
    if (!refund || refund.refund.method !== "gateway" || refund.refund.status !== "pending" || refund.refund.providerRefundId) continue;
    try {
      const result = await gateway.refund({ providerPaymentId: refund.providerPaymentId!, amountPaise: refund.refund.amountPaise, receipt: `${refund.orderNumber}-${id.slice(0, 8)}`, notes: { refundId: id } });
      await db
        .update(refunds)
        .set({ providerRefundId: result.providerRefundId, status: result.status, processedAt: result.status === "processed" ? new Date() : null, updatedAt: new Date() })
        .where(eq(refunds.id, id));
    } catch (error) {
      if (!(error instanceof PaymentGatewayError)) throw error;
      await db.transaction(async (tx) => {
        await tx.update(refunds).set({ status: "failed", failureReason: error.message.slice(0, 300), updatedAt: new Date() }).where(eq(refunds.id, id));
        await tx.update(orders).set({ needsAttention: "A refund failed at the payment gateway. Retry it or refund the customer another way.", updatedAt: new Date() }).where(eq(orders.id, refund.refund.orderId));
        await recordAudit(tx, { entityType: "order", entityId: refund.refund.orderId, action: "refund.failed", actorStaffId: null, after: { refundId: id, reason: error.message } });
      });
    }
  }
}

export async function createRefund(
  db: Database,
  gateway: PaymentGateway,
  orderId: string,
  input: { amountPaise: number; method: "gateway" | "manual"; reason: string; note: string | null },
  actorStaffId: string,
) {
  const ids = await db.transaction(async (tx) => {
    const order = await lockedOrder(tx, orderId);
    if (order.status === "pending_payment" || order.status === "expired") throw invalid("orderId", "not_paid", "This order hasn't been paid, so there is nothing to refund.");
    const created = await recordRefunds(tx, order, input, actorStaffId);
    await recordAudit(tx, { entityType: "order", entityId: order.id, action: "refund.created", actorStaffId, after: { amountPaise: input.amountPaise, method: input.method, reason: input.reason } });
    return created;
  });
  await sendPendingRefunds(db, gateway, ids);
}

/** Retries a failed gateway refund as a new pending refund of the same amount. */
export async function retryRefund(db: Database, gateway: PaymentGateway, orderId: string, refundId: string, actorStaffId: string) {
  const [failed] = await db.select().from(refunds).where(and(eq(refunds.id, refundId), eq(refunds.orderId, orderId)));
  if (!failed || failed.status !== "failed" || failed.method !== "gateway") throw invalid("refundId", "not_retryable", "Only failed online refunds can be retried.");
  await createRefund(db, gateway, orderId, { amountPaise: failed.amountPaise, method: "gateway", reason: failed.reason, note: `Retry of ${refundId}` }, actorStaffId);
}

// ---- Fulfilment steps and cancellation ----

export async function setFulfilmentStep(db: Database, orderId: string, next: FulfilmentStatus, actorStaffId: string) {
  await db.transaction(async (tx) => {
    const order = await lockedOrder(tx, orderId);
    if (order.status !== "confirmed") throw invalid("status", "not_confirmed", "Only confirmed orders can be fulfilled.");
    if (!MANUAL_STEPS[order.fulfilmentStatus]?.includes(next)) {
      throw invalid("fulfilmentStatus", "invalid_transition", `An order that is "${order.fulfilmentStatus}" can't be moved to "${next}" by hand.`);
    }
    await assertNoLiveShipment(tx, order.id);
    await tx.update(orders).set({ fulfilmentStatus: next, updatedAt: new Date() }).where(eq(orders.id, orderId));
    await recordAudit(tx, { entityType: "order", entityId: orderId, action: `fulfilment.${next}`, actorStaffId, before: { fulfilmentStatus: order.fulfilmentStatus }, after: { fulfilmentStatus: next } });
  });
}

/**
 * Staff cancellation before dispatch: stock goes back and everything paid online is refunded automatically.
 * After dispatch the courier must bring it back first (RTO/returns), so cancellation is refused.
 */
export async function staffCancelOrder(db: Database, gateway: PaymentGateway, orderId: string, reason: string, actorStaffId: string) {
  const refundIds = await db.transaction(async (tx) => {
    const order = await lockedOrder(tx, orderId);
    if (order.status === "cancelled") throw invalid("status", "already_cancelled", "This order is already cancelled.");
    if (order.status !== "confirmed") throw invalid("status", "not_confirmed", "Unpaid orders expire on their own; only confirmed orders are cancelled here.");
    if (!CANCELLABLE_FULFILMENT.includes(order.fulfilmentStatus)) {
      throw invalid("fulfilmentStatus", "already_shipped", "This order has left the warehouse. Stop the shipment with the courier (RTO) or process it as a return.");
    }
    await assertNoLiveShipment(tx, order.id);
    await release(tx, order.id, `Cancelled by staff before dispatch (${order.number})`);
    await cancelInvoice(tx, order.id);
    await tx.update(orders).set({ status: "cancelled", cancelReason: reason, closedAt: new Date(), updatedAt: new Date() }).where(eq(orders.id, order.id));
    const money = await moneySummary(tx, order);
    const ids = money.onlineRefundable > 0
      ? await recordRefunds(tx, order, { amountPaise: money.onlineRefundable, method: "gateway", reason: `Order cancelled: ${reason}`, note: null }, actorStaffId)
      : [];
    await recordAudit(tx, { entityType: "order", entityId: order.id, action: "order.cancelled_by_staff", actorStaffId, after: { reason, refundedOnlinePaise: money.onlineRefundable } });
    return ids;
  });
  await sendPendingRefunds(db, gateway, refundIds);
}

export async function clearAttention(db: Database, orderId: string, note: string, actorStaffId: string) {
  await db.transaction(async (tx) => {
    const order = await lockedOrder(tx, orderId);
    if (!order.needsAttention) return;
    await tx.update(orders).set({ needsAttention: null, updatedAt: new Date() }).where(eq(orders.id, orderId));
    await recordAudit(tx, { entityType: "order", entityId: orderId, action: "attention.resolved", actorStaffId, before: { needsAttention: order.needsAttention }, comment: note });
  });
}

// ---- Views ----

export async function refundList(db: Database, orderId: string) {
  const rows = await db
    .select({ refund: refunds, staffName: staffUsers.name })
    .from(refunds)
    .leftJoin(staffUsers, eq(staffUsers.id, refunds.createdByStaffId))
    .where(eq(refunds.orderId, orderId))
    .orderBy(desc(refunds.createdAt));
  return rows.map(({ refund, staffName }) => ({
    id: refund.id,
    method: refund.method,
    amount: { amount: refund.amountPaise, currency: "INR" as const },
    reason: refund.reason,
    note: refund.note,
    status: refund.status,
    providerRefundId: refund.providerRefundId,
    failureReason: refund.failureReason,
    createdBy: staffName,
    createdAt: refund.createdAt.toISOString(),
    processedAt: refund.processedAt?.toISOString() ?? null,
  }));
}

// ---- Gateway refund webhooks ----

/** Applies refund.processed / refund.failed from Razorpay (called by the webhook handler inside its transaction). */
export async function applyRefundEvent(tx: Tx, type: string, entity: { id?: string; status?: string } | undefined) {
  if (!entity?.id) return "ignored";
  const [refund] = await tx.select().from(refunds).where(eq(refunds.providerRefundId, entity.id)).for("update");
  if (!refund) return "unknown_refund";
  if (type === "refund.processed" && refund.status !== "processed") {
    await tx.update(refunds).set({ status: "processed", processedAt: new Date(), updatedAt: new Date() }).where(eq(refunds.id, refund.id));
    return "refund_processed";
  }
  if (type === "refund.failed" && refund.status !== "failed") {
    await tx.update(refunds).set({ status: "failed", failureReason: "Reported failed by the payment gateway", updatedAt: new Date() }).where(eq(refunds.id, refund.id));
    await tx.update(orders).set({ needsAttention: "A refund failed at the payment gateway. Retry it or refund the customer another way.", updatedAt: new Date() }).where(eq(orders.id, refund.orderId));
    return "refund_failed";
  }
  return "ignored";
}

