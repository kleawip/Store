// Shipments (Milestone 3): booking with the courier, pickup, cancellation, and tracking updates.
// Booking is saved step by step (courier order → AWB → label). A failure half-way keeps what succeeded and
// records the error, so a retry continues instead of creating a duplicate courier order.
// Stock leaves the books (on hand and committed both drop) the first time the courier reports the parcel moving.
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { recordAudit, type DbOrTx } from "../audit";
import type { CommerceSettings } from "../checkout/settings";
import type { QuoteSnapshot } from "../checkout/quote";
import type { Database } from "../db/client";
import { checkoutQuotes, customers, inventoryItems, inventoryMovements, orderLines, orders, shipmentEvents, shipments } from "../db/schema";
import { ApiError } from "../errors";
import { issueInvoice } from "../invoices/service";
import { CANCELLABLE_FULFILMENT, invalid, lockedOrder } from "../orders/lifecycle";
import type { Tx } from "../orders/service";
import { enqueueNotification } from "../notifications/outbox";
import { rupees } from "../notifications/templates";
import { getSeller } from "../settings/service";
import { ShippingRejectedError, ShippingUnavailableError, trackingUrlFor, type ShipmentRequest, type ShippingProvider } from "./provider";

type ShipmentRow = typeof shipments.$inferSelect;
type ShipmentStatus = ShipmentRow["status"];
type OrderRow = typeof orders.$inferSelect;

const LIVE_BEFORE_PICKUP: ShipmentStatus[] = ["pending", "ready", "pickup_requested"];

function courierError(error: unknown): ApiError {
  if (error instanceof ShippingUnavailableError) {
    return new ApiError(503, "COURIER_UNAVAILABLE", "Courier unavailable", "The courier service didn't respond. Nothing was lost: try again in a moment.");
  }
  if (error instanceof ShippingRejectedError) return invalid("courier", "courier_rejected", error.message);
  throw error;
}

function requireProvider(provider: ShippingProvider | null) {
  if (!provider) throw new ApiError(503, "COURIER_UNAVAILABLE", "Courier not configured", "No courier account is connected yet.");
  return provider;
}

async function activeShipment(db: DbOrTx, orderId: string, lock = false) {
  const query = db.select().from(shipments).where(and(eq(shipments.orderId, orderId), ne(shipments.status, "cancelled")));
  const [row] = lock ? await query.for("update") : await query;
  return row ?? null;
}

async function parcelWeight(tx: Tx, order: OrderRow, settings: CommerceSettings) {
  const [quote] = await tx.select({ snapshot: checkoutQuotes.snapshot }).from(checkoutQuotes).where(eq(checkoutQuotes.id, order.quoteId));
  const lines = (quote?.snapshot as QuoteSnapshot | undefined)?.lines ?? [];
  const grams = lines.reduce((sum, line) => sum + (line.weightGrams ?? settings.defaultWeightGrams) * line.quantity, 0);
  return Math.min(Math.max(grams || settings.defaultWeightGrams, 1), 30_000);
}

// ---- Booking ----

export async function bookShipment(
  db: Database,
  provider: ShippingProvider | null,
  settings: CommerceSettings,
  orderId: string,
  input: { weightGrams?: number; lengthCm?: number; breadthCm?: number; heightCm?: number },
  actorStaffId: string,
) {
  const courier = requireProvider(provider);
  const shipmentId = await db.transaction(async (tx) => {
    const order = await lockedOrder(tx, orderId);
    if (order.status !== "confirmed") throw invalid("status", "not_confirmed", "Only confirmed (paid) orders can be shipped.");
    if (!CANCELLABLE_FULFILMENT.includes(order.fulfilmentStatus)) throw invalid("fulfilmentStatus", "already_shipped", "This order has already left the warehouse.");
    if (await activeShipment(tx, order.id)) throw invalid("shipment", "shipment_active", "This order already has a shipment. Cancel it first to book again.");
    const seller = await getSeller(tx);
    if (!seller) throw invalid("seller", "seller_details_missing", "Add the business's GST details (Settings → Business details) before shipping: the parcel needs a tax invoice.");

    const [shipment] = await tx
      .insert(shipments)
      .values({
        orderId: order.id,
        provider: courier.name,
        weightGrams: input.weightGrams ?? (await parcelWeight(tx, order, settings)),
        lengthCm: input.lengthCm ?? settings.defaultParcelCm.length,
        breadthCm: input.breadthCm ?? settings.defaultParcelCm.breadth,
        heightCm: input.heightCm ?? settings.defaultParcelCm.height,
        createdByStaffId: actorStaffId,
      })
      .returning();
    const invoice = await issueInvoice(tx, order, seller);
    await tx.update(orders).set({ fulfilmentStatus: "packed", updatedAt: new Date() }).where(eq(orders.id, order.id));
    await recordAudit(tx, { entityType: "order", entityId: order.id, action: "shipment.booking_started", actorStaffId, after: { shipmentId: shipment!.id, invoice: invoice.number, weightGrams: shipment!.weightGrams } });
    return shipment!.id;
  });
  await continueBooking(db, courier, shipmentId);
}

