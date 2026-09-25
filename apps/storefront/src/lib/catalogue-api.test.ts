import { afterEach, describe, expect, it, vi } from "vitest";
import { loadProductPage, productPageRecord, publicMediaUrl } from "./catalogue-api";
import type { ProductDetail } from "@kleawip/contract";

const detail: ProductDetail = {
  slug: "twisted-loop-1200",
  title: "Twisted Loop Drying Towel",
  category: { slug: "automotive", title: "Automotive Care" },
  detail: "1200 GSM drying towel",
  spec: "1200 GSM",
  summary: "",
  images: [{ id: "image-1", url: "/products/twisted-loop-1200-1.webp", alt: "Towel", width: 900, height: 900, optionValue: null }],
  optionGroups: [],
  variants: [],
  defaultSku: null,
  priceFrom: null,
  priceStatus: "pending",
  availability: "not_for_sale",
  specifications: [],
  contentSections: [],
  related: [],
  videos: [{ id: "video-1", caption: "See the towel in motion", source: "instagram", instagramUrl: "https://www.instagram.com/reel/ABC123/", playback: { kind: "hosted", url: "http://127.0.0.1:4000/media/videos/example.mp4", mimeType: "video/mp4", poster: { url: "http://127.0.0.1:4000/media/image.webp", width: 400, height: 600 } } }],
  isDemo: true,
};

afterEach(() => vi.unstubAllGlobals());

describe("catalogue product page", () => {
  it("uses API catalogue content and its published videos", () => {
    const record = productPageRecord(detail);
    expect(record.product.title).toBe(detail.title);
    expect(record.catalogue?.videos).toEqual(detail.videos);
    expect(record.fallback).toBe(false);
  });

  it("points uploaded media paths at the API while leaving seeded storefront images local", () => {
    expect(publicMediaUrl("/media/videos/example.mp4")).toBe("http://127.0.0.1:4000/media/videos/example.mp4");
    expect(publicMediaUrl("/products/towel.webp")).toBe("/products/towel.webp");
  });

  it("loads a published product from the API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => detail }));
    const record = await loadProductPage(detail.slug);
    expect(record?.catalogue?.videos).toHaveLength(1);
    expect(record?.fallback).toBe(false);
  });

  it("uses a labelled local fixture if the product API is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const record = await loadProductPage(detail.slug);
    expect(record?.fallback).toBe(true);
    expect(record?.catalogue).toBeNull();
  });

  it("does not invent an unknown product if the API does not return it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await loadProductPage("unknown-product")).toBeNull();
  });

  it("does not resurrect a withdrawn catalogue product from the local fixture", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await loadProductPage(detail.slug)).toBeNull();
  });
});
