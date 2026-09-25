import type { FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import type { Database } from "../db/client";
import { ApiError } from "../errors";
import { resolveCustomerSession, type CustomerContext } from "./auth";

export const CUSTOMER_COOKIE = "klw_session";
/**
 * CSRF defence for the storefront API: every state-changing request must carry this header. Browsers only
 * send custom headers cross-origin after a CORS preflight, which our allow-list refuses for other sites.
 * The storefront sends `X-Kleawip-Client: storefront`.
 */
export const CLIENT_HEADER = "x-kleawip-client";

declare module "fastify" {
  interface FastifyRequest {
    customer?: CustomerContext | null;
  }
}

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export function requireClientHeader(request: FastifyRequest) {
  if (!SAFE.has(request.method) && !request.headers[CLIENT_HEADER]) {
    throw new ApiError(403, "FORBIDDEN", "Missing client header", "Send the X-Kleawip-Client header with this request.");
  }
}

/** Attaches the signed-in customer (or null). `required` rejects anonymous requests with 401. */
export function customerSession(db: Database, { required }: { required: boolean }): preHandlerAsyncHookHandler {
  return async (request) => {
    requireClientHeader(request);
    const token = request.cookies[CUSTOMER_COOKIE];
    request.customer = token ? await resolveCustomerSession(db, token) : null;
    if (required && !request.customer) throw new ApiError(401, "UNAUTHENTICATED", "Sign in required", "Please sign in to continue.");
  };
}

export function customerOf(request: FastifyRequest): CustomerContext {
  if (!request.customer) throw new ApiError(401, "UNAUTHENTICATED", "Sign in required", "Please sign in to continue.");
  return request.customer;
}
