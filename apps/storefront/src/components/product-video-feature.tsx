"use client";

import Image from "next/image";
import { ArrowUpRight, Instagram, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ProductDetail as CatalogueProductDetail } from "@kleawip/contract";
import { kleawipInstagram } from "../data/social-content";

type ProductVideo = CatalogueProductDetail["videos"][number];

function timeLabel(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function ProductVideoFeature({ video, previewImage, demo = false }: { video: ProductVideo; previewImage: string; demo?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const userPausedRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);
  const isInstagram = video.source === "instagram";
  const originalUrl = video.instagramUrl ?? (video.playback.kind === "instagram_embed" ? video.playback.permalink : null);
  const poster = video.playback.poster?.url ?? previewImage;

  useEffect(() => {
    const player = videoRef.current;
    if (!player) return;
    if (player.readyState >= 1) setDuration(player.duration);
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !userPausedRef.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        player.play().catch(() => setPlaying(false));
      } else {
        player.pause();
      }
    }, { threshold: 0.4 });
    observer.observe(player);
    return () => observer.disconnect();
  }, []);

  function togglePlayback() {
    const player = videoRef.current;
    if (!player) return;
    if (player.paused) {
      userPausedRef.current = false;
      player.play().catch(() => setPlaying(false));
    } else {
      userPausedRef.current = true;
      player.pause();
    }
  }

  function toggleMute() {
    const player = videoRef.current;
    if (!player) return;
    player.muted = !player.muted;
    setMuted(player.muted);
  }

  function seek(seconds: number) {
    const player = videoRef.current;
    if (!player || !Number.isFinite(player.duration)) return;
    player.currentTime = seconds;
    setCurrentTime(seconds);
  }

  return <section className="pdp-instagram" aria-labelledby={`product-video-${video.id}`}>
    <div className="pdp-instagram-copy">
      <span className="section-overline">{isInstagram ? "FROM KLEAWIP'S INSTAGRAM" : "KLEAWIP PRODUCT VIDEO"}</span>
      <h2 id={`product-video-${video.id}`}>{video.caption}</h2>
      <p>Watch this product in motion without leaving the page.</p>
      <p className="pdp-instagram-disclaimer">{demo ? "Local demo video; not published from the admin catalogue. " : ""}Brand content, not a customer review or verified purchase. {video.playback.kind === "hosted" ? "Sound starts off." : "Instagram controls are provided by the embedded player."}</p>
      {isInstagram && <a href={kleawipInstagram.profileUrl} target="_blank" rel="noopener noreferrer" className="inline-link">Visit @kleawip <ArrowUpRight size={17}/></a>}
    </div>
    <div className="pdp-instagram-media">
      <div className="pdp-instagram-player">
        {failed ? <div className="pdp-instagram-fallback">
          <Image src={poster} alt="Product video poster" fill unoptimized sizes="(max-width: 760px) 90vw, 300px"/>
          <p>Video unavailable in this browser.</p>
          {originalUrl && <a href={originalUrl} target="_blank" rel="noopener noreferrer">View the original post <ArrowUpRight size={15}/></a>}
        </div> : video.playback.kind === "hosted" ? <>
          <video
            ref={videoRef}
            src={video.playback.url}
            poster={poster}
            preload="metadata"
            playsInline
            muted={muted}
            loop
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
            onDurationChange={(event) => setDuration(event.currentTarget.duration)}
            onError={() => setFailed(true)}
            aria-label={video.caption}
          />
          <div className="pdp-instagram-controls" aria-label="Video controls">
            <button type="button" onClick={togglePlayback} aria-label={playing ? "Pause video" : "Play video"}>{playing ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}</button>
            <input type="range" min="0" max={duration || 1} step="0.1" value={Math.min(currentTime, duration || 1)} onChange={(event) => seek(Number(event.target.value))} aria-label="Video playback position"/>
            <span aria-hidden="true">{timeLabel(currentTime)} / {timeLabel(duration)}</span>
            <button type="button" onClick={toggleMute} aria-label={muted ? "Unmute video" : "Mute video"}>{muted ? <VolumeX size={19}/> : <Volume2 size={19}/>}</button>
          </div>
        </> : <div className="pdp-instagram-embed">
          <iframe title={video.caption} src={`${video.playback.permalink}embed/`} loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin"/>
          <a href={video.playback.permalink} target="_blank" rel="noopener noreferrer">If the player does not load, view the original post <ArrowUpRight size={14}/></a>
        </div>}
      </div>
      <footer className="pdp-instagram-footer">
        {isInstagram ? <><Instagram size={17}/><span>From <a href={kleawipInstagram.profileUrl} target="_blank" rel="noopener noreferrer">@kleawip</a></span>{originalUrl && <a href={originalUrl} target="_blank" rel="noopener noreferrer" aria-label="View original video on Instagram">Original post <ArrowUpRight size={15}/></a>}</> : <span>Kleawip product video</span>}
      </footer>
    </div>
  </section>;
}

export function ProductVideos({ catalogue, productId, previewImage }: { catalogue: CatalogueProductDetail | null; productId: string; previewImage: string }) {
  const published = catalogue?.videos ?? [];
  const showDemo = !published.length && (catalogue?.isDemo ?? true) && productId === kleawipInstagram.productId;
  const demoVideo: ProductVideo = {
    id: "twisted-loop-local-preview",
    caption: "See the towel in motion",
    source: "instagram",
    instagramUrl: kleawipInstagram.reelUrl,
    playback: { kind: "hosted", url: kleawipInstagram.videoUrl, mimeType: "video/mp4", poster: { url: previewImage, width: 900, height: 900 } },
  };
  const videos = showDemo ? [demoVideo] : published;
  if (!videos.length) return null;
  return <div className="pdp-product-videos">{videos.map((video) => <ProductVideoFeature key={video.id} video={video} previewImage={previewImage} demo={showDemo}/>)}</div>;
}
