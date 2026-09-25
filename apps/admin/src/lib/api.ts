// Admin API client. Same-origin requests (proxied to services/commerce-api by next.config.ts),
// session cookie sent automatically, CSRF token attached to every state-changing request.

export type FieldError = { path: string; code: string; message: string };

export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly errors: FieldError[] = [],
  ) {
    super(message);
  }
}

let csrfToken: string | null = null;
export const setCsrfToken = (token: string | null) => {
  csrfToken = token;
};

type Options = { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown; form?: FormData };

export async function api<T>(path: string, { method = "GET", body, form }: Options = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (method !== "GET" && csrfToken) headers["x-csrf-token"] = csrfToken;
  if (body !== undefined) headers["content-type"] = "application/json";

  const response = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiProblem(
      response.status,
      data?.code ?? "INTERNAL_ERROR",
      data?.detail ?? data?.title ?? `Request failed (${response.status})`,
      data?.errors ?? [],
    );
  }
  return data as T;
}

export const rupees = (paise: number | null | undefined) =>
  paise === null || paise === undefined ? null : `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: paise % 100 ? 2 : 0 })}`;

export const istTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
