import { z } from "zod";

const Env = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default("127.0.0.1"),
  STOREFRONT_ORIGIN: z.string().default("http://localhost:3000"),
  // Secure admin cookie unless explicitly disabled for plain-HTTP local development.
  COOKIE_SECURE: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  // Local development media store (served by the API under /media). Production uses a cloud store (Phase 0 decision).
  MEDIA_DIR: z.string().default(".data/media"),
  MEDIA_PUBLIC_BASE_URL: z.string().url().default("http://127.0.0.1:4000/media"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${fields}. See services/commerce-api/.env.example.`);
  }
  if (parsed.data.NODE_ENV === "production" && !parsed.data.COOKIE_SECURE) {
    throw new Error("COOKIE_SECURE=false is not allowed in production: admin sessions must only travel over HTTPS.");
  }
  return parsed.data;
}
