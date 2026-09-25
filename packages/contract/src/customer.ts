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

// ---- Cart (server-priced; the browser only ever sends SKU + quantity) ----

const Money = z.object({ amount: z.number().int(), currency: z.literal("INR") });

export const CartLineWarning = z.enum(["PRICE_CHANGED", "QUANTITY_REDUCED", "SKU_UNAVAILABLE"]);

export const CartLine = z.object({
  sku: z.string(),
  productSlug: z.string(),
  productTitle: z.string(),
  // e.g. "Size: 40 × 60 cm · Pack: Pack of 2"
  optionsLabel: z.string(),
  image: z.object({ url: z.string(), alt: z.string() }).nullable(),
  packQuantity: z.number().int(),
  // What the customer asked for, and what can actually be ordered now.
  quantity: z.number().int(),
  orderableQuantity: z.number().int(),
  unitPrice: Money.nullable(),
  mrp: Money.nullable(),
  lineTotal: Money, // unitPrice × orderableQuantity (0 when unavailable)
  gstRatePercent: z.number().nullable(),
  warnings: z.array(z.object({ code: CartLineWarning, message: z.string(), previousUnitPrice: Money.optional() })),
});
export type CartLine = z.infer<typeof CartLine>;

export const Cart = z.object({
  lines: z.array(CartLine),
  itemCount: z.number().int(),
  // GST-inclusive merchandise total; shipping and payment split are worked out at checkout.
  subtotal: Money,
  gstIncluded: Money,
  hasWarnings: z.boolean(),
  signedIn: z.boolean(),
});
export type Cart = z.infer<typeof Cart>;

export const CartLineUpdate = z.object({ quantity: z.number().int().min(0).max(999) });

export const WishlistItem = z.object({
  productSlug: z.string(),
  sku: z.string().nullable(),
  addedAt: z.string(),
});
export const WishlistPut = z.object({ sku: z.string().nullable().default(null) });
export const WishlistMerge = z.object({
  items: z.array(z.object({ productSlug: z.string(), sku: z.string().nullable().default(null) })).max(100),
});

// ---- Delivery check and checkout quote ----

export const ServiceabilityQuery = z.object({ pincode: z.string().regex(/^[1-9]\d{5}$/, "Enter a 6-digit pincode.") });

export const Serviceability = z.object({
  pincode: z.string(),
  // "unavailable" = the courier check itself couldn't run (show a neutral message, not "not deliverable").
  status: z.enum(["serviceable", "not_serviceable", "unavailable"]),
  partialCodAvailable: z.boolean(),
  estimatedDeliveryDays: z.object({ min: z.number().int(), max: z.number().int() }).nullable(),
});

export const CheckoutQuoteRequest = z.object({
  addressId: z.uuid(),
  paymentMethod: z.enum(["prepaid", "partial_cod"]),
  // Milestone 4: optional discount code (case-insensitive). Errors come back on path "discountCode".
  discountCode: z.string().trim().min(1).max(40).nullable().optional(),
});

export const AppliedDiscountView = z.object({
  code: z.string(),
  description: z.string(),
  goods: z.object({ amount: z.number().int(), currency: z.literal("INR") }),
  shipping: z.object({ amount: z.number().int(), currency: z.literal("INR") }),
  total: z.object({ amount: z.number().int(), currency: z.literal("INR") }),
});

const QuoteMoney = z.object({ amount: z.number().int(), currency: z.literal("INR") });

export const CheckoutQuote = z.object({
  quoteId: z.string(),
  expiresAt: z.string(),
  lines: z.array(z.object({
    sku: z.string(),
    productTitle: z.string(),
    optionsLabel: z.string(),
    quantity: z.number().int(),
    unitPrice: QuoteMoney,
    lineTotal: QuoteMoney,
    // This line's share of the discount (0 without a code).
    discount: QuoteMoney,
    gstRatePercent: z.number(),
  })),
  merchandiseTotal: QuoteMoney, // GST-inclusive, before discount
  discount: AppliedDiscountView.nullable(),
  shipping: QuoteMoney,
  total: QuoteMoney,
  gst: z.object({
    intraState: z.boolean(),
    taxable: QuoteMoney,
    cgst: QuoteMoney,
    sgst: QuoteMoney,
    igst: QuoteMoney,
  }),
  payment: z.object({
    method: z.enum(["prepaid", "partial_cod"]),
    payNow: QuoteMoney, // charged online via Razorpay
    codBalance: QuoteMoney, // collected in cash on delivery (0 for prepaid)
    depositPercent: z.number().nullable(),
  }),
  delivery: z.object({
    pincode: z.string(),
    estimatedDeliveryDays: z.object({ min: z.number().int(), max: z.number().int() }).nullable(),
  }),
  // Cart lines left out of this quote and why (e.g. out of stock), so the UI can explain.
  excluded: z.array(z.object({ sku: z.string(), reason: z.string() })),
  warnings: z.array(z.object({ sku: z.string(), code: z.string(), message: z.string() })),
});
export type CheckoutQuote = z.infer<typeof CheckoutQuote>;

