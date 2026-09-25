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

export async function createTestApp() {
  const { db, close } = createDatabase(process.env.TEST_DATABASE_URL!);
  const mediaDir = mkdtempSync(join(tmpdir(), "kleawip-test-media-"));
  const storage = new LocalDiskStorage(mediaDir, "http://127.0.0.1:4000/media");
  const app = await buildApp({ db, storage, storefrontOrigins: ["http://localhost:3000"], cookieSecure: false });
  return {
    app,
    db,
    storage,
    mediaDir,
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
  await db.execute(sql`TRUNCATE staff_sessions, staff_users, audit_events, media_assets RESTART IDENTITY CASCADE`);
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
