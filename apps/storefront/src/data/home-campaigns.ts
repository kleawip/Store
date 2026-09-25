import { categories, products, type CategoryId } from "./products";

export type CampaignTarget =
  | { type: "category"; id: CategoryId }
  | { type: "product"; id: string }
  | { type: "page"; path: "/shop" | "/bulk" };

export type HeroSlide = {
  id: string;
  eyebrow: string;
  headline: string;
  description: string;
  cta: string;
  alt: string;
  target: CampaignTarget;
  images: { desktop: string; tablet: string; mobile: string };
};

export type RibbonMessage = {
  id: string;
  text: string;
  target?: CampaignTarget;
};

// Local UX preview data. A protected admin and publish workflow will replace this fixture.
// Promotional concepts are explicitly marked as demo-only until approved and implemented.
export const heroSlides: HeroSlide[] = [
  {
    id: "automotive-care",
    eyebrow: "AUTOMOTIVE CARE",
    headline: "For every detail of the drive.",
    description: "Discover Kleawip's twisted-loop microfiber drying towel.",
    cta: "Explore the drying towel",
    alt: "Folded teal and aqua microfiber towels on a dark studio surface",
    target: { type: "product", id: "twisted-loop-1200" },
    images: {
      desktop: "/campaigns/automotive-desktop.jpg",
      tablet: "/campaigns/automotive-tablet.jpg",
      mobile: "/campaigns/automotive-mobile.jpg",
    },
  },
  {
    id: "bath-towels",
    eyebrow: "BATH TOWELS",
    headline: "Bring colour to everyday care.",
    description: "Discover Kleawip's microfiber bath towel collection.",
    cta: "Explore bath towels",
    alt: "Coral and pink microfiber towels folded on a dark studio surface",
    target: { type: "category", id: "bath" },
    images: {
      desktop: "/campaigns/bath-desktop.jpg",
      tablet: "/campaigns/bath-tablet.jpg",
      mobile: "/campaigns/bath-mobile.jpg",
    },
  },
  {
    id: "mitts-demo-offer",
    eyebrow: "DEMO OFFER · NOT ACTIVE",
    headline: "Buy 2, get 1 free.",
    description: "A sample campaign for Kleawip cleaning mitts. This offer is not active in the preview.",
    cta: "Explore cleaning mitts",
    alt: "Blue, charcoal and orange chenille microfiber cleaning mitts",
    target: { type: "product", id: "cleaning-gloves" },
    images: {
      desktop: "/campaigns/mitts-desktop.jpg",
      tablet: "/campaigns/mitts-tablet.jpg",
      mobile: "/campaigns/mitts-mobile.jpg",
    },
  },
];

export const ribbonMessages: RibbonMessage[] = [
  { id: "collection", text: "Explore the Kleawip microfiber collection", target: { type: "page", path: "/shop" } },
  { id: "automotive", text: "Discover the Twisted Loop Drying Towel", target: { type: "product", id: "twisted-loop-1200" } },
  { id: "demo-offer", text: "Demo offer: Buy 2, get 1 free · not active", target: { type: "product", id: "cleaning-gloves" } },
];

export function campaignHref(target: CampaignTarget): string {
  switch (target.type) {
    case "category":
      if (!categories.some((category) => category.id === target.id)) throw new Error(`Unknown category: ${target.id}`);
      return `/shop/${target.id}`;
    case "product":
      if (!products.some((product) => product.id === target.id)) throw new Error(`Unknown product: ${target.id}`);
      return `/product/${target.id}`;
    case "page":
      return target.path;
  }
}
