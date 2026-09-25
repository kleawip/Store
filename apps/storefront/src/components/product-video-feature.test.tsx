import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProductDetail } from "@kleawip/contract";
import { ProductVideos } from "./product-video-feature";

const video: ProductDetail["videos"][number] = {
  id: "published-video",
  caption: "How to use this towel",
  source: "upload",
  instagramUrl: null,
  playback: { kind: "hosted", url: "https://media.example.com/towel.mp4", mimeType: "video/mp4", poster: { url: "/products/twisted-loop-1200-1.webp", width: 900, height: 900 } },
};

const catalogue = { videos: [video], isDemo: true } as ProductDetail;

describe("product video rendering", () => {
  it("shows the API-published video instead of the local demo reel", () => {
    const html = renderToStaticMarkup(<ProductVideos catalogue={catalogue} productId="twisted-loop-1200" previewImage="/products/twisted-loop-1200-1.webp"/>);
    expect(html).toContain("How to use this towel");
    expect(html).toContain("https://media.example.com/towel.mp4");
    expect(html).not.toContain("kleawip-twisted-loop-reel.m4v");
  });

  it("shows only the labelled demo video for the Twisted Loop demo product", () => {
    const html = renderToStaticMarkup(<ProductVideos catalogue={{ ...catalogue, videos: [] }} productId="twisted-loop-1200" previewImage="/products/twisted-loop-1200-1.webp"/>);
    expect(html).toContain("Local demo video");
    expect(html).toContain("kleawip-twisted-loop-reel.m4v");
  });

  it("does not invent video content for another or non-demo product", () => {
    expect(renderToStaticMarkup(<ProductVideos catalogue={{ ...catalogue, videos: [] }} productId="pet-towel" previewImage="/products/pet-towel-1.webp"/>)).toBe("");
    expect(renderToStaticMarkup(<ProductVideos catalogue={{ ...catalogue, isDemo: false, videos: [] }} productId="twisted-loop-1200" previewImage="/products/twisted-loop-1200-1.webp"/>)).toBe("");
  });
});
