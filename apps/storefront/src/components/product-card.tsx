"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Heart, Plus } from "lucide-react";
import { useState } from "react";
import type { Product } from "@/data/products";
import { galleryWindow } from "@/lib/gallery-window";
import { useStore } from "./store-provider";

export function ProductCard({ product }: { product: Product }) {
  const [imageIndex, setImageIndex] = useState(0);
  const { addToBag, toggleWishlist, wishlist } = useStore();
  const saved = wishlist.includes(product.id);

  return <article className="product-card">
    <div className="product-card-image">
      <Link href={`/product/${product.id}`} aria-label={`View ${product.title}`}><Image src={product.images[imageIndex]} alt={`${product.title} image ${imageIndex + 1}`} fill sizes="(max-width: 640px) 50vw, (max-width: 1000px) 33vw, 25vw" /></Link>
      <button type="button" className={`card-heart ${saved ? "is-saved" : ""}`} aria-label={saved ? "Remove from wishlist" : "Add to wishlist"} onClick={() => toggleWishlist(product.id)}><Heart size={19} fill={saved ? "currentColor" : "none"}/></button>
      {product.images.length > 1 && <>
        <button type="button" className="card-image-arrow card-image-arrow-prev" aria-label={`Previous image of ${product.title}`} disabled={imageIndex === 0} onClick={() => setImageIndex((current) => current - 1)}><ChevronLeft size={21} strokeWidth={1.8}/></button>
        <button type="button" className="card-image-arrow card-image-arrow-next" aria-label={`Next image of ${product.title}`} disabled={imageIndex === product.images.length - 1} onClick={() => setImageIndex((current) => current + 1)}><ChevronRight size={21} strokeWidth={1.8}/></button>
        <div className="card-image-dots" role="group" aria-label={`Images of ${product.title}, image ${imageIndex + 1} of ${product.images.length}`}>{galleryWindow(product.images.length, imageIndex).map((index) => <button key={index} type="button" aria-label={`Show image ${index + 1} of ${product.title}`} aria-pressed={index === imageIndex} className={index === imageIndex ? "selected" : ""} onClick={() => setImageIndex(index)}/>)}</div>
      </>}
    </div>
    <div className="product-card-body"><span className="eyebrow">{product.spec}</span><Link className="product-title" href={`/product/${product.id}`}>{product.title}</Link><p>{product.detail}</p><div className="product-card-bottom"><span>Price to be confirmed</span><button className="quick-add" aria-label={`Add ${product.title} to preview bag`} onClick={() => addToBag(product.id)}><Plus size={19}/></button></div></div>
  </article>;
}
