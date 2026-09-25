"use client";

import Image from "next/image";
import { ArrowUpRight, Instagram, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { kleawipInstagram } from "@/data/social-content";

function timeLabel(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function InstagramFeature({ previewImage }: { previewImage: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const userPausedRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.readyState >= 1) setDuration(video.duration);
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !userPausedRef.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        video.play().catch(() => setPlaying(false));
      } else {
        video.pause();
      }
    }, { threshold: 0.4 });
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      userPausedRef.current = false;
      video.play().catch(() => setPlaying(false));
    } else {
      userPausedRef.current = true;
      video.pause();
    }
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }

  function seek(seconds: number) {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    video.currentTime = seconds;
    setCurrentTime(seconds);
  }

  return <section className="pdp-instagram" aria-labelledby="pdp-instagram-title">
    <div className="pdp-instagram-copy">
      <span className="section-overline">KLEAWIP SOCIAL</span>
      <h2 id="pdp-instagram-title">See the towel in motion</h2>
      <p>A short reel from Kleawip&apos;s official Instagram showing the 1200 GSM Twisted Loop cloth.</p>
      <p className="pdp-instagram-disclaimer">Brand video, not a customer review or verified purchase. Sound is off until you turn it on.</p>
      <a href={kleawipInstagram.profileUrl} target="_blank" rel="noopener noreferrer" className="inline-link">Visit @kleawip <ArrowUpRight size={17}/></a>
    </div>
    <div className="pdp-instagram-media">
      <div className="pdp-instagram-player">
        {failed ? <div className="pdp-instagram-fallback">
          <Image src={previewImage} alt="Kleawip 1200 GSM Twisted Loop towel" fill sizes="(max-width: 760px) 90vw, 300px"/>
          <p>Video unavailable in this browser.</p>
          <a href={kleawipInstagram.reelUrl} target="_blank" rel="noopener noreferrer">Watch the original reel <ArrowUpRight size={15}/></a>
        </div> : <>
          <video
            ref={videoRef}
            src={kleawipInstagram.videoUrl}
            poster={previewImage}
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
            aria-label="Kleawip 1200 GSM Twisted Loop product reel"
          />
          <div className="pdp-instagram-controls" aria-label="Reel controls">
            <button type="button" onClick={togglePlayback} aria-label={playing ? "Pause reel" : "Play reel"}>{playing ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}</button>
            <input type="range" min="0" max={duration || 1} step="0.1" value={Math.min(currentTime, duration || 1)} onChange={(event) => seek(Number(event.target.value))} aria-label="Reel playback position"/>
            <span aria-hidden="true">{timeLabel(currentTime)} / {timeLabel(duration)}</span>
            <button type="button" onClick={toggleMute} aria-label={muted ? "Unmute reel" : "Mute reel"}>{muted ? <VolumeX size={19}/> : <Volume2 size={19}/>}</button>
          </div>
        </>}
      </div>
      <footer className="pdp-instagram-footer"><Instagram size={17}/><span>From <a href={kleawipInstagram.profileUrl} target="_blank" rel="noopener noreferrer">@kleawip</a></span><a href={kleawipInstagram.reelUrl} target="_blank" rel="noopener noreferrer" aria-label="View original reel on Instagram">Original post <ArrowUpRight size={15}/></a></footer>
    </div>
  </section>;
}
