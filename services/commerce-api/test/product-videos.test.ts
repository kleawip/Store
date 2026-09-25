import { AdminProductVideo, MediaAsset, Problem, ProductDetail, VideoAsset } from "@kleawip/contract";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { products } from "../src/db/schema";
import { seedDemoCatalogue } from "../src/db/seed-demo";
import { parseInstagramUrl, sniffVideo } from "../src/media/video";
import { createStaff, createTestApp, resetStaffAndAudit, signIn, uploadImage } from "./helpers";

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let owner: Awaited<ReturnType<typeof signIn>>;
let productId: string;
let seed = 0;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await resetStaffAndAudit(ctx.db);
  await seedDemoCatalogue(ctx.db);
  await createStaff(ctx.db, "owner");
  owner = await signIn(ctx.app, "owner@kleawip.test");
  productId = (await ctx.db.select({ id: products.id }).from(products).where(eq(products.slug, "twisted-loop-1200")))[0]!.id;
});

const problem = (res: { json: () => unknown }) => Problem.parse(res.json());

/** Builds an ISO-BMFF box: [size][type][payload]. */
function box(type: string, ...parts: Buffer[]) {
  const payload = Buffer.concat(parts);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + payload.length, 0);
  header.write(type, 4, "latin1");
  return Buffer.concat([header, payload]);
}

/** A track whose sample description names `codec` (e.g. avc1, mp4a, hvc1). */
function track(codec: string) {
  const entry = Buffer.alloc(16);
  entry.writeUInt32BE(16, 0);
  entry.write(codec, 4, "latin1");
  const stsd = box("stsd", Buffer.from([0, 0, 0, 0, 0, 0, 0, 1]), entry);
  return box("trak", box("mdia", box("minf", box("stbl", stsd))));
}

/** A small but structurally real MP4: ftyp + moov with the given tracks + filler "mdat". */
function fakeMp4(size = 4096, codecs: string[] = ["avc1", "mp4a"]) {
  seed++;
  const ftyp = box("ftyp", Buffer.from("isom"), Buffer.alloc(4), Buffer.from("isomavc1"));
  const moov = box("moov", ...codecs.map(track));
  const fill = Math.max(8, size - ftyp.length - moov.length - 8);
  return Buffer.concat([ftyp, moov, box("mdat", Buffer.alloc(fill, seed % 255))]);
}

async function uploadVideo(buffer: Buffer, filename = "reel.mp4") {
  const boundary = "----kleawipvideo";
  return ctx.app.inject({
    method: "POST",
    url: "/v1/admin/media/videos",
    cookies: { klw_admin: owner.cookie.value },
    headers: { "content-type": `multipart/form-data; boundary=${boundary}`, "x-csrf-token": owner.session.csrfToken },
    payload: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  });
}

async function poster() {
  seed++;
  const image = await sharp({ create: { width: 720, height: 1280, channels: 3, background: { r: seed % 255, g: 100, b: 150 } } }).jpeg().toBuffer();
  return MediaAsset.parse((await uploadImage(ctx.app, owner, image, "poster.jpg", "Folded towel")).json());
}

const detail = async () => ProductDetail.parse((await ctx.app.inject({ method: "GET", url: "/v1/store/products/twisted-loop-1200" })).json());

describe("video file checks", () => {
  it("recognises MP4 and WebM by their bytes and rejects everything else with a clear reason", () => {
    expect(sniffVideo(fakeMp4())).toEqual({ mimeType: "video/mp4", ext: "mp4" });
    expect(sniffVideo(fakeMp4(4096, ["avc1"]))).toEqual({ mimeType: "video/mp4", ext: "mp4" }); // no audio is fine
    expect(() => sniffVideo(fakeMp4(4096, ["hvc1", "mp4a"]))).toThrow(/HEVC/);
    expect(() => sniffVideo(fakeMp4(4096, ["mp4v"]))).toThrow(/Unsupported video codec/);
    expect(() => sniffVideo(fakeMp4(4096, []))).toThrow(/couldn't read/);
    const webm = (codecs: string) => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from(`....B\x82\x84webm....${codecs}`), Buffer.alloc(100)]);
    expect(sniffVideo(webm("V_VP9 A_OPUS"))).toEqual({ mimeType: "video/webm", ext: "webm" });
    expect(() => sniffVideo(webm("V_VP9 A_AAC"))).toThrow(/Unsupported WebM/);
    const mov = fakeMp4();
    mov.write("qt  ", 8, "latin1"); // major brand follows the 8-byte box header
    expect(() => sniffVideo(mov)).toThrow(/QuickTime/);
    expect(() => sniffVideo(Buffer.from("not a video at all"))).toThrow(/MP4/);
    expect(() => sniffVideo(Buffer.alloc(0))).toThrow(/empty/);
  });

  it("accepts only instagram.com post/reel permalinks and normalises them", () => {
    expect(parseInstagramUrl("https://www.instagram.com/reel/DY96no4NaFh/?igsh=abc")).toEqual({ permalink: "https://www.instagram.com/reel/DY96no4NaFh/", shortcode: "DY96no4NaFh" });
    expect(parseInstagramUrl("https://instagram.com/kleawip/reel/DY96no4NaFh")).toMatchObject({ permalink: "https://www.instagram.com/reel/DY96no4NaFh/" });
    expect(parseInstagramUrl("https://www.instagram.com/p/C1abcDEF/")).toMatchObject({ permalink: "https://www.instagram.com/p/C1abcDEF/" });
    for (const bad of ["http://www.instagram.com/reel/DY96no4NaFh/", "https://scontent.cdninstagram.com/v/t50/video.mp4", "https://evil.com/reel/DY96no4NaFh/", "https://www.instagram.com/kleawip/", "not a url"]) {
      expect(parseInstagramUrl(bad), bad).toBeNull();
    }
  });
});

