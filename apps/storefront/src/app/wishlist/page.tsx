"use client";

import Link from "next/link";
import { ArrowRight, Heart } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import { useStore } from "@/components/store-provider";
import { products } from "@/data/products";

export default function WishlistPage() {
  const { wishlist } = useStore();
  const items = products.filter((product) => wishlist.includes(product.id));
  return <div className="page-width inner-page"><span className="section-overline">SAVED FOR LATER</span><h1>Your wishlist</h1>{items.length ? <div className="product-grid">{items.map((product) => <ProductCard key={product.id} product={product}/>)}</div> : <div className="empty-state"><Heart size={42}/><h2>Nothing saved yet</h2><p>Tap the heart on a product to keep it close.</p><Link className="button button-primary" href="/shop">Explore products <ArrowRight size={18}/></Link></div>}</div>;
}
