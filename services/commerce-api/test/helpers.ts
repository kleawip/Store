import type { StaffRole, StaffSession } from "@kleawip/contract";
import { sql } from "drizzle-orm";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app";
import { hashPassword } from "../src/auth/password";
import { createDatabase, type Database } from "../src/db/client";
import { staffUsers } from "../src/db/schema";
import { LocalDiskStorage } from "../src/media/storage";
import { ChannelOtpSender, MemoryOtpSender } from "../src/messaging/otp-senders";
import { DEFAULT_COMMERCE_SETTINGS, type CommerceSettings } from "../src/checkout/settings";
import { MockShippingProvider, type ShippingProvider } from "../src/shipping/provider";
import { DevGateway, type PaymentGateway } from "../src/payments/gateway";

export async function createTestApp({ rateLimits = false, shipping = new MockShippingProvider() as ShippingProvider | null, commerce = DEFAULT_COMMERCE_SETTINGS as CommerceSettings, payments = new DevGateway() as PaymentGateway } = {}) {
  const { db, close } = createDatabase(process.env.TEST_DATABASE_URL!);
  const mediaDir = mkdtempSync(join(tmpdir(), "kleawip-test-media-"));
  const storage = new LocalDiskStorage(mediaDir, "http://127.0.0.1:4000/media");
  const otp = new MemoryOtpSender();
  const app = await buildApp({ db, storage, otpSender: new ChannelOtpSender({ whatsapp: otp, email: otp }), shipping, commerce, payments, storefrontOrigins: ["http://localhost:3000"], cookieSecure: false, rateLimits });
  return {
    app,
    db,
    storage,
    mediaDir,
    otp,
    payments,
    async close() {
      await app.close();
      await close();
    },
  };
}

export const TEST_PASSWORD = "correct horse battery staple";
let cachedHash: Promise<string> | undefined;

/**
 * Empties staff, sessions, audit and media. CASCADE also empties tables that reference these
 * (product images, collections), so call this BEFORE seeding the demo catalogue.
 */
export async function resetStaffAndAudit(db: Database) {
  await db.execute(sql`TRUNCATE staff_sessions, staff_users, audit_events, media_assets, site_settings RESTART IDENTITY CASCADE`);
}

export async function createStaff(db: Database, role: StaffRole, email = `${role}@kleawip.test`) {
  cachedHash ??= hashPassword(TEST_PASSWORD);
  const [row] = await db.insert(staffUsers).values({ email, name: `Test ${role}`, role, passwordHash: await cachedHash }).returning();
  return row!;
}

type App = Awaited<ReturnType<typeof createTestApp>>["app"];

/** Signs in and returns an inject helper that sends the session cookie and CSRF header. */
export async function signIn(app: App, email: string, password = TEST_PASSWORD) {
  const res = await app.inject({ method: "POST", url: "/v1/admin/auth/login", payload: { email, password } });
  if (res.statusCode !== 200) throw new Error(`sign-in failed: ${res.statusCode} ${res.body}`);
  const session = res.json() as StaffSession;
  const cookie = res.cookies.find((c) => c.name === "klw_admin")!;
  const request = (method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      cookies: { klw_admin: cookie.value },
      headers: method === "GET" ? {} : { "x-csrf-token": session.csrfToken },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
  return { session, cookie, request };
}

/** Uploads an image through the real multipart endpoint as the given staff session. */
export async function uploadImage(app: App, session: Awaited<ReturnType<typeof signIn>>, buffer: Buffer, filename = "image.jpg", alt?: string) {
  const boundary = "----kleawiptest";
  const parts: Buffer[] = [];
  if (alt !== undefined) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="alt"\r\n\r\n${alt}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`));
  parts.push(buffer, Buffer.from(`\r\n--${boundary}--\r\n`));
  return app.inject({
    method: "POST",
    url: "/v1/admin/media",
    cookies: { klw_admin: session.cookie.value },
    headers: { "content-type": `multipart/form-data; boundary=${boundary}`, "x-csrf-token": session.session.csrfToken },
    payload: Buffer.concat(parts),
  });
}

type TestContext = Awaited<ReturnType<typeof createTestApp>>;
export const STORE_CLIENT = { "x-kleawip-client": "storefront" };

/** Signs a customer in through the real OTP flow (the in-memory sender captures the code). */
export async function customerSignIn(ctx: TestContext, phone = "9876543210", extraCookies: Record<string, string> = {}) {
  await ctx.db.execute(sql`UPDATE otp_challenges SET created_at = created_at - interval '1 hour'`);
  const request = await ctx.app.inject({ method: "POST", url: "/v1/store/auth/otp/request", headers: STORE_CLIENT, payload: { phone } });
  if (request.statusCode !== 201) throw new Error(`otp request failed: ${request.body}`);
  const { challengeId } = request.json() as { challengeId: string };
  const code = ctx.otp.lastCodeFor(`+91${phone.replace(/\D/g, "").slice(-10)}`)!;
  const verify = await ctx.app.inject({ method: "POST", url: "/v1/store/auth/otp/verify", headers: STORE_CLIENT, payload: { challengeId, code }, cookies: extraCookies });
  if (verify.statusCode !== 200) throw new Error(`otp verify failed: ${verify.body}`);
  const cookie = verify.cookies.find((c) => c.name === "klw_session")!.value;
  const call = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: object) =>
    ctx.app.inject({ method, url, headers: STORE_CLIENT, cookies: { klw_session: cookie }, ...(payload ? { payload } : {}) });
  return { cookie, call, verify, customerId: (verify.json() as { customer: { id: string } }).customer.id };
}
