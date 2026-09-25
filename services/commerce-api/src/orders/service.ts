// Orders and payments (Milestone 2). Invariants:
//  • An order reproduces its quote exactly, or it is not created.
//  • Stock is reserved in the same transaction that creates the order (row locks, consistent lock order).
//  • An order is confirmed only after the online payment (full, or the 30% deposit) is verified by signature.
//  • Every payment callback and webhook is safe to receive twice.
import { INDIAN_STATES, type Order, type StateCode } from "@kleawip/contract";
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { recordAudit, type DbOrTx } from "../audit";
import { priceLines } from "../cart/service";
import type { QuoteSnapshot } from "../checkout/quote";
import type { Database } from "../db/client";
import {
  addresses,
  cartLines,
  carts,
  checkoutQuotes,
  customers,
  inventoryItems,
  inventoryMovements,
  orderLines,
  orderNumberSeq,
  orders,
  paymentEvents,
  payments,
} from "../db/schema";
import { ApiError, notFound } from "../errors";
import { PaymentGatewayError, type PaymentGateway } from "../payments/gateway";

/** Unpaid orders hold their stock this long, then expire and release it. */
export const RESERVATION_MS = 30 * 60 * 1000;

const inr = (amount: number) => ({ amount, currency: "INR" as const });
const conflict = (code: string, message: string, status = 409) =>
  new ApiError(status, "VALIDATION_FAILED", "Order not placed", message, [{ path: "quoteId", code, message }]);

type OrderRow = typeof orders.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

// ---- Views ----

export async function orderView(db: DbOrTx, order: OrderRow): Promise<Order> {
  const [lines, orderPayments] = await Promise.all([
    db.select().from(orderLines).where(eq(orderLines.orderId, order.id)).orderBy(asc(orderLines.sku)),
    db.select().from(payments).where(eq(payments.orderId, order.id)).orderBy(desc(payments.createdAt)),
  ]);
  const address = order.shippingAddress as Order["shippingAddress"];
  const gst = order.gst as QuoteSnapshot["gst"];
  const paid = orderPayments.some((payment) => payment.status === "captured");
  const failed = !paid && orderPayments[0]?.status === "failed";
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: paid ? "paid" : failed ? "failed" : "awaiting",
    placedAt: order.createdAt.toISOString(),
    confirmedAt: order.confirmedAt?.toISOString() ?? null,
    payBy: order.status === "pending_payment" ? order.reservationExpiresAt.toISOString() : null,
    lines: lines.map((line) => ({
      sku: line.sku,
      productTitle: line.productTitle,
      optionsLabel: line.optionsLabel,
      quantity: line.quantity,
      unitPrice: inr(line.unitPricePaise),
      lineTotal: inr(line.lineTotalPaise),
    })),
    merchandiseTotal: inr(order.merchandisePaise),
    shipping: inr(order.shippingPaise),
    total: inr(order.totalPaise),
    payNow: inr(order.payNowPaise),
    codBalance: inr(order.codBalancePaise),
    gst: { intraState: gst.intraState, taxable: inr(gst.taxablePaise), cgst: inr(gst.cgstPaise), sgst: inr(gst.sgstPaise), igst: inr(gst.igstPaise) },
    shippingAddress: address,
  };
}

async function customerOrder(db: DbOrTx, customerId: string, orderId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw notFound("Order not found.");
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.customerId, customerId)));
  if (!order) throw notFound("Order not found.");
  return order;
}

export async function getCustomerOrder(db: Database, customerId: string, orderId: string) {
  return orderView(db, await customerOrder(db, customerId, orderId));
}

export async function listCustomerOrders(db: Database, customerId: string) {
  const rows = await db.select().from(orders).where(eq(orders.customerId, customerId)).orderBy(desc(orders.createdAt)).limit(100);
  return Promise.all(rows.map((row) => orderView(db, row)));
}

async function paymentSession(db: DbOrTx, gateway: PaymentGateway, order: OrderRow, payment: PaymentRow) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, order.customerId));
  return {
    provider: gateway.provider,
    keyId: gateway.keyId,
    providerOrderId: payment.providerOrderId,
    amount: inr(payment.amountPaise),
    purpose: payment.purpose as "full" | "deposit",
    prefill: { name: customer?.name ?? "", contact: customer?.phone ?? "", email: customer?.email ?? null },
  };
}

// ---- Stock reservation ----

