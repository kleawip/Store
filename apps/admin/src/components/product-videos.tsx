"use client";

import type { AdminProduct, AdminProductVideo, MediaAsset } from "@kleawip/contract";
import { ArrowDown, ArrowUp, ExternalLink, Film, Plus, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiProblem } from "@/lib/api";

type SourceType = "upload" | "instagram";
type Playback = "hosted" | "embed";

export function ProductVideos({ product, canWrite, canPublish }: { product: AdminProduct; canWrite: boolean; canPublish: boolean }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);
  const [videos, setVideos] = useState<AdminProductVideo[]>([]);
  const [posterAssets, setPosterAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [sourceType, setSourceType] = useState<SourceType>("instagram");
  const [playback, setPlayback] = useState<Playback>("hosted");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [posterAssetId, setPosterAssetId] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const posters = posterAssets;

  const load = useCallback(async () => {
    try {
      const result = await api<{ data: AdminProductVideo[] }>(`/v1/admin/products/${product.id}/videos`);
      setVideos(result.data);
      return true;
    } catch (problem) {
      setNotice({ error: true, text: problem instanceof ApiProblem ? problem.message : "Could not load product videos." });
      return false;
    } finally {
      setLoading(false);
    }
  }, [product.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api<{ data: MediaAsset[] }>("/v1/admin/media?limit=100").then((result) => setPosterAssets(result.data)).catch(() => {
      setNotice({ error: true, text: "Could not load the media library for poster selection." });
    });
  }, []);

  async function action(task: () => Promise<unknown>, success: string) {
    setBusy(true);
    setNotice(null);
    try {
      await task();
      if (await load()) setNotice({ error: false, text: success });
    } catch (problem) {
      setNotice({ error: true, text: problem instanceof ApiProblem ? problem.message : "Could not save the video. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  const hosted = sourceType === "upload" || playback === "hosted";
  const fileValid = !file || (file.size <= 100 * 1024 * 1024 && /\.(mp4|webm)$/i.test(file.name));
  const canAdd = canWrite && !busy && fileValid && caption.trim().length >= 3 && (!hosted || (!!file && !!posterAssetId)) && (sourceType !== "instagram" || (!!instagramUrl.trim() && rightsConfirmed));

  async function addVideo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAdd) return;
    await action(async () => {
      let videoAssetId: string | null = null;
      if (hosted && file) {
        const form = new FormData();
        form.append("file", file);
        const asset = await api<{ id: string }>("/v1/admin/media/videos", { method: "POST", form });
        videoAssetId = asset.id;
      }
      await api<AdminProductVideo>(`/v1/admin/products/${product.id}/videos`, {
        method: "POST",
        body: {
          sourceType,
          playback: hosted ? "hosted" : "embed",
          videoAssetId,
          posterAssetId: posterAssetId || null,
          instagramUrl: sourceType === "instagram" ? instagramUrl.trim() : null,
          caption: caption.trim(),
          rightsConfirmed: sourceType === "instagram" && rightsConfirmed,
        },
      });
      setCaption("");
      setInstagramUrl("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setRightsConfirmed(false);
    }, "Video saved as a draft. Review its checklist before publishing.");
  }

  function move(index: number, offset: number) {
    const ids = videos.map((video) => video.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + offset, 0, id);
    return action(() => api(`/v1/admin/products/${product.id}/videos/order`, { method: "PUT", body: { videoIds: ids } }), "Video order saved.");
  }

  async function uploadPoster(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("alt", `${product.title} video poster`);
      const asset = await api<MediaAsset>("/v1/admin/media", { method: "POST", form });
      setPosterAssets((items) => [asset, ...items.filter((item) => item.id !== asset.id)]);
      setPosterAssetId(asset.id);
      setNotice({ error: false, text: "Poster uploaded and selected." });
    } catch (problem) {
      setNotice({ error: true, text: problem instanceof ApiProblem ? problem.message : "Could not upload poster." });
    } finally {
      if (posterInputRef.current) posterInputRef.current.value = "";
      setBusy(false);
    }
  }

  return <section className="card product-videos">
    <header className="card-head"><h2><Film size={17} aria-hidden/> Product videos</h2><span className="muted small">{videos.length} of 10 slots</span></header>
    <p className="muted small">Brand videos appear on the product page, never in customer reviews. Uploaded files play on-site; Instagram embeds depend on Instagram and may not play in the local preview.</p>
    {notice && <div className={`alert ${notice.error ? "alert-error" : "alert-ok"}`} role={notice.error ? "alert" : "status"}>{notice.text}</div>}

    {loading ? <p className="muted">Loading videos…</p> : videos.length === 0 ? <p className="muted">No product videos yet.</p> : <div className="product-video-list">
      {videos.map((video, index) => <article key={video.id} className="product-video-item">
        <div className="product-video-summary">
          {video.poster ? <img src={video.poster.url} alt=""/> : <div className="product-video-empty-poster"><Film size={24}/></div>}
          <div>
            <strong>{video.caption || "Untitled draft"}</strong>
            <p className="muted small">{video.sourceType === "instagram" ? "Instagram Reel" : "Uploaded video"} · {video.playback === "hosted" ? "On-site playback" : "Instagram embed"} · {video.status}</p>
            {video.playback === "embed" && video.status !== "published" && <p className="warn-text">Embeds need live-domain playback QA before publishing.</p>}
            {video.instagramUrl && <a className="inline-link small" href={video.instagramUrl} target="_blank" rel="noopener noreferrer">Original post <ExternalLink size={13}/></a>}
          </div>
        </div>
        {video.video && <details className="product-video-preview"><summary>Preview on-site video</summary><video src={video.video.url} poster={video.poster?.url} controls playsInline preload="none"/></details>}
        {video.publishChecklist.some((check) => !check.ok) && <ul className="product-video-checklist">{video.publishChecklist.filter((check) => !check.ok).map((check) => <li key={check.code}>{check.message}</li>)}</ul>}
        <div className="product-video-actions">
          <button className="icon-btn" type="button" disabled={!canWrite || busy || index === 0} onClick={() => move(index, -1)} aria-label={`Move ${video.caption || "video"} earlier`}><ArrowUp size={15}/></button>
          <button className="icon-btn" type="button" disabled={!canWrite || busy || index === videos.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${video.caption || "video"} later`}><ArrowDown size={15}/></button>
          <button className="btn btn-small" type="button" disabled={!canPublish || busy || (video.status !== "published" && (video.playback === "embed" || video.publishChecklist.some((check) => !check.ok)))} title={video.status !== "published" && video.playback === "embed" ? "Confirm on-site playback on the live domain before publishing an embed." : undefined} onClick={() => action(() => api(`/v1/admin/products/${product.id}/videos/${video.id}/${video.status === "published" ? "unpublish" : "publish"}`, { method: "POST" }), video.status === "published" ? "Video unpublished." : "Video published to the product page.")}>{video.status === "published" ? "Unpublish" : "Publish"}</button>
          <button className="icon-btn danger" type="button" disabled={!canWrite || busy} onClick={() => { if (window.confirm(`Remove ${video.caption || "this video"} from this product?`)) action(() => api(`/v1/admin/products/${product.id}/videos/${video.id}`, { method: "DELETE" }), "Video removed from this product."); }} aria-label={`Remove ${video.caption || "video"}`}><Trash2 size={15}/></button>
        </div>
      </article>)}
    </div>}

    {canWrite && videos.length < 10 && <form onSubmit={addVideo} className="product-video-form">
      <h3><Plus size={16}/> Add a product video</h3>
      <div className="product-video-source" role="group" aria-label="Video source">
        <button type="button" className={sourceType === "instagram" ? "selected" : ""} aria-pressed={sourceType === "instagram"} onClick={() => { setSourceType("instagram"); setPlayback("hosted"); }}>Instagram Reel</button>
        <button type="button" className={sourceType === "upload" ? "selected" : ""} aria-pressed={sourceType === "upload"} onClick={() => { setSourceType("upload"); setPlayback("hosted"); }}>Upload only</button>
      </div>
      {sourceType === "instagram" && <label>Instagram Reel URL
        <input type="url" placeholder="https://www.instagram.com/reel/…/" value={instagramUrl} onChange={(event) => { setInstagramUrl(event.target.value); setRightsConfirmed(false); }} required/>
      </label>}
      {sourceType === "instagram" && <fieldset className="product-video-playback"><legend>Playback</legend>
        <label><input type="radio" name="video-playback" checked={playback === "hosted"} onChange={() => setPlayback("hosted")}/> Upload the same clip for reliable on-site playback</label>
        <label><input type="radio" name="video-playback" checked={playback === "embed"} onChange={() => setPlayback("embed")}/> Instagram embed (may not play locally)</label>
      </fieldset>}
      {hosted && <label>Video file <small>MP4 or WebM, up to 100 MB</small>
        <input ref={fileInputRef} type="file" accept=".mp4,.webm,video/mp4,video/webm" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required/>
        {!fileValid && <em className="field-error">Choose an MP4 or WebM file no larger than 100 MB.</em>}
      </label>}
      <label>Poster image {hosted && <small>Required for on-site playback</small>}
        <select value={posterAssetId} onChange={(event) => setPosterAssetId(event.target.value)} required={hosted}>
          <option value="">{posters.length ? "Select from the media library" : "Upload a poster image first"}</option>
          {posters.map((image) => <option key={image.id} value={image.id}>{image.alt || image.originalFilename}</option>)}
        </select>
      </label>
      <label className="product-video-poster-upload">Or upload a poster image <small>JPEG, PNG or WebP; up to 15 MB</small>
        <input ref={posterInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => uploadPoster(event.target.files?.[0])} disabled={busy}/>
      </label>
      <label>Caption <small>Describe what the video shows</small>
        <textarea maxLength={300} rows={2} value={caption} onChange={(event) => setCaption(event.target.value)} required/>
      </label>
      {sourceType === "instagram" && <label className="product-video-rights"><input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)}/> This is Kleawip&apos;s own post and we have permission to use its video and audio on this website.</label>}
      <button className="btn btn-primary" type="submit" disabled={!canAdd || videos.length >= 10 || busy}><Upload size={15}/> Save video draft</button>
    </form>}
  </section>;
}
