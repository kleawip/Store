import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import type { Database } from "../db/client";
import { ApiError } from "../errors";
import { can, type Permission } from "./permissions";
import { resolveSession, type StaffContext } from "./sessions";

export const ADMIN_COOKIE = "klw_admin";
export const CSRF_HEADER = "x-csrf-token";

declare module "fastify" {
  interface FastifyRequest {
    staff?: StaffContext;
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const unauthenticated = () => new ApiError(401, "UNAUTHENTICATED", "Sign in required", "Your session is missing or has expired.");
export const forbidden = (detail: string) => new ApiError(403, "FORBIDDEN", "Not allowed", detail);

/** The signed-in staff member for this request. Only call after `authorize` has run. */
export function staffOf(request: FastifyRequest): StaffContext {
  if (!request.staff) throw unauthenticated();
  return request.staff;
}

/**
 * preHandler for admin routes: resolves the staff session cookie, enforces CSRF on
 * state-changing methods, then checks the role grants `permission` (null = any signed-in staff).
 */
export function authorize(db: Database, permission: Permission | null): preHandlerAsyncHookHandler {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const token = request.cookies[ADMIN_COOKIE];
    const staff = token ? await resolveSession(db, token) : null;
    if (!staff) throw unauthenticated();

    if (!SAFE_METHODS.has(request.method) && request.headers[CSRF_HEADER] !== staff.csrfToken) {
      throw forbidden("Missing or invalid CSRF token. Send the csrfToken from the session as the X-CSRF-Token header.");
    }
    if (permission && !can(staff.role, permission)) {
      throw forbidden(`Your role (${staff.role}) cannot perform this action (${permission}).`);
    }
    request.staff = staff;
  };
}
