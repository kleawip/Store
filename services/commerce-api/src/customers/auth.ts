// Customer sign-in: the phone number is the identity (ADR 0002 R1), verified by a one-time code sent on
// WhatsApp, or by email for customers who already have a verified email.
import { and, count, desc, eq, gt, isNull } from "drizzle-orm";
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { Database } from "../db/client";
import { customerSessions, customers, otpChallenges } from "../db/schema";
import { ApiError } from "../errors";
import { OtpDeliveryError, type ChannelOtpSender } from "../messaging/otp-senders";

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_AFTER_MS = 30 * 1000;
export const OTP_MAX_PER_HOUR = 5;
export const CUSTOMER_SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000; // stay signed in for 30 days
export const CUSTOMER_SESSION_IDLE_MS = 14 * 24 * 60 * 60 * 1000; // unless unused for 14 days

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const codeHash = (challengeId: string, code: string) => sha256(`${challengeId}:${code}`);
const invalid = (path: string, code: string, message: string) =>
  new ApiError(422, "VALIDATION_FAILED", "Validation failed", message, [{ path, code, message }]);

export const maskPhone = (phone: string) => `WhatsApp ••••• ${phone.slice(-5)}`;
export const maskEmail = (email: string) => {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}•••@${domain}`;
};

type CustomerRow = typeof customers.$inferSelect;
export const toCustomer = (row: CustomerRow) => ({
  id: row.id,
  phone: row.phone,
  name: row.name,
  email: row.email,
  emailVerified: !!row.emailVerifiedAt,
  createdAt: row.createdAt.toISOString(),
});

/** Issues a code and sends it. Limits: one code per 30 s and 5 per hour per phone number. */
export async function requestOtp(
  db: Database,
  sender: ChannelOtpSender,
  input: { phone: string; channel: "whatsapp" | "email"; ipAddress?: string },
  now = new Date(),
) {
  const [recent] = await db
    .select({ createdAt: otpChallenges.createdAt })
    .from(otpChallenges)
    .where(eq(otpChallenges.phone, input.phone))
    .orderBy(desc(otpChallenges.createdAt))
    .limit(1);
  if (recent && now.getTime() - recent.createdAt.getTime() < OTP_RESEND_AFTER_MS) {
    const wait = Math.ceil((OTP_RESEND_AFTER_MS - (now.getTime() - recent.createdAt.getTime())) / 1000);
    throw new ApiError(429, "RATE_LIMITED", "Please wait", `You can request a new code in ${wait} seconds.`);
  }
  const [{ value: lastHour } = { value: 0 }] = await db
    .select({ value: count() })
    .from(otpChallenges)
    .where(and(eq(otpChallenges.phone, input.phone), gt(otpChallenges.createdAt, new Date(now.getTime() - 3600_000))));
  if (lastHour >= OTP_MAX_PER_HOUR) {
    throw new ApiError(429, "RATE_LIMITED", "Too many codes", "Too many codes were requested for this number. Try again in an hour.");
  }

  let destination = input.phone;
  let sentTo = maskPhone(input.phone);
  if (input.channel === "email") {
    const [customer] = await db.select().from(customers).where(eq(customers.phone, input.phone));
    if (!customer?.email || !customer.emailVerifiedAt) {
      throw invalid("channel", "email_unavailable", "Email codes are only for accounts with a verified email. Use WhatsApp instead.");
    }
    destination = customer.email;
    sentTo = maskEmail(customer.email);
  }
  if (!sender.has(input.channel)) throw invalid("channel", "channel_unavailable", `Sign-in by ${input.channel} isn't available right now.`);

  const id = randomUUID();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
  await db.insert(otpChallenges).values({ id, phone: input.phone, channel: input.channel, codeHash: codeHash(id, code), expiresAt, ipAddress: input.ipAddress, createdAt: now });

  try {
    await sender.send({ channel: input.channel, to: destination, code, expiresInMinutes: OTP_TTL_MS / 60_000 });
  } catch (error) {
    await db.update(otpChallenges).set({ consumedAt: new Date() }).where(eq(otpChallenges.id, id));
    if (error instanceof OtpDeliveryError) {
      throw new ApiError(503, "DELIVERY_FAILED", "Could not send the code", input.channel === "whatsapp"
        ? "We couldn't send a WhatsApp code to this number. Check it's on WhatsApp, or try again shortly."
        : "We couldn't send the email. Try again shortly.");
    }
    throw error;
  }
  return { challengeId: id, channel: input.channel, sentTo, expiresAt: expiresAt.toISOString(), resendAfterSeconds: OTP_RESEND_AFTER_MS / 1000 };
}

