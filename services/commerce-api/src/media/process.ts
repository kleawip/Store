import { createHash } from "node:crypto";
import sharp from "sharp";
import { ApiError } from "../errors";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MIN_DIMENSION = 300;
const MAX_DELIVERY_EDGE = 2400;

const FORMATS = {
  jpeg: { mime: "image/jpeg", ext: "jpg" },
  png: { mime: "image/png", ext: "png" },
  webp: { mime: "image/webp", ext: "webp" },
} as const;

const rejected = (code: string, message: string) =>
  new ApiError(422, "VALIDATION_FAILED", "Validation failed", message, [{ path: "file", code, message }]);

export type ProcessedImage = {
  sha256: string;
  original: { buffer: Buffer; mime: string; ext: string };
  delivery: { buffer: Buffer; width: number; height: number };
};

/**
 * Validates an upload by decoding it (the file's own bytes decide the type, never its name or
 * the browser's content-type), then produces the delivery WebP: EXIF-rotated, metadata stripped
 * (no camera GPS leaks), longest edge at most 2400 px. The original is kept untouched.
 */
export async function processImage(buffer: Buffer): Promise<ProcessedImage> {
  if (buffer.length === 0) throw rejected("empty_file", "The file is empty.");
  if (buffer.length > MAX_UPLOAD_BYTES) throw rejected("too_large", "Images must be 15 MB or smaller.");

  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    throw rejected("unsupported_type", "Upload a JPEG, PNG or WebP image.");
  }
  const format = metadata.format && metadata.format in FORMATS ? FORMATS[metadata.format as keyof typeof FORMATS] : null;
  if (!format) throw rejected("unsupported_type", "Upload a JPEG, PNG or WebP image.");
  if ((metadata.pages ?? 1) > 1) throw rejected("animated", "Animated images are not supported.");

  const { data, info } = await sharp(buffer)
    .rotate()
    .resize({ width: MAX_DELIVERY_EDGE, height: MAX_DELIVERY_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  if (Math.min(info.width, info.height) < MIN_DIMENSION) {
    throw rejected("too_small", `Images must be at least ${MIN_DIMENSION} px on the shortest side (this one is ${info.width} × ${info.height}).`);
  }

  return {
    sha256: createHash("sha256").update(buffer).digest("hex"),
    original: { buffer, mime: format.mime, ext: format.ext },
    delivery: { buffer: data, width: info.width, height: info.height },
  };
}

export const deliveryKey = (sha256: string) => `media/${sha256.slice(0, 2)}/${sha256}.webp`;
export const originalKey = (sha256: string, ext: string) => `originals/${sha256.slice(0, 2)}/${sha256}.${ext}`;
