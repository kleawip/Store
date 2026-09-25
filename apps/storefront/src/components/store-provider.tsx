"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { addLine, changeQuantity, validBagLines, type BagLine } from "@/lib/bag";
import { playCartSound } from "@/lib/cart-sound";
import { products } from "@/data/products";
import { validWishlistIds } from "@/lib/wishlist";

const knownProductIds = new Set(products.map((product) => product.id));

type Theme = "light" | "dark";
type StoreState = {
  theme: Theme;
  toggleTheme: () => void;
  bag: BagLine[];
  addToBag: (id: string, quantity?: number) => void;
  setQuantity: (id: string, quantity: number) => void;
  soundEnabled: boolean;
  toggleCartSound: () => void;
  wishlist: string[];
  toggleWishlist: (id: string) => void;
};

const StoreContext = createContext<StoreState | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [bag, setBag] = useState<BagLine[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      setTheme(localStorage.getItem("kleawip-theme") === "dark" ? "dark" : "light");
      setBag(validBagLines(JSON.parse(localStorage.getItem("kleawip-preview-bag") || "[]"), knownProductIds));
      setSoundEnabled(localStorage.getItem("kleawip-cart-sound") !== "off");
      const saved = JSON.parse(localStorage.getItem("kleawip-preview-wishlist") || "[]");
      setWishlist(validWishlistIds(saved, knownProductIds));
    } catch {
      setBag([]);
      setWishlist([]);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (hydrated) localStorage.setItem("kleawip-theme", theme);
  }, [theme, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem("kleawip-preview-bag", JSON.stringify(bag)); }, [bag, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem("kleawip-cart-sound", soundEnabled ? "on" : "off"); }, [soundEnabled, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem("kleawip-preview-wishlist", JSON.stringify(wishlist)); }, [wishlist, hydrated]);

  const addToBag = useCallback((id: string, quantity = 1) => {
    if (!knownProductIds.has(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return;
    setBag((current) => addLine(current, id, quantity));
    if (soundEnabled) playCartSound();
  }, [soundEnabled]);
  const setQuantity = useCallback((id: string, quantity: number) => {
    if (!knownProductIds.has(id)) return;
    setBag((current) => changeQuantity(current, id, quantity));
  }, []);
  const toggleCartSound = useCallback(() => setSoundEnabled((enabled) => !enabled), []);
  const toggleWishlist = useCallback((id: string) => {
    if (!knownProductIds.has(id)) return;
    setWishlist((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }, []);
  const value = useMemo(() => ({ theme, toggleTheme: () => setTheme((current) => current === "light" ? "dark" : "light"), bag, addToBag, setQuantity, soundEnabled, toggleCartSound, wishlist, toggleWishlist }), [theme, bag, addToBag, setQuantity, soundEnabled, toggleCartSound, wishlist, toggleWishlist]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error("StoreProvider is missing");
  return value;
}