/** Reserves stock for order lines. Locks inventory rows in id order so concurrent orders can't deadlock. */
async function reserve(tx: Tx, orderId: string, lines: { inventoryItemId: string; units: number }[], actorNote: string) {
  const needed = new Map<string, number>();
  for (const line of lines) needed.set(line.inventoryItemId, (needed.get(line.inventoryItemId) ?? 0) + line.units);
  const ids = [...needed.keys()].sort();
  const locked = await tx.execute<{ id: string; on_hand: number; committed: number; unavailable: number; tracked: boolean }>(
    sql`SELECT id, on_hand, committed, unavailable, tracked FROM inventory_items WHERE id IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)}) ORDER BY id FOR UPDATE`,
  );
  for (const item of locked.rows) {
    const units = needed.get(item.id)!;
    if (item.tracked && item.on_hand - item.committed - item.unavailable < units) return false;
  }
  for (const item of locked.rows) {
    if (!item.tracked) continue;
    const units = needed.get(item.id)!;
    await tx.update(inventoryItems).set({ committed: sql`${inventoryItems.committed} + ${units}`, updatedAt: new Date() }).where(eq(inventoryItems.id, item.id));
    await tx.insert(inventoryMovements).values({ inventoryItemId: item.id, reason: "order_committed", committedDelta: units, sourceRef: `order:${orderId}`, note: actorNote });
  }
  return true;
}

async function release(tx: Tx, orderId: string, note: string) {
  const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, orderId));
  const needed = new Map<string, number>();
  for (const line of lines) needed.set(line.inventoryItemId, (needed.get(line.inventoryItemId) ?? 0) + line.inventoryUnits);
  for (const id of [...needed.keys()].sort()) {
    const [item] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, id)).for("update");
    if (!item?.tracked) continue;
    const units = needed.get(id)!;
    await tx.update(inventoryItems).set({ committed: sql`${inventoryItems.committed} - ${units}`, updatedAt: new Date() }).where(eq(inventoryItems.id, id));
    await tx.insert(inventoryMovements).values({ inventoryItemId: id, reason: "order_released", committedDelta: -units, sourceRef: `order:${orderId}`, note });
  }
}

// ---- Placing an order ----

