import { Address, AddressInput, Customer, CustomerSession, CustomerUpdate, OtpChallenge, OtpRequest, OtpVerify } from "@kleawip/contract";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import { CUSTOMER_SESSION_ABSOLUTE_MS, requestOtp, revokeCustomerSession, toCustomer, verifyOtp } from "../customers/auth";
import { CUSTOMER_COOKIE, customerOf, customerSession, requireClientHeader } from "../customers/guard";
import { addressFor, createAddress, deleteAddress, getCustomer, listAddresses, updateAddress, updateCustomer } from "../customers/profile";
import type { Database } from "../db/client";
import type { ChannelOtpSender } from "../messaging/otp-senders";

type IdParams = { Params: { id: string } };
export type StoreAccountOptions = { otpSender: ChannelOtpSender; cookieSecure: boolean; onSignIn?: (request: { cookies: Record<string, string | undefined> }, reply: FastifyReply, customerId: string) => Promise<void> };

export const storeAccountRoutes = (db: Database, { otpSender, cookieSecure, onSignIn }: StoreAccountOptions): FastifyPluginAsync => async (app) => {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "private, no-store");
  });
  const signedIn = { preHandler: customerSession(db, { required: true }) };

  // ---- Sign-in ----

  app.post("/auth/otp/request", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    requireClientHeader(request);
    const input = OtpRequest.parse(request.body);
    const challenge = await requestOtp(db, otpSender, { ...input, ipAddress: request.ip });
    return reply.status(201).send(OtpChallenge.parse(challenge));
  });

  app.post("/auth/otp/verify", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
    requireClientHeader(request);
    const result = await verifyOtp(db, OtpVerify.parse(request.body), { userAgent: request.headers["user-agent"] });
    reply.setCookie(CUSTOMER_COOKIE, result.token, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: "lax",
      path: "/",
      maxAge: CUSTOMER_SESSION_ABSOLUTE_MS / 1000,
    });
    await onSignIn?.(request, reply, result.customer.id);
    return CustomerSession.parse({ customer: toCustomer(result.customer), isNewCustomer: result.isNewCustomer });
  });

  app.post("/auth/logout", signedIn, async (request, reply) => {
    await revokeCustomerSession(db, customerOf(request).sessionId);
    reply.clearCookie(CUSTOMER_COOKIE, { path: "/" });
    return reply.status(204).send();
  });

  // ---- Profile ----

  app.get("/me", signedIn, async (request) => Customer.parse(await getCustomer(db, customerOf(request).customerId)));
  app.patch("/me", signedIn, async (request) =>
    Customer.parse(await updateCustomer(db, customerOf(request).customerId, CustomerUpdate.parse(request.body))),
  );

  // ---- Addresses ----

  app.get("/me/addresses", signedIn, async (request) => ({ data: z.array(Address).parse(await listAddresses(db, customerOf(request).customerId)) }));
  app.post("/me/addresses", signedIn, async (request, reply) =>
    reply.status(201).send(Address.parse(await createAddress(db, customerOf(request).customerId, AddressInput.parse(request.body)))),
  );
  app.get<IdParams>("/me/addresses/:id", signedIn, async (request) => Address.parse(await addressFor(db, customerOf(request).customerId, request.params.id)));
  app.patch<IdParams>("/me/addresses/:id", signedIn, async (request) =>
    Address.parse(await updateAddress(db, customerOf(request).customerId, request.params.id, AddressInput.partial().parse(request.body))),
  );
  app.delete<IdParams>("/me/addresses/:id", signedIn, async (request, reply) => {
    await deleteAddress(db, customerOf(request).customerId, request.params.id);
    return reply.status(204).send();
  });
};