export async function retryBooking(db: Database, provider: ShippingProvider | null, orderId: string, actorStaffId: string) {
  const courier = requireProvider(provider);
  const shipment = await activeShipment(db, orderId);
  if (!shipment || shipment.status !== "pending") throw invalid("shipment", "not_retryable", "There is no unfinished booking to retry.");
  if (shipment.provider !== courier.name) throw invalid("shipment", "provider_changed", "This booking was started with a different courier account. Cancel it and book again.");
  await recordAudit(db, { entityType: "order", entityId: orderId, action: "shipment.booking_retried", actorStaffId, after: { shipmentId: shipment.id } });
  await continueBooking(db, courier, shipment.id);
}

async function shipmentRequest(tx: Tx, order: OrderRow, shipment: ShipmentRow): Promise<ShipmentRequest> {
  const address = order.shippingAddress as { name: string; phone: string; line1: string; line2: string; landmark: string; city: string; stateName: string; pincode: string };
  const [customer] = await tx.select({ email: customers.email }).from(customers).where(eq(customers.id, order.customerId));
  const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, order.id)).orderBy(asc(orderLines.sku));
  return {
    orderNumber: order.number,
    orderDate: order.createdAt,
    customer: {
      name: address.name,
      phone: address.phone,
      email: customer?.email ?? null,
      line1: address.line1,
      line2: [address.line2, address.landmark].filter(Boolean).join(", "),
      city: address.city,
      stateName: address.stateName,
      pincode: address.pincode,
    },
    items: lines.map((line) => ({
      name: line.optionsLabel ? `${line.productTitle} (${line.optionsLabel})` : line.productTitle,
      sku: line.sku,
      units: line.quantity,
      unitPricePaise: line.unitPricePaise,
      taxRatePercent: line.taxRateBasisPoints / 100,
      hsnCode: line.hsnCode,
      discountPerUnitPaise: Math.round(line.discountPaise / line.quantity),
    })),
    subTotalPaise: order.totalPaise,
    codAmountPaise: order.paymentMethod === "partial_cod" ? order.codBalancePaise : 0,
    weightGrams: shipment.weightGrams,
    dimensionsCm: { length: shipment.lengthCm, breadth: shipment.breadthCm, height: shipment.heightCm },
  };
}

const isLockBusy = (error: unknown) => {
  const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  return code === "55P03";
};

/**
 * Runs the remaining booking steps while holding the shipment row (so two clicks can't book twice). Each step's
 * result is saved before the next; a courier error is recorded on the shipment and reported AFTER the commit,
 * so the progress made so far is never rolled back.
 */
