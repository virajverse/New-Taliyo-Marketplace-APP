'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Search,
  X,
  SlidersHorizontal,
  ChevronDown,
  LayoutGrid,
  List,
  Star,
  Heart,
} from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { fetchSavedWishlistServiceIds, toggleWishlistService } from '@/lib/wishlistClient';
import { subscribeSmartFetch } from '@/lib/clientCache';

interface SearchResultItem {
  id: string;
  title: string;
  description: string;
  badge?: string;
  badgeType?: 'popular' | 'top-rated' | 'trending' | 'ai';
  rating: number;
  reviewsCount: number;
  ordersCount: string;
  price: number;
  slug: string;
  category: string;
  imageSrc: string;
  minDeliveryDays?: number;
}

export default function SearchPage() {
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [priceFilter, setPriceFilter] = useState<'all' | 'under-15k' | '15k-35k' | 'above-35k'>('all');
  const [ratingFilter, setRatingFilter] = useState<number>(0);
  const [deliveryFilter, setDeliveryFilter] = useState<'all' | 'fast'>('all');
  const [sortBy, setSortBy] = useState<'relevance' | 'price-asc' | 'price-desc' | 'rating-desc'>('relevance');
  const [wishlist, setWishlist] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [allServices, setAllServices] = useState<SearchResultItem[]>([]);
  const [dbCategories, setDbCategories] = useState<{ id: string; label: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Sync initial ?q= param and saved wishlist IDs
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const qParam = new URLSearchParams(window.location.search).get('q');
      if (qParam) setSearchQuery(qParam);
    }

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
    return () => window.removeEventListener('taliyo_wishlist_updated', syncWishlist);
  }, []);

  // Fetch cached categories & services with versioned SWR caching
  useEffect(() => {
    interface SearchServiceRow {
      id: string;
      title: string;
      description?: string | null;
      category_id?: string | null;
      is_featured?: boolean;
      rating_average?: number | null;
      rating_count?: number | null;
      price_min?: number | null;
      images?: string[] | null;
      service_plans?: Array<{ price_min?: number | null; estimated_delivery_time?: string | null }> | null;
    }

    return subscribeSmartFetch<{
      categories?: Array<{ id: string; name: string }>;
      services?: SearchServiceRow[];
    }>(
      '/api/catalog?mode=search',
      'catalog',
      (json) => {
        const catData = Array.isArray(json?.categories) ? json.categories : [];
        const data = Array.isArray(json?.services) ? json.services : [];

        if (catData.length > 0) {
          setDbCategories(catData.map((c) => ({ id: c.id, label: c.name })));
        }

        if (data.length > 0) {
          const badgeTypes: ('popular' | 'top-rated' | 'trending' | 'ai')[] = [
            'popular',
            'top-rated',
            'trending',
            'ai',
          ];
          const mapped: SearchResultItem[] = data.map((s, idx: number) => {
            const cleanDesc = (s.description || '')
              .replace(/<[^>]*>?/gm, '')
              .trim();
            const planPrices = Array.isArray(s.service_plans)
              ? s.service_plans.map((p) => Number(p?.price_min || 0)).filter((v) => v > 0)
              : [];
            const minPrice = Number(s.price_min || 0) || (planPrices.length ? Math.min(...planPrices) : 0);
            const deliveryDaysList = Array.isArray(s.service_plans)
              ? s.service_plans
                  .map((p) => {
                    const txt = String(p?.estimated_delivery_time || '');
                    const m = txt.match(/\d+/);
                    if (!m) return null;
                    const n = Number(m[0]);
                    return /hour|hr/i.test(txt) ? Math.max(1, Math.ceil(n / 24)) : n;
                  })
                  .filter((v): v is number => v !== null && v > 0)
              : [];
            const minDeliveryDays = deliveryDaysList.length ? Math.min(...deliveryDaysList) : undefined;

            return {
              id: s.id,
              title: s.title,
              description: cleanDesc.slice(0, 90) + (cleanDesc.length > 90 ? '...' : ''),
              badge: s.is_featured ? 'Featured' : 'Available',
              badgeType: badgeTypes[idx % badgeTypes.length],
              rating: Number(s.rating_average || 0),
              reviewsCount: Number(s.rating_count || 0),
              ordersCount: '',
              price: minPrice,
              slug: s.id,
              category: s.category_id || 'All',
              imageSrc: s.images?.[0] || '/assets/search_svc_1.png',
              minDeliveryDays,
            };
          });

          setAllServices(mapped);
        } else {
          setAllServices([]);
        }
        setIsLoading(false);
      },
      {
        onError: (err) => {
          console.warn('Error loading search services from Supabase:', err);
          setAllServices([]);
          setIsLoading(false);
        },
      },
    );
  }, []);

  const categories = [
    { id: 'All', label: 'All', icon: null },
    ...dbCategories.map((c) => ({ id: c.id, label: c.label, icon: null })),
  ];

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

  const filteredResults = useMemo(() => {
    const list = allServices.filter((item) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q);
      const matchesCategory =
        activeCategory === 'All' || item.category === activeCategory;

      const matchesPrice =
        priceFilter === 'all' ||
        (priceFilter === 'under-15k' && item.price > 0 && item.price < 15000) ||
        (priceFilter === '15k-35k' && item.price >= 15000 && item.price <= 35000) ||
        (priceFilter === 'above-35k' && item.price > 35000);

      const matchesRating = ratingFilter === 0 || item.rating >= ratingFilter;
      const matchesDelivery =
        deliveryFilter === 'all' ||
        (deliveryFilter === 'fast' && item.minDeliveryDays !== undefined && item.minDeliveryDays <= 7);

      return matchesQuery && matchesCategory && matchesPrice && matchesRating && matchesDelivery;
    });

    if (sortBy === 'price-asc') {
      list.sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price-desc') {
      list.sort((a, b) => b.price - a.price);
    } else if (sortBy === 'rating-desc') {
      list.sort((a, b) => b.rating - a.rating);
    }

    return list;
  }, [allServices, searchQuery, activeCategory, priceFilter, ratingFilter, deliveryFilter, sortBy]);

  const hasActiveFilters =
    priceFilter !== 'all' ||
    ratingFilter > 0 ||
    sortBy !== 'relevance' ||
    deliveryFilter !== 'all' ||
    activeCategory !== 'All';

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  return (
    <div className="min-h-screen bg-[#080811] text-white flex flex-col items-center">
      <div className="w-full max-w-md min-h-screen flex flex-col bg-[#080811] relative shadow-2xl">
        {/* Top Header */}
        <header className="sticky top-0 z-40 w-full bg-[#080811]/90 backdrop-blur-xl px-4 py-3 flex items-center justify-between border-b border-purple-500/10">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Back"
              className="w-9 h-9 rounded-full bg-[#15162a]/90 border border-purple-500/20 flex items-center justify-center text-gray-300 hover:text-white transition-all shadow-sm cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div>
              <h1 className="text-base sm:text-lg font-black text-white leading-tight">
                Search Services
              </h1>
              <p className="text-[11px] text-purple-300/70 leading-none">
                Find the right service for your project
              </p>
            </div>
          </div>
        </header>

        {/* Search Input Bar with Submit Button */}
        <form onSubmit={handleSearchSubmit} className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 flex items-center bg-[#111222] border border-purple-500/30 rounded-2xl px-3.5 py-2.5 focus-within:border-purple-500 shadow-md">
              <Search className="w-4 h-4 text-purple-300/60 mr-2 flex-shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search services..."
                className="w-full bg-transparent text-sm text-white placeholder-gray-400 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear"
                  className="p-0.5 rounded-full text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              type="submit"
              onClick={handleSearchSubmit}
              aria-label="Submit Search"
              className="w-11 h-11 rounded-2xl bg-gradient-to-r from-purple-600 to-fuchsia-600 flex items-center justify-center text-white shadow-lg shadow-purple-900/40 hover:scale-105 active:scale-95 transition-all flex-shrink-0 cursor-pointer"
            >
              <Search className="w-5 h-5" />
            </button>
          </div>
        </form>

        {/* Quick Category Filter Pills */}
        <div className="px-4 py-1.5">
          <div className="flex gap-2 overflow-x-auto no-scrollbar scroll-smooth">
            {categories.map((cat) => {
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-[0_0_15px_rgba(217,70,239,0.4)]'
                      : 'bg-[#121326] text-gray-300 hover:text-white border border-purple-500/15'
                  }`}
                >
                  {cat.icon}
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Secondary Filter Dropdowns Row */}
        <div className="px-4 py-2">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {/* Filters Button */}
            <button
              type="button"
              onClick={() => {
                setPriceFilter('all');
                setRatingFilter(0);
                setSortBy('relevance');
                setDeliveryFilter('all');
                setActiveCategory('All');
              }}
              title={hasActiveFilters ? 'Reset all filters' : 'Filters active'}
              className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#121326] border border-purple-500/25 text-xs font-bold text-white shadow-sm flex-shrink-0 cursor-pointer hover:border-purple-400"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-purple-300" />
              <span>{hasActiveFilters ? 'Reset' : 'Filters'}</span>
              {hasActiveFilters && (
                <span className="w-2 h-2 rounded-full bg-fuchsia-500 ring-2 ring-[#080811]" />
              )}
            </button>

            {/* Price Dropdown Button */}
            <button
              type="button"
              onClick={() => {
                setPriceFilter((prev) =>
                  prev === 'all'
                    ? 'under-15k'
                    : prev === 'under-15k'
                    ? '15k-35k'
                    : prev === '15k-35k'
                    ? 'above-35k'
                    : 'all'
                );
              }}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs shadow-sm flex-shrink-0 cursor-pointer transition-all ${
                priceFilter !== 'all'
                  ? 'bg-purple-600/30 border-purple-400 text-fuchsia-300 font-bold'
                  : 'bg-[#121326] border-purple-500/20 text-gray-300 hover:text-white'
              }`}
            >
              <span>
                {priceFilter === 'all'
                  ? 'Price: All'
                  : priceFilter === 'under-15k'
                  ? '< ₹15k'
                  : priceFilter === '15k-35k'
                  ? '₹15k–₹35k'
                  : '> ₹35k'}
              </span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {/* Rating Dropdown Button */}
            <button
              type="button"
              onClick={() => {
                setRatingFilter((prev) => (prev === 0 ? 4.8 : prev === 4.8 ? 4.9 : 0));
              }}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs shadow-sm flex-shrink-0 cursor-pointer transition-all ${
                ratingFilter > 0
                  ? 'bg-purple-600/30 border-purple-400 text-fuchsia-300 font-bold'
                  : 'bg-[#121326] border-purple-500/20 text-gray-300 hover:text-white'
              }`}
            >
              <span>{ratingFilter > 0 ? `${ratingFilter}+ Rated` : 'Rating'}</span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {/* Delivery Dropdown Button */}
            <button
              type="button"
              onClick={() => {
                setDeliveryFilter((prev) => (prev === 'all' ? 'fast' : 'all'));
              }}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs shadow-sm flex-shrink-0 cursor-pointer transition-all ${
                deliveryFilter !== 'all'
                  ? 'bg-purple-600/30 border-purple-400 text-fuchsia-300 font-bold'
                  : 'bg-[#121326] border-purple-500/20 text-gray-300 hover:text-white'
              }`}
            >
              <span>{deliveryFilter === 'fast' ? 'Express' : 'Delivery'}</span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {/* Sort Dropdown Button */}
            <button
              type="button"
              onClick={() => {
                setSortBy((prev) =>
                  prev === 'relevance'
                    ? 'price-asc'
                    : prev === 'price-asc'
                    ? 'price-desc'
                    : prev === 'price-desc'
                    ? 'rating-desc'
                    : 'relevance'
                );
              }}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs shadow-sm flex-shrink-0 cursor-pointer transition-all ${
                sortBy !== 'relevance'
                  ? 'bg-purple-600/30 border-purple-400 text-fuchsia-300 font-bold'
                  : 'bg-[#121326] border-purple-500/20 text-gray-300 hover:text-white'
              }`}
            >
              <span>
                {sortBy === 'relevance'
                  ? 'Sort: Relevance'
                  : sortBy === 'price-asc'
                  ? 'Price: Low-High'
                  : sortBy === 'price-desc'
                  ? 'Price: High-Low'
                  : 'Top Rated'}
              </span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Results Count & View Mode Row */}
        <div className="px-4 py-2 flex items-center justify-between">
          <span className="text-xs font-bold text-gray-300">
            {filteredResults.length} Services Found
          </span>

          <div className="flex items-center gap-1 p-0.5 rounded-xl bg-[#111222] border border-purple-500/20">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-label="Grid View"
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'grid'
                  ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-label="List View"
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'list'
                  ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Search Results List */}
        <main className="flex-1 px-4 space-y-3.5 pb-28">
          {isLoading ? (
            /* Search Skeleton Loader */
            <div className="space-y-3.5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-[24px] bg-[#121326]/80 border border-purple-500/15 p-4 animate-pulse flex flex-col sm:flex-row gap-3.5 shadow-xl"
                >
                  <div className="w-full sm:w-44 h-36 bg-purple-900/30 rounded-2xl shrink-0" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-4 bg-purple-800/40 rounded-md w-3/4" />
                    <div className="h-3 bg-purple-900/20 rounded-md w-full" />
                    <div className="h-4 bg-purple-900/30 rounded-md w-1/4 mt-3" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="py-20 text-center text-xs text-gray-400">
              No services found matching your search.
            </div>
          ) : (
            filteredResults.map((item) => (
            <div
              key={item.id}
              className="group relative rounded-[24px] bg-[#121326] border border-purple-500/20 hover:border-purple-400/50 shadow-xl shadow-black/50 overflow-hidden transition-all flex flex-col sm:flex-row"
            >
              {/* Left Thumbnail */}
              <div className="relative w-full sm:w-44 h-36 sm:h-auto bg-gradient-to-br from-[#1a0f35] to-[#0d071d] flex items-center justify-center overflow-hidden flex-shrink-0">
                <Image
                  src={item.imageSrc}
                  alt={item.title}
                  width={200}
                  height={120}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                />

                {/* Wishlist Heart */}
                <button
                  type="button"
                  onClick={(e) => toggleWishlist(item.id, e)}
                  aria-label="Wishlist"
                  className="absolute top-2.5 right-2.5 z-10 w-7 h-7 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-gray-300 hover:text-white transition-all hover:scale-110 active:scale-90 cursor-pointer"
                >
                  <Heart
                    className={`w-3.5 h-3.5 transition-colors ${
                      wishlist[item.id] ? 'fill-pink-500 text-pink-500' : 'text-gray-300'
                    }`}
                  />
                </button>
              </div>

              {/* Right Details Block */}
              <div className="p-3.5 flex-1 flex flex-col justify-between">
                <div>
                  <h2 className="font-bold text-white text-sm sm:text-base leading-snug group-hover:text-purple-300 transition-colors">
                    {item.title}
                  </h2>
                  <p className="mt-1 text-xs text-purple-200/70 line-clamp-2 leading-relaxed">
                    {item.description}
                  </p>

                  {/* Rating */}
                  <div className="mt-2.5 flex items-center gap-2 text-xs">
                    <div className="flex items-center gap-1 font-bold text-white">
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      {item.rating > 0 ? (
                        <>
                          <span>{item.rating}</span>
                          <span className="text-gray-400 font-normal">({item.reviewsCount})</span>
                        </>
                      ) : (
                        <span className="text-gray-400 font-normal">New System</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Price & CTA Button */}
                <div className="mt-3.5 pt-2.5 border-t border-purple-500/15 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-gray-400 block leading-none">Starting at</span>
                    <span className="text-base font-extrabold text-white">
                      {item.price > 0 ? `₹${item.price.toLocaleString('en-IN')}` : 'Custom Quote'}
                    </span>
                  </div>

                  <Link
                    href={`/services/${item.slug}`}
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white text-xs font-bold shadow-md shadow-purple-900/40 hover:opacity-95 hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    <span>View Details</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>
            </div>
          )))}
        </main>

        {/* Bottom Navigation */}
        <BottomNav />
      </div>
    </div>
  );
}
