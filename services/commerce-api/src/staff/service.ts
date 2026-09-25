// Staff accounts (Settings → Staff). Kleawip employees only; the Owner invites people with a one-time
// setup link so nobody else ever knows their password.
import type { StaffMember } from "@kleawip/contract";
import { and, asc, count, desc, eq, gt, isNull, lt, ne, type SQL } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { recordAudit } from "../audit";
import { hashPassword, verifyPassword } from "../auth/password";
import type { Role } from "../auth/permissions";
import type { Database } from "../db/client";
import { auditEvents, staffSessions, staffSetupTokens, staffUsers } from "../db/schema";
import { ApiError, notFound } from "../errors";

export const SETUP_TOKEN_TTL_MS = 72 * 60 * 60 * 1000;
/** Stored for invited staff until they choose a password; never verifies. */
const NO_PASSWORD = "!unset";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const invalid = (path: string, code: string, message: string) =>
  new ApiError(422, "VALIDATION_FAILED", "Validation failed", message, [{ path, code, message }]);

type StaffRow = typeof staffUsers.$inferSelect;

export const toMember = (row: StaffRow): StaffMember => ({
  id: row.id,
  email: row.email,
  name: row.name,
  role: row.role,
  status: row.status,
  lockedUntil: row.lockedUntil && row.lockedUntil > new Date() ? row.lockedUntil.toISOString() : null,
  lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

async function staffRow(db: Database, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Staff member not found.");
  const [row] = await db.select().from(staffUsers).where(eq(staffUsers.id, id));
  if (!row) throw notFound("Staff member not found.");
  return row;
}

export async function listStaff(db: Database) {
  return (await db.select().from(staffUsers).orderBy(asc(staffUsers.status), asc(staffUsers.name))).map(toMember);
}

async function issueSetupToken(db: Parameters<Parameters<Database["transaction"]>[0]>[0], staffId: string, purpose: "invite" | "reset", createdByStaffId: string) {
  // Any earlier unused link for this person stops working.
  await db.update(staffSetupTokens).set({ usedAt: new Date() }).where(and(eq(staffSetupTokens.staffId, staffId), isNull(staffSetupTokens.usedAt)));
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SETUP_TOKEN_TTL_MS);
  await db.insert(staffSetupTokens).values({ staffId, tokenHash: hashToken(token), purpose, expiresAt, createdByStaffId });
  return { setupToken: token, setupPath: `/setup?token=${token}`, expiresAt: expiresAt.toISOString() };
}

export async function inviteStaff(db: Database, input: { email: string; name: string; role: Role }, actorStaffId: string) {
  const email = input.email.toLowerCase();
  const [existing] = await db.select({ id: staffUsers.id }).from(staffUsers).where(eq(staffUsers.email, email));
  if (existing) throw invalid("email", "duplicate", "A staff account with this email already exists.");
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(staffUsers).values({ email, name: input.name, role: input.role, status: "invited", passwordHash: NO_PASSWORD }).returning();
    const link = await issueSetupToken(tx, row!.id, "invite", actorStaffId);
    await recordAudit(tx, { entityType: "staff", entityId: row!.id, action: "staff.invited", actorStaffId, after: { email, name: input.name, role: input.role } });
    return { staff: toMember(row!), ...link };
  });
}

/** The Owner cannot lock the business out: at least one active Owner must always remain. */
async function assertOtherActiveOwner(db: Database, exceptId: string) {
  const [{ value } = { value: 0 }] = await db
    .select({ value: count() })
    .from(staffUsers)
    .where(and(eq(staffUsers.role, "owner"), eq(staffUsers.status, "active"), ne(staffUsers.id, exceptId)));
  if (value === 0) throw invalid("role", "last_owner", "This is the only active Owner. Make someone else an Owner first.");
}

export async function updateStaff(
  db: Database,
  id: string,
  patch: { name?: string; role?: Role; status?: "active" | "disabled" },
  actorStaffId: string,
) {
  const current = await staffRow(db, id);
  if (id === actorStaffId && (patch.role !== undefined && patch.role !== current.role || patch.status === "disabled")) {
    throw invalid(patch.role !== undefined ? "role" : "status", "self_change", "You can't change your own role or disable yourself. Ask another Owner.");
  }
  const losingOwner = current.role === "owner" && current.status === "active" && ((patch.role && patch.role !== "owner") || patch.status === "disabled");
  if (losingOwner) await assertOtherActiveOwner(db, id);
  if (patch.status === "active" && current.status === "invited") {
    throw invalid("status", "not_set_up", "This person hasn't set a password yet. Send a new setup link instead.");
  }

  await db.transaction(async (tx) => {
    await tx.update(staffUsers).set({ ...patch, updatedAt: new Date() }).where(eq(staffUsers.id, id));
    // A role change or disable takes effect immediately: end every session so permissions reload.
    if ((patch.role && patch.role !== current.role) || patch.status === "disabled") {
      await tx.update(staffSessions).set({ revokedAt: new Date() }).where(and(eq(staffSessions.staffId, id), isNull(staffSessions.revokedAt)));
    }
    const before = Object.fromEntries(Object.keys(patch).map((key) => [key, (current as Record<string, unknown>)[key]]));
    await recordAudit(tx, { entityType: "staff", entityId: id, action: "staff.updated", actorStaffId, before, after: patch });
  });
  return toMember(await staffRow(db, id));
}

