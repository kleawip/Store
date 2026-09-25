// Builds DEMO homepage banner images from real Kleawip product photos on the live site (kleawip.com).
// No generated imagery: each banner is the untouched product photo placed on one side, over a blurred,
// darkened copy of the same photo that leaves space for HTML headline text. Final campaign art needs
// Kleawip approval (HOMEPAGE_CAMPAIGNS_SPEC "Still awaiting approval").
//
//   npx tsx scripts/build-demo-campaign-images.ts     (writes database/seeds/demo/campaigns/*.jpg)
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SOURCE_BASE = "https://kleawip.com/wp-content/uploads/2026/03/";
const OUT = fileURLToPath(new URL("../../../database/seeds/demo/campaigns/", import.meta.url));

export const DEMO_BANNER_SOURCES = {
  automotive: "1200gsm-2-colors.png",
  bath: "Bath-Towels-Category-Image.png",
  mitts: "Stacked-Kleawip-Glove.png",
} as const;

const DEVICES = {
  desktop: { width: 1920, height: 680 },
  tablet: { width: 1200, height: 700 },
  mobile: { width: 750, height: 900 },
} as const;

async function download(filename: string) {
  const response = await fetch(SOURCE_BASE + encodeURIComponent(filename), { headers: { "user-agent": "Kleawip-build/1.0" } });
  if (!response.ok) throw new Error(`Download failed for ${filename}: ${response.status}`);
  return sharp(Buffer.from(await response.arrayBuffer())).flatten({ background: "#1c1d21" }).toBuffer();
}

async function banner(photo: Buffer, device: keyof typeof DEVICES) {
  const { width, height } = DEVICES[device];
  const backdrop = await sharp(photo)
    .resize(width, height, { fit: "cover" })
    .blur(90)
    .modulate({ brightness: 0.55, saturation: 0.8 })
    .toBuffer();

  if (device === "mobile") {
    // Photo across the lower part, text space above.
    const size = width;
    const product = await sharp(photo).resize(size, size, { fit: "cover" }).toBuffer();
    return sharp(backdrop).composite([{ input: product, left: 0, top: height - size }]).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  }

  // Photo on the right with a soft left edge, text space on the left.
  const size = height;
  const fade = Math.round(size * 0.35);
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="0">` +
      `<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="${fade / size}" stop-color="#fff" stop-opacity="1"/>` +
      `</linearGradient></defs><rect width="${size}" height="${size}" fill="url(#g)"/></svg>`,
  );
  const product = await sharp(photo)
    .resize(size, size, { fit: "cover" })
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
  return sharp(backdrop).composite([{ input: product, left: width - size, top: 0 }]).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
}

await mkdir(OUT, { recursive: true });
for (const [campaign, source] of Object.entries(DEMO_BANNER_SOURCES)) {
  const photo = await download(source);
  for (const device of Object.keys(DEVICES) as (keyof typeof DEVICES)[]) {
    const file = `${campaign}-${device}.jpg`;
    await writeFile(OUT + file, await banner(photo, device));
    console.log(`${file}  (from kleawip.com/${source})`);
  }
}
