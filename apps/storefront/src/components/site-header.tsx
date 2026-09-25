"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Grid2X2, Heart, House, Menu, Moon, Search, ShoppingBag, Sun, UserRound, X } from "lucide-react";
import { useRef, useState } from "react";
import { categories } from "@/data/products";
import { AnnouncementRibbon } from "./announcement-ribbon";
import { SearchAutocomplete } from "./search-autocomplete";
import { SearchOverlay } from "./search-overlay";
import { useStore } from "./store-provider";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchReturnFocusRef = useRef<HTMLElement | null>(null);
  const pathname = usePathname();
  const { theme, toggleTheme, bag, wishlist } = useStore();
  const bagCount = bag.reduce((sum, line) => sum + line.quantity, 0);
  function openSearch() {
    searchReturnFocusRef.current = document.activeElement as HTMLElement;
    setSearchOpen(true);
  }
  function closeSearch() {
    setSearchOpen(false);
    requestAnimationFrame(() => searchReturnFocusRef.current?.focus());
  }

  return <>
    <AnnouncementRibbon/>
    <header className="site-header">
      <div className="header-main page-width">
        <button className="icon-button mobile-only" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Menu size={23}/></button>
        <Link className="logo-link" href="/" aria-label="Kleawip home"><Image src="/brand/Kleawip-logo.webp" alt="Kleawip" width={154} height={38} priority /></Link>
        <SearchAutocomplete variant="header"/>
        <div className="header-actions">
          <button className="icon-button compact-search-action" type="button" onClick={openSearch} aria-label="Search products" aria-expanded={searchOpen}><Search size={21}/></button>
          <button className="icon-button header-theme-action" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`} title="Change theme">{theme === "light" ? <Moon size={21}/> : <Sun size={21}/>}</button>
          <Link className="icon-button desktop-action" href="/wishlist" aria-label={`Wishlist, ${wishlist.length} items`}><Heart size={21}/>{wishlist.length > 0 && <span className="icon-count">{wishlist.length}</span>}</Link>
          <Link className="icon-button desktop-action" href="/account" aria-label="Account"><UserRound size={21}/></Link>
          <Link className="icon-button" href="/cart" aria-label={`Bag, ${bagCount} items`}><ShoppingBag size={21}/>{bagCount > 0 && <span className="icon-count">{bagCount}</span>}</Link>
        </div>
      </div>
      <nav className="desktop-nav page-width" aria-label="Primary navigation">
        <Link className={pathname === "/shop" ? "active" : ""} href="/shop">Shop all</Link>
        {categories.slice(0, 4).map((category) => <div className="nav-group" key={category.id}><Link className={pathname === `/shop/${category.id}` ? "active" : ""} href={`/shop/${category.id}`}>{category.title}</Link><div className="nav-dropdown"><p>Explore {category.title}</p><Link href={`/shop/${category.id}`}>All {category.title}</Link><Link href="/shop">Browse all products</Link></div></div>)}
        <Link href="/bulk">Bulk enquiries</Link><Link href="/clients">Our clients</Link>
      </nav>
    </header>
    {searchOpen && <SearchOverlay onClose={closeSearch} onNavigate={() => setSearchOpen(false)}/>}
    {menuOpen && <div className="drawer-backdrop" onClick={() => setMenuOpen(false)}><aside className="mobile-drawer" onClick={(event) => event.stopPropagation()} aria-label="Mobile menu"><div className="drawer-top"><strong>Menu</strong><button className="icon-button" aria-label="Close menu" onClick={() => setMenuOpen(false)}><X/></button></div><Link onClick={() => setMenuOpen(false)} href="/shop">Shop all products</Link>{categories.map((category) => <Link key={category.id} onClick={() => setMenuOpen(false)} href={`/shop/${category.id}`}>{category.title}</Link>)}<div className="drawer-divider"/><Link onClick={() => setMenuOpen(false)} href="/bulk">Bulk enquiries</Link><Link onClick={() => setMenuOpen(false)} href="/clients">Our clients</Link><Link onClick={() => setMenuOpen(false)} href="/wishlist">Wishlist</Link><Link onClick={() => setMenuOpen(false)} href="/account">Account</Link><button className="drawer-theme-toggle" type="button" onClick={toggleTheme}>{theme === "light" ? <Moon size={19}/> : <Sun size={19}/>} Switch to {theme === "light" ? "dark" : "light"} mode</button></aside></div>}
    <nav className="mobile-bottom-nav" aria-label="Quick navigation"><Link href="/"><House size={20}/>Home</Link><Link href="/shop"><Grid2X2 size={20}/>Shop</Link><button type="button" onClick={openSearch} aria-label="Search products" aria-expanded={searchOpen}><Search size={20}/>Search</button><Link href="/account"><UserRound size={20}/>Account</Link><Link href="/cart"><ShoppingBag size={20}/>Bag</Link></nav>
  </>;
}
