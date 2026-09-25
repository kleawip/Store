// Read-only shipment views, kept apart from the booking logic so order views can use them without import cycles.
import { and, desc, eq, ne } from "drizzle-orm";
import type { DbOrTx } from "../audit";
import { shipmentEvents, shipments } from "../db/schema";
import { trackingUrlFor } from "./provider";

async function liveShipment(db: DbOrTx, orderId: string) {
  const [row] = await db.select().from(shipments).where(and(eq(shipments.orderId, orderId), ne(shipments.status, "cancelled")));
  return row ?? null;
}

async function eventsFor(db: DbOrTx, shipmentId: string) {
  const rows = await db.select().from(shipmentEvents).where(eq(shipmentEvents.shipmentId, shipmentId)).orderBy(desc(shipmentEvents.occurredAt));
  return rows.map((row) => ({ status: row.courierStatus, location: row.location, occurredAt: row.occurredAt.toISOString() }));
}

export async function adminShipments(db: DbOrTx, orderId: string) {
  const rows = await db.select().from(shipments).where(eq(shipments.orderId, orderId)).orderBy(desc(shipments.createdAt));
  const out = [];
  for (const row of rows) {
    out.push({
      id: row.id,
      provider: row.provider,
      status: row.status,
      awb: row.awb,
      courierName: row.courierName,
      labelUrl: row.labelUrl,
      trackingUrl: trackingUrlFor(row.provider, row.awb),
      weightGrams: row.weightGrams,
      dimensionsCm: { length: row.lengthCm, breadth: row.breadthCm, height: row.heightCm },
      lastError: row.lastError,
      events: await eventsFor(db, row.id),
      pickupRequestedAt: row.pickupRequestedAt?.toISOString() ?? null,
      shippedAt: row.shippedAt?.toISOString() ?? null,
      deliveredAt: row.deliveredAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    });
  }
  return out;
}

/** What the customer sees: the live shipment's courier, AWB, tracking link and updates. */
export async function orderTracking(db: DbOrTx, orderId: string) {
  const shipment = await liveShipment(db, orderId);
  if (!shipment) return null;
  return {
    courierName: shipment.courierName,
    awb: shipment.awb,
    trackingUrl: trackingUrlFor(shipment.provider, shipment.awb),
    status: shipment.status,
    events: await eventsFor(db, shipment.id),
  };
}
