import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import { staffSessions, staffUsers } from "../db/schema";
import type { Role } from "./permissions";

export const SESSION_IDLE_MS = 30 * 60 * 1000; // 30 minutes without activity
export const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000; // hard limit: one working day
const TOUCH_INTERVAL_MS = 60 * 1000;

export type StaffContext = {
  sessionId: string;
  staffId: string;
  email: string;
  name: string;
  role: Role;
  csrfToken: string;
};

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(db: Database, staffId: string, meta: { userAgent?: string; ipAddress?: string }) {
  const token = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(24).toString("base64url");
  const now = Date.now();
  await db.insert(staffSessions).values({
    staffId,
    tokenHash: hashToken(token),
    csrfToken,
    userAgent: meta.userAgent?.slice(0, 300),
    ipAddress: meta.ipAddress,
    expiresAt: new Date(now + SESSION_ABSOLUTE_MS),
  });
  return { token, csrfToken };
}

/** Resolves a cookie token to an active staff member, enforcing idle and absolute expiry. */
export async function resolveSession(db: Database, token: string, now = new Date()): Promise<StaffContext | null> {
  const [row] = await db
    .select({
      sessionId: staffSessions.id,
      lastSeenAt: staffSessions.lastSeenAt,
      csrfToken: staffSessions.csrfToken,
      staffId: staffUsers.id,
      email: staffUsers.email,
      name: staffUsers.name,
      role: staffUsers.role,
    })
    .from(staffSessions)
    .innerJoin(staffUsers, eq(staffUsers.id, staffSessions.staffId))
    .where(and(
      eq(staffSessions.tokenHash, hashToken(token)),
      isNull(staffSessions.revokedAt),
      gt(staffSessions.expiresAt, now),
      eq(staffUsers.status, "active"),
    ));
  if (!row) return null;

  const idleFor = now.getTime() - row.lastSeenAt.getTime();
  if (idleFor > SESSION_IDLE_MS) {
    await revokeSession(db, row.sessionId);
    return null;
  }
  if (idleFor > TOUCH_INTERVAL_MS) {
    await db.update(staffSessions).set({ lastSeenAt: now }).where(eq(staffSessions.id, row.sessionId));
  }
  const { lastSeenAt: _lastSeenAt, ...context } = row;
  return context;
}

export async function revokeSession(db: Database, sessionId: string) {
  await db.update(staffSessions).set({ revokedAt: new Date() }).where(eq(staffSessions.id, sessionId));
}

export async function revokeAllSessions(db: Database, staffId: string) {
  await db
    .update(staffSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(staffSessions.staffId, staffId), isNull(staffSessions.revokedAt)));
}
