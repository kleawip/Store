import { Listing } from "@/components/listing";
import { products } from "@/data/products";

export const metadata = { title: "Shop all products" };
export default function ShopPage() { return <Listing items={products} title="Explore all products" intro="Choose from Kleawip's current microfiber catalogue. Final variants and prices are being confirmed for the new store."/>; }