/** Checks a code. Wrong codes use up attempts; a correct code signs the customer in (creating the account if new). */
export async function verifyOtp(db: Database, input: { challengeId: string; code: string }, meta: { userAgent?: string }) {
  const expired = () => invalid("code", "expired", "This code has expired. Request a new one.");
  return db.transaction(async (tx) => {
    const [challenge] = await tx.select().from(otpChallenges).where(eq(otpChallenges.id, input.challengeId)).for("update");
    if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date()) throw expired();

    const expected = Buffer.from(challenge.codeHash, "hex");
    const actual = Buffer.from(codeHash(challenge.id, input.code), "hex");
    if (!timingSafeEqual(expected, actual)) {
      const attempts = challenge.attempts + 1;
      await tx
        .update(otpChallenges)
        .set({ attempts, ...(attempts >= OTP_MAX_ATTEMPTS ? { consumedAt: new Date() } : {}) })
        .where(eq(otpChallenges.id, challenge.id));
      const left = OTP_MAX_ATTEMPTS - attempts;
      // Commit the attempt count, then report: throwing inside the transaction would roll it back.
      return { ok: false as const, left };
    }

    await tx.update(otpChallenges).set({ consumedAt: new Date() }).where(eq(otpChallenges.id, challenge.id));
    const [existing] = await tx.select().from(customers).where(eq(customers.phone, challenge.phone));
    if (existing?.status === "blocked") throw new ApiError(403, "FORBIDDEN", "Account unavailable", "This account can't sign in. Please contact Kleawip support.");
    const now = new Date();
    const [customer] = existing
      ? await tx.update(customers).set({ lastLoginAt: now, phoneVerifiedAt: existing.phoneVerifiedAt ?? now }).where(eq(customers.id, existing.id)).returning()
      : await tx.insert(customers).values({ phone: challenge.phone, phoneVerifiedAt: now, lastLoginAt: now }).returning();

    const token = randomBytes(32).toString("base64url");
    await tx.insert(customerSessions).values({
      customerId: customer!.id,
      tokenHash: sha256(token),
      userAgent: meta.userAgent?.slice(0, 300),
      expiresAt: new Date(now.getTime() + CUSTOMER_SESSION_ABSOLUTE_MS),
    });
    return { ok: true as const, token, customer: customer!, isNewCustomer: !existing };
  }).then((result) => {
    if (!result.ok) {
      throw invalid("code", result.left > 0 ? "incorrect" : "too_many_attempts", result.left > 0
        ? `That code isn't right. ${result.left} attempt${result.left === 1 ? "" : "s"} left.`
        : "Too many wrong codes. Request a new one.");
    }
    return result;
  });
}

export type CustomerContext = { sessionId: string; customerId: string };

/** Resolves the session cookie, enforcing idle and absolute expiry; blocked customers are signed out. */
export async function resolveCustomerSession(db: Database, token: string, now = new Date()): Promise<CustomerContext | null> {
  const [row] = await db
    .select({ sessionId: customerSessions.id, customerId: customers.id, lastSeenAt: customerSessions.lastSeenAt })
    .from(customerSessions)
    .innerJoin(customers, eq(customers.id, customerSessions.customerId))
    .where(and(eq(customerSessions.tokenHash, sha256(token)), isNull(customerSessions.revokedAt), gt(customerSessions.expiresAt, now), eq(customers.status, "active")));
  if (!row) return null;
  if (now.getTime() - row.lastSeenAt.getTime() > CUSTOMER_SESSION_IDLE_MS) {
    await db.update(customerSessions).set({ revokedAt: now }).where(eq(customerSessions.id, row.sessionId));
    return null;
  }
  if (now.getTime() - row.lastSeenAt.getTime() > 60 * 60 * 1000) {
    await db.update(customerSessions).set({ lastSeenAt: now }).where(eq(customerSessions.id, row.sessionId));
  }
  return { sessionId: row.sessionId, customerId: row.customerId };
}

export async function revokeCustomerSession(db: Database, sessionId: string) {
  await db.update(customerSessions).set({ revokedAt: new Date() }).where(eq(customerSessions.id, sessionId));
}
