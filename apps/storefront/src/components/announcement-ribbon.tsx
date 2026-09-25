"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { campaignHref, ribbonMessages } from "@/data/home-campaigns";

export function AnnouncementRibbon() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const message = ribbonMessages[index];

  useEffect(() => {
    if (paused || ribbonMessages.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setIndex((current) => (current + 1) % ribbonMessages.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [paused]);

  return <div className="campaign-ribbon" aria-label="Kleawip announcements" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}>
    <div className="campaign-ribbon-message" key={message.id} aria-live="off">
      {message.target ? <Link href={campaignHref(message.target)}>{message.text}</Link> : <span>{message.text}</span>}
    </div>
  </div>;
}
