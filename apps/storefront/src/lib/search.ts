import { categories, products, type Product } from "../data/products";

export type SearchSuggestion =
  | { kind: "category"; id: string; title: string; href: string }
  | { kind: "product"; id: string; title: string; detail: string; image: string; href: string };

function normalized(value: string) {
  return value.toLocaleLowerCase("en-IN").replace(/[^a-z0-9]+/g, " ").trim();
}

function matches(haystack: string, query: string) {
  const tokens = normalized(query).split(" ").filter(Boolean);
  const source = normalized(haystack);
  return tokens.length > 0 && tokens.every((token) => source.includes(token));
}

function score(title: string, query: string) {
  const heading = normalized(title);
  const needle = normalized(query);
  if (heading === needle) return 0;
  if (heading.startsWith(needle)) return 1;
  if (heading.includes(needle)) return 2;
  return 3;
}

const searchableProducts = products.map((product) => ({
  product,
  text: `${product.title} ${product.detail} ${product.spec} ${product.id} ${categories.find((category) => category.id === product.category)?.title ?? ""}`,
}));

export function searchProducts(query: string): Product[] {
  if (!normalized(query)) return [];
  return searchableProducts
    .filter(({ text }) => matches(text, query))
    .sort((a, b) => score(a.product.title, query) - score(b.product.title, query) || a.product.title.localeCompare(b.product.title))
    .map(({ product }) => product);
}

export function searchSuggestions(query: string, maxProducts = 4): SearchSuggestion[] {
  if (!normalized(query)) return [];
  const categoryHits: SearchSuggestion[] = categories
    .filter((category) => matches(`${category.title} ${category.note} ${category.id}`, query))
    .sort((a, b) => score(a.title, query) - score(b.title, query))
    .slice(0, 2)
    .map((category) => ({ kind: "category", id: category.id, title: category.title, href: `/shop/${category.id}` }));
  const productHits: SearchSuggestion[] = searchProducts(query).slice(0, maxProducts).map((product) => ({
    kind: "product",
    id: product.id,
    title: product.title,
    detail: product.detail,
    image: product.images[0],
    href: `/product/${product.id}`,
  }));
  return [...categoryHits, ...productHits];
}
