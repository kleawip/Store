// Discount codes (Milestone 4). One code per order, applied at checkout to the whole order:
//  - percentage (optionally capped) or a fixed amount off the goods, or free shipping;
//  - limits: minimum spend, start/end dates, total uses, uses per customer, first order only.
// A use is counted by the orders that carry the code and are awaiting payment or confirmed, so an expired or
// cancelled order gives its use back automatically. Order placement re-checks limits with the code row locked.
// GST: prices are GST-inclusive, and a discount given at the time of sale reduces the taxable value. The goods
// discount is spread over the lines in proportion to their value, and GST is computed on the discounted lines.
import { and, count, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { recordAudit, type DbOrTx } from "../audit";
import type { Database } from "../db/client";
import { discounts, orders, staffUsers } from "../db/schema";
import { ApiError, notFound } from "../errors";

type DiscountRow = typeof discounts.$inferSelect;

export type AppliedDiscount = { id: string; code: string; description: string; merchandisePaise: number; shippingPaise: number };

const COUNTED: (typeof orders.$inferSelect)["status"][] = ["pending_payment", "confirmed"];
const inr = (amount: number) => ({ amount, currency: "INR" as const });
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const normaliseCode = (code: string) => code.trim().toUpperCase();

const refuse = (code: string, message: string, status = 422) =>
  new ApiError(status, "VALIDATION_FAILED", "Discount code not applied", message, [{ path: "discountCode", code, message }]);

async function uses(db: DbOrTx, discountId: string, customerId?: string) {
  const [row] = await db
    .select({ value: count() })
    .from(orders)
    .where(and(eq(orders.discountId, discountId), inArray(orders.status, COUNTED), customerId ? eq(orders.customerId, customerId) : undefined));
  return row?.value ?? 0;
}

/**
 * Checks a code for this customer and basket and works out what it takes off. Throws a 422 naming the reason.
 * `lock` (order placement) holds the code row so concurrent checkouts can't both take the last use.
 */
export async function evaluateDiscount(
  db: DbOrTx,
  input: { code: string; customerId: string; merchandisePaise: number; shippingPaise: number; now: Date; lock?: boolean },
): Promise<AppliedDiscount> {
  const query = db.select().from(discounts).where(eq(discounts.code, normaliseCode(input.code)));
  const [discount] = input.lock ? await query.for("update") : await query;
  if (!discount || discount.status !== "active") throw refuse("discount_invalid", "This code isn't valid.");
  if (discount.startsAt > input.now) throw refuse("discount_not_started", "This code isn't active yet.");
  if (discount.endsAt && discount.endsAt <= input.now) throw refuse("discount_expired", "This code has expired.");
  if (input.merchandisePaise < discount.minSubtotalPaise) {
    throw refuse("discount_min_subtotal", `Add ${rupees(discount.minSubtotalPaise - input.merchandisePaise)} more to use this code (minimum ${rupees(discount.minSubtotalPaise)}).`);
  }
  if (discount.usageLimit !== null && (await uses(db, discount.id)) >= discount.usageLimit) throw refuse("discount_used_up", "This code has been fully used.");
  if (discount.perCustomerLimit !== null && (await uses(db, discount.id, input.customerId)) >= discount.perCustomerLimit) {
    throw refuse("discount_already_used", "You've already used this code.");
  }
  if (discount.firstOrderOnly) {
    const [previous] = await db.select({ value: count() }).from(orders).where(and(eq(orders.customerId, input.customerId), eq(orders.status, "confirmed")));
    if ((previous?.value ?? 0) > 0) throw refuse("discount_first_order", "This code is for your first order only.");
  }

  let merchandisePaise = 0;
  let shippingPaise = 0;
  if (discount.kind === "percentage") {
    merchandisePaise = Math.floor((input.merchandisePaise * discount.percentBasisPoints!) / 10000);
    if (discount.maxDiscountPaise !== null) merchandisePaise = Math.min(merchandisePaise, discount.maxDiscountPaise);
  } else if (discount.kind === "fixed_amount") {
    merchandisePaise = discount.amountPaise!;
  } else {
    if (input.shippingPaise === 0) throw refuse("discount_no_effect", "Shipping is already free on this order.");
    shippingPaise = input.shippingPaise;
  }
  // Something must still be paid online (at least ₹1 of goods stays chargeable).
  merchandisePaise = Math.max(0, Math.min(merchandisePaise, input.merchandisePaise - 100));
  return { id: discount.id, code: discount.code, description: discount.description, merchandisePaise, shippingPaise };
}

/** Splits a goods discount across line amounts in proportion to their value. The parts always add up exactly. */
export function allocateDiscount(lineAmounts: number[], discountPaise: number) {
  const total = lineAmounts.reduce((sum, amount) => sum + amount, 0);
  if (discountPaise === 0 || total === 0) return lineAmounts.map(() => 0);
  const parts = lineAmounts.map((amount) => Math.floor((amount * discountPaise) / total));
  let left = discountPaise - parts.reduce((sum, part) => sum + part, 0);
  // Hand out the remaining paise to the largest lines first (never beyond a line's own value).
  const order = lineAmounts.map((amount, index) => ({ amount, index })).sort((a, b) => b.amount - a.amount);
  for (let i = 0; left > 0; i = (i + 1) % order.length) {
    const { index, amount } = order[i]!;
    if (parts[index]! < amount) {
      parts[index]! += 1;
      left -= 1;
    }
  }
  return parts;
}

// ---- Admin ----

export type DiscountInput = {
  code: string;
  description: string;
  kind: DiscountRow["kind"];
  percent?: number | null;
  amountPaise?: number | null;
  maxDiscountPaise?: number | null;
  minSubtotalPaise: number;
  startsAt?: string | null;
  endsAt?: string | null;
  usageLimit?: number | null;
  perCustomerLimit?: number | null;
  firstOrderOnly: boolean;
};

function valuesFrom(input: DiscountInput) {
  const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (endsAt && endsAt <= startsAt) throw new ApiError(422, "VALIDATION_FAILED", "Invalid dates", "The end must be after the start.", [{ path: "endsAt", code: "before_start", message: "The end must be after the start." }]);
  const need = (path: string, ok: boolean, message: string) => {
    if (!ok) throw new ApiError(422, "VALIDATION_FAILED", "Invalid discount", message, [{ path, code: "required", message }]);
  };
  need("percent", input.kind !== "percentage" || (!!input.percent && input.percent > 0 && input.percent <= 100), "Enter a percentage between 0 and 100.");
  need("amountPaise", input.kind !== "fixed_amount" || (!!input.amountPaise && input.amountPaise > 0), "Enter the amount to take off.");
  return {
    code: normaliseCode(input.code),
    description: input.description,
    kind: input.kind,
    percentBasisPoints: input.kind === "percentage" ? Math.round(input.percent! * 100) : null,
    amountPaise: input.kind === "fixed_amount" ? input.amountPaise! : null,
    maxDiscountPaise: input.kind === "percentage" ? (input.maxDiscountPaise ?? null) : null,
    minSubtotalPaise: input.minSubtotalPaise,
    startsAt,
    endsAt,
    usageLimit: input.usageLimit ?? null,
    perCustomerLimit: input.perCustomerLimit === undefined ? 1 : input.perCustomerLimit,
    firstOrderOnly: input.firstOrderOnly,
  };
}

const duplicate = () => new ApiError(409, "VALIDATION_FAILED", "Code already exists", "Another discount already uses this code.", [{ path: "code", code: "code_taken", message: "Another discount already uses this code." }]);
const isUnique = (error: unknown) => (error as { cause?: { code?: string } }).cause?.code === "23505";

export async function createDiscount(db: Database, input: DiscountInput, actorStaffId: string) {
  try {
    const id = await db.transaction(async (tx) => {
      const [row] = await tx.insert(discounts).values({ ...valuesFrom(input), createdByStaffId: actorStaffId }).returning();
      await recordAudit(tx, { entityType: "discount", entityId: row!.id, action: "discount.created", actorStaffId, after: row });
      return row!.id;
    });
    return adminDiscount(db, id);
  } catch (error) {
    if (isUnique(error)) throw duplicate();
    throw error;
  }
}

/** Changes a code's rules. Orders already placed keep the discount they got. */
export async function updateDiscount(db: Database, id: string, input: DiscountInput, actorStaffId: string) {
  const before = await discountRow(db, id);
  try {
    await db.transaction(async (tx) => {
      await tx.update(discounts).set({ ...valuesFrom({ ...input, startsAt: input.startsAt ?? before.startsAt.toISOString() }), updatedAt: new Date() }).where(eq(discounts.id, id));
      await recordAudit(tx, { entityType: "discount", entityId: id, action: "discount.updated", actorStaffId, before, after: input });
    });
  } catch (error) {
    if (isUnique(error)) throw duplicate();
    throw error;
  }
  return adminDiscount(db, id);
}

export async function setDiscountStatus(db: Database, id: string, status: DiscountRow["status"], actorStaffId: string) {
  await discountRow(db, id);
  await db.transaction(async (tx) => {
    await tx.update(discounts).set({ status, updatedAt: new Date() }).where(eq(discounts.id, id));
    await recordAudit(tx, { entityType: "discount", entityId: id, action: `discount.${status === "active" ? "enabled" : "disabled"}`, actorStaffId });
  });
  return adminDiscount(db, id);
}

async function discountRow(db: DbOrTx, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Discount not found.");
  const [row] = await db.select().from(discounts).where(eq(discounts.id, id));
  if (!row) throw notFound("Discount not found.");
  return row;
}

function state(row: DiscountRow, now: Date) {
  if (row.status === "disabled") return "disabled" as const;
  if (row.startsAt > now) return "scheduled" as const;
  if (row.endsAt && row.endsAt <= now) return "expired" as const;
  return "active" as const;
}

async function view(db: DbOrTx, row: DiscountRow & { createdBy?: string | null }, now = new Date()) {
  const [stats] = await db
    .select({ used: count(), discounted: sql<number>`coalesce(sum(${orders.discountPaise} + ${orders.shippingDiscountPaise}), 0)::int` })
    .from(orders)
    .where(and(eq(orders.discountId, row.id), eq(orders.status, "confirmed")));
  const reserved = await uses(db, row.id);
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    kind: row.kind,
    percent: row.percentBasisPoints === null ? null : row.percentBasisPoints / 100,
    amount: row.amountPaise === null ? null : inr(row.amountPaise),
    maxDiscount: row.maxDiscountPaise === null ? null : inr(row.maxDiscountPaise),
    minSubtotal: inr(row.minSubtotalPaise),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    usageLimit: row.usageLimit,
    perCustomerLimit: row.perCustomerLimit,
    firstOrderOnly: row.firstOrderOnly,
    status: row.status,
    state: state(row, now),
    // Confirmed orders that used it, plus unpaid ones still holding a use.
    timesUsed: stats?.used ?? 0,
    usesHeld: reserved,
    totalDiscounted: inr(stats?.discounted ?? 0),
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function adminDiscount(db: DbOrTx, id: string) {
  await discountRow(db, id);
  const [row] = await db.select({ discount: discounts, createdBy: staffUsers.name }).from(discounts).leftJoin(staffUsers, eq(staffUsers.id, discounts.createdByStaffId)).where(eq(discounts.id, id));
  return view(db, { ...row!.discount, createdBy: row!.createdBy });
}

export async function listDiscounts(db: Database, query: { q?: string; status?: DiscountRow["status"]; limit: number; offset: number }) {
  const where = and(query.q ? ilike(discounts.code, `%${query.q.trim()}%`) : undefined, query.status ? eq(discounts.status, query.status) : undefined);
  const rows = await db.select({ discount: discounts, createdBy: staffUsers.name }).from(discounts).leftJoin(staffUsers, eq(staffUsers.id, discounts.createdByStaffId)).where(where).orderBy(desc(discounts.createdAt)).limit(query.limit).offset(query.offset);
  const [total] = await db.select({ value: count() }).from(discounts).where(where);
  const data = [];
  for (const row of rows) data.push(await view(db, { ...row.discount, createdBy: row.createdBy }));
  return { data, totalCount: total?.value ?? 0 };
}
