import catalogue from "./catalogue.json";

export const categories = [
  { id: "automotive", title: "Automotive Care", note: "Wash, dry & detail", tone: "automotive" },
  { id: "bath", title: "Bath Towels", note: "Everyday softness", tone: "bath" },
  { id: "household", title: "Household Cleaning", note: "Clean surfaces with ease", tone: "household" },
  { id: "personal", title: "Personal Care", note: "Gentle daily essentials", tone: "personal" },
  { id: "pet", title: "Pet Care", note: "For your companion", tone: "pet" },
] as const;

export type CategoryId = (typeof categories)[number]["id"];
export type Product = {
  id: string;
  title: string;
  detail: string;
  category: string;
  spec: string;
  images: string[];
};

export const products: Product[] = catalogue.map((product) => ({
  ...product,
  category: product.category as CategoryId,
  images: product.images.map((image, index) => `/products/${product.id}-${index + 1}.webp`),
}));

export function productById(id: string) {
  return products.find((product) => product.id === id);
}

export function categoryById(id: string) {
  return categories.find((category) => category.id === id);
}
