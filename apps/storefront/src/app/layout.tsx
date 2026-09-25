import type { Metadata } from "next";
import { Manrope, Inter } from "next/font/google";
import { StoreProvider } from "@/components/store-provider";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-heading", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Kleawip | Microfiber essentials", template: "%s | Kleawip" },
  description: "Explore Kleawip microfiber products for automotive care, home, bath and personal care.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body className={`${manrope.variable} ${inter.variable}`}><StoreProvider><SiteHeader/><main id="main-content">{children}</main><SiteFooter/></StoreProvider></body></html>;
}
