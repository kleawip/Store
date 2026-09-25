"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Grid2X2, Heart, House, Menu, Moon, Search, ShoppingBag, Sun, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { categories } from "@/data/products";
import { AnnouncementRibbon } from "./announcement-ribbon";
import { SearchAutocomplete } from "./search-autocomplete";
import { SearchOverlay } from "./search-overlay";
import { useStore } from "./store-provider";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLElement>(null);
  const menuCloseRef = useRef<HTMLButtonElement>(null);
  const searchReturnFocusRef = useRef<HTMLElement | null>(null);
  const pathname = usePathname();
  const { theme, toggleTheme, bag, wishlist } = useStore();
  const bagCount = bag.reduce((sum, line) => sum + line.quantity, 0);
  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    menuCloseRef.current?.focus();
    function handleMenuKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        requestAnimationFrame(() => menuTriggerRef.current?.focus());
        return;
      }
      if (event.key !== "Tab" || !menuPanelRef.current) return;
      const focusable = Array.from(menuPanelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", handleMenuKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleMenuKeyDown);
    };
  }, [menuOpen]);
  function closeMenu(restoreFocus = true) {
    setMenuOpen(false);
    if (restoreFocus) requestAnimationFrame(() => menuTriggerRef.current?.focus());
  }
  function openSearch() {
    if (menuOpen) closeMenu(false);
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
        <button ref={menuTriggerRef} className="icon-button mobile-only" aria-label="Open menu" aria-expanded={menuOpen} aria-controls="kleawip-mobile-menu" onClick={() => setMenuOpen(true)}><Menu size={23}/></button>
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
    {menuOpen && <div className="drawer-backdrop" onClick={() => closeMenu()}><aside id="kleawip-mobile-menu" ref={menuPanelRef} className="mobile-drawer" role="dialog" aria-modal="true" aria-label="Mobile menu" onClick={(event) => event.stopPropagation()}><div className="drawer-top"><strong>Menu</strong><button ref={menuCloseRef} className="icon-button" aria-label="Close menu" onClick={() => closeMenu()}><X/></button></div><Link onClick={() => closeMenu(false)} href="/shop">Shop all products</Link>{categories.map((category) => <Link key={category.id} onClick={() => closeMenu(false)} href={`/shop/${category.id}`}>{category.title}</Link>)}<div className="drawer-divider"/><Link onClick={() => closeMenu(false)} href="/bulk">Bulk enquiries</Link><Link onClick={() => closeMenu(false)} href="/clients">Our clients</Link><Link onClick={() => closeMenu(false)} href="/wishlist">Wishlist</Link><Link onClick={() => closeMenu(false)} href="/account">Account</Link><button className="drawer-theme-toggle" type="button" onClick={toggleTheme}>{theme === "light" ? <Moon size={19}/> : <Sun size={19}/>} Switch to {theme === "light" ? "dark" : "light"} mode</button></aside></div>}
    <nav className="mobile-bottom-nav" aria-label="Quick navigation"><Link href="/"><House size={20}/>Home</Link><Link href="/shop"><Grid2X2 size={20}/>Shop</Link><button type="button" onClick={openSearch} aria-label="Search products" aria-expanded={searchOpen}><Search size={20}/>Search</button><Link href="/account"><UserRound size={20}/>Account</Link><Link href="/cart"><ShoppingBag size={20}/>Bag</Link></nav>
  </>;
}
