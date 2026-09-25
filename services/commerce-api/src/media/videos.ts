// Product videos: staff uploads or Kleawip's own Instagram posts. Brand content only: never reviews.
import type { AdminProductVideo, ProductDetail } from "@kleawip/contract";
import { and, asc, desc, eq, inArray, max } from "drizzle-orm";
import { recordAudit } from "../audit";
import type { Database } from "../db/client";
import { mediaAssets, products, productVideos, staffUsers, videoAssets } from "../db/schema";
import { ApiError, notFound } from "../errors";
import type { MediaStorage } from "./storage";
import { parseInstagramUrl, sha256Of, sniffVideo, videoKey } from "./video";

export const MAX_VIDEOS_PER_PRODUCT = 10;
const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const invalid = (path: string, code: string, message: string) =>
  new ApiError(422, "VALIDATION_FAILED", "Validation failed", message, [{ path, code, message }]);

// ---- Video files ----

async function videoUsage(db: Database, ids: string[]) {
  if (!ids.length) return [];
  return db
    .selectDistinct({ videoAssetId: productVideos.videoAssetId, productId: products.id, productTitle: products.title })
    .from(productVideos)
    .innerJoin(products, eq(products.id, productVideos.productId))
    .where(inArray(productVideos.videoAssetId, ids));
}

const toVideoAsset = (row: typeof videoAssets.$inferSelect, usedBy: { productId: string; productTitle: string }[]) => ({
  id: row.id,
  url: row.url,
  mimeType: row.mimeType,
  bytes: row.bytes,
  originalFilename: row.originalFilename,
  createdAt: row.createdAt.toISOString(),
  usedBy,
});

export async function uploadVideo(db: Database, storage: MediaStorage, file: { buffer: Buffer; filename: string }, actorStaffId: string) {
  const { mimeType, ext } = sniffVideo(file.buffer);
  const sha256 = sha256Of(file.buffer);
  const [existing] = await db.select().from(videoAssets).where(eq(videoAssets.sha256, sha256));
  if (existing) return { asset: toVideoAsset(existing, (await videoUsage(db, [existing.id])).map(({ productId, productTitle }) => ({ productId, productTitle }))), duplicate: true };
  const storageKey = videoKey(sha256, ext);
  await storage.put(storageKey, file.buffer, mimeType);
  const [row] = await db
    .insert(videoAssets)
    .values({ storageKey, url: storage.publicUrl(storageKey), mimeType, bytes: file.buffer.length, sha256, originalFilename: file.filename.slice(0, 200), uploadedByStaffId: actorStaffId })
    .onConflictDoNothing()
    .returning();
  const asset = row ?? (await db.select().from(videoAssets).where(eq(videoAssets.sha256, sha256)))[0]!;
  return { asset: toVideoAsset(asset, []), duplicate: !row };
}

export async function listVideoAssets(db: Database) {
  const rows = await db.select().from(videoAssets).orderBy(desc(videoAssets.createdAt)).limit(200);
  const usage = await videoUsage(db, rows.map((row) => row.id));
  return rows.map((row) => toVideoAsset(row, usage.filter((u) => u.videoAssetId === row.id).map(({ productId, productTitle }) => ({ productId, productTitle }))));
}

export async function deleteVideoAsset(db: Database, storage: MediaStorage, id: string) {
  if (!isUuid(id)) throw notFound("Video not found.");
  const [row] = await db.select().from(videoAssets).where(eq(videoAssets.id, id));
  if (!row) throw notFound("Video not found.");
  const usage = await videoUsage(db, [id]);
  if (usage.length) throw invalid("id", "in_use", `This video is still used by ${usage.map((u) => `"${u.productTitle}"`).join(", ")}. Remove it there first.`);
  await db.delete(videoAssets).where(eq(videoAssets.id, id));
  await storage.remove(row.storageKey);
}

// ---- Product videos ----

type VideoRow = typeof productVideos.$inferSelect;

