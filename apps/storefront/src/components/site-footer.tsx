import Link from "next/link";
import Image from "next/image";
import { categories } from "@/data/products";

export function SiteFooter() {
  return <footer className="site-footer"><div className="page-width footer-grid"><div><Image src="/brand/Kleawip-logo.webp" alt="Kleawip" width={144} height={35}/><p>Microfiber products for automotive, home and everyday care.</p></div><div><strong>Explore</strong><Link href="/shop">All products</Link>{categories.slice(0,4).map((category) => <Link href={`/shop/${category.id}`} key={category.id}>{category.title}</Link>)}</div><div><strong>Business</strong><Link href="/bulk">Bulk enquiries</Link><Link href="/clients">Our clients</Link><a href="mailto:sales@kleawip.com">sales@kleawip.com</a></div><div><strong>Your account</strong><Link href="/account">Account overview</Link><Link href="/account/orders">Orders</Link><Link href="/wishlist">Wishlist</Link><Link href="/cart">Bag</Link></div></div><div className="page-width footer-bottom"><span>© {new Date().getFullYear()} Kleawip</span><span>Local design preview · No orders or payments accepted</span></div></footer>;
}