async function continueBooking(db: Database, courier: ShippingProvider, shipmentId: string) {
  let failure: unknown = null;
  try {
    await db.transaction(async (tx) => {
      let [shipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId)).for("update", { noWait: true });
      if (!shipment || shipment.status !== "pending") return;
      const save = async (patch: Partial<ShipmentRow>) => {
        [shipment] = await tx.update(shipments).set({ ...patch, updatedAt: new Date() }).where(eq(shipments.id, shipmentId)).returning();
      };
      try {
        if (!shipment.providerShipmentId) {
          const [order] = await tx.select().from(orders).where(eq(orders.id, shipment.orderId));
          await save(await courier.createShipment(await shipmentRequest(tx, order!, shipment)));
        }
        if (!shipment!.awb) await save(await courier.assignAwb(shipment!.providerShipmentId!));
        if (!shipment!.labelUrl) await save(await courier.generateLabel(shipment!.providerShipmentId!));
        await save({ status: "ready", lastError: null });
      } catch (error) {
        if (!(error instanceof ShippingUnavailableError || error instanceof ShippingRejectedError)) throw error;
        failure = error;
        await save({ lastError: error.message });
      }
    });
  } catch (error) {
    if (isLockBusy(error)) throw invalid("shipment", "booking_in_progress", "This shipment is being booked right now. Refresh in a moment.", 409);
    throw error;
  }
  if (failure) throw courierError(failure);
}

// ---- Pickup and cancellation ----

export async function requestPickup(db: Database, provider: ShippingProvider | null, orderId: string, actorStaffId: string) {
  const courier = requireProvider(provider);
  try {
    await db.transaction(async (tx) => {
      await lockedOrder(tx, orderId);
      const shipment = await activeShipment(tx, orderId, true);
      if (!shipment || shipment.status !== "ready") throw invalid("shipment", "not_ready", "Book the shipment (AWB and label) before asking for a pickup.");
      await courier.requestPickup(shipment.providerShipmentId!);
      await tx.update(shipments).set({ status: "pickup_requested", pickupRequestedAt: new Date(), updatedAt: new Date() }).where(eq(shipments.id, shipment.id));
      await recordAudit(tx, { entityType: "order", entityId: orderId, action: "shipment.pickup_requested", actorStaffId, after: { shipmentId: shipment.id, awb: shipment.awb } });
    });
  } catch (error) {
    if (error instanceof ShippingUnavailableError || error instanceof ShippingRejectedError) throw courierError(error);
    throw error;
  }
}

/** Cancels a shipment that hasn't been picked up. The order goes back to "packed" and can be booked again. */
export async function cancelShipment(db: Database, provider: ShippingProvider | null, orderId: string, actorStaffId: string) {
  try {
    await db.transaction(async (tx) => {
      await lockedOrder(tx, orderId);
      const shipment = await activeShipment(tx, orderId, true);
      if (!shipment) throw invalid("shipment", "no_shipment", "This order has no shipment to cancel.");
      if (!LIVE_BEFORE_PICKUP.includes(shipment.status)) {
        throw invalid("shipment", "already_picked_up", "The courier already has this parcel. Ask the courier for a return to origin (RTO) instead.");
      }
      if (shipment.providerOrderId) await requireProvider(provider).cancelShipment(shipment.providerOrderId);
      await tx.update(shipments).set({ status: "cancelled", updatedAt: new Date() }).where(eq(shipments.id, shipment.id));
      await tx.update(orders).set({ fulfilmentStatus: "packed", updatedAt: new Date() }).where(eq(orders.id, orderId));
      await recordAudit(tx, { entityType: "order", entityId: orderId, action: "shipment.cancelled", actorStaffId, before: { status: shipment.status, awb: shipment.awb } });
    });
  } catch (error) {
    if (error instanceof ShippingUnavailableError || error instanceof ShippingRejectedError) throw courierError(error);
    throw error;
  }
}

/** True when the order has a live shipment (staff must cancel it before cancelling the order). */
export async function hasActiveShipment(db: DbOrTx, orderId: string) {
  return (await activeShipment(db, orderId)) !== null;
}

// ---- Tracking updates ----

type Mapped = Exclude<ShipmentStatus, "pending" | "ready" | "pickup_requested"> | "ndr" | null;

