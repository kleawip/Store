import type { AdminInventoryAdjustment, AdminInventoryItem } from "@kleawip/contract";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { recordAudit } from "../audit";
import type { Database } from "../db/client";
import { inventoryItems, inventoryMovements, products, staffUsers, variants } from "../db/schema";
import { availableUnits } from "../domain/availability";
import { ApiError, notFound } from "../errors";

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export async function listInventory(db: Database, filter?: "low" | "out" | "untracked"): Promise<AdminInventoryItem[]> {
  const items = await db.select().from(inventoryItems).orderBy(asc(inventoryItems.label));
  const skus = items.length
    ? await db
        .select({ inventoryItemId: variants.inventoryItemId, sku: variants.sku, productTitle: products.title, inventoryUnitsPerSale: variants.inventoryUnitsPerSale })
        .from(variants)
        .innerJoin(products, eq(products.id, variants.productId))
        .where(inArray(variants.inventoryItemId, items.map((item) => item.id)))
        .orderBy(asc(variants.sku))
    : [];

  return items
    .map((item) => ({
      id: item.id,
      label: item.label,
      tracked: item.tracked,
      onHand: item.onHand,
      committed: item.committed,
      unavailable: item.unavailable,
      available: availableUnits(item),
      incoming: item.incoming,
      lowStockThreshold: item.lowStockThreshold,
      skus: skus.filter((row) => row.inventoryItemId === item.id).map(({ sku, productTitle, inventoryUnitsPerSale }) => ({ sku, productTitle, inventoryUnitsPerSale })),
    }))
    .filter((item) => {
      if (filter === "untracked") return !item.tracked;
      if (filter === "out") return item.tracked && item.available === 0;
      if (filter === "low") return item.tracked && item.lowStockThreshold !== null && item.available <= item.lowStockThreshold;
      return true;
    });
}

/**
 * Applies one manual stock adjustment. The row is locked (SELECT … FOR UPDATE) so two staff
 * adjusting at once cannot lose an update; the movement, the new totals and the audit entry
 * commit together or not at all.
 */
export async function adjustInventory(db: Database, itemId: string, input: AdminInventoryAdjustment, actorStaffId: string) {
  if (!isUuid(itemId)) throw notFound("Inventory item not found.");
  return db.transaction(async (tx) => {
    const locked = await tx.execute<{ id: string; on_hand: number; committed: number; unavailable: number; tracked: boolean }>(
      sql`SELECT id, on_hand, committed, unavailable, tracked FROM inventory_items WHERE id = ${itemId} FOR UPDATE`,
    );
    const item = locked.rows[0];
    if (!item) throw notFound("Inventory item not found.");
    if (!item.tracked) {
      throw new ApiError(422, "VALIDATION_FAILED", "Validation failed", "This item's stock is not tracked.", [
        { path: "field", code: "not_tracked", message: "Turn on stock tracking before adjusting quantities." },
      ]);
    }

    const next = {
      onHand: item.on_hand + (input.field === "on_hand" ? input.delta : 0),
      unavailable: item.unavailable + (input.field === "unavailable" ? input.delta : 0),
    };
    const available = next.onHand - item.committed - next.unavailable;
    if (next.onHand < 0 || next.unavailable < 0 || available < 0) {
      throw new ApiError(422, "VALIDATION_FAILED", "Validation failed", "This adjustment would make stock negative.", [
        {
          path: "delta",
          code: "negative_available",
          message: `On hand cannot go below committed + unavailable (${item.committed} + ${next.unavailable}). Available after this change would be ${available}.`,
        },
      ]);
    }

    await tx.update(inventoryItems).set({ ...next, updatedAt: new Date() }).where(eq(inventoryItems.id, itemId));
    await tx.insert(inventoryMovements).values({
      inventoryItemId: itemId,
      reason: input.reason,
      onHandDelta: input.field === "on_hand" ? input.delta : 0,
      unavailableDelta: input.field === "unavailable" ? input.delta : 0,
      note: input.note,
      actorStaffId,
    });
    await recordAudit(tx, {
      entityType: "inventory_item",
      entityId: itemId,
      action: "inventory.adjusted",
      actorStaffId,
      before: { onHand: item.on_hand, unavailable: item.unavailable },
      after: { ...next, reason: input.reason, note: input.note },
    });
    return { onHand: next.onHand, committed: item.committed, unavailable: next.unavailable, available };
  });
}

export async function inventoryMovementHistory(db: Database, itemId: string) {
  if (!isUuid(itemId)) throw notFound("Inventory item not found.");
  const [item] = await db.select({ id: inventoryItems.id }).from(inventoryItems).where(eq(inventoryItems.id, itemId));
  if (!item) throw notFound("Inventory item not found.");
  const rows = await db
    .select({
      id: inventoryMovements.id,
      reason: inventoryMovements.reason,
      onHandDelta: inventoryMovements.onHandDelta,
      committedDelta: inventoryMovements.committedDelta,
      unavailableDelta: inventoryMovements.unavailableDelta,
      note: inventoryMovements.note,
      actorName: staffUsers.name,
      createdAt: inventoryMovements.createdAt,
    })
    .from(inventoryMovements)
    .leftJoin(staffUsers, eq(staffUsers.id, inventoryMovements.actorStaffId))
    .where(eq(inventoryMovements.inventoryItemId, itemId))
    .orderBy(desc(inventoryMovements.createdAt));
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}
