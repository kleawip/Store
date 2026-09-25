import { notFound } from "next/navigation";
import { ProductDetail } from "@/components/product-detail";
import { loadProductPage } from "@/lib/catalogue-api";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await loadProductPage(id);
  if (!record) notFound();
  return <ProductDetail {...record}/>;
}
