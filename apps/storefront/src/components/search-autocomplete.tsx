"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FolderOpen, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { searchSuggestions } from "@/lib/search";

export function SearchAutocomplete({ variant, initialQuery = "", autoFocus = false, onNavigate, onQueryChange }: { variant: "header" | "page" | "overlay"; initialQuery?: string; autoFocus?: boolean; onNavigate?: () => void; onQueryChange?: (query: string) => void }) {
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const router = useRouter();
  const term = query.trim();
  const suggestions = searchSuggestions(term);
  const resultUrl = `/search?q=${encodeURIComponent(term)}`;
  const options = [...suggestions.map((suggestion) => suggestion.href), resultUrl];
  const visible = open && term.length > 0;

  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!term) return;
    router.push(resultUrl);
    onNavigate?.();
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && term) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => event.key === "ArrowDown" ? (current + 1) % options.length : (current - 1 + options.length) % options.length);
    } else if (event.key === "Enter" && visible && activeIndex >= 0) {
      event.preventDefault();
      router.push(options[activeIndex]);
      onNavigate?.();
      setOpen(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
    }
  }

  return <form ref={rootRef} className={`${variant === "header" ? "header-search" : variant === "overlay" ? "overlay-search" : "search-page-form"} search-autocomplete`} onSubmit={submit} role="search" autoComplete="off">
    {variant !== "overlay" && <Search size={variant === "header" ? 19 : 21} aria-hidden="true"/>}
    <input
      ref={inputRef}
      name="q"
      aria-label="Search products"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={visible}
      aria-controls={visible ? listId : undefined}
      aria-activedescendant={visible && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
      placeholder={variant === "header" ? "Search towels, GSM, car care..." : "Search towels, GSM, car care..."}
      value={query}
      onChange={(event) => { setQuery(event.target.value); onQueryChange?.(event.target.value); setOpen(true); setActiveIndex(-1); }}
      onFocus={() => { if (term) setOpen(true); }}
      onKeyDown={keyDown}
    />
    {term && <button type="button" className="search-clear" aria-label="Clear search" onClick={() => { setQuery(""); onQueryChange?.(""); setOpen(false); setActiveIndex(-1); inputRef.current?.focus(); }}><X size={16}/></button>}
    <button className={variant === "page" || variant === "overlay" ? "button button-primary" : ""} type="submit" aria-label={variant === "overlay" ? "Search all products" : undefined}>{variant === "overlay" ? <Search size={20} aria-hidden="true"/> : "Search"}</button>
    {visible && <div id={listId} className="search-suggestion-panel" role="listbox" aria-label="Search suggestions">
      {suggestions.length > 0 ? suggestions.map((suggestion, index) => <Link
        key={`${suggestion.kind}-${suggestion.id}`}
        id={`${listId}-${index}`}
        className={`search-suggestion-row ${activeIndex === index ? "is-active" : ""}`}
        role="option"
        aria-selected={activeIndex === index}
        href={suggestion.href}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => { setOpen(false); setActiveIndex(-1); onNavigate?.(); }}
      >
        {suggestion.kind === "product" ? <span className="search-suggestion-thumb"><Image src={suggestion.image} alt="" fill sizes="48px"/></span> : <span className="search-suggestion-icon"><FolderOpen size={19}/></span>}
        <span className="search-suggestion-copy"><strong>{suggestion.title}</strong><small>{suggestion.kind === "category" ? "Category" : suggestion.detail}</small></span>
        <ArrowRight size={16} aria-hidden="true"/>
      </Link>) : <div className="search-suggestion-empty">No catalogue matches yet. Try a product, category or GSM.</div>}
      <Link id={`${listId}-${suggestions.length}`} className={`search-suggestion-all ${activeIndex === suggestions.length ? "is-active" : ""}`} role="option" aria-selected={activeIndex === suggestions.length} href={resultUrl} onMouseEnter={() => setActiveIndex(suggestions.length)} onClick={() => { setOpen(false); setActiveIndex(-1); onNavigate?.(); }}>View all results for “{term}” <ArrowRight size={16}/></Link>
    </div>}
  </form>;
}
