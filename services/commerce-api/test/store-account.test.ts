import { Address, CustomerSession, IndianMobile, OtpChallenge, Problem } from "@kleawip/contract";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { customers, customerSessions, otpChallenges } from "../src/db/schema";
import { WhatsAppCloudOtpSender } from "../src/messaging/otp-senders";
import { createTestApp } from "./helpers";

let ctx: Awaited<ReturnType<typeof createTestApp>>;
const PHONE = "+919876543210";
const CLIENT = { "x-kleawip-client": "storefront" };

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.db.execute(sql`TRUNCATE customers, otp_challenges RESTART IDENTITY CASCADE`);
  ctx.otp.sent.length = 0;
});

const problem = (res: { json: () => unknown }) => Problem.parse(res.json());
const post = (url: string, payload: object, cookie?: string) =>
  ctx.app.inject({ method: "POST", url, payload, headers: CLIENT, ...(cookie ? { cookies: { klw_session: cookie } } : {}) });

async function requestCode(phone = "98765 43210") {
  const res = await post("/v1/store/auth/otp/request", { phone });
  expect(res.statusCode, res.body).toBe(201);
  return OtpChallenge.parse(res.json());
}

async function signIn(phone = "98765 43210") {
  const challenge = await requestCode(phone);
  const code = ctx.otp.lastCodeFor(IndianMobile.parse(phone))!;
  const res = await post("/v1/store/auth/otp/verify", { challengeId: challenge.challengeId, code });
  expect(res.statusCode, res.body).toBe(200);
  const cookie = res.cookies.find((c) => c.name === "klw_session")!;
  return { session: CustomerSession.parse(res.json()), cookie: cookie.value, raw: cookie };
}

describe("phone numbers", () => {
  it("normalises Indian mobile formats to E.164 and rejects others", () => {
    for (const input of ["9876543210", "+91 98765 43210", "098765-43210", "91 9876543210"]) expect(IndianMobile.parse(input)).toBe(PHONE);
    for (const input of ["12345", "5876543210", "+1 4155552671"]) expect(IndianMobile.safeParse(input).success).toBe(false);
  });
});

