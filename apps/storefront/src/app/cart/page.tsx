"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { products } from "@/data/products";
import { useStore } from "@/components/store-provider";

export default function CartPage() {
  const { bag, setQuantity } = useStore();
  const lines = bag.map((line) => ({ ...line, product: products.find((product) => product.id === line.productId) })).filter((line) => line.product);
  return <div className="page-width inner-page"><span className="section-overline">YOUR SELECTION</span><h1>Preview bag</h1>{lines.length === 0 ? <div className="empty-state"><ShoppingBag size={42}/><h2>Your bag is empty</h2><p>Find a product you love and add it here to review your selection.</p><Link className="button button-primary" href="/shop">Explore products <ArrowRight size={18}/></Link></div> : <div className="cart-layout"><div className="cart-lines">{lines.map((line) => line.product && <article className="cart-line" key={line.productId}><div className="cart-line-image"><Image src={line.product.images[0]} alt="" fill sizes="120px"/></div><div className="cart-line-detail"><Link href={`/product/${line.product.id}`}><strong>{line.product.title}</strong></Link><span>{line.product.detail}</span><span>Price pending confirmation</span><div className="quantity-control"><button aria-label={`Decrease ${line.product.title} quantity`} onClick={() => setQuantity(line.productId, line.quantity - 1)}><Minus size={16}/></button><output aria-label="Quantity">{line.quantity}</output><button aria-label={`Increase ${line.product.title} quantity`} onClick={() => setQuantity(line.productId, Math.min(99, line.quantity + 1))}><Plus size={16}/></button></div></div><button className="icon-button cart-remove" aria-label={`Remove ${line.product.title}`} onClick={() => setQuantity(line.productId, 0)}><Trash2 size={18}/></button></article>)}</div><aside className="bag-summary"><h2>Bag summary</h2><div><span>Products</span><strong>{bag.reduce((sum, line) => sum + line.quantity, 0)}</strong></div><div><span>Subtotal</span><strong>Pending final prices</strong></div><p>Shipping, discounts, tax and payment options will be calculated after the commerce system is connected.</p><Link className="button button-primary" href="/sign-in?next=%2Fcart">Continue to account <ArrowRight size={18}/></Link><small>Account sign-in is required before purchase. This preview does not accept orders.</small></aside></div>}</div>;
}
