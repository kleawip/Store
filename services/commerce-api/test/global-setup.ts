import pg from "pg";
import { createDatabase, runMigrations } from "../src/db/client";

// Rebuilds the test database schema from migrations before each run.
// Guard: only ever operates on a database whose name ends in "_test".
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/kleawip_test";
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith("_test")) throw new Error(`Refusing to reset non-test database "${name}".`);

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  await client.end();

  const { db, close } = createDatabase(url);
  await runMigrations(db);
  await close();
}
