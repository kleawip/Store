"use client";

import type { AdminProduct } from "@kleawip/contract";
import {
  AlertTriangle, ArrowLeft, ArrowRight, BadgeCheck, CheckCircle2, Circle, ExternalLink, ImagePlus, Layers, MessageSquareText,
  PackageCheck, Plus, Save, Send, ShieldAlert, Smartphone, Tag, Trash2, Truck, Upload,
} from "lucide-react";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Breadcrumbs } from "@/components/shell";
import { useSession } from "@/components/session";
import { api, ApiProblem, istTime, rupees, type FieldError } from "@/lib/api";

const CATEGORIES = [
  { slug: "automotive", title: "Automotive Care" },
  { slug: "bath", title: "Bath Towels" },
  { slug: "household", title: "Household Cleaning" },
  { slug: "personal", title: "Personal Care" },
  { slug: "pet", title: "Pet Care" },
];

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "variants", label: "Variants & Inventory" },
  { id: "media", label: "Media & Gallery" },
  { id: "content", label: "Product Page & Accordions", later: "Next" },
  { id: "offers", label: "Offers & Rules", later: "Milestone 2" },
  { id: "reviews", label: "Reviews Moderation", later: "Later" },
  { id: "shipping", label: "Shipping & SEO", later: "Milestone 2" },
] as const;
type TabId = (typeof TABS)[number]["id"];

type Form = { title: string; detail: string; summary: string; spec: string; categorySlug: string; slug: string };
const formOf = (p: AdminProduct): Form => ({ title: p.title, detail: p.detail, summary: p.summary, spec: p.spec, categorySlug: p.categorySlug, slug: p.slug });

const STOREFRONT_ORIGIN = process.env.NEXT_PUBLIC_STOREFRONT_ORIGIN ?? "http://localhost:3000";

