import { INDIAN_STATES, type AddressInput, type StateCode } from "@kleawip/contract";
import { and, asc, count, desc, eq, ne } from "drizzle-orm";
import type { Database } from "../db/client";
import { addresses, customers } from "../db/schema";
import { ApiError, notFound } from "../errors";
import { randomBytes } from "node:crypto";
import { toCustomer } from "./auth";

export const MAX_ADDRESSES = 20;
const invalid = (path: string, code: string, message: string) =>
  new ApiError(422, "VALIDATION_FAILED", "Validation failed", message, [{ path, code, message }]);

export async function getCustomer(db: Database, customerId: string) {
  const [row] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!row) throw notFound("Customer not found.");
  return toCustomer(row);
}

export async function updateCustomer(
  db: Database,
  customerId: string,
  patch: { name?: string; email?: string | null; marketingOptIn?: boolean; marketingOptInSource?: "account" | "checkout" },
) {
  const [current] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!current) throw notFound("Customer not found.");
  const email = patch.email === undefined ? undefined : patch.email?.toLowerCase() ?? null;
  if (email) {
    const [taken] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.email, email), ne(customers.id, customerId)));
    if (taken) throw invalid("email", "duplicate", "This email is already used by another account.");
  }
  await db
    .update(customers)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      // A changed email is unverified until confirmed (verification email arrives with order emails, Milestone 2b).
      ...(email !== undefined && email !== current.email ? { email, emailVerifiedAt: null } : {}),
      ...(patch.marketingOptIn !== undefined && patch.marketingOptIn !== current.marketingOptIn
        ? patch.marketingOptIn
          ? { marketingOptIn: true, marketingOptInAt: new Date(), marketingOptInSource: patch.marketingOptInSource ?? "account", unsubscribeToken: current.unsubscribeToken ?? randomBytes(24).toString("base64url") }
          : { marketingOptIn: false, marketingOptInAt: new Date(), marketingOptInSource: patch.marketingOptInSource ?? "account" }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(customers.id, customerId));
  return getCustomer(db, customerId);
}

/** One-click unsubscribe. Unknown tokens get the same answer, so the endpoint reveals nothing. */
export async function unsubscribeByToken(db: Database, token: string) {
  await db
    .update(customers)
    .set({ marketingOptIn: false, marketingOptInAt: new Date(), marketingOptInSource: "unsubscribe_link", updatedAt: new Date() })
    .where(and(eq(customers.unsubscribeToken, token), eq(customers.marketingOptIn, true)));
}

type AddressRow = typeof addresses.$inferSelect;
const toAddress = (row: AddressRow) => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  line1: row.line1,
  line2: row.line2,
  landmark: row.landmark,
  city: row.city,
  stateCode: row.stateCode as StateCode,
  stateName: INDIAN_STATES[row.stateCode as StateCode],
  pincode: row.pincode,
  isDefault: row.isDefault,
});

export async function listAddresses(db: Database, customerId: string) {
  const rows = await db.select().from(addresses).where(eq(addresses.customerId, customerId)).orderBy(desc(addresses.isDefault), asc(addresses.createdAt));
  return rows.map(toAddress);
}

async function ownedAddress(db: Database, customerId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Address not found.");
  // Scoped by customer: another customer's address id is simply "not found".
  const [row] = await db.select().from(addresses).where(and(eq(addresses.id, id), eq(addresses.customerId, customerId)));
  if (!row) throw notFound("Address not found.");
  return row;
}

export async function addressFor(db: Database, customerId: string, id: string) {
  return toAddress(await ownedAddress(db, customerId, id));
}

export async function createAddress(db: Database, customerId: string, input: AddressInput) {
  const [{ value: existing } = { value: 0 }] = await db.select({ value: count() }).from(addresses).where(eq(addresses.customerId, customerId));
  if (existing >= MAX_ADDRESSES) throw invalid("addresses", "too_many", `You can save up to ${MAX_ADDRESSES} addresses.`);
  return db.transaction(async (tx) => {
    const makeDefault = input.isDefault || existing === 0;
    if (makeDefault) await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.customerId, customerId));
    const [row] = await tx.insert(addresses).values({ ...input, customerId, isDefault: makeDefault }).returning();
    return toAddress(row!);
  });
}

export async function updateAddress(db: Database, customerId: string, id: string, input: Partial<AddressInput>) {
  await ownedAddress(db, customerId, id);
  return db.transaction(async (tx) => {
    if (input.isDefault) await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.customerId, customerId));
    const [row] = await tx.update(addresses).set({ ...input, updatedAt: new Date() }).where(eq(addresses.id, id)).returning();
    return toAddress(row!);
  });
}

export async function deleteAddress(db: Database, customerId: string, id: string) {
  const row = await ownedAddress(db, customerId, id);
  await db.transaction(async (tx) => {
    await tx.delete(addresses).where(eq(addresses.id, id));
    if (row.isDefault) {
      const [next] = await tx.select({ id: addresses.id }).from(addresses).where(eq(addresses.customerId, customerId)).orderBy(asc(addresses.createdAt)).limit(1);
      if (next) await tx.update(addresses).set({ isDefault: true }).where(eq(addresses.id, next.id));
    }
  });
}
