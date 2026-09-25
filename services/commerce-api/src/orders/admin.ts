import type { z } from "zod";
import type { AdminOrderPayment } from "@kleawip/contract";
import { and, count, desc, eq, ilike, isNotNull, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "../db/client";
import { customers, orderLines, orders, payments } from "../db/schema";
import { notFound } from "../errors";
import { invoiceFor } from "../invoices/service";
import { adminShipments } from "../shipping/views";
import { refundList } from "./lifecycle";
import { orderView } from "./service";

const inr = (amount: number) => ({ amount, currency: "INR" as const });

export async function listAdminOrders(
  db: Database,
  query: { status?: "pending_payment" | "confirmed" | "expired" | "cancelled"; needsAttention?: "true"; q?: string; limit: number; offset: number },
) {
  const filters: (SQL | undefined)[] = [
    query.status ? eq(orders.status, query.status) : undefined,
    query.needsAttention ? isNotNull(orders.needsAttention) : undefined,
    query.q ? or(ilike(orders.number, `%${query.q}%`), ilike(customers.phone, `%${query.q.replace(/\D/g, "") || query.q}%`)) : undefined,
  ];
  const where = and(...filters);
  const [rows, [total]] = await Promise.all([
    db
      .select({
        order: orders,
        customer: { id: customers.id, name: customers.name, phone: customers.phone },
        itemCount: sql<number>`(SELECT coalesce(sum(quantity), 0)::int FROM ${orderLines} WHERE ${orderLines.orderId} = ${orders.id})`,
        paid: sql<boolean>`EXISTS (SELECT 1 FROM ${payments} WHERE ${payments.orderId} = ${orders.id} AND ${payments.status} = 'captured')`,
        lastFailed: sql<boolean>`(SELECT status = 'failed' FROM ${payments} WHERE ${payments.orderId} = ${orders.id} ORDER BY created_at DESC LIMIT 1)`,
      })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ value: count() }).from(orders).innerJoin(customers, eq(customers.id, orders.customerId)).where(where),
  ]);
  return {
    data: rows.map(({ order, customer, itemCount, paid, lastFailed }) => ({
      id: order.id,
      number: order.number,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: paid ? ("paid" as const) : lastFailed ? ("failed" as const) : ("awaiting" as const),
      total: inr(order.totalPaise),
      payNow: inr(order.payNowPaise),
      codBalance: inr(order.codBalancePaise),
      customer,
      itemCount,
      placedAt: order.createdAt.toISOString(),
      needsAttention: order.needsAttention,
    })),
    totalCount: total?.value ?? 0,
  };
}

export async function adminOrder(db: Database, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Order not found.");
  const [row] = await db.select().from(orders).where(eq(orders.id, id));
  if (!row) throw notFound("Order not found.");
  const [[customer], paymentRows] = await Promise.all([
    db.select({ id: customers.id, name: customers.name, phone: customers.phone, email: customers.email }).from(customers).where(eq(customers.id, row.customerId)),
    db.select().from(payments).where(eq(payments.orderId, id)).orderBy(desc(payments.createdAt)),
  ]);
  const paymentsOut: z.infer<typeof AdminOrderPayment>[] = paymentRows.map((payment) => ({
    provider: payment.provider,
    purpose: payment.purpose as "full" | "deposit",
    providerOrderId: payment.providerOrderId,
    providerPaymentId: payment.providerPaymentId,
    amount: inr(payment.amountPaise),
    status: payment.status,
    failureReason: payment.failureReason,
    createdAt: payment.createdAt.toISOString(),
    capturedAt: payment.capturedAt?.toISOString() ?? null,
  }));
  return {
    order: await orderView(db, row),
    customer: customer!,
    payments: paymentsOut,
    refunds: await refundList(db, id),
    cancelReason: row.cancelReason,
    codCollected: inr(row.codCollectedPaise),
    needsAttention: row.needsAttention,
    shipments: await adminShipments(db, id),
    invoice: await invoiceSummary(db, id),
  };
}

async function invoiceSummary(db: Database, orderId: string) {
  const invoice = await invoiceFor(db, orderId);
  return invoice ? { number: invoice.number, issuedAt: invoice.issuedAt.toISOString(), status: invoice.status } : null;
}