export default function ProductEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useSession();
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [tab, setTab] = useState<TabId>("overview");
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string; errors?: FieldError[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api<AdminProduct>(`/v1/admin/products/${id}`);
      setProduct(result);
      setForm(formOf(result));
    } catch (problem) {
      setLoadError(problem instanceof ApiProblem ? problem.message : "Could not load this product.");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(() => !!product && !!form && JSON.stringify(formOf(product)) !== JSON.stringify(form), [product, form]);

  // Warn before leaving with unsaved edits (Shopify pattern, ADMIN_SCREENS_BRIEF §0).
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function run(action: () => Promise<AdminProduct | void>, success: string) {
    setBusy(true);
    setNotice(null);
    try {
      const result = await action();
      if (result) {
        setProduct(result);
        setForm(formOf(result));
      } else {
        await load();
      }
      setNotice({ tone: "ok", text: success });
    } catch (problem) {
      if (problem instanceof ApiProblem) setNotice({ tone: "error", text: problem.message, errors: problem.errors });
      else setNotice({ tone: "error", text: "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  const save = () => {
    if (!product || !form) return;
    const patch = Object.fromEntries(Object.entries(form).filter(([key, value]) => (formOf(product) as Record<string, string>)[key] !== value));
    return run(() => api<AdminProduct>(`/v1/admin/products/${id}`, { method: "PATCH", body: patch }), "Draft saved.");
  };

  if (loadError) return <div className="page"><div className="alert alert-error">{loadError}</div></div>;
  if (!product || !form) return <div className="page"><div className="skeleton-block" /></div>;

  const checklist = product.publishChecklist;
  const done = checklist.filter((check) => check.ok).length;
  const ready = done === checklist.length;
  const category = CATEGORIES.find((c) => c.slug === product.categorySlug);
  const canWrite = can("catalogue.write");
  const fieldError = (path: string) => notice?.errors?.find((error) => error.path === path)?.message;

  return (
    <div className="page editor">
      <Breadcrumbs items={[{ label: "Catalog", href: "/products" }, { label: category?.title ?? product.categorySlug }, { label: product.title }]} />

      <div className="editor-head">
        <div className="editor-title">
          <h1>{product.title}</h1>
          <span className={`badge badge-${product.status}`}>
            {product.status === "draft" ? (ready ? "Draft · Ready" : "Draft · Incomplete") : product.status}
          </span>
          {product.isDemo && <span className="badge badge-demo" title="Seeded demo record, not client-approved data">Demo data</span>}
          <span className="muted small">{dirty ? "Unsaved changes" : `Saved ${istTime(product.updatedAt)} IST`}</span>
        </div>
        <div className="editor-actions">
          <button className="btn" onClick={save} disabled={!dirty || busy || !canWrite}><Save size={15} /> Save draft</button>
          <a
            className={`btn${product.status === "published" ? "" : " is-disabled"}`}
            href={product.status === "published" ? `${STOREFRONT_ORIGIN}/product/${product.slug}` : undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={product.status !== "published"}
            title={product.status === "published" ? "Open the live product page" : "Available once published"}
          >
            <ExternalLink size={15} /> Preview PDP
          </a>
          {product.status === "published" ? (
            <button className="btn" disabled={busy || !can("catalogue.publish")} onClick={() => run(() => api<AdminProduct>(`/v1/admin/products/${id}/unpublish`, { method: "POST" }), "Product unpublished. It is hidden from the storefront.")}>
              Unpublish
            </button>
          ) : (
            <button
              className="btn btn-primary"
              disabled={busy || dirty || !can("catalogue.publish")}
              title={dirty ? "Save your changes first" : !ready ? "Complete the publish checklist first" : undefined}
              onClick={() => run(() => api<AdminProduct>(`/v1/admin/products/${id}/publish`, { method: "POST" }), "Published to the storefront.")}
            >
              <Send size={15} /> Publish to storefront
            </button>
          )}
        </div>
      </div>

      {dirty && (
        <div className="unsaved-bar" role="status">
          <span>Unsaved changes</span>
          <button className="btn btn-ghost" onClick={() => setForm(formOf(product))}>Discard</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>Save</button>
        </div>
      )}

      <div className="tabs" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? "active" : ""}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            {"later" in item && <small>{item.later}</small>}
            {item.id === "variants" && <small className="count">{product.variants.length}</small>}
            {item.id === "media" && <small className="count">{product.media.length}</small>}
          </button>
        ))}
      </div>

      {notice && (
        <div className={`alert ${notice.tone === "ok" ? "alert-ok" : "alert-error"}`} role={notice.tone === "error" ? "alert" : "status"}>
          <strong>{notice.text}</strong>
          {notice.errors && notice.errors.length > 0 && (
            <ul>{notice.errors.map((error) => <li key={error.path + error.code}>{error.message}</li>)}</ul>
          )}
        </div>
      )}

      {!ready && product.status !== "published" && (
        <div className="alert alert-warn">
          <AlertTriangle size={17} aria-hidden />
          <div>
            <strong>Storefront publication blocked</strong>
            <span> {checklist.length - done} checklist item{checklist.length - done === 1 ? "" : "s"} remain. Checkout stays disabled until approved product data and integrations are complete.</span>
          </div>
          <span className="gate-tag">Publish gate active</span>
        </div>
      )}

      {tab === "overview" && (
        <div className="editor-grid">
          <div className="editor-main">
            <IdentityCard product={product} form={form} setForm={setForm} canWrite={canWrite} fieldError={fieldError} />
            <VariantSummary product={product} onManage={() => setTab("variants")} />
            <MediaSummary product={product} onManage={() => setTab("media")} />
            <IntegrationsCard product={product} />
          </div>
          <aside className="editor-side">
            <ChecklistCard checklist={checklist} />
            <div className="card safety-card">
              <ShieldAlert size={16} aria-hidden />
              <div>
                <strong>Ops safety protocol</strong>
                <p>Checkout remains disabled until approved product data and integrations are complete. Nothing here invents prices, stock or claims.</p>
              </div>
            </div>
            <MobilePreview product={product} form={form} />
          </aside>
        </div>
      )}

      {tab === "variants" && <VariantsTab product={product} canWrite={canWrite} onChange={(result, text) => run(async () => result, text)} run={run} />}
      {tab === "media" && <MediaTab product={product} canWrite={canWrite && can("media.write")} run={run} />}
      {TABS.find((item) => item.id === tab && "later" in item) && (
        <div className="card empty-card">
          <Layers size={22} aria-hidden />
          <h2>{TABS.find((item) => item.id === tab)!.label}</h2>
          <p>This section is planned for {(TABS.find((item) => item.id === tab) as { later: string }).later.toLowerCase() === "next" ? "the next build step" : (TABS.find((item) => item.id === tab) as { later: string }).later}. It needs client-approved rules before it can go live.</p>
        </div>
      )}
    </div>
  );
}

// ---- Overview cards ----

