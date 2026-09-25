import { StaffLoginRequest, StaffSession } from "@kleawip/contract";
import { eq, sql } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { ADMIN_COOKIE, authorize, staffOf, unauthenticated } from "../auth/guard";
import { dummyPasswordHash, verifyPassword } from "../auth/password";
import { permissionsFor, type Role } from "../auth/permissions";
import { createSession, revokeSession, SESSION_ABSOLUTE_MS } from "../auth/sessions";
import type { Database } from "../db/client";
import { staffUsers } from "../db/schema";
import { ApiError } from "../errors";

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

export type AdminAuthOptions = { cookieSecure: boolean };

const session = (staff: { id: string; email: string; name: string; role: Role }, csrfToken: string) =>
  StaffSession.parse({ staff: { ...staff, permissions: permissionsFor(staff.role) }, csrfToken });

export const adminAuthRoutes = (db: Database, { cookieSecure }: AdminAuthOptions): FastifyPluginAsync => async (app) => {
  const setCookie = (reply: FastifyReply, token: string) =>
    reply.setCookie(ADMIN_COOKIE, token, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: "strict",
      path: "/v1/admin",
      maxAge: SESSION_ABSOLUTE_MS / 1000,
    });

  // Per-IP brake on password guessing, on top of the per-account lockout.
  app.post("/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { email, password } = StaffLoginRequest.parse(request.body);
    const [staff] = await db.select().from(staffUsers).where(eq(staffUsers.email, email.toLowerCase()));

    if (!staff) {
      await verifyPassword(password, await dummyPasswordHash()); // equalise timing for unknown emails
      throw new ApiError(401, "UNAUTHENTICATED", "Sign-in failed", "Email or password is incorrect.");
    }
    if (staff.lockedUntil && staff.lockedUntil > new Date()) {
      const seconds = Math.ceil((staff.lockedUntil.getTime() - Date.now()) / 1000);
      reply.header("retry-after", String(seconds));
      throw new ApiError(429, "RATE_LIMITED", "Too many attempts", `Too many failed sign-ins. Try again in ${Math.ceil(seconds / 60)} minute(s).`);
    }

    const valid = await verifyPassword(password, staff.passwordHash);
    if (!valid || staff.status !== "active") {
      if (!valid) {
        const attempts = staff.failedLoginAttempts + 1;
        await db
          .update(staffUsers)
          .set({
            failedLoginAttempts: attempts >= MAX_FAILED_LOGINS ? 0 : attempts,
            lockedUntil: attempts >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MS) : staff.lockedUntil,
            updatedAt: sql`now()`,
          })
          .where(eq(staffUsers.id, staff.id));
      }
      // Same message for wrong password and disabled account: never reveal which.
      throw new ApiError(401, "UNAUTHENTICATED", "Sign-in failed", "Email or password is incorrect.");
    }

    await db
      .update(staffUsers)
      .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
      .where(eq(staffUsers.id, staff.id));
    const { token, csrfToken } = await createSession(db, staff.id, {
      userAgent: request.headers["user-agent"],
      ipAddress: request.ip,
    });
    setCookie(reply, token);
    reply.header("cache-control", "private, no-store");
    return session(staff, csrfToken);
  });

  app.get("/me", { preHandler: authorize(db, null) }, async (request, reply) => {
    const staff = staffOf(request);
    reply.header("cache-control", "private, no-store");
    return session({ id: staff.staffId, email: staff.email, name: staff.name, role: staff.role }, staff.csrfToken);
  });

  app.post("/logout", { preHandler: authorize(db, null) }, async (request, reply) => {
    const staff = request.staff;
    if (!staff) throw unauthenticated();
    await revokeSession(db, staff.sessionId);
    reply.clearCookie(ADMIN_COOKIE, { path: "/v1/admin" });
    return reply.status(204).send();
  });
};
