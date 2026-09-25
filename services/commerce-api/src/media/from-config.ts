import type { Config } from "../config";
import { R2Storage } from "./r2";
import { LocalDiskStorage, type MediaStorage } from "./storage";

/** R2 when configured (always in production; loadConfig enforces it), otherwise local disk for development. */
export function storageFromConfig(config: Config): MediaStorage {
  if (config.R2_ACCOUNT_ID) {
    return new R2Storage({
      accountId: config.R2_ACCOUNT_ID,
      accessKeyId: config.R2_ACCESS_KEY_ID!,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY!,
      publicBucket: config.R2_PUBLIC_BUCKET!,
      privateBucket: config.R2_PRIVATE_BUCKET!,
      publicBaseUrl: config.R2_PUBLIC_BASE_URL!,
    });
  }
  if (config.NODE_ENV === "production") throw new Error("Refusing to store production uploads on local disk.");
  return new LocalDiskStorage(config.MEDIA_DIR, config.MEDIA_PUBLIC_BASE_URL);
}