export async function placeOrder(db: Database, gateway: PaymentGateway, customerId: string, quoteId: string, idempotencyKey: string, now = new Date()) {
  // Same key again: return the same order (and its payment) instead of creating another.
  const [previous] = await db.select().from(orders).where(and(eq(orders.customerId, customerId), eq(orders.idempotencyKey, idempotencyKey)));
  if (previous) {
    if (previous.quoteId !== quoteId) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Idempotency key reused", "This Idempotency-Key was already used for a different checkout.");
    const [payment] = await db.select().from(payments).where(eq(payments.orderId, previous.id)).orderBy(desc(payments.createdAt)).limit(1);
    return { order: await orderView(db, previous), payment: payment && previous.status === "pending_payment" ? await paymentSession(db, gateway, previous, payment) : null, created: false };
  }

  const [quote] = await db.select().from(checkoutQuotes).where(and(eq(checkoutQuotes.id, quoteId), eq(checkoutQuotes.customerId, customerId)));
  if (!quote) throw conflict("unknown_quote", "Checkout details not found. Please review your order again.", 422);
  if (quote.consumedAt) throw conflict("quote_used", "This checkout was already used to place an order.");
  if (quote.expiresAt <= now) throw conflict("quote_expired", "Your checkout details expired. Please review your order again.");

  // Create the gateway order first: an unused Razorpay order simply expires, whereas a DB order without a
  // payment would strand the reservation.
  let gatewayOrder;
  try {
    gatewayOrder = await gateway.createOrder({ amountPaise: quote.payNowPaise, receipt: quote.id, notes: { quoteId: quote.id, customerId } });
  } catch (error) {
    if (error instanceof PaymentGatewayError) throw new ApiError(503, "PAYMENT_UNAVAILABLE", "Payments unavailable", "We couldn't start the payment. Please try again in a moment.");
    throw error;
  }

  const snapshot = quote.snapshot as QuoteSnapshot;
  try {
    const orderId = await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(checkoutQuotes).where(eq(checkoutQuotes.id, quote.id)).for("update");
      if (locked!.consumedAt) throw conflict("quote_used", "This checkout was already used to place an order.");

      // Re-price: anything different from what the customer agreed to means a fresh quote.
      const current = await priceLines(tx, snapshot.lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity, pricePaiseWhenAdded: null })));
      for (const line of snapshot.lines) {
        const live = current.find((c) => c.variantId === line.variantId);
        if (!live || live.unitPrice?.amount !== line.unitPricePaise || live.taxRateBasisPoints !== line.taxRateBasisPoints) {
          throw conflict("quote_changed", "Prices or availability changed. Please review your order again.");
        }
      }

      // nextval() takes the sequence name as a literal (a bound text parameter would need a regclass cast).
      const sequenceName = sql.raw(`'${orderNumberSeq.seqName}'`);
      const [{ value: sequence }] = (await tx.execute<{ value: string }>(sql`SELECT nextval(${sequenceName}) AS value`)).rows as [{ value: string }];
      const [address] = await tx.select().from(addresses).where(eq(addresses.id, quote.addressId));
      const [order] = await tx
        .insert(orders)
        .values({
          number: `KLW${sequence}`,
          customerId,
          quoteId: quote.id,
          idempotencyKey,
          paymentMethod: quote.paymentMethod,
          shippingAddress: {
            name: address!.name, phone: address!.phone, line1: address!.line1, line2: address!.line2, landmark: address!.landmark,
            city: address!.city, stateCode: address!.stateCode, stateName: INDIAN_STATES[address!.stateCode as StateCode], pincode: address!.pincode,
          },
          merchandisePaise: snapshot.merchandisePaise,
          shippingPaise: snapshot.shippingPaise,
          totalPaise: quote.totalPaise,
          payNowPaise: quote.payNowPaise,
          codBalancePaise: quote.codBalancePaise,
          gst: snapshot.gst,
          reservationExpiresAt: new Date(now.getTime() + RESERVATION_MS),
        })
        .returning();

      const reserved = await reserve(tx, order!.id, snapshot.lines.map((line) => ({ inventoryItemId: line.inventoryItemId, units: line.quantity * line.inventoryUnitsPerSale })), `Reserved for ${order!.number}`);
      if (!reserved) throw conflict("out_of_stock", "Some items sold out while you were checking out. Please review your order again.");

      await tx.insert(orderLines).values(snapshot.lines.map((line) => ({
        orderId: order!.id,
        variantId: line.variantId,
        inventoryItemId: line.inventoryItemId,
        inventoryUnits: line.quantity * line.inventoryUnitsPerSale,
        sku: line.sku,
        productTitle: line.productTitle,
        optionsLabel: line.optionsLabel,
        quantity: line.quantity,
        unitPricePaise: line.unitPricePaise,
        taxRateBasisPoints: line.taxRateBasisPoints,
        lineTotalPaise: line.unitPricePaise * line.quantity,
      })));
      await tx.insert(payments).values({
        orderId: order!.id,
        provider: gateway.provider,
        purpose: quote.paymentMethod === "prepaid" ? "full" : "deposit",
        providerOrderId: gatewayOrder.providerOrderId,
        amountPaise: quote.payNowPaise,
      });
      await tx.update(checkoutQuotes).set({ consumedAt: now }).where(eq(checkoutQuotes.id, quote.id));
      await recordAudit(tx, { entityType: "order", entityId: order!.id, action: "order.placed", actorStaffId: null, after: { number: order!.number, total: quote.totalPaise, payNow: quote.payNowPaise, method: quote.paymentMethod } });
      return order!.id;
    });
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    const [payment] = await db.select().from(payments).where(eq(payments.orderId, orderId));
    return { order: await orderView(db, order!), payment: await paymentSession(db, gateway, order!, payment!), created: true };
  } catch (error) {
    // Two requests with the same key raced: the other one created the order, so return it.
    const pg = (error as { cause?: { code?: string; constraint?: string } }).cause;
    if (pg?.code === "23505" && pg.constraint === "orders_customer_idempotency_key") return placeOrder(db, gateway, customerId, quoteId, idempotencyKey, now);
    throw error;
  }
}