describe("uploaded product video", () => {
  it("uploads, publishes with a poster and caption, and appears on the product page", async () => {
    const upload = await uploadVideo(fakeMp4());
    expect(upload.statusCode, upload.body).toBe(201);
    const video = VideoAsset.parse(upload.json());
    expect(video).toMatchObject({ mimeType: "video/mp4", usedBy: [] });
    expect(video.url).toMatch(/\/videos\/[0-9a-f]{2}\/[0-9a-f]{64}\.mp4$/);

    const created = AdminProductVideo.parse((await owner.request("POST", `/v1/admin/products/${productId}/videos`, { sourceType: "upload", videoAssetId: video.id })).json());
    expect(created.publishChecklist.filter((c) => !c.ok).map((c) => c.code)).toEqual(["caption", "poster_image"]);
    expect(problem(await owner.request("POST", `/v1/admin/products/${productId}/videos/${created.id}/publish`)).code).toBe("PUBLISH_BLOCKED");

    const image = await poster();
    await owner.request("PATCH", `/v1/admin/products/${productId}/videos/${created.id}`, { posterAssetId: image.id, caption: "Drying a car with the 1200 GSM towel" });
    expect(AdminProductVideo.parse((await owner.request("POST", `/v1/admin/products/${productId}/videos/${created.id}/publish`)).json()).status).toBe("published");

    const page = await detail();
    expect(page.videos).toEqual([{
      id: created.id,
      caption: "Drying a car with the 1200 GSM towel",
      source: "upload",
      instagramUrl: null,
      playback: { kind: "hosted", url: video.url, mimeType: "video/mp4", poster: { url: image.url, width: 720, height: 1280 } },
    }]);
    // The poster and the video now count as "in use".
    expect(MediaAsset.parse((await owner.request("GET", `/v1/admin/media/${image.id}`)).json()).usedBy[0]).toMatchObject({ type: "product" });
    expect(problem(await owner.request("DELETE", `/v1/admin/media/videos/${video.id}`)).errors![0]!.code).toBe("in_use");
  });

  it("serves the file with byte ranges so browsers can seek", async () => {
    const buffer = fakeMp4(10_000);
    const video = VideoAsset.parse((await uploadVideo(buffer)).json());
    const path = `/media/${video.url.split("/media/")[1]}`;
    const whole = await ctx.app.inject({ method: "GET", url: path });
    expect(whole.statusCode).toBe(200);
    expect(whole.headers).toMatchObject({ "content-type": "video/mp4", "accept-ranges": "bytes", "content-length": "10000" });

    const part = await ctx.app.inject({ method: "GET", url: path, headers: { range: "bytes=100-199" } });
    expect(part.statusCode).toBe(206);
    expect(part.headers["content-range"]).toBe("bytes 100-199/10000");
    expect(part.rawPayload.equals(buffer.subarray(100, 200))).toBe(true);

    const tail = await ctx.app.inject({ method: "GET", url: path, headers: { range: "bytes=-50" } });
    expect(tail.headers["content-range"]).toBe("bytes 9950-9999/10000");
    expect((await ctx.app.inject({ method: "GET", url: path, headers: { range: "bytes=20000-" } })).statusCode).toBe(416);
  });

  it("rejects QuickTime and non-video uploads", async () => {
    const mov = fakeMp4();
    mov.write("qt  ", 8, "latin1");
    expect(problem(await uploadVideo(mov, "clip.mov")).errors![0]!.code).toBe("quicktime");
    expect(problem(await uploadVideo(fakeMp4(4096, ["hvc1"]), "iphone.mp4")).errors![0]!.code).toBe("hevc");
    expect(problem(await uploadVideo(Buffer.from("hello"), "fake.mp4")).errors![0]!.code).toBe("unsupported_type");
  });
});

