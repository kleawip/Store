"use client";

import type { z } from "zod";
import type { AdminProductListResponse } from "@kleawip/contract";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Breadcrumbs } from "@/components/shell";
import { useSession } from "@/components/session";
import { api, ApiProblem, istTime, rupees } from "@/lib/api";

type List = z.infer<typeof AdminProductListResponse>;
const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
];
const CATEGORIES = [
  { slug: "automotive", title: "Automotive Care" },
  { slug: "bath", title: "Bath Towels" },
  { slug: "household", title: "Household Cleaning" },
  { slug: "personal", title: "Personal Care" },
  { slug: "pet", title: "Pet Care" },
];

function ProductList() {
  const params = useSearchParams();
  const router = useRouter();
  const { can } = useSession();
  const [status, setStatus] = useState("");
  const [list, setList] = useState<List | null>(null);
  const [creating, setCreating] = useState(false);
  const q = params.get("q") ?? "";

  useEffect(() => {
    const search = new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}) });
    setList(null);
    api<List>(`/v1/admin/products?${search}`).then(setList);
  }, [status, q]);

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Catalog" }, { label: "Products" }]} />
      <div className="page-head">
        <div>
          <h1>Products</h1>
          <p className="muted">{list ? `${list.totalCount} product${list.totalCount === 1 ? "" : "s"}` : "Loading…"}{q && ` matching “${q}”`}</p>
        </div>
        {can("catalogue.write") && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Add product</button>
        )}
      </div>

      <div className="tabs" role="tablist">
        {STATUS_TABS.map((tab) => (
          <button key={tab.value} role="tab" aria-selected={status === tab.value} className={status === tab.value ? "active" : ""} onClick={() => setStatus(tab.value)}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="card table-card">
        <table className="data-table">
          <thead>
            <tr><th>Product</th><th>Category</th><th>Status</th><th>SKUs</th><th>Price</th><th>Updated</th></tr>
          </thead>
          <tbody>
            {!list && <tr><td colSpan={6} className="muted">Loading products…</td></tr>}
            {list?.data.length === 0 && <tr><td colSpan={6} className="muted">No products match.</td></tr>}
            {list?.data.map((product) => (
              <tr key={product.id} onClick={() => router.push(`/products/${product.id}`)} className="row-link">
                <td>
                  <Link href={`/products/${product.id}`} className="product-cell" onClick={(event) => event.stopPropagation()}>
                    {product.thumbnailUrl ? <img src={product.thumbnailUrl} alt="" /> : <span className="thumb-empty" />}
                    <strong>{product.title}</strong>
                  </Link>
                </td>
                <td>{CATEGORIES.find((c) => c.slug === product.categorySlug)?.title ?? product.categorySlug}</td>
                <td><span className={`badge badge-${product.status}`}>{product.status}</span></td>
                <td>{product.variantCount || <span className="muted">None yet</span>}</td>
                <td>
                  {product.minPricePaise === null ? (
                    <span className="pending">Pending approval</span>
                  ) : product.minPricePaise === product.maxPricePaise ? (
                    rupees(product.minPricePaise)
                  ) : (
                    `${rupees(product.minPricePaise)} – ${rupees(product.maxPricePaise)}`
                  )}
                </td>
                <td className="muted">{istTime(product.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {creating && <CreateProduct onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateProduct({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [categorySlug, setCategorySlug] = useState("automotive");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      const created = await api<{ id: string }>("/v1/admin/products", { method: "POST", body: { title, categorySlug } });
      router.push(`/products/${created.id}`);
    } catch (problem) {
      setError(problem instanceof ApiProblem ? problem.errors[0]?.message ?? problem.message : "Could not create the product.");
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="create-title">
      <form className="modal" onSubmit={submit}>
        <h2 id="create-title">Add product</h2>
        <p className="muted">New products start as drafts. Nothing reaches the storefront until it passes the publish checklist.</p>
        <label>Title<input autoFocus required value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label>
          Category
          <select value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.title}</option>)}
          </select>
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary">Create draft</button>
        </div>
      </form>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense>
      <ProductList />
    </Suspense>
  );
}
