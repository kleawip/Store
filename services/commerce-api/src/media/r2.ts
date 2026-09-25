// Cloudflare R2 media storage (ADR 0002: R2, free tier, no egress fees). R2 speaks the S3 API; requests are
// signed here with AWS Signature V4 using node:crypto, so no SDK dependency is needed for put/delete/head.
// Two buckets: delivery images and videos go to the PUBLIC bucket (served by Cloudflare, with Range support for
// video seeking); untouched originals go to the PRIVATE bucket and are never publicly reachable.
import { createHash, createHmac } from "node:crypto";
import { STORAGE_KEY, type MediaStorage } from "./storage";

type Fetch = typeof fetch;

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBucket: string;
  privateBucket: string;
  /** Public address of the public bucket: its r2.dev URL now, a custom domain (e.g. https://media.kleawip.com) at launch. */
  publicBaseUrl: string;
  /** Override for tests. Default: https://<accountId>.r2.cloudflarestorage.com */
  endpoint?: string;
};

export class MediaStorageError extends Error {}

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();
// RFC 3986 encoding per path segment, as SigV4 requires.
const encodeKey = (key: string) => key.split("/").map((part) => encodeURIComponent(part).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join("/");

/** AWS Signature V4 headers for one request (region "auto", service "s3", as R2 expects). Exported for tests. */
export function signV4(input: {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: Buffer | string;
  accessKeyId: string;
  secretAccessKey: string;
  now: Date;
  region?: string;
  service?: string;
}) {
  const region = input.region ?? "auto";
  const service = input.service ?? "s3";
  const amzDate = input.now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const payloadHash = sha256(input.body);
  const headers: Record<string, string> = { ...input.headers, host: input.url.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  const names = Object.keys(headers).map((name) => name.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), String(value).trim().replace(/\s+/g, " ")]));
  const query = [...input.url.searchParams.entries()]
    .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const canonical = [input.method, input.url.pathname, query, names.map((name) => `${name}:${lower[name]}\n`).join(""), names.join(";"), payloadHash].join("\n");
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), region), service), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(toSign).digest("hex");
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`,
  };
}

export class R2Storage implements MediaStorage {
  constructor(private readonly config: R2Config, private readonly fetchImpl: Fetch = fetch) {}

  private bucketFor(key: string) {
    if (!STORAGE_KEY.test(key)) throw new MediaStorageError(`Invalid storage key: ${key}`);
    return key.startsWith("originals/") ? this.config.privateBucket : this.config.publicBucket;
  }

  private objectUrl(key: string) {
    const endpoint = (this.config.endpoint ?? `https://${this.config.accountId}.r2.cloudflarestorage.com`).replace(/\/$/, "");
    return new URL(`${endpoint}/${this.bucketFor(key)}/${encodeKey(key)}`);
  }

  private async send(method: "PUT" | "DELETE" | "HEAD", key: string, body: Buffer | string = "", extra: Record<string, string> = {}) {
    const url = this.objectUrl(key);
    const headers = signV4({ method, url, headers: extra, body, accessKeyId: this.config.accessKeyId, secretAccessKey: this.config.secretAccessKey, now: new Date() });
    delete (headers as Record<string, string>).host; // fetch sets Host itself
    try {
      return await this.fetchImpl(url, { method, headers, body: method === "PUT" ? new Uint8Array(body as Buffer) : undefined, signal: AbortSignal.timeout(60_000) });
    } catch (error) {
      throw new MediaStorageError(`R2 ${method} ${key} unreachable: ${(error as Error).message}`);
    }
  }

  async put(key: string, body: Buffer, contentType: string) {
    // Keys are content-addressed, so every file can be cached forever.
    const response = await this.send("PUT", key, body, {
      "content-type": contentType,
      "cache-control": key.startsWith("originals/") ? "private, no-store" : "public, max-age=31536000, immutable",
    });
    if (!response.ok) throw new MediaStorageError(`R2 upload failed (${response.status}): ${(await response.text().catch(() => "")).slice(0, 300)}`);
  }

  async remove(key: string) {
    const response = await this.send("DELETE", key);
    // 404 is fine: already gone.
    if (!response.ok && response.status !== 404) throw new MediaStorageError(`R2 delete failed (${response.status})`);
  }

  /** True when the object exists (used by the connection check and the sync script). */
  async exists(key: string) {
    const response = await this.send("HEAD", key);
    if (response.status === 404) return false;
    if (!response.ok) throw new MediaStorageError(`R2 check failed (${response.status})`);
    return true;
  }

  publicUrl(key: string) {
    return `${this.config.publicBaseUrl.replace(/\/$/, "")}/${key}`;
  }
}