function checklist(row: VideoRow, hasVideo: boolean, hasPoster: boolean) {
  const needsFile = row.playback === "hosted";
  return [
    { code: "caption", ok: row.caption.trim().length >= 3, message: "Add a caption that describes the video (it's also read by screen readers)." },
    ...(needsFile
      ? [
          { code: "video_file", ok: hasVideo, message: "Upload the video file (MP4 or WebM)." },
          { code: "poster_image", ok: hasPoster, message: "Choose a poster image from the media library." },
        ]
      : []),
    ...(row.sourceType === "instagram"
      ? [{ code: "rights_confirmed", ok: !!row.rightsConfirmedAt, message: "Confirm this Instagram post is Kleawip's own content." }]
      : []),
  ];
}

async function views(db: Database, rows: VideoRow[]): Promise<AdminProductVideo[]> {
  const videoIds = rows.map((r) => r.videoAssetId).filter((id): id is string => !!id);
  const posterIds = rows.map((r) => r.posterAssetId).filter((id): id is string => !!id);
  const staffIds = rows.map((r) => r.rightsConfirmedByStaffId).filter((id): id is string => !!id);
  const [videos, posters, staff] = await Promise.all([
    videoIds.length ? db.select().from(videoAssets).where(inArray(videoAssets.id, videoIds)) : Promise.resolve([]),
    posterIds.length ? db.select().from(mediaAssets).where(inArray(mediaAssets.id, posterIds)) : Promise.resolve([]),
    staffIds.length ? db.select({ id: staffUsers.id, name: staffUsers.name }).from(staffUsers).where(inArray(staffUsers.id, staffIds)) : Promise.resolve([]),
  ]);
  return rows.map((row) => {
    const video = videos.find((v) => v.id === row.videoAssetId);
    const poster = posters.find((p) => p.id === row.posterAssetId);
    return {
      id: row.id,
      sourceType: row.sourceType,
      playback: row.playback,
      video: video ? { id: video.id, url: video.url, mimeType: video.mimeType } : null,
      poster: poster ? { id: poster.id, url: poster.url, width: poster.width, height: poster.height } : null,
      instagramUrl: row.instagramUrl,
      caption: row.caption,
      rightsConfirmed: row.rightsConfirmedAt ? { at: row.rightsConfirmedAt.toISOString(), byName: staff.find((s) => s.id === row.rightsConfirmedByStaffId)?.name ?? null } : null,
      status: row.status,
      position: row.position,
      publishChecklist: checklist(row, !!video, !!poster),
    };
  });
}

async function requireProduct(db: Database, productId: string) {
  if (!isUuid(productId)) throw notFound("Product not found.");
  const [row] = await db.select({ id: products.id }).from(products).where(eq(products.id, productId));
  if (!row) throw notFound("Product not found.");
}

async function videoRow(db: Database, productId: string, videoId: string) {
  if (!isUuid(videoId)) throw notFound("Video not found.");
  const [row] = await db.select().from(productVideos).where(and(eq(productVideos.id, videoId), eq(productVideos.productId, productId)));
  if (!row) throw notFound("Video not found.");
  return row;
}

async function checkReferences(db: Database, input: { videoAssetId?: string | null; posterAssetId?: string | null }) {
  if (input.videoAssetId) {
    const [video] = await db.select({ id: videoAssets.id }).from(videoAssets).where(eq(videoAssets.id, input.videoAssetId));
    if (!video) throw invalid("videoAssetId", "unknown", "That video isn't in the library.");
  }
  if (input.posterAssetId) {
    const [poster] = await db.select({ id: mediaAssets.id }).from(mediaAssets).where(eq(mediaAssets.id, input.posterAssetId));
    if (!poster) throw invalid("posterAssetId", "unknown", "That image isn't in the media library.");
  }
}

function normaliseInstagram(url: string | null | undefined) {
  if (url === null || url === undefined) return url;
  const parsed = parseInstagramUrl(url);
  if (!parsed) throw invalid("instagramUrl", "invalid", "Paste the Instagram post or reel link, e.g. https://www.instagram.com/reel/ABC123/.");
  return parsed.permalink;
}