describe("WhatsApp OTP sign-in", () => {
  it("sends a 6-digit code to WhatsApp and masks the destination", async () => {
    const challenge = await requestCode();
    expect(challenge).toMatchObject({ channel: "whatsapp", sentTo: "WhatsApp ••••• 43210", resendAfterSeconds: 30 });
    expect(ctx.otp.sent).toEqual([expect.objectContaining({ channel: "whatsapp", to: PHONE, expiresInMinutes: 5 })]);
    expect(ctx.otp.sent[0]!.code).toMatch(/^\d{6}$/);
    // Only a hash is stored.
    const [stored] = await ctx.db.select().from(otpChallenges);
    expect(stored!.codeHash).not.toContain(ctx.otp.sent[0]!.code);
  });

  it("creates the account on first sign-in and sets a long-lived, httpOnly, lax cookie", async () => {
    const { session, raw } = await signIn();
    expect(session).toMatchObject({ isNewCustomer: true, customer: { phone: PHONE, name: "", email: null } });
    expect(raw).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
    expect(raw.maxAge).toBe(30 * 24 * 60 * 60);
    const again = await (async () => {
      await ctx.db.update(otpChallenges).set({ createdAt: new Date(Date.now() - 60_000) });
      return signIn();
    })();
    expect(again.session.isNewCustomer).toBe(false);
    expect(await ctx.db.select().from(customers)).toHaveLength(1);
  });

  it("counts wrong codes, then invalidates the code after 5", async () => {
    const challenge = await requestCode();
    const code = ctx.otp.lastCodeFor(PHONE)!;
    const wrong = code === "000000" ? "111111" : "000000";
    for (let left = 4; left >= 1; left--) {
      const res = await post("/v1/store/auth/otp/verify", { challengeId: challenge.challengeId, code: wrong });
      expect(problem(res).errors![0]).toMatchObject({ code: "incorrect", message: expect.stringContaining(`${left} attempt`) });
    }
    expect(problem(await post("/v1/store/auth/otp/verify", { challengeId: challenge.challengeId, code: wrong })).errors![0]!.code).toBe("too_many_attempts");
    // Even the right code no longer works.
    expect(problem(await post("/v1/store/auth/otp/verify", { challengeId: challenge.challengeId, code })).errors![0]!.code).toBe("expired");
  });

  it("rejects expired and reused codes", async () => {
    const challenge = await requestCode();
    const code = ctx.otp.lastCodeFor(PHONE)!;
    await ctx.db.update(otpChallenges).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(problem(await post("/v1/store/auth/otp/verify", { challengeId: challenge.challengeId, code })).errors![0]!.code).toBe("expired");

    await ctx.db.update(otpChallenges).set({ createdAt: new Date(Date.now() - 60_000) });
    const fresh = await requestCode();
    const freshCode = ctx.otp.lastCodeFor(PHONE)!;
    expect((await post("/v1/store/auth/otp/verify", { challengeId: fresh.challengeId, code: freshCode })).statusCode).toBe(200);
    expect(problem(await post("/v1/store/auth/otp/verify", { challengeId: fresh.challengeId, code: freshCode })).errors![0]!.code).toBe("expired");
  });

  it("enforces a 30-second resend wait and 5 codes per hour per number", async () => {
    await requestCode();
    const tooSoon = await post("/v1/store/auth/otp/request", { phone: PHONE });
    expect(tooSoon.statusCode).toBe(429);
    expect(problem(tooSoon).detail).toMatch(/in \d+ seconds/);
    for (let i = 0; i < 4; i++) {
      await ctx.db.update(otpChallenges).set({ createdAt: sql`created_at - interval '40 seconds'` });
      await requestCode();
    }
    await ctx.db.update(otpChallenges).set({ createdAt: sql`created_at - interval '40 seconds'` });
    expect(problem(await post("/v1/store/auth/otp/request", { phone: PHONE })).detail).toContain("Try again in an hour");
  });

  it("reports a failed WhatsApp delivery without leaving a usable code", async () => {
    ctx.otp.failNext = true;
    const res = await post("/v1/store/auth/otp/request", { phone: PHONE });
    expect(res.statusCode).toBe(503);
    expect(problem(res).code).toBe("DELIVERY_FAILED");
    const [stored] = await ctx.db.select().from(otpChallenges);
    expect(stored!.consumedAt).not.toBeNull();
  });

  it("offers email codes only to accounts with a verified email", async () => {
    expect(problem(await post("/v1/store/auth/otp/request", { phone: PHONE, channel: "email" })).errors![0]!.code).toBe("email_unavailable");
    await signIn();
    await ctx.db.update(customers).set({ email: "priya@example.com", emailVerifiedAt: new Date() });
    await ctx.db.update(otpChallenges).set({ createdAt: new Date(Date.now() - 60_000) });
    const challenge = OtpChallenge.parse((await post("/v1/store/auth/otp/request", { phone: PHONE, channel: "email" })).json());
    expect(challenge).toMatchObject({ channel: "email", sentTo: "p•••@example.com" });
    expect(ctx.otp.sent.at(-1)).toMatchObject({ channel: "email", to: "priya@example.com" });
  });

  it("requires the X-Kleawip-Client header on state-changing requests (CSRF)", async () => {
    const res = await ctx.app.inject({ method: "POST", url: "/v1/store/auth/otp/request", payload: { phone: PHONE } });
    expect(res.statusCode).toBe(403);
  });

  it("blocks sign-in for blocked accounts", async () => {
    await signIn();
    await ctx.db.update(customers).set({ status: "blocked" });
    await ctx.db.update(otpChallenges).set({ createdAt: new Date(Date.now() - 60_000) });
    const challenge = await requestCode();
    const res = await post("/v1/store/auth/otp/verify", { challengeId: challenge.challengeId, code: ctx.otp.lastCodeFor(PHONE)! });
    expect(res.statusCode).toBe(403);
  });
});

describe("customer session and profile", () => {
  it("reads and updates the profile; logout ends the session", async () => {
    const { cookie } = await signIn();
    const me = await ctx.app.inject({ method: "GET", url: "/v1/store/me", cookies: { klw_session: cookie } });
    expect(me.json()).toMatchObject({ phone: PHONE });
    const patched = await ctx.app.inject({ method: "PATCH", url: "/v1/store/me", headers: CLIENT, cookies: { klw_session: cookie }, payload: { name: "Priya", email: "PRIYA@Example.com" } });
    expect(patched.json()).toMatchObject({ name: "Priya", email: "priya@example.com", emailVerified: false });
    expect((await post("/v1/store/auth/logout", {}, cookie)).statusCode).toBe(204);
    expect((await ctx.app.inject({ method: "GET", url: "/v1/store/me", cookies: { klw_session: cookie } })).statusCode).toBe(401);
  });

  it("expires after 14 idle days", async () => {
    const { cookie } = await signIn();
    await ctx.db.update(customerSessions).set({ lastSeenAt: sql`now() - interval '15 days'` });
    expect((await ctx.app.inject({ method: "GET", url: "/v1/store/me", cookies: { klw_session: cookie } })).statusCode).toBe(401);
  });

  it("rejects a staff admin cookie on customer routes and vice versa", async () => {
    const { cookie } = await signIn();
    expect((await ctx.app.inject({ method: "GET", url: "/v1/store/me", cookies: { klw_admin: cookie } })).statusCode).toBe(401);
    expect((await ctx.app.inject({ method: "GET", url: "/v1/admin/auth/me", cookies: { klw_admin: cookie } })).statusCode).toBe(401);
  });
});

