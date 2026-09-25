import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, resetStaffAndAudit } from "./helpers";

let ctx: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  ctx = await createTestApp({ rateLimits: true });
  await resetStaffAndAudit(ctx.db);
});
afterAll(async () => {
  await ctx.close();
});

describe("API hardening", () => {
  it("sends security headers on every response", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/v1/store/categories" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["strict-transport-security"]).toBeDefined();
  });

  it("reports readiness only when the database answers", async () => {
    expect((await ctx.app.inject({ method: "GET", url: "/ready" })).json()).toEqual({ status: "ready" });
  });

  it("limits sign-in attempts per IP to 10 a minute", async () => {
    const attempt = () => ctx.app.inject({ method: "POST", url: "/v1/admin/auth/login", payload: { email: "nobody@kleawip.test", password: "x" } });
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await attempt()).statusCode);
    expect(codes.slice(0, 10).every((code) => code === 401)).toBe(true);
    expect(codes[10]).toBe(429);
  });

  it("rejects oversized JSON bodies", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/v1/admin/auth/setup",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ token: "x".repeat(2 * 1024 * 1024), password: "y" }),
    });
    expect(res.statusCode).toBe(413);
  });
});
