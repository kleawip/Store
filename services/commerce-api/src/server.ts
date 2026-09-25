import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createDatabase } from "./db/client";

const config = loadConfig();
const { db, close } = createDatabase(config.DATABASE_URL);
const app = await buildApp({
  db,
  storefrontOrigins: config.STOREFRONT_ORIGIN.split(",").map((origin) => origin.trim()),
  cookieSecure: config.COOKIE_SECURE,
  logger: true,
});

app.addHook("onClose", async () => close());
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void app.close().then(() => process.exit(0)));
}

await app.listen({ port: config.PORT, host: config.HOST });