describe("addresses", () => {
  const address = { name: "Priya Sharma", phone: "9876543210", line1: "12 MG Road", city: "Pune", stateCode: "MH", pincode: "411001" };

  it("saves addresses, keeps exactly one default, and never exposes another customer's", async () => {
    const { cookie } = await signIn();
    const call = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: object) =>
      ctx.app.inject({ method, url, headers: CLIENT, cookies: { klw_session: cookie }, ...(payload ? { payload } : {}) });

    const first = Address.parse((await call("POST", "/v1/store/me/addresses", address)).json());
    expect(first).toMatchObject({ isDefault: true, stateName: "Maharashtra", phone: PHONE });
    const second = Address.parse((await call("POST", "/v1/store/me/addresses", { ...address, line1: "8 FC Road", isDefault: true })).json());
    const list = (await call("GET", "/v1/store/me/addresses")).json().data;
    expect(list.map((a: { id: string; isDefault: boolean }) => [a.id, a.isDefault])).toEqual([[second.id, true], [first.id, false]]);

    await call("DELETE", `/v1/store/me/addresses/${second.id}`);
    expect((await call("GET", `/v1/store/me/addresses/${first.id}`)).json().isDefault).toBe(true);

    await ctx.db.update(otpChallenges).set({ createdAt: new Date(Date.now() - 60_000) });
    const other = await signIn("9123456789");
    const peek = await ctx.app.inject({ method: "GET", url: `/v1/store/me/addresses/${first.id}`, cookies: { klw_session: other.cookie } });
    expect(peek.statusCode).toBe(404);
  });

  it("validates Indian pincodes and states", async () => {
    const { cookie } = await signIn();
    const res = await ctx.app.inject({ method: "POST", url: "/v1/store/me/addresses", headers: CLIENT, cookies: { klw_session: cookie }, payload: { ...address, pincode: "01100", stateCode: "XX" } });
    expect(problem(res).errors!.map((e) => e.path).sort()).toEqual(["pincode", "stateCode"]);
  });
});

describe("WhatsApp Cloud API request", () => {
  it("sends an authentication template with the code in the body and copy-code button", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      captured = { url, init };
      return new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const sender = new WhatsAppCloudOtpSender(
      { phoneNumberId: "123", accessToken: "token-x", templateName: "kleawip_login_otp", languageCode: "en", graphVersion: "v21.0" },
      fakeFetch,
    );
    await sender.send({ channel: "whatsapp", to: PHONE, code: "482913", expiresInMinutes: 5 });
    expect(captured!.url).toBe("https://graph.facebook.com/v21.0/123/messages");
    expect((captured!.init.headers as Record<string, string>).authorization).toBe("Bearer token-x");
    const body = JSON.parse(captured!.init.body as string);
    expect(body).toMatchObject({ to: "919876543210", type: "template", template: { name: "kleawip_login_otp", language: { code: "en" } } });
    expect(body.template.components).toEqual([
      { type: "body", parameters: [{ type: "text", text: "482913" }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "482913" }] },
    ]);
  });

  it("raises a delivery error without leaking the token or code", async () => {
    const fakeFetch = (async () => new Response(JSON.stringify({ error: { code: 131026, message: "not on WhatsApp" } }), { status: 400 })) as unknown as typeof fetch;
    const sender = new WhatsAppCloudOtpSender({ phoneNumberId: "1", accessToken: "secret-token", templateName: "t", languageCode: "en", graphVersion: "v21.0" }, fakeFetch);
    const error = await sender.send({ channel: "whatsapp", to: PHONE, code: "123456", expiresInMinutes: 5 }).catch((e: Error) => e);
    expect(String(error)).toContain("131026");
    expect(String(error)).not.toContain("secret-token");
    expect(String(error)).not.toContain("123456");
  });
});
