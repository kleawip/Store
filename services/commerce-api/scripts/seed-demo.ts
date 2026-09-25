import { seedDemoCampaigns } from "../src/campaigns/seed-demo";
import { loadConfig } from "../src/config";
import { createDatabase } from "../src/db/client";
import { seedDemoCatalogue } from "../src/db/seed-demo";
import { LocalDiskStorage } from "../src/media/storage";

const config = loadConfig();
const { db, close } = createDatabase(config.DATABASE_URL);
try {
  const catalogue = await seedDemoCatalogue(db);
  console.log(`Demo catalogue seeded: ${catalogue.categories} categories, ${catalogue.products} products (all isDemo=true).`);
  const campaigns = await seedDemoCampaigns(db, new LocalDiskStorage(config.MEDIA_DIR, config.MEDIA_PUBLIC_BASE_URL));
  console.log(`Demo campaigns seeded: ${campaigns.slides} hero slides (real kleawip.com photos), ${campaigns.ribbon} ribbon messages.`);
} finally {
  await close();
}
