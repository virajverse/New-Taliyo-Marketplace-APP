'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Layers, ChevronRight } from 'lucide-react';
import { subscribeSmartFetch } from '@/lib/clientCache';

interface BannerSlide {
  id: string;
  badge: string;
  title: string;
  highlightText: string;
  subtitle: string;
  ctaText: string;
  ctaHref: string;
  imageSrc?: string;
  imageUrl?: string;
  isRealLogoBanner?: boolean;
}

const BRAND_INTRO_SLIDE: BannerSlide = {
  id: 'taliyo-intro',
  badge: 'TALIYO MARKETPLACE',
  title: 'Ready-to-Launch',
  highlightText: 'Digital Systems',
  subtitle: 'Custom websites, automation & mobile apps built to scale',
  ctaText: 'Explore Services',
  ctaHref: '/categories',
  imageSrc: '/assets/hero_laptop_clean.png',
};

export interface ApiBannerInput {
  id?: string;
  alt_text?: string | null;
  aria_label?: string | null;
  cta_text?: string | null;
  cta_url?: string | null;
  image_url?: string | null;
}

function mapApiBanners(data: ApiBannerInput[]): BannerSlide[] {
  if (!data || data.length === 0) return [BRAND_INTRO_SLIDE];
  return data.map((b, idx: number) => {
    const customTitle = b.alt_text || 'Taliyo Technologies Marketplace';
    const parts = customTitle.includes('—')
      ? customTitle.split('—')
      : customTitle.includes('-')
      ? customTitle.split('-')
      : [customTitle, ''];
    const title = parts[0]?.trim() || 'Taliyo Technologies';
    const highlight = parts[1]?.trim() || (parts[0] ? '' : 'Marketplace');

    return {
      id: b.id || `b-${idx}`,
      badge: b.aria_label || 'FEATURED BANNER',
      title,
      highlightText: highlight,
      subtitle: 'Verified software services & packages',
      ctaText: b.cta_text || 'Explore',
      ctaHref: b.cta_url || '/categories',
      imageUrl: b.image_url || undefined,
      isRealLogoBanner: true,
    };
  });
}