describe("Instagram product video", () => {
  it("needs a valid permalink and a staff rights confirmation before it can be published as an embed", async () => {
    const bad = await owner.request("POST", `/v1/admin/products/${productId}/videos`, { sourceType: "instagram", playback: "embed", instagramUrl: "https://scontent.cdninstagram.com/v/abc.mp4" });
    expect(problem(bad).errors![0]).toMatchObject({ path: "instagramUrl", code: "invalid" });

    const created = AdminProductVideo.parse((await owner.request("POST", `/v1/admin/products/${productId}/videos`, {
      sourceType: "instagram", playback: "embed", instagramUrl: "https://www.instagram.com/reel/DY96no4NaFh/?igsh=x", caption: "1200 GSM Twisted Loop in action",
    })).json());
    expect(created.instagramUrl).toBe("https://www.instagram.com/reel/DY96no4NaFh/");
    expect(created.publishChecklist.filter((c) => !c.ok).map((c) => c.code)).toEqual(["embed_verified", "rights_confirmed"]);
    // The owner confirms embeds play on the production domain.
    expect((await owner.request("PATCH", "/v1/admin/settings", { instagramEmbedsVerified: true })).json()).toEqual({ instagramEmbedsVerified: true });

    const confirmed = AdminProductVideo.parse((await owner.request("PATCH", `/v1/admin/products/${productId}/videos/${created.id}`, { rightsConfirmed: true })).json());
    expect(confirmed.rightsConfirmed).toMatchObject({ byName: "Test owner" });
    await owner.request("POST", `/v1/admin/products/${productId}/videos/${created.id}/publish`);
    expect((await detail()).videos).toEqual([expect.objectContaining({ source: "instagram", playback: { kind: "instagram_embed", permalink: "https://www.instagram.com/reel/DY96no4NaFh/", poster: null } })]);
  });

  it("keeps embeds unpublishable until the owner verifies them on the live domain", async () => {
    const created = AdminProductVideo.parse((await owner.request("POST", `/v1/admin/products/${productId}/videos`, {
      sourceType: "instagram", playback: "embed", instagramUrl: "https://www.instagram.com/reel/DY96no4NaFh/", caption: "Reel", rightsConfirmed: true,
    })).json());
    const blocked = await owner.request("POST", `/v1/admin/products/${productId}/videos/${created.id}/publish`);
    expect(problem(blocked).errors!.map((e) => e.code)).toEqual(["embed_verified"]);
    expect((await detail()).videos).toEqual([]);
    await createStaff(ctx.db, "catalogue_manager");
    const manager = await signIn(ctx.app, "catalogue_manager@kleawip.test");
    expect((await manager.request("PATCH", "/v1/admin/settings", { instagramEmbedsVerified: true })).statusCode).toBe(403);
  });

  it("changing the linked post clears the rights confirmation and takes a published video down", async () => {
    await owner.request("PATCH", "/v1/admin/settings", { instagramEmbedsVerified: true });
    const created = AdminProductVideo.parse((await owner.request("POST", `/v1/admin/products/${productId}/videos`, {
      sourceType: "instagram", playback: "embed", instagramUrl: "https://www.instagram.com/reel/DY96no4NaFh/", caption: "Reel", rightsConfirmed: true,
    })).json());
    await owner.request("POST", `/v1/admin/products/${productId}/videos/${created.id}/publish`);
    const changed = AdminProductVideo.parse((await owner.request("PATCH", `/v1/admin/products/${productId}/videos/${created.id}`, { instagramUrl: "https://www.instagram.com/reel/Other12345/" })).json());
    expect(changed).toMatchObject({ rightsConfirmed: null, status: "draft" });
    expect((await detail()).videos).toEqual([]);
  });

  it("hosted Instagram videos need the uploaded file and poster too", async () => {
    const created = AdminProductVideo.parse((await owner.request("POST", `/v1/admin/products/${productId}/videos`, {
      sourceType: "instagram", playback: "hosted", instagramUrl: "https://www.instagram.com/reel/DY96no4NaFh/", caption: "Reel", rightsConfirmed: true,
    })).json());
    expect(created.publishChecklist.filter((c) => !c.ok).map((c) => c.code)).toEqual(["video_file", "poster_image"]);
  });
});

describe("rules", () => {
  it("keeps uploads free of Instagram links, orders videos, and hides drafts from customers", async () => {
    expect(problem(await owner.request("POST", `/v1/admin/products/${productId}/videos`, { sourceType: "upload", instagramUrl: "https://www.instagram.com/reel/DY96no4NaFh/" })).errors![0]!.code).toBe("invalid_combination");
    const a = AdminProductVideo.parse((await owner.request("POST", `/v1/admin/products/${productId}/videos`, { sourceType: "upload", caption: "First" })).json());
    const b = AdminProductVideo.parse((await owner.request("POST", `/v1/admin/products/${productId}/videos`, { sourceType: "upload", caption: "Second" })).json());
    const reordered = (await owner.request("PUT", `/v1/admin/products/${productId}/videos/order`, { videoIds: [b.id, a.id] })).json();
    expect(reordered.data.map((v: { caption: string }) => v.caption)).toEqual(["Second", "First"]);
    expect((await detail()).videos).toEqual([]);
  });

  it("only catalogue roles manage videos; only publishers publish", async () => {
    await createStaff(ctx.db, "operations");
    const operations = await signIn(ctx.app, "operations@kleawip.test");
    expect((await operations.request("POST", `/v1/admin/products/${productId}/videos`, { sourceType: "upload" })).statusCode).toBe(403);
  });
});
