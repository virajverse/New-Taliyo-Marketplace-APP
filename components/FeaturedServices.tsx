'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Star, Heart, ArrowRight, ShieldCheck } from 'lucide-react';
import { fetchSavedWishlistServiceIds, toggleWishlistService } from '@/lib/wishlistClient';
import { subscribeSmartFetch } from '@/lib/clientCache';

export interface ServiceItem {
  id: string;
  title: string;
  badge?: string;
  badgeType?: 'popular' | 'trending' | 'ai';
  rating: number;
  reviewsCount: number;
  price: number;
  imageSrc: string;
  slug: string;
  providerName?: string;
}

export default function FeaturedServices() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [wishlist, setWishlist] = useState<Record<string, boolean>>({});

  useEffect(() => {
    interface FeaturedRow {
      id: string;
      title: string;
      price_min?: number | null;
      rating_average?: number | null;
      rating_count?: number | null;
      images?: string[] | null;
      provider_name?: string | null;
      slug?: string | null;
      is_featured?: boolean;
      service_plans?: Array<{ price_min?: number | null }> | null;
    }

    const unsubServices = subscribeSmartFetch<{ data?: FeaturedRow[] }>(
      '/api/catalog?mode=featured',
      'catalog',
      (json) => {
        const data = Array.isArray(json?.data) ? json.data : [];
        if (data.length > 0) {
          const mapped: ServiceItem[] = data.map((item, idx) => {
            const rawImages = Array.isArray(item.images) ? item.images : [];
            const firstImg = rawImages[0] || '/assets/hero_laptop_clean.png';
            const planPrices = Array.isArray(item.service_plans)
              ? item.service_plans
                  .map((p: { price_min?: number | null }) => Number(p?.price_min || 0))
                  .filter((v: number) => v > 0)
              : [];
            const minPrice = Number(item.price_min || 0) || (planPrices.length ? Math.min(...planPrices) : 0);

            return {
              id: item.id,
              title: item.title,
              badge: item.is_featured ? 'Featured' : idx === 0 ? 'Popular' : 'Available',
              badgeType: item.is_featured ? 'popular' : 'trending',
              rating: Number(item.rating_average || 0),
              reviewsCount: Number(item.rating_count || 0),
              price: minPrice,
              imageSrc: firstImg,
              slug: item.slug || item.id,
              providerName: item.provider_name || 'Taliyo Technologies',
            };
          });
          setServices(mapped);
        } else {
          setServices([]);
        }
        setIsLoading(false);
      },
      {
        onError: () => {
          setServices([]);
          setIsLoading(false);
        },
      },
    );

    const syncWishlist = async () => {
      const { serviceIds } = await fetchSavedWishlistServiceIds();
      const map: Record<string, boolean> = {};
      serviceIds.forEach((id) => {
        map[id] = true;
      });
      setWishlist(map);
    };
    syncWishlist();
    window.addEventListener('taliyo_wishlist_updated', syncWishlist);
    return () => {
      unsubServices();
      window.removeEventListener('taliyo_wishlist_updated', syncWishlist);
    };
  }, []);

  const toggleWishlist = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const currentlySaved = Boolean(wishlist[id]);
    setWishlist((prev) => ({ ...prev, [id]: !currentlySaved }));
    try {
      const nextSaved = await toggleWishlistService(id, currentlySaved);
      setWishlist((prev) => ({ ...prev, [id]: nextSaved }));
    } catch {
      setWishlist((prev) => ({ ...prev, [id]: currentlySaved }));
    }
  };

  return (
    <section className="w-full">
      {/* Header */}
      <div className="flex items-end justify-between mb-3 px-0.5">
        <div>
          <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
            Featured Systems
          </h2>
          <p className="text-[11px] sm:text-xs text-purple-200/60 mt-0.5">
            Ready-to-deploy services with full source code ownership.
          </p>
        </div>
        <Link
          href="/categories"
          className="text-xs font-bold text-fuchsia-400 hover:text-fuchsia-300 flex items-center gap-1 group transition-colors"
        >
          <span>See All</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      {/* Horizontal Carousel */}
      {isLoading ? (
        <div className="flex gap-3.5 overflow-x-auto no-scrollbar pb-2 pt-1 -mx-4 px-4">
          {[1, 2].map((i) => (
            <div key={i} className="flex-shrink-0 w-64 sm:w-72 h-64 rounded-[24px] bg-[#111226]/90 border border-purple-500/20 animate-pulse" />
          ))}
        </div>
      ) : services.length === 0 ? (
        <div className="rounded-[24px] bg-[#111226]/90 border border-purple-500/20 p-6 text-center text-xs text-gray-400">
          No active services available yet.
        </div>
      ) : (
      <div className="flex gap-3.5 overflow-x-auto no-scrollbar pb-2 pt-1 -mx-4 px-4 scroll-smooth">
        {services.map((item) => (
          <div
            key={item.id}
            className="flex-shrink-0 w-64 sm:w-72 rounded-[24px] bg-[#111226]/90 border border-purple-500/20 hover:border-purple-500/40 transition-all duration-300 shadow-xl overflow-hidden group flex flex-col justify-between"
          >
            {/* Top Media Area */}
            <div className="relative w-full h-36 bg-[#1a1236] overflow-hidden">
              <Link href={`/services/${item.slug}`} className="block w-full h-full">
                <Image
                  src={item.imageSrc}
                  alt={item.title}
                  fill
                  loading="lazy"
                  sizes="(max-width: 640px) 256px, 288px"
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                  unoptimized
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#111226] via-transparent to-black/30" />
              </Link>

              {/* Badge */}
              {item.badge && (
                <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-black/60 border border-purple-400/30 text-[10px] font-bold text-white backdrop-blur-md pointer-events-none">
                  {item.badge}
                </div>
              )}

              {/* Wishlist Heart Button */}
              <button
                type="button"
                onClick={(e) => toggleWishlist(item.id, e)}
                aria-label="Add to Wishlist"
                className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/50 border border-white/20 flex items-center justify-center text-white backdrop-blur-md hover:bg-black/70 transition-all cursor-pointer z-10"
              >
                <Heart
                  className={`w-3.5 h-3.5 transition-colors ${
                    wishlist[item.id]
                      ? 'fill-rose-500 text-rose-500'
                      : 'text-gray-200'
                  }`}
                />
              </button>
            </div>

            {/* Content Area */}
            <div className="p-3.5 flex-1 flex flex-col justify-between">
              <Link href={`/services/${item.slug}`} className="block">
                {/* Provider info */}
                <div className="flex items-center gap-1.5 text-[10px] text-purple-300/70 font-semibold mb-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  <span>{item.providerName || 'Taliyo Technologies'}</span>
                </div>

                <h3 className="text-xs sm:text-sm font-extrabold text-white leading-snug line-clamp-2 group-hover:text-fuchsia-300 transition-colors">
                  {item.title}
                </h3>
              </Link>

              {/* Rating & Reviews */}
              <div className="mt-2.5 flex items-center gap-1 text-[11px]">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                {item.rating > 0 ? (
                  <>
                    <span className="font-bold text-white">{item.rating}</span>
                    <span className="text-gray-400">({item.reviewsCount} reviews)</span>
                  </>
                ) : (
                  <span className="text-gray-400 font-medium">New System</span>
                )}
              </div>

              {/* Price & Action Button */}
              <div className="mt-3 pt-2.5 border-t border-purple-500/15 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-gray-400 uppercase font-semibold block leading-none">
                    Starting from
                  </span>
                  <span className="text-sm sm:text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-300 to-white">
                    {item.price > 0 ? `₹${item.price.toLocaleString('en-IN')}` : 'Custom Quote'}
                  </span>
                </div>

                <Link
                  href={`/services/${item.slug}`}
                  className="px-3 py-1.5 rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white text-[11px] font-bold shadow-md shadow-purple-950/40 transition-all active:scale-95"
                >
                  View Details
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
      )}
    </section>
  );
}
