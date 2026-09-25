import { ProductDetail as ProductDetailSchema, type ProductDetail as CatalogueProductDetail } from "@kleawip/contract";
import { productById, type Product } from "../data/products";

const apiOrigin = (process.env.KLEAWIP_API_ORIGIN ?? "http://127.0.0.1:4000").replace(/\/$/, "");

export type ProductPageRecord = {
  product: Product;
  catalogue: CatalogueProductDetail | null;
  fallback: boolean;
};

export function publicMediaUrl(url: string) {
  // Demo seed images live in the storefront. Uploaded assets live on the API (or its configured CDN).
  if (url.startsWith("/media/")) return `${apiOrigin}${url}`;
  return url;
}

export function productPageRecord(detail: CatalogueProductDetail): ProductPageRecord {
  const fixture = productById(detail.slug);
  return {
    product: {
      id: detail.slug,
      title: detail.title,
      detail: detail.detail,
      category: detail.category.slug,
      spec: detail.spec,
      images: detail.images.length
        ? detail.images.map((image) => publicMediaUrl(image.url))
        : fixture?.images ?? [],
    },
    catalogue: detail,
    fallback: false,
  };
}

export async function loadProductPage(slug: string): Promise<ProductPageRecord | null> {
  try {
    const response = await fetch(`${apiOrigin}/v1/store/products/${encodeURIComponent(slug)}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (response.ok) return productPageRecord(ProductDetailSchema.parse(await response.json()));
    // A published product can be withdrawn in admin. Never resurrect it from a fixture on 404.
    if (response.status >= 400 && response.status < 500) return null;
  } catch (error) {
    // Local preview remains usable when the API is stopped, but is visibly labelled as a fixture.
    console.error("Product API unavailable; displaying local preview if available.", error);
  }
  const fixture = productById(slug);
  return fixture ? { product: fixture, catalogue: null, fallback: true } : null;
}