/** A new payment attempt for a still-reserved order (e.g. after the customer closed the payment window). */
export async function retryPayment(db: Database, gateway: PaymentGateway, customerId: string, orderId: string, now = new Date()) {
  const order = await customerOrder(db, customerId, orderId);
  if (order.status !== "pending_payment" || order.reservationExpiresAt <= now) {
    throw conflict("not_payable", order.status === "confirmed" ? "This order is already paid." : "This order can no longer be paid. Please place it again.");
  }
  let gatewayOrder;
  try {
    gatewayOrder = await gateway.createOrder({ amountPaise: order.payNowPaise, receipt: order.number, notes: { orderId: order.id } });
  } catch (error) {
    if (error instanceof PaymentGatewayError) throw new ApiError(503, "PAYMENT_UNAVAILABLE", "Payments unavailable", "We couldn't start the payment. Please try again in a moment.");
    throw error;
  }
  const [payment] = await db
    .insert(payments)
    .values({ orderId: order.id, provider: gateway.provider, purpose: order.paymentMethod === "prepaid" ? "full" : "deposit", providerOrderId: gatewayOrder.providerOrderId, amountPaise: order.payNowPaise })
    .returning();
  return paymentSession(db, gateway, order, payment!);
}

// ---- Payment confirmation (checkout callback and webhooks share this) ----

async function removePurchasedFromCart(tx: Tx, order: OrderRow) {
  const [cart] = await tx.select().from(carts).where(eq(carts.customerId, order.customerId));
  if (!cart) return;
  const variantIds = (await tx.select({ id: orderLines.variantId }).from(orderLines).where(eq(orderLines.orderId, order.id))).map((row) => row.id);
  if (variantIds.length) await tx.delete(cartLines).where(and(eq(cartLines.cartId, cart.id), inArray(cartLines.variantId, variantIds)));
}

/**
 * Records a captured payment and confirms its order. Idempotent. Late or duplicate money is never lost:
 * it is recorded and the order is flagged for staff when it can't simply be confirmed.
 */
async function capturePayment(tx: Tx, payment: PaymentRow, providerPaymentId: string, source: string) {
  if (payment.status === "captured") return;
  await tx.update(payments).set({ status: "captured", providerPaymentId, capturedAt: new Date(), updatedAt: new Date() }).where(eq(payments.id, payment.id));
  const [order] = await tx.select().from(orders).where(eq(orders.id, payment.orderId)).for("update");
  if (!order) return;
  const confirm = async () => {
    await tx.update(orders).set({ status: "confirmed", confirmedAt: new Date(), closedAt: null, updatedAt: new Date() }).where(eq(orders.id, order.id));
    await removePurchasedFromCart(tx, order);
    await recordAudit(tx, { entityType: "order", entityId: order.id, action: "order.confirmed", actorStaffId: null, after: { payment: providerPaymentId, source } });
  };

  if (order.status === "pending_payment") return confirm();

  if (order.status === "confirmed") {
    await tx.update(orders).set({ needsAttention: "A second payment was captured for this order. Refund the duplicate.", updatedAt: new Date() }).where(eq(orders.id, order.id));
    await recordAudit(tx, { entityType: "order", entityId: order.id, action: "payment.duplicate", actorStaffId: null, after: { payment: providerPaymentId } });
    return;
  }

  // Paid after the order expired or was cancelled: take the stock again if it's still there.
  const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, order.id));
  const reserved = await reserve(tx, order.id, lines.map((line) => ({ inventoryItemId: line.inventoryItemId, units: line.inventoryUnits })), `Re-reserved for late payment on ${order.number}`);
  if (reserved) return confirm();
  await tx
    .update(orders)
    .set({ needsAttention: "Paid after the reservation lapsed and the stock is gone. Refund the customer or fulfil manually.", updatedAt: new Date() })
    .where(eq(orders.id, order.id));
  await recordAudit(tx, { entityType: "order", entityId: order.id, action: "payment.late_unfulfillable", actorStaffId: null, after: { payment: providerPaymentId } });
}

/** Checkout success callback from the storefront (Razorpay handler response). */
export async function verifyPayment(
  db: Database,
  gateway: PaymentGateway,
  customerId: string,
  orderId: string,
  input: { providerOrderId: string; providerPaymentId: string; signature: string },
) {
  const order = await customerOrder(db, customerId, orderId);
  const [payment] = await db.select().from(payments).where(and(eq(payments.orderId, order.id), eq(payments.providerOrderId, input.providerOrderId)));
  if (!payment) throw new ApiError(422, "VALIDATION_FAILED", "Payment not recognised", "This payment doesn't belong to this order.", [{ path: "providerOrderId", code: "unknown_payment", message: "Unknown payment." }]);
  if (!gateway.verifyPaymentSignature(input)) {
    throw new ApiError(422, "VALIDATION_FAILED", "Payment not verified", "We couldn't verify this payment. If money was taken, it will be confirmed automatically or refunded.", [{ path: "signature", code: "signature_invalid", message: "Invalid payment signature." }]);
  }
  await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(payments).where(eq(payments.id, payment.id)).for("update");
    await capturePayment(tx, locked!, input.providerPaymentId, "checkout");
  });
  return getCustomerOrder(db, customerId, orderId);
}

