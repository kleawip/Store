import { createDatabase } from "../src/db/client";
import { seedDemoCatalogue } from "../src/db/seed-demo";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. See services/commerce-api/.env.example.");

const { db, close } = createDatabase(url);
try {
  const result = await seedDemoCatalogue(db);
  console.log(`Demo catalogue seeded: ${result.categories} categories, ${result.products} products (all isDemo=true).`);
} finally {
  await close();
}
