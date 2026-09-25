import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createDatabase } from "./db/client";
import { LocalDiskStorage } from "./media/storage";

const config = loadConfig();
const { db, close } = createDatabase(config.DATABASE_URL);
if (config.NODE_ENV === "production") {
  throw new Error("No production media storage is configured yet (Phase 0 decision); refusing to store uploads on local disk.");
}
const storage = new LocalDiskStorage(config.MEDIA_DIR, config.MEDIA_PUBLIC_BASE_URL);
const app = await buildApp({
  db,
  storage,
  storefrontOrigins: config.STOREFRONT_ORIGIN.split(",").map((origin) => origin.trim()),
  cookieSecure: config.COOKIE_SECURE,
  logger: true,
});

app.addHook("onClose", async () => close());
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void app.close().then(() => process.exit(0)));
}

await app.listen({ port: config.PORT, host: config.HOST });
