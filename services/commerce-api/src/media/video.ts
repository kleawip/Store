// Product videos: uploaded files are checked by their own bytes (never the file name or browser type).
// We don't transcode, so we only accept codecs every modern browser plays: MP4 with H.264 (+AAC) and WebM
// with VP8/VP9/AV1 (+Opus/Vorbis). Codecs are read from the file's own track headers.
import { createHash } from "node:crypto";
import { ApiError } from "../errors";

export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

const rejected = (code: string, message: string) =>
  new ApiError(422, "VALIDATION_FAILED", "Validation failed", message, [{ path: "file", code, message }]);

/** Walks ISO-BMFF boxes (moov → trak → mdia → minf → stbl → stsd) and returns each track's sample-entry codec. */
export function mp4Codecs(buffer: Buffer): string[] {
  const codecs: string[] = [];
  const containers = new Set(["moov", "trak", "mdia", "minf", "stbl"]);
  const walk = (start: number, end: number, depth: number) => {
    let offset = start;
    while (offset + 8 <= end && depth < 8) {
      let size = buffer.readUInt32BE(offset);
      const type = buffer.toString("latin1", offset + 4, offset + 8);
      let header = 8;
      if (size === 1) {
        if (offset + 16 > end) return;
        size = Number(buffer.readBigUInt64BE(offset + 8));
        header = 16;
      } else if (size === 0) {
        size = end - offset;
      }
      if (size < header || offset + size > end) return;
      if (containers.has(type)) walk(offset + header, offset + size, depth + 1);
      else if (type === "stsd" && offset + header + 16 <= offset + size) {
        // Full box: version+flags (4), entry_count (4), then sample entries [size(4)][format(4)]…
        codecs.push(buffer.toString("latin1", offset + header + 12, offset + header + 16));
      }
      offset += size;
    }
  };
  walk(0, buffer.length, 0);
  return codecs;
}

const MP4_VIDEO = new Set(["avc1", "avc3"]);
const MP4_AUDIO = new Set(["mp4a"]);
const WEBM_VIDEO = ["V_VP8", "V_VP9", "V_AV1"];
const WEBM_AUDIO = ["A_OPUS", "A_VORBIS"];

/**
 * Returns the container type or throws a field error. Checks the codecs too, because a container that plays
 * in one browser can fail in another: MP4 must be H.264 video (+ optional AAC audio); WebM VP8/VP9/AV1 video
 * (+ optional Opus/Vorbis audio). HEVC/H.265 is refused: Chrome and Firefox don't reliably play it.
 */
export function sniffVideo(buffer: Buffer): { mimeType: "video/mp4" | "video/webm"; ext: "mp4" | "webm" } {
  if (buffer.length === 0) throw rejected("empty_file", "The file is empty.");
  if (buffer.length > MAX_VIDEO_BYTES) throw rejected("too_large", "Videos must be 100 MB or smaller.");
  // ISO base media: [size:4]["ftyp"][major brand:4]…
  if (buffer.length >= 12 && buffer.toString("latin1", 4, 8) === "ftyp") {
    const brand = buffer.toString("latin1", 8, 12);
    if (brand === "qt  ") throw rejected("quicktime", "This is a QuickTime (.mov) file. Export it as MP4 (H.264) first.");
    const codecs = mp4Codecs(buffer);
    if (!codecs.length) throw rejected("unreadable_video", "We couldn't read the video tracks. Re-export it as MP4 (H.264, AAC audio).");
    const video = codecs.filter((codec) => !MP4_AUDIO.has(codec));
    if (codecs.some((codec) => codec === "hvc1" || codec === "hev1")) throw rejected("hevc", "This video is HEVC (H.265), which many browsers can't play. Export it as H.264.");
    if (!video.length || !video.every((codec) => MP4_VIDEO.has(codec))) {
      throw rejected("unsupported_codec", `Unsupported video codec (${codecs.join(", ")}). Export as MP4 with H.264 video and AAC audio.`);
    }
    return { mimeType: "video/mp4", ext: "mp4" };
  }
  // Matroska/WebM: EBML magic 1A 45 DF A3 with DocType "webm"; CodecID strings sit in the track headers.
  if (buffer.length >= 4 && buffer.readUInt32BE(0) === 0x1a45dfa3) {
    if (!buffer.subarray(0, 64).includes(Buffer.from("webm"))) throw rejected("unsupported_type", "Matroska (.mkv) isn't supported. Upload MP4 or WebM.");
    const head = buffer.subarray(0, Math.min(buffer.length, 256 * 1024)).toString("latin1");
    const codecIds = [...head.matchAll(/[VA]_[A-Z0-9/]+/g)].map((m) => m[0]);
    const hasVideo = codecIds.some((id) => WEBM_VIDEO.some((ok) => id.startsWith(ok)));
    const badAudio = codecIds.filter((id) => id.startsWith("A_") && !WEBM_AUDIO.includes(id));
    if (!hasVideo || badAudio.length) throw rejected("unsupported_codec", "Unsupported WebM codecs. Use VP9 (or VP8/AV1) video with Opus audio, or export as MP4 (H.264).");
    return { mimeType: "video/webm", ext: "webm" };
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
