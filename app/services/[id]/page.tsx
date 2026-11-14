'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Heart,
  Share2,
  Star,
  ShieldCheck,
  Check,
  Clock,
  ArrowRight,
  ShoppingCart,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { fetchSavedWishlistServiceIds, toggleWishlistService } from '@/lib/wishlistClient';
import { subscribeSmartFetch } from '@/lib/clientCache';

interface PackageOption {
  id: 'basic' | 'standard' | 'premium';
  name: string;
  badge?: string;
  subtitle: string;
  price: number;
  deliveryTime?: string;
  features: string[];
}

interface ServiceReviewItem {
  id: string;
  customer_name?: string;
  rating?: number;
  review_text?: string;
  created_at?: string;
}

interface ServiceMeta {
  id: string;
  title: string;
  description: string;
  provider: string;
  rating: number;
  reviewsCount: number;
  imageSrc: string;
}

export default function ServiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const rawId = (params?.id as string) || '';

  const [serviceMeta, setServiceMeta] = useState<ServiceMeta | null>(null);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [serviceReviews, setServiceReviews] = useState<ServiceReviewItem[]>([]);
  const [isNotFound, setIsNotFound] = useState(false);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [activeTab, setActiveTab] = useState<'packages' | 'details' | 'reviews' | 'faq'>('packages');
  const [selectedPackage, setSelectedPackage] = useState<'basic' | 'standard' | 'premium'>('standard');
  const [cartAdded, setCartAdded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!rawId) {
      setIsNotFound(true);
      setIsLoading(false);
      return;
    }

    const unsubService = subscribeSmartFetch<{
      service?: {
        id: string;
        title: string;
        description?: string | null;
        provider_name?: string | null;
        rating_average?: number | null;
        rating_count?: number | null;
        images?: string[] | null;
        price_min?: number | null;
      } | null;
      plans?: Array<{
        level?: string | null;
        is_recommended?: boolean;
        description?: string | null;
        price_min?: number | null;
        estimated_delivery_time?: string | null;
        includes?: string[] | null;
      }>;
    }>(
      `/api/catalog?mode=service&id=${encodeURIComponent(rawId)}`,
      'catalog',
      (json) => {
        const svc = json?.service || null;
        if (!svc) {
          setIsNotFound(true);
          setIsLoading(false);
          return;
        }

        const rawImages = Array.isArray(svc.images) ? svc.images : [];
        const img = rawImages[0] || '/assets/search_svc_1.png';

        setIsNotFound(false);
        setServiceMeta({
          id: svc.id,
          title: svc.title,
          description: (svc.description || '').replace(/<[^>]*>?/gm, ''),
          provider: svc.provider_name || 'Taliyo Technologies',
          rating: Number(svc.rating_average || 0),
          reviewsCount: Number(svc.rating_count || 0),
          imageSrc: img,
        });

        fetchSavedWishlistServiceIds()
          .then(({ serviceIds }) => setIsWishlisted(serviceIds.includes(svc.id)))
          .catch(() => {});

        const plans = Array.isArray(json?.plans) ? json.plans : [];
        if (plans.length > 0) {
          const mappedPlans: PackageOption[] = plans.map((p, idx) => {
            const levelKey = idx === 0 ? 'basic' : idx === 1 ? 'standard' : 'premium';
            const includes = Array.isArray(p.includes) ? p.includes : [];

            return {
              id: levelKey,
              name: p.level ? p.level.charAt(0).toUpperCase() + p.level.slice(1) : `Plan ${idx + 1}`,
              badge: p.is_recommended ? 'Popular' : idx === 2 ? 'Enterprise' : undefined,
              subtitle: p.description ? p.description.slice(0, 60) + (p.description.length > 60 ? '...' : '') : '',
              price: Number(p.price_min || 0),
              deliveryTime: p.estimated_delivery_time || undefined,
              features: includes.slice(0, 5),
            };
          });

          setPackages(mappedPlans);
          setSelectedPackage((prev) =>
            mappedPlans.some((p) => p.id === prev) ? prev : mappedPlans[1]?.id || mappedPlans[0]?.id || 'basic',
          );
        } else {
          setPackages([
            {
              id: 'basic',
              name: 'Standard',
              subtitle: 'Configured service plan',
              price: Number(svc.price_min || 0),
              features: ['Source code handover', 'Direct technical support'],
            },
          ]);
          setSelectedPackage('basic');
        }
        setIsLoading(false);
      },
      {
        onError: (err) => {
          console.error('Failed to load service detail:', err);
          setIsNotFound(true);
          setIsLoading(false);
        },
      },
    );

    const unsubReviews = subscribeSmartFetch<{ data?: ServiceReviewItem[] }>(
      '/api/reviews',
      'reviews',
      (revJson) => {
        const list = Array.isArray(revJson?.data) ? revJson.data : [];
        setServiceReviews(list.slice(0, 5));
      },
    );

    return () => {
      unsubService();
      unsubReviews();
    };
  }, [rawId]);

  const currentPkg = packages.find((p) => p.id === selectedPackage) || packages[1] || packages[0];

  const trackServiceEvent = (eventType: string) => {
    try {
      const payload = JSON.stringify({
        slug: rawId,
        event_type: eventType,
        event_data: { title: serviceMeta?.title || rawId, package: currentPkg?.name || null },
      });
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon('/api/tracking', new Blob([payload], { type: 'application/json' }));
      } else {
        fetch('/api/tracking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {}
  };

  const handleAddToCart = () => {
    if (!serviceMeta || !currentPkg) return;
    trackServiceEvent('add_to_cart');
    try {
      interface CartItemRecord {
        id: string;
        slug: string;
        title: string;
        subtitle: string;
        packageName: string;
        deliveryDays: number;
        price: number;
        quantity: number;
        imageSrc: string;
      }
      const stored = typeof window !== 'undefined' ? localStorage.getItem('taliyo_cart') : null;
      const cart: CartItemRecord[] = stored ? (JSON.parse(stored) as CartItemRecord[]) : [];
      const itemKey = `cart-${rawId}-${currentPkg.name}`;
      const existingIdx = cart.findIndex((i) => i.id === itemKey);
      if (existingIdx !== -1) {
        cart[existingIdx].quantity += 1;
      } else {
        const dtText = String(currentPkg.deliveryTime || '');
        const dtMatch = dtText.match(/\d+/);
        const parsedDeliveryDays = dtMatch
          ? /hour|hr/i.test(dtText)
            ? Math.max(1, Math.ceil(Number(dtMatch[0]) / 24))
            : Number(dtMatch[0])
          : 14;
        cart.push({
          id: itemKey,
          slug: rawId,
          title: serviceMeta.title,
          subtitle: `By ${serviceMeta.provider}`,
          packageName: currentPkg.name,
          deliveryDays: parsedDeliveryDays,
          price: currentPkg.price,
          quantity: 1,
          imageSrc: serviceMeta.imageSrc || '/assets/cart_thumb_1.png',
        });
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('taliyo_cart', JSON.stringify(cart));
        window.dispatchEvent(new Event('taliyo_cart_updated'));
      }
    } catch (e) {
      console.warn('Error adding to cart:', e);
    }
    setCartAdded(true);
    setTimeout(() => setCartAdded(false), 2500);
  };

  const handleBookNow = () => {
    trackServiceEvent('book_now');
    handleAddToCart();
    setTimeout(() => {
      router.push('/cart');
    }, 600);
  };

  return (
    <div className="min-h-screen bg-[#080811] text-white flex flex-col items-center">
      <div className="w-full max-w-md min-h-screen flex flex-col bg-[#080811] relative shadow-2xl">
        {/* Top Header */}
        <header className="sticky top-0 z-40 w-full bg-[#080811]/90 backdrop-blur-xl px-4 py-3 flex items-center justify-between border-b border-purple-500/10">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go Back"
            className="w-9 h-9 rounded-full bg-[#121326] border border-purple-500/20 flex items-center justify-center text-gray-300 hover:text-white hover:border-purple-400 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                if (!serviceMeta?.id) return;
                const prev = isWishlisted;
                setIsWishlisted(!prev);
                try {
                  const saved = await toggleWishlistService(serviceMeta.id, prev);
                  setIsWishlisted(saved);
                } catch {
                  setIsWishlisted(prev);
                }
              }}
              aria-label="Wishlist"
              className="w-9 h-9 rounded-full bg-[#121326] border border-purple-500/20 flex items-center justify-center text-gray-300 hover:text-rose-400 transition-all cursor-pointer"
            >
              <Heart
                className={`w-4 h-4 ${
                  isWishlisted ? 'fill-rose-500 text-rose-500' : ''
                }`}
              />
            </button>
            <button
              type="button"
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: serviceMeta?.title || 'Taliyo Service', url: window.location.href });
                }
              }}
              aria-label="Share"
              className="w-9 h-9 rounded-full bg-[#121326] border border-purple-500/20 flex items-center justify-center text-gray-300 hover:text-white transition-all cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Floating Add to Cart Toast */}
        {cartAdded && currentPkg && (
          <div className="fixed top-16 inset-x-0 z-50 flex justify-center px-4 animate-in fade-in slide-in-from-top-3 duration-250 pointer-events-none">
            <div className="bg-[#0b0d1e]/80 backdrop-blur-xl border border-emerald-500/20 text-emerald-200 text-xs font-medium px-3.5 py-1.5 rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.5),0_0_10px_rgba(16,185,129,0.1)] flex items-center gap-2 pointer-events-auto transition-all">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="leading-tight">Added to Cart! Package: {currentPkg.name}</span>
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 pb-32">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Loader2 className="w-8 h-8 text-fuchsia-400 animate-spin" />
              <p className="text-xs text-purple-200/60 font-medium">
                Loading service from Supabase...
              </p>
            </div>
          ) : isNotFound || !serviceMeta ? (
            <div className="py-24 px-4 text-center space-y-3">
              <p className="text-base font-bold text-white">Service not found</p>
              <p className="text-xs text-gray-400">
                This system is unavailable or has been removed from the catalog.
              </p>
              <button
                type="button"
                onClick={() => router.push('/categories')}
                className="px-4 py-2 rounded-full bg-purple-600 text-white text-xs font-bold cursor-pointer"
              >
                Browse Categories
              </button>
            </div>
          ) : (
            <>
              {/* Hero Media Banner */}
              <div className="relative w-full h-56 bg-[#181135] overflow-hidden">
                <Image
                  src={serviceMeta.imageSrc}
                  alt={serviceMeta.title}
                  fill
                  className="object-cover"
                  unoptimized
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#080811] via-[#080811]/40 to-transparent" />

                {/* Rating Badge Overlay */}
                <div className="absolute bottom-3 left-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/70 border border-purple-400/30 backdrop-blur-md">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  {serviceMeta.rating > 0 ? (
                    <>
                      <span className="text-xs font-bold text-white">{serviceMeta.rating}</span>
                      <span className="text-[10px] text-gray-300">
                        ({serviceMeta.reviewsCount} reviews)
                      </span>
                    </>
                  ) : (
                    <span className="text-xs font-bold text-white">New System</span>
                  )}
                </div>
              </div>

              {/* Title & Info Section */}
              <div className="px-4 pt-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-purple-300 font-semibold">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>{serviceMeta.provider}</span>
                  <span className="text-gray-600">•</span>
                  <span className="text-gray-400 text-[11px]">End-to-End Delivery</span>
                </div>

                <h1 className="text-lg sm:text-xl font-black text-white tracking-tight leading-snug">
                  {serviceMeta.title}
                </h1>

                <p className="text-xs text-gray-300 leading-relaxed">
                  {serviceMeta.description}
                </p>
              </div>

              {/* Navigation Tabs */}
              <div className="mt-4 px-4 border-b border-purple-500/15 flex gap-4 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setActiveTab('packages')}
                  className={`pb-2.5 transition-colors cursor-pointer border-b-2 ${
                    activeTab === 'packages'
                      ? 'border-fuchsia-500 text-white'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Packages ({packages.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('details')}
                  className={`pb-2.5 transition-colors cursor-pointer border-b-2 ${
                    activeTab === 'details'
                      ? 'border-fuchsia-500 text-white'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Tech Details
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('reviews')}
                  className={`pb-2.5 transition-colors cursor-pointer border-b-2 ${
                    activeTab === 'reviews'
                      ? 'border-fuchsia-500 text-white'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Reviews ({serviceReviews.length})
                </button>
              </div>

              {/* Tab Content */}
              <div className="px-4 pt-4 space-y-4">
                {activeTab === 'packages' && (
                  <>
                    {/* Package Selector Cards */}
                    <div
                      className={`grid gap-2 ${
                        packages.length === 1
                          ? 'grid-cols-1'
                          : packages.length === 2
                          ? 'grid-cols-2'
                          : 'grid-cols-3'
                      }`}
                    >
                      {packages.map((pkg) => (
                        <button
                          key={pkg.id}
                          type="button"
                          onClick={() => setSelectedPackage(pkg.id)}
                          className={`p-3 rounded-2xl border text-left transition-all duration-200 relative cursor-pointer ${
                            selectedPackage === pkg.id
                              ? 'bg-gradient-to-b from-[#241347] to-[#160c2e] border-fuchsia-500 shadow-lg shadow-purple-950/40 ring-1 ring-fuchsia-400/50'
                              : 'bg-[#111226]/80 border-purple-500/20 hover:border-purple-500/40'
                          }`}
                        >
                          {pkg.badge && (
                            <span className="absolute -top-2 right-2 px-1.5 py-0.2 rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-600 text-[8px] font-extrabold text-white uppercase tracking-wider shadow-sm">
                              {pkg.badge}
                            </span>
                          )}

                          <span className="text-xs font-bold text-white block">
                            {pkg.name}
                          </span>

                          <span className="text-[11px] font-black text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-300 to-white block mt-1">
                            ₹{pkg.price.toLocaleString('en-IN')}
                          </span>

                          {pkg.deliveryTime && (
                            <span className="text-[9px] text-gray-400 block mt-0.5">
                              {pkg.deliveryTime}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Selected Package Detailed Breakdown */}
                    <div className="rounded-[24px] bg-[#111226]/90 border border-purple-500/25 p-4 shadow-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-extrabold text-white block">
                            {currentPkg.name} Package Overview
                          </span>
                          <span className="text-[10px] text-purple-200/70 block mt-0.5">
                            {currentPkg.subtitle}
                          </span>
                        </div>
                        <span className="text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-pink-300">
                          ₹{currentPkg.price.toLocaleString('en-IN')}
                        </span>
                      </div>

                      {/* Timeline Pill */}
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1b1540] border border-purple-500/30 text-purple-200 text-[10px] font-semibold">
                        <Clock className="w-3 h-3 text-cyan-400" />
                        <span>Estimated Delivery: {currentPkg.deliveryTime || '7–10 Days'}</span>
                      </div>

                      {/* Included Features List */}
                      <div className="pt-2 space-y-2 border-t border-purple-500/15">
                        <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider block">
                          What&apos;s Included:
                        </span>
                        {currentPkg.features.map((feat, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-xs text-gray-200">
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            <span className="leading-snug">{feat}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {activeTab === 'details' && (
                  <div className="rounded-[24px] bg-[#111226]/90 border border-purple-500/25 p-4 shadow-xl space-y-3 text-xs leading-relaxed text-gray-300">
                    <h3 className="font-bold text-white text-sm">What&apos;s Included in Delivery</h3>
                    <p>
                      Every project delivered through Taliyo Marketplace includes clean source code, deployment setup, documentation, and full ownership rights.
                    </p>
                    <div className="pt-2 space-y-1.5 text-purple-200">
                      <p>✓ 100% Full Source Code Handover</p>
                      <p>✓ Zero Vendor Lock-in or Hidden Licensing</p>
                      <p>✓ Cloud Infrastructure Auto-Setup (AWS, GCP, Supabase)</p>
                      <p>✓ Post-Deployment Verification & Bug Warranty</p>
                    </div>
                  </div>
                )}

                {activeTab === 'reviews' && (
                  <div className="rounded-[24px] bg-[#111226]/90 border border-purple-500/25 p-4 shadow-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-purple-500/15 pb-2">
                      <span className="text-xs font-bold text-white">Verified Client Reviews</span>
                      <button
                        type="button"
                        onClick={() => router.push('/reviews')}
                        className="text-[11px] font-bold text-fuchsia-400 hover:text-fuchsia-300 cursor-pointer"
                      >
                        See All →
                      </button>
                    </div>
                    {serviceReviews.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">
                        No reviews published yet. Be the first to share your feedback on the Reviews page.
                      </p>
                    ) : (
                      <div className="space-y-2 text-xs text-gray-300">
                        {serviceReviews.map((rev) => (
                          <div key={rev.id} className="p-2.5 rounded-xl bg-[#171433]/70 border border-purple-500/15">
                            <div className="flex justify-between text-[11px] font-bold text-white mb-1">
                              <span>{rev.customer_name || 'Verified Client'}</span>
                              <span className="text-amber-300 text-[10px]">{rev.rating || 5} ★</span>
                            </div>
                            <p className="text-[11px] text-gray-300">
                              {rev.review_text}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </main>

        {/* Sticky Bottom Action Dock */}
        {!isNotFound && currentPkg && (
        <div className="fixed bottom-0 inset-x-0 z-40 flex justify-center px-4 pb-4 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-[#0d0a21]/95 border border-purple-500/30 p-3 shadow-2xl backdrop-blur-xl flex items-center justify-between gap-3">
            <div>
              <span className="text-[9px] text-gray-400 uppercase font-semibold block leading-none">
                Total Price
              </span>
              <span className="text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-300 via-pink-300 to-white">
                {currentPkg.price > 0 ? `₹${currentPkg.price.toLocaleString('en-IN')}` : 'Custom Quote'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAddToCart}
                className="p-3 rounded-xl bg-[#1b143a] border border-purple-500/30 text-purple-200 hover:text-white hover:border-purple-400 transition-all cursor-pointer shadow-sm active:scale-95"
                title="Add to Cart"
              >
                <ShoppingCart className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleBookNow}
                className="px-5 py-3 rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-500 text-white font-extrabold text-xs shadow-lg shadow-purple-900/40 hover:opacity-95 transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                <span>Book Now</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