type RazorpayWebhook = {
  event?: string;
  payload?: { payment?: { entity?: { id?: string; order_id?: string; error_description?: string; error_reason?: string } } };
};

/** Razorpay webhook: signature-checked, recorded once per event id, then applied. */
export async function handleWebhook(db: Database, gateway: PaymentGateway, rawBody: string, signature: string | undefined, eventIdHeader: string | undefined) {
  if (!signature || !gateway.verifyWebhookSignature(rawBody, signature)) return { status: 400 as const, result: "bad_signature" };
  let body: RazorpayWebhook;
  try {
    body = JSON.parse(rawBody) as RazorpayWebhook;
  } catch {
    return { status: 400 as const, result: "bad_json" };
  }
  const eventId = eventIdHeader || createHash("sha256").update(rawBody).digest("hex");
  const type = body.event ?? "unknown";

  return db.transaction(async (tx) => {
    const [recorded] = await tx.insert(paymentEvents).values({ provider: gateway.provider, eventId, type, payload: body }).onConflictDoNothing().returning({ id: paymentEvents.id });
    if (!recorded) return { status: 200 as const, result: "duplicate" };

    const entity = body.payload?.payment?.entity;
    if (!entity?.order_id || !entity.id) return { status: 200 as const, result: "ignored" };
    const [payment] = await tx.select().from(payments).where(and(eq(payments.provider, gateway.provider), eq(payments.providerOrderId, entity.order_id))).for("update");
    if (!payment) return { status: 200 as const, result: "unknown_order" };

    if (type === "payment.captured" || type === "order.paid") {
      await capturePayment(tx, payment, entity.id, `webhook:${type}`);
      return { status: 200 as const, result: "captured" };
    }
    if (type === "payment.failed" && payment.status === "created") {
      await tx
        .update(payments)
        .set({ status: "failed", providerPaymentId: entity.id, failureReason: (entity.error_description ?? entity.error_reason ?? "Payment failed").slice(0, 300), updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
      return { status: 200 as const, result: "failed" };
    }
    return { status: 200 as const, result: "ignored" };
  });
}

// ---- Cancelling and expiring unpaid orders ----

export async function cancelUnpaidOrder(db: Database, customerId: string, orderId: string) {
  const order = await customerOrder(db, customerId, orderId);
  if (order.status !== "pending_payment") throw conflict("not_cancellable", order.status === "confirmed" ? "Paid orders are cancelled through support." : "This order is already closed.");
  await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(orders).where(eq(orders.id, order.id)).for("update");
    if (locked!.status !== "pending_payment") return;
    await release(tx, order.id, `Cancelled by customer before payment (${order.number})`);
    await tx.update(orders).set({ status: "cancelled", closedAt: new Date(), updatedAt: new Date() }).where(eq(orders.id, order.id));
    await recordAudit(tx, { entityType: "order", entityId: order.id, action: "order.cancelled_unpaid", actorStaffId: null });
  });
  return getCustomerOrder(db, customerId, orderId);
}

/** Expires unpaid orders past their reservation and returns their stock. Safe to run from several workers. */
export async function expireUnpaidOrders(db: Database, now = new Date()) {
  const due = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.status, "pending_payment"), lt(orders.reservationExpiresAt, now))).limit(200);
  let expired = 0;
  for (const { id } of due) {
    await db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for("update", { skipLocked: true });
      if (!order || order.status !== "pending_payment" || order.reservationExpiresAt >= now) return;
      await release(tx, order.id, `Payment window lapsed (${order.number})`);
      await tx.update(orders).set({ status: "expired", closedAt: now, updatedAt: now }).where(eq(orders.id, order.id));
      await recordAudit(tx, { entityType: "order", entityId: order.id, action: "order.expired", actorStaffId: null });
      expired++;
    });
  }
  return expired;
}