/** Courier status text → our status. Unknown texts are recorded on the timeline but change nothing. */
export function mapCourierStatus(raw: string): Mapped {
  const status = raw.toUpperCase().replace(/[_-]+/g, " ").trim();
  if (status.startsWith("RTO")) return /DELIVERED|RECEIVED/.test(status) ? "returned_to_origin" : "rto_initiated";
  if (/UNDELIVERED|NDR|DELIVERY FAILED|FAILED DELIVERY|FAILED ATTEMPT/.test(status)) return "ndr";
  if (status === "DELIVERED") return "delivered";
  if (status.includes("OUT FOR DELIVERY")) return "out_for_delivery";
  if (/CANCEL/.test(status)) return "cancelled";
  if (/PICKED UP|SHIPPED|IN TRANSIT|REACHED|DISPATCHED|MISROUTED|DELAYED/.test(status)) return "in_transit";
  return null;
}

const RANK: Record<ShipmentStatus, number> = {
  pending: 0, ready: 1, pickup_requested: 2, in_transit: 3, out_for_delivery: 4, delivered: 5, rto_initiated: 6, returned_to_origin: 7, cancelled: -1,
};
const FULFILMENT_FOR: Partial<Record<ShipmentStatus, OrderRow["fulfilmentStatus"]>> = {
  in_transit: "shipped", out_for_delivery: "out_for_delivery", delivered: "delivered", rto_initiated: "rto_initiated", returned_to_origin: "returned_to_origin",
};

export type TrackingUpdate = { awb: string; courierStatus: string; occurredAt: Date; location: string | null; payload: unknown };

/** Parses a Shiprocket tracking webhook body. Returns null when it doesn't look like one. */
export function parseShiprocketTracking(body: unknown, now = new Date()): TrackingUpdate | null {
  if (!body || typeof body !== "object") return null;
  const data = body as { awb?: unknown; current_status?: unknown; shipment_status?: unknown; current_timestamp?: unknown; scans?: { location?: unknown }[] };
  const awb = typeof data.awb === "string" || typeof data.awb === "number" ? String(data.awb).trim() : "";
  const courierStatus = String(data.current_status ?? data.shipment_status ?? "").trim();
  if (!awb || !courierStatus) return null;
  const lastScan = Array.isArray(data.scans) ? data.scans[data.scans.length - 1] : undefined;
  return {
    awb,
    courierStatus: courierStatus.slice(0, 120),
    occurredAt: parseCourierTime(data.current_timestamp) ?? now,
    location: typeof lastScan?.location === "string" && lastScan.location.trim() ? lastScan.location.trim().slice(0, 120) : null,
    payload: body,
  };
}

/** Courier times are India time without a zone: "23 05 2023 11:43:52", "2023-05-23 11:43:52" or ISO. */
function parseCourierTime(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const dmy = value.match(/^(\d{2})[ /-](\d{2})[ /-](\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  const ymd = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  const parts = dmy ? [dmy[3], dmy[2], dmy[1], dmy[4], dmy[5], dmy[6]] : ymd ? [ymd[1], ymd[2], ymd[3], ymd[4], ymd[5], ymd[6]] : null;
  if (parts) {
    const date = new Date(`${parts[0]}-${parts[1]}-${parts[2]}T${parts[3]}:${parts[4]}:${parts[5] ?? "00"}+05:30`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const iso = new Date(value);
  return /\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(iso.getTime()) ? iso : null;
}

/** Stock leaves the books once, when the parcel first moves: on hand and committed both drop. */
async function fulfilStock(tx: Tx, order: OrderRow) {
  const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, order.id));
  const units = new Map<string, number>();
  for (const line of lines) units.set(line.inventoryItemId, (units.get(line.inventoryItemId) ?? 0) + line.inventoryUnits);
  for (const id of [...units.keys()].sort()) {
    const [item] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, id)).for("update");
    if (!item?.tracked) continue;
    const count = units.get(id)!;
    await tx
      .update(inventoryItems)
      .set({ onHand: sql`${inventoryItems.onHand} - ${count}`, committed: sql`${inventoryItems.committed} - ${count}`, updatedAt: new Date() })
      .where(eq(inventoryItems.id, id));
    await tx.insert(inventoryMovements).values({ inventoryItemId: id, reason: "order_fulfilled", onHandDelta: -count, committedDelta: -count, sourceRef: `order:${order.id}`, note: `Shipped (${order.number})` });
  }
}

