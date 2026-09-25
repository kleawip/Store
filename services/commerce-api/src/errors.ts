import type { ErrorCode, Problem } from "@kleawip/contract";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

const PROBLEM_BASE = "https://api.kleawip.example/problems/";

type FieldError = NonNullable<Problem["errors"]>[number];

/** A deliberate, client-facing error. Anything else becomes a 500 with no internals exposed. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    readonly title: string,
    readonly detail?: string,
    readonly errors?: FieldError[],
  ) {
    super(detail ?? title);
  }
}

export const notFound = (detail: string) => new ApiError(404, "NOT_FOUND", "Not found", detail);

function send(reply: FastifyReply, request: FastifyRequest, problem: Omit<Problem, "requestId" | "type">) {
  const body: Problem = {
    type: PROBLEM_BASE + problem.code.toLowerCase().replaceAll("_", "-"),
    ...problem,
    requestId: String(request.id),
  };
  return reply.status(problem.status).type("application/problem+json").send(body);
}

export function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof ApiError) {
    return send(reply, request, {
      title: error.title,
      status: error.status,
      code: error.code,
      detail: error.detail,
      errors: error.errors,
    });
  }
  if (error instanceof ZodError) {
    return send(reply, request, {
      title: "Validation failed",
      status: 422,
      code: "VALIDATION_FAILED",
      detail: "One or more fields are invalid.",
      errors: error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code, message: issue.message })),
    });
  }
  const status = "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500;
  if (status >= 400 && status < 500) {
    return send(reply, request, { title: "Bad request", status, code: "VALIDATION_FAILED", detail: error.message });
  }
  request.log.error({ err: error }, "unhandled error");
  return send(reply, request, { title: "Internal error", status: 500, code: "INTERNAL_ERROR" });
}

export function notFoundHandler(request: FastifyRequest, reply: FastifyReply) {
  return send(reply, request, { title: "Not found", status: 404, code: "NOT_FOUND", detail: `No route for ${request.method} ${request.url}` });
}
