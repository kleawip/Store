import { buildApp } from "../src/app";
import { createDatabase } from "../src/db/client";

export async function createTestApp() {
  const { db, close } = createDatabase(process.env.TEST_DATABASE_URL!);
  const app = await buildApp({ db, storefrontOrigins: ["http://localhost:3000"] });
  return {
    app,
    db,
    async close() {
      await app.close();
      await close();
    },
  };
}