export async function listProductVideos(db: Database, productId: string) {
  await requireProduct(db, productId);
  return views(db, await db.select().from(productVideos).where(eq(productVideos.productId, productId)).orderBy(asc(productVideos.position)));
}

export async function createProductVideo(
  db: Database,
  productId: string,
  input: { sourceType: "upload" | "instagram"; playback: "hosted" | "embed"; videoAssetId: string | null; posterAssetId: string | null; instagramUrl: string | null; caption: string; rightsConfirmed: boolean },
  actorStaffId: string,
) {
  await requireProduct(db, productId);
  if (input.sourceType === "upload" && (input.instagramUrl || input.playback !== "hosted")) {
    throw invalid("sourceType", "invalid_combination", "Uploaded videos are played from our own storage and have no Instagram link.");
  }
  const instagramUrl = input.sourceType === "instagram" ? normaliseInstagram(input.instagramUrl ?? "") : null;
  await checkReferences(db, input);
  const existing = await db.select({ id: productVideos.id }).from(productVideos).where(eq(productVideos.productId, productId));
  if (existing.length >= MAX_VIDEOS_PER_PRODUCT) throw invalid("videos", "too_many", `A product can have up to ${MAX_VIDEOS_PER_PRODUCT} videos.`);

  return db.transaction(async (tx) => {
    const [{ value: last } = { value: null }] = await tx.select({ value: max(productVideos.position) }).from(productVideos).where(eq(productVideos.productId, productId));
    const [row] = await tx
      .insert(productVideos)
      .values({
        productId,
        sourceType: input.sourceType,
        playback: input.playback,
        videoAssetId: input.videoAssetId,
        posterAssetId: input.posterAssetId,
        instagramUrl,
        caption: input.caption,
        ...(input.sourceType === "instagram" && input.rightsConfirmed ? { rightsConfirmedAt: new Date(), rightsConfirmedByStaffId: actorStaffId } : {}),
        position: (last ?? -1) + 1,
      })
      .returning();
    await recordAudit(tx, { entityType: "product", entityId: productId, action: "video.added", actorStaffId, after: { videoId: row!.id, sourceType: input.sourceType, instagramUrl } });
    return (await views(db, [row!]))[0]!;
  });
}

export async function updateProductVideo(
  db: Database,
  productId: string,
  videoId: string,
  patch: { playback?: "hosted" | "embed"; videoAssetId?: string | null; posterAssetId?: string | null; instagramUrl?: string | null; caption?: string; rightsConfirmed?: boolean },
  actorStaffId: string,
) {
  const current = await videoRow(db, productId, videoId);
  if (current.sourceType === "upload" && ((patch.instagramUrl ?? null) !== null || (patch.playback && patch.playback !== "hosted"))) {
    throw invalid("sourceType", "invalid_combination", "Uploaded videos are played from our own storage and have no Instagram link.");
  }
  if (current.sourceType === "instagram" && patch.instagramUrl === null) throw invalid("instagramUrl", "required", "An Instagram video needs its post link.");
  await checkReferences(db, patch);
  const { rightsConfirmed, instagramUrl, ...rest } = patch;
  const changes = {
    ...rest,
    ...(instagramUrl !== undefined ? { instagramUrl: normaliseInstagram(instagramUrl) } : {}),
    // Changing the linked post invalidates an earlier rights confirmation.
    ...(instagramUrl !== undefined && normaliseInstagram(instagramUrl) !== current.instagramUrl && rightsConfirmed === undefined ? { rightsConfirmedAt: null, rightsConfirmedByStaffId: null } : {}),
    ...(rightsConfirmed === true && current.sourceType === "instagram" ? { rightsConfirmedAt: new Date(), rightsConfirmedByStaffId: actorStaffId } : {}),
    ...(rightsConfirmed === false ? { rightsConfirmedAt: null, rightsConfirmedByStaffId: null } : {}),
  };
  await db.transaction(async (tx) => {
    const [row] = await tx.update(productVideos).set({ ...changes, updatedAt: new Date() }).where(eq(productVideos.id, videoId)).returning();
    // A published video that no longer meets the rules is taken down rather than shown broken.
    if (row!.status === "published") {
      const [view] = await views(db, [row!]);
      if (view!.publishChecklist.some((check) => !check.ok)) await tx.update(productVideos).set({ status: "draft" }).where(eq(productVideos.id, videoId));
    }
    await recordAudit(tx, { entityType: "product", entityId: productId, action: "video.updated", actorStaffId, after: { videoId, ...patch } });
  });
  return (await views(db, [await videoRow(db, productId, videoId)]))[0]!;
}

