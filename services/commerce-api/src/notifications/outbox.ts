// Notifications outbox. `enqueueNotification` runs inside the business transaction (so a message exists exactly when
// the event committed). `deliverDueNotifications` is the worker: it leases due rows, sends them outside any
// transaction, and records the result with exponential backoff. Delivery is at-least-once per attempt; the
// dedupe key stops the same event producing two messages.
import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import type { DbOrTx } from "../audit";
import type { Database } from "../db/client";
import { customers, notifications } from "../db/schema";
import { MARKETING_EVENTS, renderNotification, type NotificationEvent, type NotificationParams } from "./templates";

export type OutgoingMessage = {
  channel: "whatsapp" | "email";
  to: string;
  whatsapp: { template: string; variables: string[] };
  email: { subject: string; text: string };
};

export interface NotificationSender {
  /** Channels this sender can deliver; others are marked "skipped". */
  has(channel: OutgoingMessage["channel"]): boolean;
  send(message: OutgoingMessage): Promise<{ providerMessageId: string | null }>;
}

/** Retry delays after each failed attempt; after the last one the message is marked failed for staff. */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000];
/** A leased row is retried after this long if the worker died mid-send. */
const LEASE_MS = 5 * 60_000;

export async function enqueueNotification(
  tx: DbOrTx,
  input: { event: NotificationEvent; customerId: string; orderId: string | null; ref: string; params: Omit<NotificationParams, "name"> },
) {
  const [customer] = await tx.select({ name: customers.name, phone: customers.phone, email: customers.email }).from(customers).where(eq(customers.id, input.customerId));
  if (!customer) return;
  const params = { ...input.params, name: customer.name };
  const targets: { channel: "whatsapp" | "email"; recipient: string }[] = [{ channel: "whatsapp", recipient: customer.phone }];
  if (customer.email) targets.push({ channel: "email", recipient: customer.email });
  for (const target of targets) {
    await tx
      .insert(notifications)
      .values({ customerId: input.customerId, orderId: input.orderId, event: input.event, channel: target.channel, recipient: target.recipient, params, dedupeKey: `${input.event}:${input.ref}:${target.channel}` })
      .onConflictDoNothing();
  }
}

/** Sends due notifications. Returns how many were attempted. Safe to run from several processes at once. */
export async function deliverDueNotifications(db: Database, sender: NotificationSender, now = new Date(), batch = 25) {
  const leased = await db.transaction(async (tx) => {
    const due = await tx
      .select({ id: notifications.id })
      .from(notifications)
      // 1 s tolerance: Postgres stamps rows in microseconds, JavaScript's clock only has milliseconds, so a row
      // queued in the same millisecond would otherwise look "not due yet".
      .where(and(eq(notifications.status, "pending"), lte(notifications.nextAttemptAt, new Date(now.getTime() + 1000))))
      .orderBy(asc(notifications.nextAttemptAt))
      .limit(batch)
      .for("update", { skipLocked: true });
    if (!due.length) return [];
    return tx
      .update(notifications)
      .set({ nextAttemptAt: new Date(now.getTime() + LEASE_MS), attempts: sql`${notifications.attempts} + 1` })
      .where(inArray(notifications.id, due.map((row) => row.id)))
      .returning();
  });

  for (const row of leased) {
    if (!sender.has(row.channel)) {
      await db.update(notifications).set({ status: "skipped", lastError: `No ${row.channel} sender configured` }).where(eq(notifications.id, row.id));
      continue;
    }
    if (MARKETING_EVENTS.has(row.event as NotificationEvent)) {
      const [consent] = await db.select({ optIn: customers.marketingOptIn }).from(customers).where(eq(customers.id, row.customerId));
      if (!consent?.optIn) {
        await db.update(notifications).set({ status: "skipped", lastError: "Customer is not opted in to marketing messages" }).where(eq(notifications.id, row.id));
        continue;
      }
    }
    const rendered = renderNotification(row.event as NotificationEvent, row.params as NotificationParams);
    try {
      const result = await sender.send({ channel: row.channel, to: row.recipient, ...rendered });
      await db.update(notifications).set({ status: "sent", sentAt: new Date(), providerMessageId: result.providerMessageId, lastError: null }).where(eq(notifications.id, row.id));
    } catch (error) {
      const delay = RETRY_DELAYS_MS[row.attempts - 1];
      await db
        .update(notifications)
        .set(delay === undefined
          ? { status: "failed", lastError: String((error as Error).message).slice(0, 300) }
          : { nextAttemptAt: new Date(now.getTime() + delay), lastError: String((error as Error).message).slice(0, 300) })
        .where(eq(notifications.id, row.id));
    }
  }
  return leased.length;
}

/** Staff: send a failed or skipped message again from scratch. */
export async function retryNotification(db: Database, id: string) {
  const [row] = await db
    .update(notifications)
    .set({ status: "pending", attempts: 0, nextAttemptAt: new Date(), lastError: null })
    .where(and(eq(notifications.id, id), inArray(notifications.status, ["failed", "skipped"])))
    .returning({ id: notifications.id });
  return !!row;
}

const view = (row: typeof notifications.$inferSelect) => ({
  id: row.id,
  orderId: row.orderId,
  event: row.event,
  channel: row.channel,
  // Staff see where it went; masked in lists to limit personal data on screen.
  recipient: row.channel === "whatsapp" ? `••••${row.recipient.slice(-4)}` : row.recipient.replace(/^(.).*(@.*)$/, "$1•••$2"),
  status: row.status,
  attempts: row.attempts,
  lastError: row.lastError,
  sentAt: row.sentAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

export async function orderNotifications(db: DbOrTx, orderId: string) {
  const rows = await db.select().from(notifications).where(eq(notifications.orderId, orderId)).orderBy(desc(notifications.createdAt));
  return rows.map(view);
}

export async function listNotifications(db: Database, query: { status?: "pending" | "sent" | "failed" | "skipped"; limit: number; offset: number }) {
  const rows = await db
    .select()
    .from(notifications)
    .where(query.status ? eq(notifications.status, query.status) : undefined)
    .orderBy(desc(notifications.createdAt))
    .limit(query.limit)
    .offset(query.offset);
  return rows.map(view);
}
