import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import pg from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export const migrationsFolder = fileURLToPath(new URL("../../../../database/migrations", import.meta.url));

export function createDatabase(url: string) {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const db = drizzle(pool, { schema });
  return { db, close: () => pool.end() };
}

export async function runMigrations(db: Database) {
  await migrate(db, { migrationsFolder });
}
