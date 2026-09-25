import { and, desc, eq } from "drizzle-orm";
import type { Database } from "./db/client";
import { auditEvents, staffUsers } from "./db/schema";

/** A database handle or an open transaction: audit rows are written inside the change's own transaction. */
export type DbOrTx = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export type AuditEntry = {
  entityType: "product" | "variant" | "inventory_item" | "collection" | "hero_slide" | "ribbon_message" | "staff" | "order";
  entityId: string;
  action: string;
  actorStaffId: string | null;
  before?: unknown;
  after?: unknown;
  comment?: string;
};

export async function recordAudit(db: DbOrTx, entry: AuditEntry) {
  await db.insert(auditEvents).values({
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    actorStaffId: entry.actorStaffId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    comment: entry.comment ?? null,
  });
}

export async function listAudit(db: Database, entityType: string, entityId: string, limit = 100) {
  const rows = await db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      actorName: staffUsers.name,
      comment: auditEvents.comment,
      before: auditEvents.before,
      after: auditEvents.after,
      createdAt: auditEvents.createdAt,
    })
    .from(auditEvents)
    .leftJoin(staffUsers, eq(staffUsers.id, auditEvents.actorStaffId))
    .where(and(eq(auditEvents.entityType, entityType), eq(auditEvents.entityId, entityId)))
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}
