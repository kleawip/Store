// Admin Overview (ADMIN_SCREENS_BRIEF §2, Milestone 1): work queues only. Order and revenue cards arrive in
// Milestone 2; nothing here estimates or invents numbers.
import { and, count, eq, gt, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { heroSlides, inventoryItems, orders, productMedia, products, ribbonMessages, variants } from "../db/schema";
import { activityLog } from "../staff/service";

export async function dashboard(db: Database, now = new Date()) {
  const available = sql`${inventoryItems.onHand} - ${inventoryItems.committed} - ${inventoryItems.unavailable}`;
  const [
    [statusCounts],
    [missingPrice],
    [missingImages],
    [lowStock],
    [outOfStock],
    upcoming,
    recent,
    [orderCounts],
  ] = await Promise.all([
    db
      .select({
        draft: sql<number>`count(*) filter (where ${products.status} = 'draft')::int`,
        published: sql<number>`count(*) filter (where ${products.status} = 'published')::int`,
        archived: sql<number>`count(*) filter (where ${products.status} = 'archived')::int`,
      })
      .from(products),
    db
      .select({ value: sql<number>`count(distinct ${variants.productId})::int` })
      .from(variants)
      .where(and(eq(variants.status, "active"), isNull(variants.pricePaise))),
    db
      .select({ value: count() })
      .from(products)
      .where(and(sql`${products.status} <> 'archived'`, sql`not exists (select 1 from ${productMedia} where ${productMedia.productId} = ${products.id})`)),
    db
      .select({ value: count() })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.tracked, true), isNotNull(inventoryItems.lowStockThreshold), gt(available, 0), lte(available, inventoryItems.lowStockThreshold))),
    db
      .select({ value: count() })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.tracked, true), lte(available, 0), sql`exists (select 1 from ${variants} where ${variants.inventoryItemId} = ${inventoryItems.id} and ${variants.status} = 'active')`)),
    Promise.all([
      db
        .select({ id: heroSlides.id, title: heroSlides.internalTitle, startsAt: heroSlides.startsAt, endsAt: heroSlides.endsAt })
        .from(heroSlides)
        .where(and(eq(heroSlides.status, "published"), or(gt(heroSlides.startsAt, now), gt(heroSlides.endsAt, now)))),
      db
        .select({ id: ribbonMessages.id, title: ribbonMessages.text, startsAt: ribbonMessages.startsAt, endsAt: ribbonMessages.endsAt })
        .from(ribbonMessages)
        .where(and(eq(ribbonMessages.status, "published"), or(gt(ribbonMessages.startsAt, now), gt(ribbonMessages.endsAt, now)))),
    ]),
    activityLog(db, { limit: 10 }),
    db
      .select({
        // "Today" in India time.
        confirmedToday: sql<number>`count(*) filter (where ${orders.status} = 'confirmed' and (${orders.confirmedAt} at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date)::int`,
        awaitingPayment: sql<number>`count(*) filter (where ${orders.status} = 'pending_payment')::int`,
        needsAttention: sql<number>`count(*) filter (where ${orders.needsAttention} is not null)::int`,
      })
      .from(orders),
  ]);

  // Next start or end for each scheduled campaign, soonest first.
  const schedule = [
    ...upcoming[0].map((row) => ({ ...row, kind: "hero_slide" as const })),
    ...upcoming[1].map((row) => ({ ...row, kind: "ribbon_message" as const })),
  ]
    .map((row) => {
      const starts = row.startsAt && row.startsAt > now;
      const at = starts ? row.startsAt! : row.endsAt!;
      return { id: row.id, kind: row.kind, title: row.title, event: starts ? ("starts" as const) : ("ends" as const), at: at.toISOString() };
    })
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(0, 5);

  return {
    products: statusCounts!,
    attention: { productsMissingPrice: missingPrice!.value, productsMissingImages: missingImages!.value },
    stock: { lowStockItems: lowStock!.value, outOfStockItems: outOfStock!.value },
    orders: orderCounts!,
    campaignSchedule: schedule,
    recentActivity: recent,
  };
}
