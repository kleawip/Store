// Creates a Kleawip staff account. There is no public sign-up: the first Owner is created here,
// later staff through the admin (Settings → Staff, a later milestone).
//
//   npm run staff:create -w @kleawip/commerce-api -- --email owner@example.com --name "Owner" --role owner
//
// A random password is printed ONCE. Share it privately; the person should change it on first sign-in.
import { StaffRole } from "@kleawip/contract";
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { z } from "zod";
import { hashPassword } from "../src/auth/password";
import { createDatabase } from "../src/db/client";
import { staffUsers } from "../src/db/schema";

const { values } = parseArgs({ options: { email: { type: "string" }, name: { type: "string" }, role: { type: "string" } } });
const input = z.object({ email: z.email(), name: z.string().trim().min(1), role: StaffRole }).parse(values);

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. See services/commerce-api/.env.example.");

const password = randomBytes(18).toString("base64url");
const { db, close } = createDatabase(url);
try {
  await db.insert(staffUsers).values({
    email: input.email.toLowerCase(),
    name: input.name,
    role: input.role,
    passwordHash: await hashPassword(password),
  });
  console.log(`Created ${input.role} ${input.email.toLowerCase()}.`);
  console.log(`Temporary password (shown once): ${password}`);
} catch (error) {
  const code = (error as { cause?: { code?: string } }).cause?.code;
  if (code === "23505") console.error(`A staff account for ${input.email} already exists.`);
  else throw error;
  process.exitCode = 1;
} finally {
  await close();
}