/** New setup link: the old password stops working, sessions end, and the person chooses a new password. */
export async function resetStaffPassword(db: Database, id: string, actorStaffId: string) {
  const current = await staffRow(db, id);
  if (id === actorStaffId) throw invalid("id", "self_reset", "Change your own password from your account settings instead.");
  if (current.status === "disabled") throw invalid("status", "disabled", "Re-enable this account before sending a setup link.");
  return db.transaction(async (tx) => {
    await tx
      .update(staffUsers)
      .set({ passwordHash: NO_PASSWORD, status: current.status === "active" ? "invited" : current.status, failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(staffUsers.id, id));
    await tx.update(staffSessions).set({ revokedAt: new Date() }).where(and(eq(staffSessions.staffId, id), isNull(staffSessions.revokedAt)));
    const link = await issueSetupToken(tx, id, current.status === "invited" ? "invite" : "reset", actorStaffId);
    await recordAudit(tx, { entityType: "staff", entityId: id, action: "staff.setup_link_issued", actorStaffId });
    const [row] = await tx.select().from(staffUsers).where(eq(staffUsers.id, id));
    return { staff: toMember(row!), ...link };
  });
}

/** Public: the invited person sets their password with the one-time link. */
export async function completeSetup(db: Database, token: string, password: string) {
  const expired = () => invalid("token", "invalid_or_expired", "This setup link is invalid or has expired. Ask the Owner for a new one.");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ tokenId: staffSetupTokens.id, staffId: staffSetupTokens.staffId, email: staffUsers.email, status: staffUsers.status })
      .from(staffSetupTokens)
      .innerJoin(staffUsers, eq(staffUsers.id, staffSetupTokens.staffId))
      .where(and(eq(staffSetupTokens.tokenHash, hashToken(token)), isNull(staffSetupTokens.usedAt), gt(staffSetupTokens.expiresAt, new Date())))
      .for("update");
    if (!row || row.status === "disabled") throw expired();
    if (password.toLowerCase().includes(row.email.split("@")[0]!.toLowerCase()) || password.toLowerCase() === row.email) {
      throw invalid("password", "contains_email", "Choose a password that doesn't contain your email name.");
    }
    await tx.update(staffSetupTokens).set({ usedAt: new Date() }).where(eq(staffSetupTokens.id, row.tokenId));
    await tx
      .update(staffUsers)
      .set({ passwordHash: await hashPassword(password), status: "active", failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(staffUsers.id, row.staffId));
    await recordAudit(tx, { entityType: "staff", entityId: row.staffId, action: "staff.password_set", actorStaffId: row.staffId });
    return { email: row.email };
  });
}

/** Signed-in staff change their own password; every other session of theirs ends. */
export async function changeOwnPassword(db: Database, staffId: string, sessionId: string, input: { currentPassword: string; newPassword: string }) {
  const current = await staffRow(db, staffId);
  if (!(await verifyPassword(input.currentPassword, current.passwordHash))) {
    throw invalid("currentPassword", "incorrect", "Your current password is incorrect.");
  }
  if (input.newPassword === input.currentPassword) throw invalid("newPassword", "unchanged", "Choose a password you haven't just used.");
  if (input.newPassword.toLowerCase().includes(current.email.split("@")[0]!.toLowerCase())) {
    throw invalid("newPassword", "contains_email", "Choose a password that doesn't contain your email name.");
  }
  await db.transaction(async (tx) => {
    await tx.update(staffUsers).set({ passwordHash: await hashPassword(input.newPassword), updatedAt: new Date() }).where(eq(staffUsers.id, staffId));
    await tx
      .update(staffSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(staffSessions.staffId, staffId), isNull(staffSessions.revokedAt), ne(staffSessions.id, sessionId)));
    await recordAudit(tx, { entityType: "staff", entityId: staffId, action: "staff.password_changed", actorStaffId: staffId });
  });
}

/** Store activity log (Settings → General → activity): newest first, filterable, paged by time. */
export async function activityLog(db: Database, query: { entityType?: string; actorId?: string; limit: number; before?: string }) {
  const filters: (SQL | undefined)[] = [
    query.entityType ? eq(auditEvents.entityType, query.entityType) : undefined,
    query.actorId ? eq(auditEvents.actorStaffId, query.actorId) : undefined,
    query.before ? lt(auditEvents.createdAt, new Date(query.before)) : undefined,
  ];
  const rows = await db
    .select({
      id: auditEvents.id,
      entityType: auditEvents.entityType,
      entityId: auditEvents.entityId,
      action: auditEvents.action,
      actorName: staffUsers.name,
      comment: auditEvents.comment,
      createdAt: auditEvents.createdAt,
    })
    .from(auditEvents)
    .leftJoin(staffUsers, eq(staffUsers.id, auditEvents.actorStaffId))
    .where(and(...filters))
    .orderBy(desc(auditEvents.createdAt))
    .limit(query.limit);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

