// Product videos: uploaded files are checked by their own bytes (never the file name or browser type).
// We don't transcode, so we only accept formats every modern browser plays: MP4 (H.264/AAC) and WebM.
import { createHash } from "node:crypto";
import { ApiError } from "../errors";

export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

const rejected = (code: string, message: string) =>
  new ApiError(422, "VALIDATION_FAILED", "Validation failed", message, [{ path: "file", code, message }]);

/** Returns the container type or throws a field error. */
export function sniffVideo(buffer: Buffer): { mimeType: "video/mp4" | "video/webm"; ext: "mp4" | "webm" } {
  if (buffer.length === 0) throw rejected("empty_file", "The file is empty.");
  if (buffer.length > MAX_VIDEO_BYTES) throw rejected("too_large", "Videos must be 100 MB or smaller.");
  // ISO base media: [size:4]["ftyp"][major brand:4]…
  if (buffer.length >= 12 && buffer.toString("latin1", 4, 8) === "ftyp") {
    const brand = buffer.toString("latin1", 8, 12);
    if (brand === "qt  ") throw rejected("quicktime", "This is a QuickTime (.mov) file. Export it as MP4 (H.264) first.");
    return { mimeType: "video/mp4", ext: "mp4" };
  }
  // Matroska/WebM: EBML magic 1A 45 DF A3 with DocType "webm" in the header.
  if (buffer.length >= 4 && buffer.readUInt32BE(0) === 0x1a45dfa3) {
    if (buffer.subarray(0, 64).includes(Buffer.from("webm"))) return { mimeType: "video/webm", ext: "webm" };
    throw rejected("unsupported_type", "Matroska (.mkv) isn't supported. Upload MP4 or WebM.");
  }
  throw rejected("unsupported_type", "Upload an MP4 (H.264) or WebM video.");
}

export const videoKey = (sha256: string, ext: string) => `videos/${sha256.slice(0, 2)}/${sha256}.${ext}`;
export const sha256Of = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");

/**
 * Normalises an Instagram post or reel link to its canonical permalink. Only instagram.com permalinks are
 * accepted: never CDN media URLs (they expire and aren't ours to hotlink).
 */
export function parseInstagramUrl(raw: string): { permalink: string; shortcode: string } | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !/^(www\.)?instagram\.com$/i.test(url.hostname)) return null;
  const match = /^\/(?:[A-Za-z0-9._]+\/)?(reel|reels|p|tv)\/([A-Za-z0-9_-]{5,40})\/?$/.exec(url.pathname);
  if (!match) return null;
  const kind = match[1] === "p" ? "p" : "reel";
  return { permalink: `https://www.instagram.com/${kind}/${match[2]}/`, shortcode: match[2]! };
}
