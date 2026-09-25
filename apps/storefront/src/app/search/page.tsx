import Link from "next/link";
import { Search } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import { SearchAutocomplete } from "@/components/search-autocomplete";
import { categories } from "@/data/products";
import { searchProducts } from "@/lib/search";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const query = q.trim();
  const results = searchProducts(query);
  return <div className="page-width inner-page"><span className="section-overline">FIND YOUR FIT</span><h1>Search Kleawip</h1><SearchAutocomplete key={q} variant="page" initialQuery={q}/>{query ? <><p className="search-count">{results.length} result{results.length === 1 ? "" : "s"} for “{q}”</p>{results.length ? <div className="product-grid">{results.map((product) => <ProductCard key={product.id} product={product}/>)}</div> : <div className="empty-state"><Search size={42}/><h2>No exact match</h2><p>Try a category, size, GSM or product type.</p></div>}</> : <><p className="search-count">Popular places to begin</p><div className="search-categories">{categories.map((category) => <Link key={category.id} href={`/shop/${category.id}`}>{category.title}</Link>)}</div></>}</div>;
}
