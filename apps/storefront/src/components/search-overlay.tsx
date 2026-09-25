"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { categories } from "@/data/products";
import { SearchAutocomplete } from "./search-autocomplete";

export function SearchOverlay({ onClose, onNavigate }: { onClose: () => void; onNavigate: () => void }) {
  const [query, setQuery] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])'));
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
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return <div className="search-overlay-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panelRef} className="search-overlay-panel" role="dialog" aria-modal="true" aria-label="Search Kleawip products">
      <div className="search-overlay-content page-width">
        <div className="search-overlay-controls"><SearchAutocomplete variant="overlay" autoFocus onNavigate={onNavigate} onQueryChange={setQuery}/><button className="icon-button search-overlay-close" type="button" aria-label="Close search" onClick={onClose}><X size={22}/></button></div>
        {!query.trim() && <div className="search-overlay-discover"><span>Popular</span><div>{categories.map((category) => <Link key={category.id} href={`/shop/${category.id}`} onClick={onNavigate}>{category.title}</Link>)}</div></div>}
      </div>
    </div>
  </div>;
}
