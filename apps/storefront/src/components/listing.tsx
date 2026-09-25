"use client";

import { useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { Product } from "@/data/products";
import { ProductCard } from "./product-card";

export function Listing({ items, title, intro }: { items: Product[]; title: string; intro: string }) {
  const [filter, setFilter] = useState("All");
  const specs = useMemo(() => ["All", ...new Set(items.map((product) => product.spec))], [items]);
  const visible = filter === "All" ? items : items.filter((product) => product.spec === filter);
  return <div className="page-width listing-page"><div className="listing-intro"><span className="section-overline">THE KLEAWIP COLLECTION</span><h1>{title}</h1><p>{intro}</p></div><div className="listing-toolbar"><div><SlidersHorizontal size={18}/><span>Explore by specification</span></div><span>{visible.length} products</span></div><div className="filter-pills" aria-label="Filter products by specification">{specs.map((spec) => <button key={spec} className={filter === spec ? "selected" : ""} onClick={() => setFilter(spec)}>{spec}</button>)}</div><div className="product-grid">{visible.map((product) => <ProductCard key={product.id} product={product}/>)}</div>{visible.length === 0 && <p className="empty-note">No products match this selection.</p>}</div>;
}
