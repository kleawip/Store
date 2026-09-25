"use client";

import Link from "next/link";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { campaignHref, heroSlides } from "@/data/home-campaigns";

export function HomeHeroCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const slide = heroSlides[index];

  useEffect(() => {
    if (paused || heroSlides.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setIndex((current) => (current + 1) % heroSlides.length);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [paused]);

  function move(amount: number) {
    setIndex((current) => (current + amount + heroSlides.length) % heroSlides.length);
  }

  return <section className="home-campaigns" aria-label="Featured Kleawip collections" aria-roledescription="carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}>
    <div className="home-campaign-frame">
      <Link className="home-campaign-link" href={campaignHref(slide.target)} aria-label={`${slide.cta}: ${slide.headline}`}>
        <picture className="home-campaign-picture">
          <source media="(max-width: 767px)" srcSet={slide.images.mobile}/>
          <source media="(max-width: 1199px)" srcSet={slide.images.tablet}/>
          <img src={slide.images.desktop} alt={slide.alt} width="2098" height="749" fetchPriority={index === 0 ? "high" : "auto"}/>
        </picture>
        <span className="home-campaign-shade" aria-hidden="true"/>
        <span className="home-campaign-content">
          <span className="home-campaign-eyebrow">{slide.eyebrow}</span>
          <strong className="home-campaign-headline">{slide.headline}</strong>
          <span className="home-campaign-description">{slide.description}</span>
          <span className="home-campaign-cta">{slide.cta}<ArrowUpRight size={18}/></span>
        </span>
      </Link>
      {heroSlides.length > 1 && <>
        <button className="home-campaign-arrow home-campaign-arrow-prev" type="button" aria-label="Previous banner" onClick={() => move(-1)}><ChevronLeft size={22}/></button>
        <button className="home-campaign-arrow home-campaign-arrow-next" type="button" aria-label="Next banner" onClick={() => move(1)}><ChevronRight size={22}/></button>
      </>}
    </div>
    {heroSlides.length > 1 && <div className="home-campaign-dots" role="group" aria-label="Choose banner">
      {heroSlides.map((item, dotIndex) => <button key={item.id} type="button" className={dotIndex === index ? "is-active" : ""} aria-label={`Show banner ${dotIndex + 1}: ${item.eyebrow}`} aria-current={dotIndex === index ? "true" : undefined} onClick={() => setIndex(dotIndex)}/>)}
    </div>}
  </section>;
}
