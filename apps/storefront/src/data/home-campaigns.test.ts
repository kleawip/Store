import { describe, expect, it } from "vitest";
import { campaignHref, heroSlides, ribbonMessages } from "./home-campaigns";

describe("homepage campaign preview data", () => {
  it("gives every hero one valid internal destination and three distinct device images", () => {
    expect(heroSlides.length).toBeGreaterThan(0);
    for (const slide of heroSlides) {
      expect(campaignHref(slide.target)).toMatch(/^\/(shop|product)\//);
      expect(slide.cta.trim()).not.toBe("");
      expect(slide.alt.trim()).not.toBe("");
      const images = Object.values(slide.images);
      expect(new Set(images).size).toBe(3);
      images.forEach((src) => expect(src).toMatch(/^\/campaigns\/[-\w]+\.jpg$/));
      if (/\b(free|off|save|discount)\b|%/i.test(slide.headline)) {
        expect(slide.eyebrow).toMatch(/demo.*not active/i);
        expect(slide.description).toMatch(/not active/i);
      }
    }
  });

  it("labels sample promotions as inactive in the ribbon", () => {
    for (const message of ribbonMessages) {
      if (/\b(free|off|save|discount)\b|%/i.test(message.text)) expect(message.text).toMatch(/demo.*not active/i);
      if (message.target) expect(campaignHref(message.target)).toMatch(/^\//);
    }
  });

  it("rejects unknown product links", () => {
    expect(() => campaignHref({ type: "product", id: "not-a-product" })).toThrow("Unknown product");
  });
});
