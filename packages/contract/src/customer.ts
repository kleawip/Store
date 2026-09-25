// Customer-facing schemas (Milestone 2). SHARED between storefront (Codex) and API (Claude Code).
import { z } from "zod";

/** Accepts "98765 43210", "+91 98765-43210", "09876543210" … and normalises to E.164 "+919876543210". */
export const IndianMobile = z
  .string()
  .transform((raw) => raw.replace(/[\s\-()]/g, "").replace(/^(\+?91|0)(?=[6-9]\d{9}$)/, ""))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number."))
  .transform((digits) => `+91${digits}`);

// ISO 3166-2:IN codes (without "IN-") for states and union territories.
export const INDIAN_STATES = {
  AN: "Andaman and Nicobar Islands", AP: "Andhra Pradesh", AR: "Arunachal Pradesh", AS: "Assam", BR: "Bihar",
  CH: "Chandigarh", CT: "Chhattisgarh", DH: "Dadra and Nagar Haveli and Daman and Diu", DL: "Delhi", GA: "Goa",
  GJ: "Gujarat", HR: "Haryana", HP: "Himachal Pradesh", JK: "Jammu and Kashmir", JH: "Jharkhand", KA: "Karnataka",
  KL: "Kerala", LA: "Ladakh", LD: "Lakshadweep", MP: "Madhya Pradesh", MH: "Maharashtra", MN: "Manipur",
  ML: "Meghalaya", MZ: "Mizoram", NL: "Nagaland", OR: "Odisha", PY: "Puducherry", PB: "Punjab", RJ: "Rajasthan",
  SK: "Sikkim", TN: "Tamil Nadu", TG: "Telangana", TR: "Tripura", UP: "Uttar Pradesh", UT: "Uttarakhand",
  WB: "West Bengal",
} as const;
export type StateCode = keyof typeof INDIAN_STATES;
export const StateCodeSchema = z.enum(Object.keys(INDIAN_STATES) as [StateCode, ...StateCode[]]);

// ---- Sign-in (WhatsApp OTP, email OTP fallback for customers with a verified email) ----

export const OtpRequest = z.object({
  phone: IndianMobile,
  channel: z.enum(["whatsapp", "email"]).default("whatsapp"),
});

export const OtpChallenge = z.object({
  challengeId: z.string(),
  channel: z.enum(["whatsapp", "email"]),
  // Masked destination for the UI, e.g. "WhatsApp ••••• 43210" or "p•••@gmail.com".
  sentTo: z.string(),
  expiresAt: z.string(),
  resendAfterSeconds: z.number().int(),
});

export const OtpVerify = z.object({
  challengeId: z.uuid(),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code."),
});

export const Customer = z.object({
  id: z.string(),
  phone: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  emailVerified: z.boolean(),
  createdAt: z.string(),
});
export type Customer = z.infer<typeof Customer>;

export const CustomerSession = z.object({ customer: Customer, isNewCustomer: z.boolean() });

export const CustomerUpdate = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email().max(254).nullable(),
}).partial();

// ---- Addresses ----

export const AddressInput = z.object({
  name: z.string().trim().min(2).max(80),
  phone: IndianMobile,
  line1: z.string().trim().min(3).max(120),
  line2: z.string().trim().max(120).default(""),
  landmark: z.string().trim().max(80).default(""),
  city: z.string().trim().min(2).max(60),
  stateCode: StateCodeSchema,
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a 6-digit pincode."),
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.infer<typeof AddressInput>;

export const Address = AddressInput.extend({ id: z.string(), phone: z.string(), stateName: z.string() });
export type Address = z.infer<typeof Address>;
