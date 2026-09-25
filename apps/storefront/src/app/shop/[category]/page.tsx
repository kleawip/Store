import { notFound } from "next/navigation";
import { Listing } from "@/components/listing";
import { categoryById, categories, products } from "@/data/products";

export function generateStaticParams() { return categories.map((category) => ({ category: category.id })); }
export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category: id } = await params;
  const category = categoryById(id);
  if (!category) notFound();
  return <Listing items={products.filter((product) => product.category === id)} title={category.title} intro={`Explore the Kleawip ${category.title.toLowerCase()} selection. Browse the details and find the right fit for your routine.`}/>;
}
