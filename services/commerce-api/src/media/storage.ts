import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { Readable } from "node:stream";

/**
 * Where uploaded files live. The provider (S3, R2, …) is a Phase 0 decision, so the rest of the
 * backend only talks to this interface. Keys are content-addressed and never reused.
 */
export interface MediaStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  remove(key: string): Promise<void>;
  publicUrl(key: string): string;
  /** Only the local development store serves files itself; cloud stores return null. */
  read?(key: string): Promise<{ stream: Readable; size: number } | null>;
}

export const STORAGE_KEY = /^(media|originals)\/[0-9a-f]{2}\/[0-9a-f]{64}\.(webp|jpg|png)$/;

/** Development storage on local disk, served by the API under /media/. Not for production. */
export class LocalDiskStorage implements MediaStorage {
  private readonly root: string;

  constructor(root: string, private readonly publicBaseUrl: string) {
    this.root = resolve(root);
  }

  private pathFor(key: string) {
    if (!STORAGE_KEY.test(key)) throw new Error(`Invalid storage key: ${key}`);
    const path = resolve(join(this.root, key));
    if (!path.startsWith(this.root + sep)) throw new Error(`Storage key escapes root: ${key}`);
    return path;
  }

  async put(key: string, body: Buffer) {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async remove(key: string) {
    await rm(this.pathFor(key), { force: true });
  }

  publicUrl(key: string) {
    return `${this.publicBaseUrl.replace(/\/$/, "")}/${key}`;
  }

  async read(key: string) {
    if (!STORAGE_KEY.test(key)) return null;
    const path = this.pathFor(key);
    try {
      const info = await stat(path);
      return { stream: createReadStream(path), size: info.size };
    } catch {
      return null;
    }
  }
}