export async function setProductVideoStatus(db: Database, productId: string, videoId: string, status: "published" | "draft", actorStaffId: string) {
  const current = await videoRow(db, productId, videoId);
  if (status === "published") {
    const [view] = await views(db, [current]);
    const blocking = view!.publishChecklist.filter((check) => !check.ok);
    if (blocking.length) {
      throw new ApiError(422, "PUBLISH_BLOCKED", "Cannot publish yet", `${blocking.length} item(s) must be fixed first.`, blocking.map((check) => ({ path: `publishChecklist.${check.code}`, code: check.code, message: check.message })));
    }
  }
  await db.transaction(async (tx) => {
    await tx.update(productVideos).set({ status, updatedAt: new Date() }).where(eq(productVideos.id, videoId));
    await recordAudit(tx, { entityType: "product", entityId: productId, action: `video.${status}`, actorStaffId, after: { videoId } });
  });
  return (await views(db, [await videoRow(db, productId, videoId)]))[0]!;
}

export async function deleteProductVideo(db: Database, productId: string, videoId: string, actorStaffId: string) {
  await videoRow(db, productId, videoId);
  await db.transaction(async (tx) => {
    await tx.delete(productVideos).where(eq(productVideos.id, videoId));
    await recordAudit(tx, { entityType: "product", entityId: productId, action: "video.removed", actorStaffId, after: { videoId } });
  });
}

export async function reorderProductVideos(db: Database, productId: string, videoIds: string[], actorStaffId: string) {
  await requireProduct(db, productId);
  const current = await db.select({ id: productVideos.id }).from(productVideos).where(eq(productVideos.productId, productId));
  const same = current.length === videoIds.length && new Set(videoIds).size === videoIds.length && current.every((row) => videoIds.includes(row.id));
  if (!same) throw invalid("videoIds", "mismatch", "Send every video of this product exactly once.");
  await db.transaction(async (tx) => {
    for (const [position, id] of videoIds.entries()) await tx.update(productVideos).set({ position }).where(eq(productVideos.id, id));
    await recordAudit(tx, { entityType: "product", entityId: productId, action: "video.reordered", actorStaffId, after: { videoIds } });
  });
  return listProductVideos(db, productId);
}

/** Published videos for the storefront product page, in order. Anything incomplete is left out. */
export async function storefrontVideos(db: Database, productId: string): Promise<ProductDetail["videos"]> {
  const rows = await db.select().from(productVideos).where(and(eq(productVideos.productId, productId), eq(productVideos.status, "published"))).orderBy(asc(productVideos.position));
  const result: ProductDetail["videos"] = [];
  for (const video of await views(db, rows)) {
    if (video.publishChecklist.some((check) => !check.ok)) continue;
    const poster = video.poster ? { url: video.poster.url, width: video.poster.width, height: video.poster.height } : null;
    const base = { id: video.id, caption: video.caption, source: video.sourceType, instagramUrl: video.instagramUrl };
    if (video.playback === "hosted") {
      if (video.video && poster) result.push({ ...base, playback: { kind: "hosted", url: video.video.url, mimeType: video.video.mimeType, poster } });
    } else if (video.instagramUrl) {
      result.push({ ...base, playback: { kind: "instagram_embed", permalink: video.instagramUrl, poster } });
    }
  }
  return result;
}