const ATTENTION: Partial<Record<NonNullable<Mapped>, (status: string) => string>> = {
  ndr: (status) => `Delivery attempt failed ("${status}"). Contact the customer and tell the courier to reattempt or return it.`,
  rto_initiated: () => "The parcel is being returned to us (RTO). When it arrives, inspect it and decide on restock and refund.",
  returned_to_origin: () => "The parcel is back at the warehouse (RTO delivered). Inspect it, restock, and refund the customer's online payment if it won't be re-sent.",
  cancelled: (status) => `The courier reports this shipment as cancelled ("${status}"). Check with the courier and re-book if needed.`,
};

export async function applyTrackingUpdate(db: Database, provider: string, update: TrackingUpdate) {
  const [found] = await db
    .select({ id: shipments.id, orderId: shipments.orderId })
    .from(shipments)
    .where(and(eq(shipments.provider, provider), eq(shipments.awb, update.awb)))
    .orderBy(desc(shipments.createdAt))
    .limit(1);
  if (!found) return "unknown_awb" as const;

  return db.transaction(async (tx) => {
    const order = await lockedOrder(tx, found.orderId);
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, found.id)).for("update");
    const [event] = await tx
      .insert(shipmentEvents)
      .values({
        shipmentId: shipment!.id,
        dedupeKey: `${provider}:${update.awb}:${update.courierStatus.toUpperCase()}:${update.occurredAt.toISOString()}`,
        courierStatus: update.courierStatus,
        location: update.location,
        occurredAt: update.occurredAt,
        payload: update.payload as object,
      })
      .onConflictDoNothing()
      .returning({ id: shipmentEvents.id });
    if (!event) return "duplicate" as const;
    if (shipment!.status === "cancelled") return "recorded" as const;

    const mapped = mapCourierStatus(update.courierStatus);
    const attention = mapped ? ATTENTION[mapped]?.(update.courierStatus) : undefined;
    if (attention) await tx.update(orders).set({ needsAttention: attention, updatedAt: new Date() }).where(eq(orders.id, order.id));
    if (!mapped || mapped === "ndr" || mapped === "cancelled") return "recorded" as const;

    const current = shipment!.status;
    // Forward only: late or out-of-order updates never move a parcel backwards, and nothing follows delivery.
    if (RANK[mapped] <= RANK[current] || current === "delivered" || (current === "returned_to_origin")) return "recorded" as const;

    const now = new Date();
    const patch: Partial<ShipmentRow> = { status: mapped, updatedAt: now };
    if (!shipment!.stockFulfilledAt) {
      await fulfilStock(tx, order);
      patch.stockFulfilledAt = now;
      patch.shippedAt = update.occurredAt;
    }
    const orderPatch: Partial<OrderRow> = { fulfilmentStatus: FULFILMENT_FOR[mapped]!, updatedAt: now };
    if (mapped === "delivered") {
      patch.deliveredAt = update.occurredAt;
      // The courier collected the partial-COD balance. (Remittance to our bank is reconciled separately.)
      if (order.paymentMethod === "partial_cod") orderPatch.codCollectedPaise = order.codBalancePaise;
    }
    await tx.update(shipments).set(patch).where(eq(shipments.id, shipment!.id));
    await tx.update(orders).set(orderPatch).where(eq(orders.id, order.id));
    await recordAudit(tx, { entityType: "order", entityId: order.id, action: `shipment.${mapped}`, actorStaffId: null, before: { status: current }, after: { status: mapped, courierStatus: update.courierStatus } });
    const notice = ({ in_transit: "order_shipped", out_for_delivery: "order_out_for_delivery", delivered: "order_delivered" } as const)[mapped as "in_transit" | "out_for_delivery" | "delivered"];
    if (notice) {
      const codDue = order.paymentMethod === "partial_cod" && notice !== "order_delivered" ? rupees(order.codBalancePaise) : null;
      await enqueueNotification(tx, {
        event: notice,
        customerId: order.customerId,
        orderId: order.id,
        ref: order.id,
        params: { orderNumber: order.number, courier: shipment!.courierName, awb: shipment!.awb, trackingUrl: trackingUrlFor(shipment!.provider, shipment!.awb), codBalance: codDue },
      });
    }
    return "applied" as const;
  });
}