function IdentityCard({
  product, form, setForm, canWrite, fieldError,
}: {
  product: AdminProduct;
  form: Form;
  setForm: (form: Form) => void;
  canWrite: boolean;
  fieldError: (path: string) => string | undefined;
}) {
  const set = (key: keyof Form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [key]: event.target.value });
  return (
    <section className="card">
      <header className="card-head">
        <h2><BadgeCheck size={17} aria-hidden /> Core product identity & classification</h2>
      </header>
      <div className="form-grid">
        <label className="span-2">
          Product title <small>Approved display name</small>
          <input value={form.title} onChange={set("title")} disabled={!canWrite} aria-invalid={!!fieldError("title")} />
          {fieldError("title") && <em className="field-error">{fieldError("title")}</em>}
        </label>
        <label className="span-2">
          Subtitle & primary commercial summary
          <textarea rows={3} value={form.summary} onChange={set("summary")} disabled={!canWrite} placeholder="Awaiting client catalogue copy" />
        </label>
        <label>
          Primary category
          <select value={form.categorySlug} onChange={set("categorySlug")} disabled={!canWrite}>
            {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.title}</option>)}
          </select>
        </label>
        <label>
          URL slug {product.slugLocked && <small>Locked after first publish</small>}
          <input value={form.slug} onChange={set("slug")} disabled={!canWrite || product.slugLocked} aria-invalid={!!fieldError("slug")} />
          {fieldError("slug") && <em className="field-error">{fieldError("slug")}</em>}
        </label>
        <label>
          Short detail line
          <input value={form.detail} onChange={set("detail")} disabled={!canWrite} placeholder="e.g. 40 × 60 cm · twisted loop" />
        </label>
        <label>
          Verified fabric spec
          <input value={form.spec} onChange={set("spec")} disabled={!canWrite} placeholder="e.g. 1200 GSM" />
        </label>
      </div>
    </section>
  );
}

