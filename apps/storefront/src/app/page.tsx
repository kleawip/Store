import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { categories, products } from "@/data/products";
import { HomeHeroCarousel } from "@/components/home-hero-carousel";
import { ProductCard } from "@/components/product-card";

export default function HomePage() {
  const categoryImages: Record<string, string> = {
    automotive: "/brand/automotive-hero.webp", bath: products[1].images[0], household: products[7].images[0], personal: products[0].images[0], pet: products[2].images[0],
  };
  return <>
    <HomeHeroCarousel/>
    <section className="section page-width home-featured"><div className="section-heading"><div><span className="section-overline">THE KLEAWIP COLLECTION</span><h2>Everyday essentials</h2></div><Link className="inline-link" href="/shop">View all products <ArrowRight size={17}/></Link></div><div className="product-grid">{[products[4], products[3], products[5], products[7]].map((product) => <ProductCard key={product.id} product={product}/>)}</div></section>
    <section className="section page-width"><div className="section-heading"><div><span className="section-overline">EXPLORE KLEAWIP</span><h2>Shop by category</h2></div><Link className="inline-link" href="/shop">View all <ArrowRight size={17}/></Link></div><div className="category-grid">{categories.slice(0,4).map((category) => <Link className={`category-card tone-${category.tone}`} key={category.id} href={`/shop/${category.id}`}><div className="category-card-image"><Image src={categoryImages[category.id]} alt="" fill sizes="(max-width: 640px) 50vw, 25vw"/></div><div className="category-card-copy"><span>{category.note}</span><strong>{category.title}</strong><ArrowUpRight size={19}/></div></Link>)}</div></section>
    <section className="editorial-section"><div className="page-width editorial-grid"><div className="editorial-photo"><Image src={products[3].images[0]} alt="Kleawip microfiber cleaning gloves" fill sizes="(max-width: 760px) 100vw, 50vw"/></div><div className="editorial-copy"><span className="section-overline">MADE TO BE USED</span><h2>Find the right cloth for the right job.</h2><p>From plush drying towels to practical cleaning cloths, browse by what you want to care for and compare the details that matter.</p><Link className="button button-primary" href="/shop/automotive">Explore automotive care <ArrowRight size={17}/></Link></div></div></section>
    <section className="section page-width home-actions"><div><span className="section-overline">FOR TEAMS & BUSINESSES</span><h2>Buying for more than yourself?</h2><p>Tell us what products and quantities you need. We’ll help you start a bulk enquiry.</p><Link className="inline-link" href="/bulk">Explore bulk enquiries <ArrowRight size={18}/></Link></div><div className="home-actions-note">The bulk ordering workflow will be finalised with Kleawip before launch.</div></section>
  </>;
}
