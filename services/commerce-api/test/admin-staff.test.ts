import { Problem, StaffMember, StaffSetupLink } from "@kleawip/contract";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { staffSetupTokens } from "../src/db/schema";
import { updateStaff } from "../src/staff/service";
import { createStaff, createTestApp, resetStaffAndAudit, signIn, TEST_PASSWORD } from "./helpers";

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let owner: Awaited<ReturnType<typeof signIn>>;
let ownerId: string;
const NEW_PASSWORD = "towels are soft 2026";

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await resetStaffAndAudit(ctx.db);
  ownerId = (await createStaff(ctx.db, "owner")).id;
  owner = await signIn(ctx.app, "owner@kleawip.test");
});

const problem = (res: { json: () => unknown }) => Problem.parse(res.json());
const login = (email: string, password: string) => ctx.app.inject({ method: "POST", url: "/v1/admin/auth/login", payload: { email, password } });
const setup = (token: string, password: string) => ctx.app.inject({ method: "POST", url: "/v1/admin/auth/setup", payload: { token, password } });

async function invite(email = "priya@kleawip.test", role = "catalogue_manager") {
  const res = await owner.request("POST", "/v1/admin/staff", { email, name: "Priya", role });
  expect(res.statusCode, res.body).toBe(201);
  return StaffSetupLink.parse(res.json());
}

describe("inviting staff", () => {
  it("creates an invited account that can't sign in until the setup link is used", async () => {
    const link = await invite();
    expect(link.staff).toMatchObject({ email: "priya@kleawip.test", status: "invited", role: "catalogue_manager" });
    expect(link.setupPath).toBe(`/setup?token=${link.setupToken}`);
    expect((await login("priya@kleawip.test", NEW_PASSWORD)).statusCode).toBe(401);

    expect((await setup(link.setupToken, NEW_PASSWORD)).statusCode).toBe(204);
    const signedIn = await login("priya@kleawip.test", NEW_PASSWORD);
    expect(signedIn.statusCode).toBe(200);
    expect(signedIn.json().staff.role).toBe("catalogue_manager");

    // Only the hash of the token is stored, and it can't be reused.
    const [stored] = await ctx.db.select().from(staffSetupTokens);
    expect(stored!.tokenHash).not.toBe(link.setupToken);
    expect(problem(await setup(link.setupToken, "another long password")).errors![0]!.code).toBe("invalid_or_expired");
  });

  it("rejects duplicate emails, weak passwords and expired links", async () => {
    const link = await invite();
    expect(problem(await owner.request("POST", "/v1/admin/staff", { email: "PRIYA@kleawip.test", name: "P", role: "viewer" })).errors![0]!.code).toBe("duplicate");
    expect((await setup(link.setupToken, "short")).statusCode).toBe(422);
    expect(problem(await setup(link.setupToken, "priya-password-123")).errors![0]!.code).toBe("contains_email");

    await ctx.db.update(staffSetupTokens).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(problem(await setup(link.setupToken, NEW_PASSWORD)).errors![0]!.code).toBe("invalid_or_expired");
  });

  it("is owner-only", async () => {
    await createStaff(ctx.db, "catalogue_manager");
    const manager = await signIn(ctx.app, "catalogue_manager@kleawip.test");
    expect((await manager.request("GET", "/v1/admin/staff")).statusCode).toBe(403);
    expect((await manager.request("POST", "/v1/admin/staff", { email: "x@kleawip.test", name: "X", role: "owner" })).statusCode).toBe(403);
  });
});

describe("changing staff", () => {
  it("changes a role and ends that person's sessions so new permissions apply at once", async () => {
    const member = await createStaff(ctx.db, "viewer");
    const viewer = await signIn(ctx.app, "viewer@kleawip.test");
    const updated = StaffMember.parse((await owner.request("PATCH", `/v1/admin/staff/${member.id}`, { role: "operations" })).json());
    expect(updated.role).toBe("operations");
    expect((await viewer.request("GET", "/v1/admin/auth/me")).statusCode).toBe(401);
    expect((await login("viewer@kleawip.test", TEST_PASSWORD)).json().staff.permissions).toContain("inventory.adjust");
  });

  it("disables an account immediately", async () => {
    const member = await createStaff(ctx.db, "support");
    const support = await signIn(ctx.app, "support@kleawip.test");
    await owner.request("PATCH", `/v1/admin/staff/${member.id}`, { status: "disabled" });
    expect((await support.request("GET", "/v1/admin/auth/me")).statusCode).toBe(401);
    expect((await login("support@kleawip.test", TEST_PASSWORD)).statusCode).toBe(401);
  });

  it("blocks changing your own role or status", async () => {
    expect(problem(await owner.request("PATCH", `/v1/admin/staff/${ownerId}`, { role: "viewer" })).errors![0]!.code).toBe("self_change");
    expect(problem(await owner.request("PATCH", `/v1/admin/staff/${ownerId}`, { status: "disabled" })).errors![0]!.code).toBe("self_change");
    const second = await createStaff(ctx.db, "owner", "second-owner@kleawip.test");
    expect((await owner.request("PATCH", `/v1/admin/staff/${second.id}`, { role: "viewer" })).statusCode).toBe(200);
  });

  it("never demotes or disables the last active owner (service rule)", async () => {
    // Through the API the acting owner always remains, so exercise the rule directly with a system actor.
    const staff = await createStaff(ctx.db, "viewer");
    await expect(updateStaff(ctx.db, ownerId, { role: "viewer" }, staff.id)).rejects.toMatchObject({ errors: [{ code: "last_owner" }] });
    await expect(updateStaff(ctx.db, ownerId, { status: "disabled" }, staff.id)).rejects.toMatchObject({ errors: [{ code: "last_owner" }] });
  });

  it("issues a fresh setup link that disables the old password", async () => {
    const member = await createStaff(ctx.db, "operations");
    const link = StaffSetupLink.parse((await owner.request("POST", `/v1/admin/staff/${member.id}/setup-link`)).json());
    expect(link.staff.status).toBe("invited");
    expect((await login("operations@kleawip.test", TEST_PASSWORD)).statusCode).toBe(401);
    await setup(link.setupToken, NEW_PASSWORD);
    expect((await login("operations@kleawip.test", NEW_PASSWORD)).statusCode).toBe(200);
    expect(problem(await owner.request("POST", `/v1/admin/staff/${ownerId}/setup-link`)).errors![0]!.code).toBe("self_reset");
  });
});

describe("own password and activity log", () => {
  it("changes your own password and signs out your other sessions only", async () => {
    const other = await signIn(ctx.app, "owner@kleawip.test");
    expect(problem(await owner.request("POST", "/v1/admin/auth/password", { currentPassword: "wrong", newPassword: NEW_PASSWORD })).errors![0]!.code).toBe("incorrect");
    expect((await owner.request("POST", "/v1/admin/auth/password", { currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD })).statusCode).toBe(204);
    expect((await owner.request("GET", "/v1/admin/auth/me")).statusCode).toBe(200);
    expect((await other.request("GET", "/v1/admin/auth/me")).statusCode).toBe(401);
    expect((await login("owner@kleawip.test", NEW_PASSWORD)).statusCode).toBe(200);
  });

  it("lists recent activity with actor names, filterable by type", async () => {
    await invite();
    const all = (await owner.request("GET", "/v1/admin/activity")).json().data;
    expect(all[0]).toMatchObject({ entityType: "staff", action: "staff.invited", actorName: "Test owner" });
    const products = (await owner.request("GET", "/v1/admin/activity?entityType=product")).json().data;
    expect(products).toEqual([]);
  });
});
