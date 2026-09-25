import { notFound } from "next/navigation";
import { ProductDetail } from "@/components/product-detail";
import { productById, products } from "@/data/products";

export function generateStaticParams() { return products.map((product) => ({ id: product.id })); }
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = productById(id);
  if (!product) notFound();
  return <ProductDetail product={product}/>;
}