function ChecklistCard({ checklist }: { checklist: AdminProduct["publishChecklist"] }) {
  const done = checklist.filter((check) => check.ok).length;
  return (
    <section className="card checklist-card">
      <header className="card-head">
        <h2>Publish readiness checklist</h2>
        <span className={done === checklist.length ? "ok-text" : "warn-text"}>{done} of {checklist.length} complete</span>
      </header>
      <div className="progress" aria-hidden><span style={{ width: `${(done / checklist.length) * 100}%` }} /></div>
      <ul>
        {checklist.map((check) => (
          <li key={check.code} className={check.ok ? "done" : ""}>
            {check.ok ? <CheckCircle2 size={15} aria-label="Done" /> : <Circle size={15} aria-label="To do" />}
            <span>{check.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function VariantSummary({ product, onManage }: { product: AdminProduct; onManage: () => void }) {
  return (
    <section className="card">
      <header className="card-head">
        <h2><Tag size={17} aria-hidden /> Variant matrix & inventory allocation</h2>
        <button className="btn btn-small" onClick={onManage}>Manage variants <ArrowRight size={14} /></button>
      </header>
      {product.variants.some((variant) => variant.pricePaise === null) || product.variants.length === 0 ? (
        <p className="info-strip">Variant pricing is unverified. The storefront shows “Price to be confirmed” until the commercial list is approved.</p>
      ) : null}
      <VariantTable product={product} />
    </section>
  );
}

function VariantTable({ product }: { product: AdminProduct }) {
  const groups = product.optionGroups;
  const label = (code: string, value: string) => groups.find((g) => g.code === code)?.values.find((v) => v.code === value)?.label ?? value;
  return (
    <div className="table-scroll">
      <table className="data-table compact">
        <thead>
          <tr>
            {groups.length ? groups.map((group) => <th key={group.code}>{group.label}</th>) : <th>Variant</th>}
            <th>SKU</th><th>Stock</th><th>Sale price</th><th>MRP</th><th>GST</th><th>HSN</th>
          </tr>
        </thead>
        <tbody>
          {product.variants.length === 0 && (
            <tr className="awaiting">
              <td colSpan={groups.length + 6 || 7}>Awaiting client catalogue: no approved SKUs, sizes, packs or prices yet.</td>
            </tr>
          )}
          {product.variants.map((variant) => (
            <tr key={variant.sku} className={variant.status === "archived" ? "archived" : ""}>
              {groups.length ? groups.map((group) => <td key={group.code}>{label(group.code, variant.options[group.code] ?? "")}</td>) : <td>Default</td>}
              <td className="mono">{variant.sku}</td>
              <td>
                {variant.sellableQuantity === null ? "Not tracked" : `${variant.sellableQuantity} sellable`}
                {variant.stockMode === "shared" && <small className="muted block">uses {variant.inventoryUnitsPerSale} single units</small>}
              </td>
              <td>{rupees(variant.pricePaise) ?? <span className="pending">Pending</span>}</td>
              <td>{rupees(variant.mrpPaise) ?? <span className="muted">—</span>}</td>
              <td>{variant.taxRateBasisPoints === null ? <span className="pending">Missing</span> : `${variant.taxRateBasisPoints / 100}%`}</td>
              <td>{variant.hsnCode ?? <span className="pending">Missing</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MediaSummary({ product, onManage }: { product: AdminProduct; onManage: () => void }) {
  return (
    <section className="card">
      <header className="card-head">
        <h2><ImagePlus size={17} aria-hidden /> Media & gallery order</h2>
        <button className="btn btn-small" onClick={onManage}>Manage media <ArrowRight size={14} /></button>
      </header>
      <div className="media-strip">
        {product.media.map((image, index) => (
          <figure key={image.id} className={index === 0 ? "primary" : ""}>
            <span className="slot-tag">{index === 0 ? "Slot 1 · Primary" : `Slot ${index + 1}`}</span>
            <img src={image.url} alt={image.alt} />
            <figcaption>{image.alt || <span className="pending">Alt text missing</span>}</figcaption>
          </figure>
        ))}
        <button className="media-add" onClick={onManage}><Upload size={18} /> Upload or select</button>
      </div>
    </section>
  );
}

function IntegrationsCard({ product }: { product: AdminProduct }) {
  const items = [
    { icon: Truck, title: "Logistics & pincode engine", status: "Not configured", text: "Pincode serviceability, COD and delivery estimates stay hidden until the courier (Shiprocket or DTDC) is selected and tested." },
    { icon: Tag, title: "Offer & discount rules", status: "Milestone 2", text: "No offer can appear on this product until the offer engine exists and a rule is approved." },
    { icon: MessageSquareText, title: "Customer reviews moderation", status: "No reviews", text: "Only genuine, verified reviews will be shown. Nothing is imported or invented." },
    {
      icon: PackageCheck,
      title: "Accordions: care & returns",
      status: product.contentSections.length ? `${product.contentSections.length} section(s)` : "Awaiting copy",
      text: "Care, FAQ and returns copy must be approved and agree with checkout policies.",
    },
  ];
  return (
    <section className="card">
      <header className="card-head"><h2><ShieldAlert size={17} aria-hidden /> Storefront integrations & compliance rules</h2></header>
      <div className="integration-grid">
        {items.map(({ icon: Icon, title, status, text }) => (
          <div key={title} className="integration">
            <div><Icon size={16} aria-hidden /><strong>{title}</strong><span className="status-tag">{status}</span></div>
            <p>{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function MobilePreview({ product, form }: { product: AdminProduct; form: Form }) {
  const [imageIndex, setImageIndex] = useState(0);
  const priced = product.variants.filter((variant) => variant.status === "active" && variant.pricePaise !== null);
  const from = priced.length ? Math.min(...priced.map((variant) => variant.pricePaise!)) : null;
  const image = product.media[imageIndex];
  return (
    <section className="card preview-card">
      <header className="card-head">
        <h2><Smartphone size={16} aria-hidden /> Storefront mobile PDP preview</h2>
        <span className="live-tag">Live sync</span>
      </header>
      <div className="phone">
        <div className="phone-bar"><ArrowLeft size={13} /><strong>KLEAWIP</strong><span /></div>
        <div className="phone-image">
          {image ? <img src={image.url} alt={image.alt} /> : <span className="muted">No image yet</span>}
          {product.media.length > 1 && (
            <div className="phone-dots">
              {product.media.map((m, index) => (
                <button key={m.id} className={index === imageIndex ? "on" : ""} onClick={() => setImageIndex(index)} aria-label={`Image ${index + 1}`} />
              ))}
            </div>
          )}
        </div>
        <div className="phone-body">
          <small>{form.spec || "Spec pending"} · {CATEGORIES.find((c) => c.slug === form.categorySlug)?.title}</small>
          <strong>{form.title}</strong>
          <p className="phone-price">{from === null ? "Price to be confirmed" : `From ${rupees(from)}`}</p>
          {product.optionGroups.map((group) => (
            <div key={group.code} className="phone-options">
              <small>Select {group.label.toLowerCase()}</small>
              <div>{group.values.map((value) => <span key={value.code}>{value.label}</span>)}</div>
            </div>
          ))}
          <div className="phone-delivery"><span>Pincode & delivery</span><em>Pending courier</em></div>
          <button disabled>Add to bag (checkout disabled)</button>
        </div>
      </div>
    </section>
  );
}

// ---- Variants tab ----

function VariantsTab({
  product, canWrite, run,
}: {
  product: AdminProduct;
  canWrite: boolean;
  onChange: (result: AdminProduct, text: string) => void;
  run: (action: () => Promise<AdminProduct | void>, success: string) => Promise<void>;
}) {
  const [groupsText, setGroupsText] = useState(
    product.optionGroups.map((group) => `${group.label}: ${group.values.map((v) => v.label).join(", ")}`).join("\n"),
  );
  const toCode = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const saveOptions = () => {
    const groups = groupsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, values = ""] = line.split(":");
        return {
          code: toCode(label!),
          label: label!.trim(),
          values: values.split(",").map((v) => v.trim()).filter(Boolean).map((v) => ({ code: toCode(v), label: v, swatch: null })),
        };
      });
    return run(() => api<AdminProduct>(`/v1/admin/products/${product.id}/options`, { method: "PUT", body: { groups } }), "Options saved.");
  };

  return (
    <div className="editor-grid">
      <div className="editor-main">
        <section className="card">
          <header className="card-head"><h2><Tag size={17} aria-hidden /> Variants</h2></header>
          <VariantTable product={product} />
        </section>
        {canWrite && <AddVariant product={product} run={run} />}
      </div>
      <aside className="editor-side">
        <section className="card">
          <header className="card-head"><h2>Option groups</h2></header>
          <p className="muted small">One group per line, e.g. <code>Pack: Single, Pack of 2</code>. Up to 3 groups. Values used by a SKU can’t be removed.</p>
          <textarea rows={5} className="mono" value={groupsText} onChange={(e) => setGroupsText(e.target.value)} disabled={!canWrite} />
          {canWrite && <button className="btn btn-block" onClick={saveOptions}>Save option groups</button>}
        </section>
      </aside>
    </div>
  );
}

function AddVariant({ product, run }: { product: AdminProduct; run: (action: () => Promise<AdminProduct | void>, success: string) => Promise<void> }) {
  const [sku, setSku] = useState("");
  const [options, setOptions] = useState<Record<string, string>>({});
  const [price, setPrice] = useState("");
  const [mrp, setMrp] = useState("");
  const [gst, setGst] = useState("");
  const [hsn, setHsn] = useState("");
  const [pack, setPack] = useState("1");
  const [stockMode, setStockMode] = useState<"own" | "shared">("own");
  const [fromSku, setFromSku] = useState("");
  const toPaise = (value: string) => (value.trim() === "" ? null : Math.round(Number(value) * 100));
  const singleUnitSkus = product.variants.filter((v) => v.stockMode === "own" && v.inventoryUnitsPerSale === 1);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const body = {
      sku: sku.trim().toUpperCase(),
      options,
      pricePaise: toPaise(price),
      mrpPaise: toPaise(mrp),
      taxRateBasisPoints: gst.trim() === "" ? null : Math.round(Number(gst) * 100),
      hsnCode: hsn.trim() || null,
      packQuantity: Number(pack) || 1,
      stock: stockMode === "own" ? { mode: "own" } : { mode: "shared", fromSku },
    };
    return run(() => api<AdminProduct>(`/v1/admin/products/${product.id}/variants`, { method: "POST", body }), `SKU ${body.sku} added.`);
  };

  return (
    <form className="card" onSubmit={submit}>
      <header className="card-head"><h2><Plus size={17} aria-hidden /> Add SKU</h2></header>
      <div className="form-grid three">
        <label>SKU<input required value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. KLW-TL1200-P1" className="mono" /></label>
        {product.optionGroups.map((group) => (
          <label key={group.code}>
            {group.label}
            <select required value={options[group.code] ?? ""} onChange={(e) => setOptions({ ...options, [group.code]: e.target.value })}>
              <option value="" disabled>Choose…</option>
              {group.values.map((value) => <option key={value.code} value={value.code}>{value.label}</option>)}
            </select>
          </label>
        ))}
        <label>Sale price ₹ <small>blank = pending</small><input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        <label>MRP ₹<input inputMode="decimal" value={mrp} onChange={(e) => setMrp(e.target.value)} /></label>
        <label>GST %<input inputMode="decimal" value={gst} onChange={(e) => setGst(e.target.value)} /></label>
        <label>HSN<input inputMode="numeric" value={hsn} onChange={(e) => setHsn(e.target.value)} /></label>
        <label>Pack quantity<input type="number" min={1} max={100} value={pack} onChange={(e) => setPack(e.target.value)} /></label>
        <label>
          Stock source
          <select value={stockMode} onChange={(e) => setStockMode(e.target.value as "own" | "shared")}>
            <option value="own">Own stock</option>
            <option value="shared" disabled={!singleUnitSkus.length}>Uses single-unit stock</option>
          </select>
        </label>
        {stockMode === "shared" && (
          <label>
            Draw from SKU
            <select required value={fromSku} onChange={(e) => setFromSku(e.target.value)}>
              <option value="" disabled>Choose…</option>
              {singleUnitSkus.map((v) => <option key={v.sku} value={v.sku}>{v.sku}</option>)}
            </select>
          </label>
        )}
      </div>
      {stockMode === "shared" && <p className="info-strip">Each sale of this SKU uses {Number(pack) || 1} units of {fromSku || "the chosen SKU"}’s stock.</p>}
      <button className="btn btn-primary">Add SKU</button>
    </form>
  );
}

// ---- Media tab ----

function MediaTab({ product, canWrite, run }: { product: AdminProduct; canWrite: boolean; run: (action: () => Promise<AdminProduct | void>, success: string) => Promise<void> }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [alts, setAlts] = useState<Record<string, string>>({});

  const upload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    await run(async () => {
      const asset = await api<{ id: string }>("/v1/admin/media", { method: "POST", form });
      return api<AdminProduct>(`/v1/admin/products/${product.id}/media`, { method: "POST", body: { assetId: asset.id } });
    }, "Image uploaded. Add alt text before publishing.");
    if (fileInput.current) fileInput.current.value = "";
  };

  const move = (index: number, delta: number) => {
    const ids = product.media.map((m) => m.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved!);
    return run(() => api<AdminProduct>(`/v1/admin/products/${product.id}/media/order`, { method: "PUT", body: { mediaIds: ids } }), "Gallery order saved.");
  };

  return (
    <section className="card">
      <header className="card-head">
        <h2><ImagePlus size={17} aria-hidden /> Media & gallery order</h2>
        {canWrite && (
          <>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => upload(e.target.files)} />
            <button className="btn btn-primary btn-small" onClick={() => fileInput.current?.click()}><Upload size={14} /> Upload image</button>
          </>
        )}
      </header>
      <p className="muted small">JPEG, PNG or WebP, up to 15 MB, at least 300 px. Images are converted to WebP and camera data (including GPS) is removed. Slot 1 is the primary image.</p>
      <div className="media-grid">
        {product.media.length === 0 && <p className="muted">No images yet.</p>}
        {product.media.map((image, index) => (
          <figure key={image.id}>
            <span className="slot-tag">{index === 0 ? "Slot 1 · Primary" : `Slot ${index + 1}`}</span>
            <img src={image.url} alt={image.alt} />
            <label>
              Alt text
              <input
                value={alts[image.id] ?? image.alt}
                onChange={(e) => setAlts({ ...alts, [image.id]: e.target.value })}
                disabled={!canWrite}
                aria-invalid={!image.alt}
                placeholder="Describe the image"
              />
            </label>
            {canWrite && (
              <div className="media-actions">
                <button className="icon-btn" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move earlier"><ArrowLeft size={14} /></button>
                <button className="icon-btn" disabled={index === product.media.length - 1} onClick={() => move(index, 1)} aria-label="Move later"><ArrowRight size={14} /></button>
                <button
                  className="btn btn-small"
                  disabled={(alts[image.id] ?? image.alt) === image.alt}
                  onClick={() => run(() => api<AdminProduct>(`/v1/admin/products/${product.id}/media/${image.id}`, { method: "PATCH", body: { alt: alts[image.id] } }), "Alt text saved.")}
                >
                  Save alt
                </button>
                <button className="icon-btn danger" onClick={() => run(() => api<AdminProduct>(`/v1/admin/products/${product.id}/media/${image.id}`, { method: "DELETE" }), "Image removed from this product.")} aria-label="Remove image">
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </figure>
        ))}
      </div>
    </section>
  );
}
