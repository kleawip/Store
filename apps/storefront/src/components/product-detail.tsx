"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Heart, ShoppingBag, Star } from "lucide-react";
import { useState } from "react";
import type { Product } from "@/data/products";
import { categoryById } from "@/data/products";
import { formatDemoPrice, getDemoMerchandising } from "@/data/demo-merchandising";
import { useStore } from "./store-provider";
import { TwistedLoopDetail } from "./twisted-loop-detail";

export function ProductDetail({ product }: { product: Product }) {
  return product.id === "twisted-loop-1200" ? <TwistedLoopDetail product={product}/> : <LegacyProductDetail product={product}/>;
}

function LegacyProductDetail({ product }: { product: Product }) {
  const [imageIndex, setImageIndex] = useState(0);
  const [added, setAdded] = useState(false);
  const { addToBag, wishlist, toggleWishlist } = useStore();
  const category = categoryById(product.category);
  const demo = getDemoMerchandising(product.id);
  function add() { addToBag(product.id); setAdded(true); window.setTimeout(() => setAdded(false), 2500); }
  return <div className="page-width product-page"><div className="breadcrumbs"><Link href="/shop"><ArrowLeft size={15}/> Shop</Link><span>/</span><Link href={`/shop/${product.category}`}>{category?.title}</Link><span>/</span><span>{product.title}</span></div><div className="product-layout"><div className="pdp-gallery"><div className="pdp-main-image"><Image src={product.images[imageIndex]} alt={`${product.title}, view ${imageIndex + 1}`} fill priority sizes="(max-width: 800px) 100vw, 55vw"/><button className="gallery-arrow previous" aria-label="Previous product image" onClick={() => setImageIndex((imageIndex - 1 + product.images.length) % product.images.length)}><ChevronLeft/></button><button className="gallery-arrow next" aria-label="Next product image" onClick={() => setImageIndex((imageIndex + 1) % product.images.length)}><ChevronRight/></button></div><div className="pdp-thumbnails">{product.images.map((image, index) => <button className={index === imageIndex ? "selected" : ""} aria-label={`Show product image ${index + 1}`} key={image} onClick={() => setImageIndex(index)}><Image src={image} alt="" fill sizes="90px"/></button>)}</div></div><div className="pdp-info"><span className="section-overline">KLEAWIP / {category?.title.toUpperCase()}</span><h1>{product.title}</h1><p className="pdp-detail">{product.detail}</p>{demo && <div className="pdp-demo-rating" aria-label={`Demo rating ${demo.rating} out of 5. Not a customer review.`}><span className="pdp-demo-stars" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <Star key={index} size={14} fill="currentColor"/>)}</span><strong>{demo.rating}/5</strong><span>Demo rating</span></div>}<div className="pdp-price"><strong>{demo ? formatDemoPrice(demo.price) : "Price to be confirmed"}</strong><span>{demo ? "Demo price for layout only · Final price pending approval" : "Preview catalogue · Not available for purchase yet"}</span></div><div className="pdp-spec"><span>Known specification</span><strong>{product.spec}</strong></div><div className="pdp-placeholder"><strong>Variants are being verified</strong><p>Size, GSM, colour, pack options, stock and price will be connected to the approved catalogue before checkout is enabled.</p></div><div className="pdp-actions"><button className="button button-primary" onClick={add}>{added ? <><Check size={18}/> Added to preview bag</> : <><ShoppingBag size={18}/> Add to preview bag</>}</button><button className="button button-outline square-button" aria-label="Toggle wishlist" onClick={() => toggleWishlist(product.id)}><Heart size={20} fill={wishlist.includes(product.id) ? "currentColor" : "none"}/></button></div><p className="pdp-safe-note">No payment, shipping or order will be processed in this preview.</p><div className="pdp-accordion"><details open><summary>Product overview</summary><p>{product.detail}. This information comes from the current Kleawip catalogue; final ecommerce copy is pending approval.</p></details><details><summary>Specifications</summary><p>{product.spec}. Confirmed variant combinations and complete technical data will be added from the client product sheet.</p></details><details><summary>Delivery & returns</summary><p>Serviceability, delivery estimates, COD eligibility and returns policy are pending the approved shipping and policy setup.</p></details></div></div></div></div>;
}