// ---- Orders and payment ----

export const PlaceOrderRequest = z.object({ quoteId: z.uuid() });

// What the storefront needs to open Razorpay Checkout (or the dev payment simulator).
export const PaymentSession = z.object({
  provider: z.enum(["razorpay", "dev"]),
  keyId: z.string(),
  providerOrderId: z.string(),
  amount: QuoteMoney,
  purpose: z.enum(["full", "deposit"]),
  prefill: z.object({ name: z.string(), contact: z.string(), email: z.string().nullable() }),
});

export const PaymentVerifyRequest = z.object({
  providerOrderId: z.string().min(1).max(100),
  providerPaymentId: z.string().min(1).max(100),
  signature: z.string().regex(/^[0-9a-f]{64}$/i),
});

export const OrderStatus = z.enum(["pending_payment", "confirmed", "expired", "cancelled"]);

export const FulfilmentStatus = z.enum(["unfulfilled", "processing", "packed", "shipped", "out_for_delivery", "delivered", "rto_initiated", "returned_to_origin"]);

export const ShipmentStatus = z.enum(["pending", "ready", "pickup_requested", "in_transit", "out_for_delivery", "delivered", "rto_initiated", "returned_to_origin", "cancelled"]);

export const OrderTracking = z.object({
  courierName: z.string().nullable(),
  awb: z.string().nullable(),
  trackingUrl: z.string().nullable(),
  status: ShipmentStatus,
  events: z.array(z.object({ status: z.string(), location: z.string().nullable(), occurredAt: z.string() })),
});

export const Order = z.object({
  id: z.string(),
  number: z.string(),
  status: OrderStatus,
  fulfilmentStatus: FulfilmentStatus,
  refundedTotal: QuoteMoney,
  paymentMethod: z.enum(["prepaid", "partial_cod"]),
  paymentStatus: z.enum(["awaiting", "paid", "failed"]),
  placedAt: z.string(),
  confirmedAt: z.string().nullable(),
  // Pay before this time or the reservation lapses (pending_payment only).
  payBy: z.string().nullable(),
  lines: z.array(z.object({ sku: z.string(), productTitle: z.string(), optionsLabel: z.string(), quantity: z.number().int(), unitPrice: QuoteMoney, lineTotal: QuoteMoney, discount: QuoteMoney })),
  merchandiseTotal: QuoteMoney,
  // Milestone 4 (additive): the code used and what it took off goods and shipping.
  discount: AppliedDiscountView.nullable(),
  shipping: QuoteMoney,
  total: QuoteMoney,
  payNow: QuoteMoney,
  codBalance: QuoteMoney,
  gst: z.object({ intraState: z.boolean(), taxable: QuoteMoney, cgst: QuoteMoney, sgst: QuoteMoney, igst: QuoteMoney }),
  shippingAddress: z.object({ name: z.string(), phone: z.string(), line1: z.string(), line2: z.string(), landmark: z.string(), city: z.string(), stateCode: z.string(), stateName: z.string(), pincode: z.string() }),
  // Milestone 3 (additive). Null until a shipment is booked / an invoice is issued.
  tracking: OrderTracking.nullable(),
  invoice: z.object({ number: z.string(), issuedAt: z.string() }).nullable(),
});
export type Order = z.infer<typeof Order>;

export const PlaceOrderResponse = z.object({ order: Order, payment: PaymentSession.nullable() });

// ---- Returns (Milestone 3 step 3) ----

export const ReturnReason = z.enum(["damaged", "wrong_item", "not_as_described", "quality_issue", "changed_mind", "undelivered", "other"]);
export const ReturnStatus = z.enum(["requested", "approved", "rejected", "received", "refunded", "closed", "cancelled"]);

export const ReturnRequest = z.object({
  lines: z.array(z.object({ sku: z.string().min(1).max(64), quantity: z.number().int().positive() })).min(1).max(50),
  // Customers can't choose "undelivered" (that's for courier returns staff record).
  reason: ReturnReason.exclude(["undelivered"]),
  note: z.string().trim().max(1000).default(""),
});

export const CustomerReturn = z.object({
  id: z.string(),
  number: z.string(),
  orderId: z.string(),
  status: ReturnStatus,
  reason: ReturnReason,
  note: z.string(),
  // Shown to the customer when a request is rejected.
  rejectionReason: z.string().nullable(),
  lines: z.array(z.object({ sku: z.string(), productTitle: z.string(), optionsLabel: z.string(), quantity: z.number().int() })),
  refundedTotal: QuoteMoney,
  requestedAt: z.string(),
});

/** What can still be returned on a delivered order, and until when. */
export const ReturnEligibility = z.object({
  eligible: z.boolean(),
  // Why not, in words for the customer (null when eligible).
  reason: z.string().nullable(),
  returnBy: z.string().nullable(),
  lines: z.array(z.object({ sku: z.string(), productTitle: z.string(), optionsLabel: z.string(), returnableQuantity: z.number().int() })),
});
