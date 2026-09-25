import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";

export const metadata = { title: "Our clients" };
export default function ClientsPage() {
  return <div className="page-width inner-page business-page"><span className="section-overline">WHO WE WORK WITH</span><h1>Built around real working needs.</h1><p className="business-lead">Kleawip supports customers across automotive, home and professional-use categories. Approved customer stories and logos will be published here only with permission.</p><div className="clients-placeholder"><ShieldCheck size={35}/><h2>Client stories are being prepared</h2><p>We are confirming names, logos, use cases and publishing rights with the Kleawip team. No unapproved endorsements are shown in this preview.</p></div><div className="business-cta"><div><span className="section-overline">WORK WITH KLEAWIP</span><h2>Have a product requirement?</h2><p>Start with a bulk enquiry and the team can discuss the right range for your business.</p></div><Link className="button button-primary" href="/bulk">Explore bulk enquiries <ArrowRight size={18}/></Link></div></div>;
}
