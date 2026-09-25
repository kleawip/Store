import Link from "next/link";
import { ArrowRight, PackageSearch } from "lucide-react";

export default function OrdersPage() {
  return <div className="page-width inner-page"><span className="section-overline">ACCOUNT DESIGN PREVIEW</span><h1>Orders & tracking</h1><div className="empty-state"><PackageSearch size={43}/><h2>No orders to display</h2><p>After secure account access is built, this page will show actual orders, shipment updates, invoices and return actions. No sample orders are invented here.</p><Link className="button button-primary" href="/shop">Browse products <ArrowRight size={18}/></Link></div></div>;
}
