// Local design placeholders only. Never use these values for checkout, an API seed,
// structured review data, or a production catalogue.
const demoMerchandising: Record<string, { price: number; rating: number }> = {
  "makeup-removal-towel": { price: 349, rating: 4.7 },
  "hair-wrap-towel": { price: 449, rating: 4.6 },
  "pet-towel": { price: 599, rating: 4.8 },
  "cleaning-gloves": { price: 299, rating: 4.5 },
  "twisted-loop-1200": { price: 799, rating: 4.8 },
  "twisted-loop-800": { price: 649, rating: 4.7 },
  "coral-cloth": { price: 399, rating: 4.6 },
  "warp-300-400": { price: 329, rating: 4.5 },
  "weft-460": { price: 379, rating: 4.7 },
  "weft-400": { price: 349, rating: 4.6 },
};

export function getDemoMerchandising(productId: string) {
  return demoMerchandising[productId];
}

export function formatDemoPrice(price: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(price);
}
