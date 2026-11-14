'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Search,
  ChevronDown,
  LayoutGrid,
  List,
  Star,
} from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { subscribeSmartFetch } from '@/lib/clientCache';

interface CategoryService {
  id: string;
  title: string;
  description: string;
  badge?: string;
  badgeType?: 'popular' | 'trending' | 'ai';
  rating: number;
  reviewsCount: number;
  ordersCount: string;
  price: number;
  slug: string;
  imageSrc: string;
  subcategoryName?: string;
  isFeatured?: boolean;
}

export default function CategoryDetailPage() {
  const router = useRouter();
  const params = useParams();
  const rawSlug = (params?.id as string) || 'web-development';

  const [categoryName, setCategoryName] = useState('System Services');
  const [services, setServices] = useState<CategoryService[]>([]);
  const [subcategories, setSubcategories] = useState<string[]>(['All Systems']);
  const [activeSubcat, setActiveSubcat] = useState<string>('All Systems');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<string>('Popular');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    interface CategoryServiceRow {
      id: string;
      title: string;
      description?: string | null;
      images?: string[] | null;
      service_plans?: Array<{ price_min?: number | string | null }> | null;
      price_min?: number | null;
      subcategories?: { name?: string | null } | Array<{ name?: string | null }> | null;
      is_featured?: boolean;
      rating_average?: number | null;
      rating_count?: number | null;
      slug?: string | null;
    }

    return subscribeSmartFetch<{
      category?: { id: string; name: string } | null;
      subcategories?: Array<{ name: string; slug: string }>;
      services?: CategoryServiceRow[];
    }>(
      `/api/catalog?mode=category&slug=${encodeURIComponent(rawSlug)}`,
      'catalog',
      (json) => {
        const category = json?.category || null;
        const subcats = Array.isArray(json?.subcategories) ? json.subcategories : [];
        const catServices = Array.isArray(json?.services) ? json.services : [];

        if (category) {
          setCategoryName(category.name);
          setSubcategories(
            subcats.length > 0 ? ['All Systems', ...subcats.map((s) => s.name)] : ['All Systems'],
          );

          if (catServices.length > 0) {
            const mapped: CategoryService[] = catServices.map((s, idx) => {
              const rawImages = Array.isArray(s.images) ? s.images : [];
              const img =
                rawImages[0] ||
                (idx % 2 === 0 ? '/assets/cat_illust_1.png' : '/assets/cat_illust_3.png');

              const plans = Array.isArray(s.service_plans) ? s.service_plans : [];
              const planPrices = plans
                .map((p: { price_min?: number | string | null }) => Number(p?.price_min || 0))
                .filter((p: number) => p > 0);
              const resolvedPrice =
                Number(s.price_min || 0) > 0
                  ? Number(s.price_min)
                  : planPrices.length > 0
                  ? Math.min(...planPrices)
                  : 0;
              const subcatObj = Array.isArray(s.subcategories) ? s.subcategories[0] : s.subcategories;

              return {
                id: s.id,
                title: s.title,
                description: (s.description || '').replace(/<[^>]*>?/gm, '').slice(0, 120) + '...',
                badge: s.is_featured ? 'Featured' : idx === 0 ? 'Popular' : 'Available',
                badgeType: idx === 0 ? 'popular' : 'trending',
                rating: Number(s.rating_average || 0),
                reviewsCount: Number(s.rating_count || 0),
                ordersCount: '',
                price: resolvedPrice,
                slug: s.slug || s.id,
                imageSrc: img,
                subcategoryName: subcatObj?.name || undefined,
                isFeatured: Boolean(s.is_featured),
              };
            });
            setServices(mapped);
          } else {
            setServices([]);
          }
        } else {
          const pretty = rawSlug
            .split('-')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
          setCategoryName(pretty);
          setServices([]);
        }
        setIsLoading(false);
      },
      {
        onError: (err) => {
          console.error('Failed to load category details:', err);
          setIsLoading(false);
        },
      },
    );
  }, [rawSlug]);

  return (
    <div className="min-h-screen bg-[#07070d] text-white flex flex-col items-center">
      <div className="w-full max-w-md min-h-screen flex flex-col bg-[#07070d] relative shadow-2xl">
        {/* Sticky Top Header */}
        <header className="sticky top-0 z-40 w-full bg-[#07070d]/90 backdrop-blur-xl border-b border-purple-500/10 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Go Back"
              className="w-9 h-9 rounded-full bg-[#121326] border border-purple-500/20 flex items-center justify-center text-gray-300 hover:text-white hover:border-purple-400 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-base sm:text-lg font-black text-white tracking-tight leading-none">
                {categoryName}
              </h1>
              <p className="text-[10px] text-purple-200/60 font-medium leading-tight mt-0.5">
                {services.length} {services.length === 1 ? 'Service' : 'Services'} Available
              </p>
            </div>
          </div>

          <Link
            href="/search"
            aria-label="Search"
            className="w-9 h-9 rounded-full bg-[#121326] border border-purple-500/20 flex items-center justify-center text-gray-300 hover:text-white hover:border-purple-400 transition-all cursor-pointer"
          >
            <Search className="w-4 h-4" />
          </Link>
        </header>

        {/* Subcategory Pills Strip */}
        <div className="px-4 pt-3 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
          {subcategories.map((subcat) => (
            <button
              key={subcat}
              type="button"
              onClick={() => setActiveSubcat(subcat)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                activeSubcat === subcat
                  ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-md shadow-purple-900/40'
                  : 'bg-[#121326] border border-purple-500/20 text-gray-400 hover:text-gray-200 hover:border-purple-400/40'
              }`}
            >
              {subcat}
            </button>
          ))}
        </div>

        {/* Filters and View Mode Controls */}
        <div className="px-4 py-2 flex items-center justify-between border-b border-purple-500/10 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 font-medium">Sort by:</span>
            <button
              type="button"
              onClick={() => setSortBy(sortBy === 'Popular' ? 'Price: Low to High' : 'Popular')}
              className="inline-flex items-center gap-1 font-bold text-white hover:text-fuchsia-300 transition-colors cursor-pointer"
            >
              <span>{sortBy}</span>
              <ChevronDown className="w-3.5 h-3.5 text-purple-400" />
            </button>
          </div>

          <div className="flex items-center gap-1 bg-[#121326] p-1 rounded-xl border border-purple-500/20">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-label="Grid View"
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-xs'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-label="List View"
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-xs'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Services Stream */}
        <main className="flex-1 px-4 pt-3 pb-28">
          {(() => {
            const visibleServices = services
              .filter(
                (svc) =>
                  activeSubcat === 'All Systems' ||
                  (svc.subcategoryName && svc.subcategoryName.toLowerCase() === activeSubcat.toLowerCase()),
              )
              .sort((a, b) => {
                if (sortBy === 'Price: Low to High') {
                  if (a.price === 0 && b.price === 0) return 0;
                  if (a.price === 0) return 1;
                  if (b.price === 0) return -1;
                  return a.price - b.price;
                }
                return Number(b.isFeatured || false) - Number(a.isFeatured || false) || b.rating - a.rating;
              });

            if (isLoading) {
              return (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="rounded-[24px] bg-[#111226]/80 border border-purple-500/15 p-4 animate-pulse flex gap-3 shadow-xl"
                    >
                      <div className="w-24 h-24 rounded-2xl bg-purple-900/30 border border-purple-500/20 shrink-0" />
                      <div className="flex-1 space-y-2 py-1">
                        <div className="h-4 bg-purple-800/40 rounded-md w-3/4" />
                        <div className="h-3 bg-purple-900/20 rounded-md w-full" />
                        <div className="h-3.5 bg-purple-900/30 rounded-md w-1/3 mt-3" />
                      </div>
                    </div>
                  ))}
                </div>
              );
            }

            if (visibleServices.length === 0) {
              return (
                <div className="py-20 text-center text-xs text-gray-400">
                  No services found matching this filter yet.
                </div>
              );
            }

            if (viewMode === 'grid') {
              return (
                <div className="grid grid-cols-2 gap-3">
                  {visibleServices.map((svc) => (
                    <Link
                      key={svc.id}
                      href={`/services/${svc.slug}`}
                      className="group rounded-[22px] bg-[#111226]/90 border border-purple-500/20 hover:border-purple-400/50 overflow-hidden shadow-xl transition-all duration-300 flex flex-col justify-between"
                    >
                      <div>
                        <div className="w-full aspect-[4/3] bg-[#1b143a] relative overflow-hidden">
                          <Image
                            src={svc.imageSrc}
                            alt={svc.title}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-500"
                            unoptimized
                          />
                          {svc.badge && (
                            <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-black/60 border border-purple-400/30 text-[9px] font-bold text-white backdrop-blur-md">
                              {svc.badge}
                            </div>
                          )}
                        </div>
                        <div className="p-2.5">
                          <h3 className="text-xs font-extrabold text-white leading-snug line-clamp-2 group-hover:text-fuchsia-300 transition-colors">
                            {svc.title}
                          </h3>
                          <p className="text-[10px] text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                            {svc.description}
                          </p>
                        </div>
                      </div>

                      <div className="px-2.5 pb-2.5 pt-1.5 border-t border-purple-500/15 flex items-center justify-between">
                        <div>
                          <span className="text-[8px] text-gray-400 uppercase font-semibold block leading-none">
                            Starting at
                          </span>
                          <span className="text-xs font-black text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-300 to-white">
                            {svc.price > 0 ? `₹${svc.price.toLocaleString('en-IN')}` : 'Custom Quote'}
                          </span>
                        </div>
                        <div className="flex items-center gap-0.5 text-[10px]">
                          <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                          <span className="font-bold text-white">{svc.rating > 0 ? svc.rating : 'New'}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              );
            }

            return (
              <div className="space-y-3">
                {visibleServices.map((svc) => (
                  <Link
                    key={svc.id}
                    href={`/services/${svc.slug}`}
                    className="group block rounded-[24px] bg-[#111226]/90 border border-purple-500/20 hover:border-purple-400/50 p-4 shadow-xl transition-all duration-300 hover:scale-[1.01] overflow-hidden"
                  >
                    <div className="flex gap-3">
                      <div className="w-24 h-24 rounded-2xl bg-[#1b143a] flex-shrink-0 relative overflow-hidden">
                        <Image
                          src={svc.imageSrc}
                          alt={svc.title}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-500"
                          unoptimized
                        />
                        {svc.badge && (
                          <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-black/60 border border-purple-400/30 text-[9px] font-bold text-white backdrop-blur-md">
                            {svc.badge}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <h3 className="text-xs sm:text-sm font-extrabold text-white leading-snug line-clamp-2 group-hover:text-fuchsia-300 transition-colors">
                            {svc.title}
                          </h3>
                          <p className="text-[11px] text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                            {svc.description}
                          </p>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-purple-500/15">
                          <div>
                            <span className="text-[9px] text-gray-400 uppercase font-semibold block leading-none">
                              Starting at
                            </span>
                            <span className="text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-300 to-white">
                              {svc.price > 0 ? `₹${svc.price.toLocaleString('en-IN')}` : 'Custom Quote'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 text-[11px]">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            <span className="font-bold text-white">
                              {svc.rating > 0 ? svc.rating : 'New'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            );
          })()}
        </main>

        {/* Floating Bottom Navigation */}
        <BottomNav />
      </div>
    </div>
  );
}
