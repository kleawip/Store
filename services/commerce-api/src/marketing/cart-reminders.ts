// Abandoned-cart reminders (Milestone 4). A marketing message, so it goes only to signed-in customers who opted in,
// only while the owner has the switch on, and never more than once per cooldown. Rules (TBC with the client):
//  - the bag has something that can still be ordered, untouched for `delayMinutes` (default 2 h) but not older than 7 days;
//  - the customer hasn't placed an order since last changing the bag;
//  - no reminder to this customer in the last `cooldownDays` (default 7);
//  - sent only 9:00–21:00 India time (outside those hours the check waits for the next run).
// Reminders go through the notifications outbox (event "cart_reminder"), so delivery, retries and dedupe are shared.
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { priceLines } from "../cart/service";
import type { Database } from "../db/client";
import { cartLines, carts, customers, notifications, orders } from "../db/schema";
import { enqueueNotification } from "../notifications/outbox";
import { getSettings } from "../settings/service";

export type CartReminderOptions = {
  storefrontUrl: string;
  delayMinutes?: number;
  cooldownDays?: number;
  maxAgeDays?: number;
  quietHours?: { startHour: number; endHour: number };
  now?: Date;
  batch?: number;
};

const istHour = (date: Date) => new Date(date.getTime() + 330 * 60_000).getUTCHours();

/** Finds carts due a reminder and queues them. Returns how many were queued. Safe to run repeatedly. */
export async function queueCartReminders(db: Database, options: CartReminderOptions) {
  const now = options.now ?? new Date();
  const { startHour, endHour } = options.quietHours ?? { startHour: 9, endHour: 21 };
  if (!(await getSettings(db)).cartRemindersEnabled) return 0;
  const hour = istHour(now);
  if (hour < startHour || hour >= endHour) return 0;

  const delayMs = (options.delayMinutes ?? 120) * 60_000;
  const cooldownMs = (options.cooldownDays ?? 7) * 24 * 60 * 60_000;
  const maxAgeMs = (options.maxAgeDays ?? 7) * 24 * 60 * 60_000;
  const lastActivity = sql<Date>`max(${cartLines.updatedAt})`;

  const due = await db
    .select({ cartId: carts.id, customerId: customers.id, unsubscribeToken: customers.unsubscribeToken, lastActivity })
    .from(carts)
    .innerJoin(customers, eq(customers.id, carts.customerId))
    .innerJoin(cartLines, eq(cartLines.cartId, carts.id))
    .where(and(eq(customers.marketingOptIn, true), eq(customers.status, "active")))
    .groupBy(carts.id, customers.id)
    .having(sql`${lastActivity} <= ${new Date(now.getTime() - delayMs)} AND ${lastActivity} >= ${new Date(now.getTime() - maxAgeMs)}`)
    .orderBy(asc(lastActivity))
    .limit(options.batch ?? 100);

  let queued = 0;
  for (const cart of due) {
    const activity = new Date(cart.lastActivity);
    // Ordered since the bag last changed? Then it isn't abandoned.
    const [ordered] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.customerId, cart.customerId), gte(orders.createdAt, activity))).limit(1);
    if (ordered) continue;
    const [recent] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.customerId, cart.customerId), eq(notifications.event, "cart_reminder"), gte(notifications.createdAt, new Date(now.getTime() - cooldownMs))))
      .limit(1);
    if (recent) continue;

    const stored = await db.select().from(cartLines).where(eq(cartLines.cartId, cart.cartId)).orderBy(asc(cartLines.createdAt));
    const orderable = (await priceLines(db, stored)).filter((line) => line.orderableQuantity > 0);
    if (!orderable.length) continue;

    const base = options.storefrontUrl.replace(/\/$/, "");
    await enqueueNotification(db, {
      event: "cart_reminder",
      customerId: cart.customerId,
      orderId: null,
      // One reminder per bag state: changing the bag after a reminder can earn another only after the cooldown.
      ref: `${cart.cartId}:${activity.getTime()}`,
      params: {
        firstItem: orderable[0]!.productTitle,
        otherItems: orderable.length - 1,
        cartUrl: `${base}/bag?utm_source=reminder&utm_medium=cart_reminder`,
        unsubscribeUrl: `${base}/unsubscribe?token=${encodeURIComponent(cart.unsubscribeToken ?? "")}`,
      },
    });
    queued += 1;
  }
  return queued;
}

/** Owner report: reminders sent in the range and orders placed by those customers within 3 days after. */
export async function cartReminderStats(db: Database, range: { start: Date; end: Date }) {
  const result = await db.execute<{ sent: number; customers: number; orders: number; sales: number }>(sql`
    WITH sent AS (
      -- One row per reminder (WhatsApp and email copies share the dedupe key apart from the channel suffix).
      SELECT DISTINCT ON (customer_id, regexp_replace(dedupe_key, ':[a-z]+$', '')) customer_id, coalesce(sent_at, created_at) AS at
      FROM notifications
      WHERE event = 'cart_reminder' AND status = 'sent' AND coalesce(sent_at, created_at) >= ${range.start} AND coalesce(sent_at, created_at) < ${range.end}
    ), recovered AS (
      SELECT DISTINCT o.id, o.total_paise
      FROM sent s JOIN orders o ON o.customer_id = s.customer_id
      WHERE o.confirmed_at IS NOT NULL AND o.created_at >= s.at AND o.created_at < s.at + interval '3 days'
    )
    SELECT (SELECT count(*) FROM sent)::int AS sent,
           (SELECT count(DISTINCT customer_id) FROM sent)::int AS customers,
           (SELECT count(*) FROM recovered)::int AS orders,
           (SELECT coalesce(sum(total_paise), 0) FROM recovered)::int AS sales`);
  const row = result.rows[0]!;
  return { messagesSent: row.sent, customersReminded: row.customers, recoveredOrders: row.orders, recoveredSales: { amount: row.sales, currency: "INR" as const } };
}
