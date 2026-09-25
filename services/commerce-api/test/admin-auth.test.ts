import { Problem, StaffSession } from "@kleawip/contract";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { can, PERMISSIONS, ROLES } from "../src/auth/permissions";
import { hashPassword, verifyPassword } from "../src/auth/password";
import { staffSessions, staffUsers } from "../src/db/schema";
import { createStaff, createTestApp, resetStaffAndAudit, signIn, TEST_PASSWORD } from "./helpers";

let ctx: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await resetStaffAndAudit(ctx.db);
});

const login = (email: string, password: string) =>
  ctx.app.inject({ method: "POST", url: "/v1/admin/auth/login", payload: { email, password } });

describe("password hashing", () => {
  it("verifies the right password and rejects others, with a unique salt per hash", async () => {
    const [a, b] = await Promise.all([hashPassword("secret-one-123"), hashPassword("secret-one-123")]);
    expect(a).not.toBe(b);
    expect(await verifyPassword("secret-one-123", a)).toBe(true);
    expect(await verifyPassword("secret-one-124", a)).toBe(false);
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
  });
});

describe("POST /v1/admin/auth/login", () => {
  it("returns the staff session and sets a hardened cookie", async () => {
    await createStaff(ctx.db, "owner");
    const res = await login("OWNER@kleawip.test", TEST_PASSWORD);
    expect(res.statusCode).toBe(200);
    const body = StaffSession.parse(res.json());
    expect(body.staff).toMatchObject({ email: "owner@kleawip.test", role: "owner" });
    expect(body.staff.permissions).toContain("catalogue.publish");
    const cookie = res.cookies.find((c) => c.name === "klw_admin")!;
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Strict", path: "/v1/admin" });
    expect(res.headers["cache-control"]).toContain("no-store");
    // Only a hash of the token is stored.
    const [stored] = await ctx.db.select().from(staffSessions);
    expect(stored!.tokenHash).not.toBe(cookie.value);
  });

  it("gives the same answer for an unknown email and a wrong password", async () => {
    await createStaff(ctx.db, "owner");
    const unknown = await login("nobody@kleawip.test", TEST_PASSWORD);
    const wrong = await login("owner@kleawip.test", "wrong password");
    expect(unknown.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect(Problem.parse(unknown.json()).detail).toBe(Problem.parse(wrong.json()).detail);
  });

  it("locks the account for 15 minutes after 5 failures, even for the right password", async () => {
    await createStaff(ctx.db, "owner");
    for (let i = 0; i < 5; i++) expect((await login("owner@kleawip.test", "wrong")).statusCode).toBe(401);
    const locked = await login("owner@kleawip.test", TEST_PASSWORD);
    expect(locked.statusCode).toBe(429);
    expect(Problem.parse(locked.json()).code).toBe("RATE_LIMITED");
    expect(Number(locked.headers["retry-after"])).toBeGreaterThan(800);
  });

  it("resets the failure count after a successful sign-in", async () => {
    await createStaff(ctx.db, "owner");
    for (let i = 0; i < 4; i++) await login("owner@kleawip.test", "wrong");
    expect((await login("owner@kleawip.test", TEST_PASSWORD)).statusCode).toBe(200);
    const [row] = await ctx.db.select().from(staffUsers);
    expect(row!.failedLoginAttempts).toBe(0);
  });

  it("rejects a disabled account with the generic message", async () => {
    const staff = await createStaff(ctx.db, "owner");
    await ctx.db.update(staffUsers).set({ status: "disabled" }).where(eq(staffUsers.id, staff.id));
    const res = await login("owner@kleawip.test", TEST_PASSWORD);
    expect(res.statusCode).toBe(401);
    expect(Problem.parse(res.json()).detail).toBe("Email or password is incorrect.");
  });
});

describe("admin session", () => {
  it("rejects anonymous admin requests", async () => {
    for (const url of ["/v1/admin/auth/me", "/v1/admin/products", "/v1/admin/inventory"]) {
      const res = await ctx.app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(401);
      expect(Problem.parse(res.json()).code).toBe("UNAUTHENTICATED");
    }
  });

  it("requires the CSRF header on state-changing requests", async () => {
    await createStaff(ctx.db, "owner");
    const { cookie } = await signIn(ctx.app, "owner@kleawip.test");
    const res = await ctx.app.inject({
      method: "POST",
      url: "/v1/admin/products",
      cookies: { klw_admin: cookie.value },
      payload: { title: "X", categorySlug: "bath" },
    });
    expect(res.statusCode).toBe(403);
    expect(Problem.parse(res.json()).code).toBe("FORBIDDEN");
  });

  it("logout revokes the session", async () => {
    await createStaff(ctx.db, "owner");
    const { request } = await signIn(ctx.app, "owner@kleawip.test");
    expect((await request("GET", "/v1/admin/auth/me")).statusCode).toBe(200);
    expect((await request("POST", "/v1/admin/auth/logout")).statusCode).toBe(204);
    expect((await request("GET", "/v1/admin/auth/me")).statusCode).toBe(401);
  });

  it("expires after 30 idle minutes", async () => {
    await createStaff(ctx.db, "owner");
    const { request } = await signIn(ctx.app, "owner@kleawip.test");
    await ctx.db.update(staffSessions).set({ lastSeenAt: sql`now() - interval '31 minutes'` });
    expect((await request("GET", "/v1/admin/auth/me")).statusCode).toBe(401);
  });

  it("ends every session of a staff member who is disabled", async () => {
    const staff = await createStaff(ctx.db, "owner");
    const { request } = await signIn(ctx.app, "owner@kleawip.test");
    await ctx.db.update(staffUsers).set({ status: "disabled" }).where(eq(staffUsers.id, staff.id));
    expect((await request("GET", "/v1/admin/auth/me")).statusCode).toBe(401);
  });
});

describe("role permissions", () => {
  it("owner has every permission; viewer is read-only", () => {
    for (const permission of PERMISSIONS) expect(can("owner", permission)).toBe(true);
    expect(PERMISSIONS.filter((permission) => can("viewer", permission))).toEqual(["catalogue.read", "inventory.read", "audit.read"]);
  });

  it("only owner can manage staff", () => {
    expect(ROLES.filter((role) => can(role, "staff.manage"))).toEqual(["owner"]);
  });

  it("enforces roles on real endpoints", async () => {
    await createStaff(ctx.db, "viewer");
    await createStaff(ctx.db, "operations");
    const viewer = await signIn(ctx.app, "viewer@kleawip.test");
    const operations = await signIn(ctx.app, "operations@kleawip.test");

    expect((await viewer.request("GET", "/v1/admin/products")).statusCode).toBe(200);
    const denied = await viewer.request("POST", "/v1/admin/products", { title: "X", categorySlug: "bath" });
    expect(denied.statusCode).toBe(403);
    expect(Problem.parse(denied.json()).detail).toContain("viewer");
    expect((await operations.request("POST", "/v1/admin/products", { title: "X", categorySlug: "bath" })).statusCode).toBe(403);
  });
});
