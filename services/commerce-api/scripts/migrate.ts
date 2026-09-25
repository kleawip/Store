import { createDatabase, runMigrations } from "../src/db/client";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. See services/commerce-api/.env.example.");

const { db, close } = createDatabase(url);
try {
  await runMigrations(db);
  console.log("Migrations applied.");
} finally {
  await close();
}
