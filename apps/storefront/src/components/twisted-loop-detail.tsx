"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Check, ChevronLeft, ChevronRight, Heart, Minus, Plus, ShoppingBag, Star, Volume2, VolumeX, X, ZoomIn } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Product } from "@/data/products";
import { products } from "@/data/products";
import { formatDemoPrice, getDemoMerchandising } from "@/data/demo-merchandising";
import { galleryWindow } from "@/lib/gallery-window";
import { useStore } from "./store-provider";
import { ProductCard } from "./product-card";

// Illustrative UI values only. Replace with approved SKU data before checkout goes live.
const previewPacks = ["Pack of 1", "Pack of 2", "Pack of 4"];
const previewSizes = ["40 × 40 cm", "40 × 60 cm", "60 × 90 cm"];
const previewColours = [
  { name: "Blue", swatch: "#2779af" },
  { name: "Grey", swatch: "#82909b" },
  { name: "Green", swatch: "#54786b" },
];

export function TwistedLoopDetail({ product }: { product: Product }) {
  const [imageIndex, setImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [pack, setPack] = useState(previewPacks[0]);
  const [size, setSize] = useState(previewSizes[0]);
  const [colour, setColour] = useState(previewColours[0].name);
  const [added, setAdded] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [showSticky, setShowSticky] = useState(false);
  const actionRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { addToBag, wishlist, toggleWishlist, soundEnabled, toggleCartSound } = useStore();
  const saved = wishlist.includes(product.id);
  const demo = getDemoMerchandising(product.id);
  const related = products.filter((item) => item.category === product.category && item.id !== product.id).slice(0, 3);

  useEffect(() => {
    const action = actionRef.current;
    if (!action) return;
    const observer = new IntersectionObserver(([entry]) => {
      setShowSticky(!entry.isIntersecting);
    }, { threshold: 0 });
    observer.observe(action);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!zoomOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setZoomOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zoomOpen]);

  function add() {
    addToBag(product.id, quantity);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2500);
  }

  function buyNow() {
    addToBag(product.id, quantity);
    router.push("/cart");
  }

  return <div className="page-width product-page pdp-refresh">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/shop"><ArrowLeft size={15}/> Shop</Link><span>/</span><Link href="/shop/automotive">Automotive Care</Link><span>/</span><span>{product.title}</span></nav>
    <div className="product-layout pdp-refresh-layout">
      <section className="pdp-gallery" aria-label="Product photos">
        <div className="pdp-main-image pdp-refresh-image">
          <Image src={product.images[imageIndex]} alt={`${product.title}, photo ${imageIndex + 1} of ${product.images.length}`} fill priority sizes="(max-width: 800px) 100vw, 55vw"/>
          {product.images.length > 1 && <>
            <button type="button" className="gallery-arrow previous" aria-label="Previous product image" disabled={imageIndex === 0} onClick={() => setImageIndex((index) => index - 1)}><ChevronLeft size={21}/></button>
            <button type="button" className="gallery-arrow next" aria-label="Next product image" disabled={imageIndex === product.images.length - 1} onClick={() => setImageIndex((index) => index + 1)}><ChevronRight size={21}/></button>
            <div className="pdp-image-dots" role="group" aria-label={`Image ${imageIndex + 1} of ${product.images.length}`}>{galleryWindow(product.images.length, imageIndex).map((index) => <button type="button" key={index} aria-label={`Show image ${index + 1}`} aria-pressed={index === imageIndex} className={index === imageIndex ? "selected" : ""} onClick={() => setImageIndex(index)}/>)}</div>
          </>}
          <button type="button" className="pdp-zoom-button" aria-label="Enlarge product image" onClick={() => setZoomOpen(true)}><ZoomIn size={18}/></button>
        </div>
        <div className="pdp-thumbnails" role="group" aria-label="Product image thumbnails">{product.images.map((image, index) => <button type="button" className={index === imageIndex ? "selected" : ""} aria-label={`Show product photo ${index + 1}`} aria-pressed={index === imageIndex} key={image} onClick={() => setImageIndex(index)}><Image src={image} alt="" fill sizes="90px"/></button>)}</div>
      </section>

      <section className="pdp-info pdp-refresh-info" aria-label="Product information">
        <span className="section-overline">KLEAWIP / AUTOMOTIVE CARE</span>
        <h1>{product.title}</h1>
        <div className="pdp-fact-row"><span className="pdp-fact">1200 GSM</span></div>
        {demo && <div className="pdp-demo-rating" aria-label={`Demo rating ${demo.rating} out of 5. Not a customer review.`}><span className="pdp-demo-stars" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <Star key={index} size={14} fill="currentColor"/>)}</span><strong>{demo.rating}/5</strong><span>Demo rating</span></div>}

        <div className="pdp-price pdp-refresh-price"><strong>{demo ? formatDemoPrice(demo.price) : "Price to be confirmed"}</strong><span>{demo ? "Demo price for layout only · Final price pending approval" : "Final price, tax and pack savings require Kleawip approval."}</span></div>

        <div className="pdp-option-block" aria-label="Product options">
          <div className="pdp-block-heading"><h2>Choose your options</h2><span>Sample options for review</span></div>
          <fieldset className="pdp-choice-group"><legend>Pack <span>{pack}</span></legend><div className="pdp-choice-list">{previewPacks.map((value) => <button type="button" key={value} className={pack === value ? "selected" : ""} aria-pressed={pack === value} onClick={() => setPack(value)}>{value}</button>)}</div></fieldset>
          <fieldset className="pdp-choice-group"><legend>Size <span>{size}</span></legend><div className="pdp-choice-list">{previewSizes.map((value) => <button type="button" key={value} className={size === value ? "selected" : ""} aria-pressed={size === value} onClick={() => setSize(value)}>{value}</button>)}</div></fieldset>
          <fieldset className="pdp-choice-group"><legend>Colour <span>{colour}</span></legend><div className="pdp-choice-list pdp-colour-list">{previewColours.map((value) => <button type="button" key={value.name} className={colour === value.name ? "selected" : ""} aria-pressed={colour === value.name} onClick={() => setColour(value.name)}><i style={{ backgroundColor: value.swatch }} aria-hidden="true"/>{value.name}</button>)}</div></fieldset>
          <p className="pdp-option-note">Sample choices only. They do not change the demo price or bag; final SKUs and stock are pending.</p>
        </div>

        <div className="pdp-buy-controls" ref={actionRef}><div className="pdp-quantity-row"><span id="pdp-quantity-label">Quantity</span><div className="pdp-quantity-control" aria-labelledby="pdp-quantity-label"><button type="button" aria-label="Decrease quantity" disabled={quantity === 1} onClick={() => setQuantity((value) => value - 1)}><Minus size={17}/></button><output aria-live="polite">{quantity}</output><button type="button" aria-label="Increase quantity" disabled={quantity === 99} onClick={() => setQuantity((value) => value + 1)}><Plus size={17}/></button></div></div><button type="button" className={`pdp-cart-cta${added ? " is-added" : ""}`} onClick={add}>{added ? <><Check size={19}/> Added to cart</> : <>Add to cart <ShoppingBag size={20}/></>}</button></div>
        <div className="pdp-buy-secondary"><button type="button" className="pdp-buy-now" onClick={buyNow}>Buy now <ArrowUpRight size={19}/></button><button type="button" className="pdp-wishlist-cta" aria-label={saved ? "Remove from wishlist" : "Add to wishlist"} aria-pressed={saved} onClick={() => toggleWishlist(product.id)}><Heart size={20} fill={saved ? "currentColor" : "none"}/></button></div>
        <div className="pdp-buy-meta"><p className="pdp-safe-note" role="status">{added ? <>Added {quantity} to your local preview bag. <Link href="/cart">View bag</Link></> : "Local preview only — Buy now opens the bag; orders and payments are not active."}</p><button type="button" className="pdp-sound-toggle" aria-pressed={soundEnabled} onClick={toggleCartSound}>{soundEnabled ? <Volume2 size={14}/> : <VolumeX size={14}/>} Cart sound {soundEnabled ? "on" : "off"}</button></div>

        <div className="pdp-service-card"><div className="pdp-block-heading"><h2>Delivery to your area</h2><span>Coming soon</span></div><div className="pdp-pincode"><input aria-label="Delivery pincode" placeholder="Enter pincode" inputMode="numeric" disabled/><button type="button" disabled>Check</button></div><p>Pincode availability, delivery estimate, COD and partial COD will appear after courier integration is tested.</p></div>
        <div className="pdp-offer-card"><div className="pdp-block-heading"><h2>Offers for this product</h2><span>Not configured</span></div><p>Eligible offers and pack savings will be shown here when Kleawip approves the rules.</p></div>
      </section>
    </div>

    <div className="pdp-below-grid">
      <section className="pdp-deep-content" aria-label="More product details"><div className="pdp-block-heading"><h2>Details that matter</h2></div><div className="pdp-spec-table"><div><span>Product</span><strong>{product.title}</strong></div><div><span>Category</span><strong>Automotive Care</strong></div><div><span>GSM</span><strong>1200 GSM</strong></div><div><span>Dimensions, colour and pack</span><strong>Awaiting approved catalogue</strong></div></div><div className="pdp-accordion"><details><summary>Product details</summary><p>{product.detail}. Additional material and performance details are awaiting Kleawip approval.</p></details><details><summary>Washing & care</summary><p>Care instructions will be displayed once approved by Kleawip.</p></details><details><summary>Delivery & returns</summary><p>Delivery terms and return policy will be displayed after the client approves them and shipping is connected.</p></details></div></section>
      <aside className="pdp-help-card"><span className="section-overline">BUYING FOR A TEAM?</span><h2>Need towels in volume?</h2><p>Tell Kleawip which products and quantities you need.</p><Link className="inline-link" href="/bulk">Start a bulk enquiry <ArrowUpRight size={17}/></Link></aside>
    </div>

    <section id="customer-reviews" className="pdp-reviews"><div className="pdp-block-heading"><h2>Customer reviews</h2><span>Preview state</span></div><p>No reviews are published in this preview. Genuine product reviews can appear here after launch and moderation is configured.</p></section>
    <section className="pdp-related"><div className="section-heading"><div><span className="section-overline">EXPLORE MORE</span><h2>You may also like</h2></div><Link className="inline-link" href="/shop/automotive">View Automotive Care <ArrowUpRight size={17}/></Link></div><div className="product-grid">{related.map((item) => <ProductCard product={item} key={item.id}/>)}</div></section>

    {showSticky && <div className="pdp-sticky-buy" aria-label="Quick purchase actions"><button type="button" className="pdp-sticky-cart" onClick={add}><ShoppingBag size={17}/> Add to cart</button><button type="button" className="pdp-sticky-now" onClick={buyNow}>Buy now <ArrowUpRight size={16}/></button></div>}
    {zoomOpen && <div className="pdp-zoom-overlay" role="dialog" aria-modal="true" aria-label="Enlarged product photo" onClick={() => setZoomOpen(false)}><button type="button" className="pdp-zoom-close" aria-label="Close enlarged photo" onClick={() => setZoomOpen(false)}><X size={23}/></button><div className="pdp-zoom-image" onClick={(event) => event.stopPropagation()}><Image src={product.images[imageIndex]} alt={`${product.title}, enlarged photo ${imageIndex + 1}`} fill sizes="90vw"/></div></div>}
  </div>;
}