export default function HeroBanner({
  initialBanners,
}: {
  initialBanners?: ApiBannerInput[];
}) {
  const [slides, setSlides] = useState<BannerSlide[]>(() =>
    initialBanners && initialBanners.length > 0 ? mapApiBanners(initialBanners) : [BRAND_INTRO_SLIDE],
  );
  const [currentSlide, setCurrentSlide] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartXRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || slides.length <= 1) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartXRef.current;
    const diff = touchStartXRef.current - endX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        setCurrentSlide((prev) => (prev + 1) % slides.length);
      } else {
        setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
      }
    }
    touchStartXRef.current = null;
  };

  // Fetch active banners configured in Supabase / Admin Panel with versioned SWR caching
  useEffect(() => {
    return subscribeSmartFetch<{ data?: ApiBannerInput[] }>(
      '/api/banners',
      'banners',
      (json) => {
        const data = json?.data;
        if (data && data.length > 0) {
          setSlides(mapApiBanners(data));
        } else {
          setSlides([BRAND_INTRO_SLIDE]);
        }
      },
    );
  }, []);

  const slidesRef = useRef<BannerSlide[]>([]);
  slidesRef.current = slides;
  const trackedImpressionsRef = useRef<Set<string>>(new Set());

  const trackBannerEvent = (bannerId: string, type: 'impression' | 'click') => {
    if (!bannerId || bannerId === 'taliyo-intro' || bannerId.startsWith('b-')) return;
    try {
      const payload = JSON.stringify({ id: bannerId, type });
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon('/api/banners/track', new Blob([payload], { type: 'application/json' }));
      } else {
        fetch('/api/banners/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {}
  };

  useEffect(() => {
    const active = slides[currentSlide];
    if (!active?.id || trackedImpressionsRef.current.has(active.id)) return;
    trackedImpressionsRef.current.add(active.id);
    trackBannerEvent(active.id, 'impression');
  }, [currentSlide, slides]);

  // Auto-slide only when multiple admin banners exist
  useEffect(() => {
    if (slides.length <= 1) return;
    timerRef.current = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 4500);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [slides.length]);

  return (
    <div className="w-full relative">
      {/* Horizontal Landscape Rectangle Banner Container */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative w-full min-h-[158px] sm:min-h-[172px] rounded-2xl sm:rounded-3xl overflow-hidden border border-purple-500/30 shadow-[0_10px_30px_rgba(0,0,0,0.65)] bg-gradient-to-r from-[#190c38] via-[#12082b] to-[#260e45]"
      >
        {/* Ambient background glows */}
        <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-fuchsia-600/25 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-36 h-36 rounded-full bg-purple-600/25 blur-2xl pointer-events-none" />

        {/* Carousel Tracks */}
        <div
          className="flex h-full transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${currentSlide * 100}%)` }}
        >
          {slides.map((slide) => (
            <div
              key={slide.id}
              className="min-w-full h-full relative px-4 py-3.5 sm:px-5 sm:py-4 flex items-center justify-between gap-3 overflow-hidden"
            >
              {/* Left Content (Strictly horizontal alignment) */}
              <div className="flex-1 z-10 flex flex-col justify-between h-full pr-1">
                <div>
                  {/* Badge */}
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-900/50 border border-purple-400/30 text-[9px] font-bold text-purple-200 tracking-wider mb-1 backdrop-blur-xs">
                    <Layers className="w-2.5 h-2.5 text-fuchsia-400 shrink-0" />
                    <span>{slide.badge}</span>
                  </div>

                  {/* Headline */}
                  <h2 className="text-sm sm:text-base font-black text-white tracking-tight leading-snug line-clamp-2">
                    {slide.title}{' '}
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-pink-400">
                      {slide.highlightText}
                    </span>
                  </h2>

                  {/* Subtitle */}
                  <p className="text-[10px] sm:text-[11px] text-purple-200/75 line-clamp-2 mt-0.5 leading-snug">
                    {slide.subtitle}
                  </p>
                </div>

                {/* Compact Action Button */}
                <div className="pt-1">
                  <Link
                    href={slide.ctaHref}
                    onClick={() => trackBannerEvent(slide.id, 'click')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white text-[11px] font-extrabold shadow-md shadow-purple-950/50 transition-all active:scale-95"
                  >
                    <span>{slide.ctaText}</span>
                    <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>

              {/* Right Visual Graphic (Fixed compact size to guarantee rectangle proportions) */}
              <div className="w-28 sm:w-36 h-full flex-shrink-0 flex items-center justify-center relative">
                {slide.isRealLogoBanner && slide.imageUrl ? (
                  /* Real Banner Graphic */
                  <div className="relative w-full h-[100px] rounded-xl overflow-hidden border border-purple-500/25 bg-[#0a0a16] shadow-lg flex items-center justify-center">
                    <Image
                      src={slide.imageUrl}
                      alt={slide.title || 'Taliyo Technologies'}
                      fill
                      className="object-contain p-1"
                      unoptimized
                      priority
                    />
                  </div>
                ) : slide.imageSrc ? (
                  /* Banner Artwork */
                  <div className="relative w-full h-full flex items-center justify-center">
                    <Image
                      src={slide.imageSrc}
                      alt={slide.title}
                      width={120}
                      height={90}
                      className="max-h-[96px] w-auto object-contain drop-shadow-[0_8px_16px_rgba(217,70,239,0.45)]"
                      priority
                    />
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {/* Carousel Indicator Dots (only when multiple banners) */}
        {slides.length > 1 && (
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex items-center gap-1 z-20">
          {slides.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setCurrentSlide(idx)}
              aria-label={`Go to slide ${idx + 1}`}
              className={`h-1 rounded-full transition-all duration-300 cursor-pointer ${
                idx === currentSlide
                  ? 'w-4 bg-gradient-to-r from-purple-400 to-fuchsia-400'
                  : 'w-1 bg-white/30 hover:bg-white/60'
              }`}
            />
          ))}
        </div>
        )}
      </div>
    </div>
  );
}
