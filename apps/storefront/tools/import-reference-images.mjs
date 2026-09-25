import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const products = JSON.parse(await fs.readFile(path.join(root, "src/data/catalogue.json"), "utf8"));
const destination = path.join(root, "public/products");
await fs.mkdir(destination, { recursive: true });

for (const product of products) {
  for (const [index, filename] of product.images.entries()) {
    const output = path.join(destination, `${product.id}-${index + 1}.webp`);
    const response = await fetch(`https://kleawip.com/wp-content/uploads/2026/03/${encodeURIComponent(filename)}`);
    if (!response.ok) throw new Error(`Image request failed for ${filename}: ${response.status}`);
    const source = Buffer.from(await response.arrayBuffer());
    await sharp(source).resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true }).webp({ quality: 82, effort: 5 }).toFile(output);
    console.log(`${product.id}-${index + 1}.webp`);
  }
}
