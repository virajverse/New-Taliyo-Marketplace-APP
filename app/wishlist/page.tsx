'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Trash2,
  Search,
  ChevronDown,
  Heart,
  Star,
  ShoppingBag,
  ArrowRight,
  CheckCircle2,
  X,
} from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { supabase } from '@/lib/supabaseClient';
import { getGuestWishlistIds, setGuestWishlistIds } from '@/lib/wishlistClient';

interface WishlistItem {
  id: string;
  serviceId: string;
  slug: string;
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  category: string;
  rating: number;
  reviewCount: number;
  ordersCount: string;
  price: string;
  priceRaw: number;
  thumbnail: string;
}

type SortOption = 'recent' | 'price-asc' | 'price-desc' | 'rating-desc';

export default function WishlistPage() {
  const router = useRouter();

  // Wishlist State (starts empty with lazy loader)
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);

  // Modal & Toast States
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; action?: () => void; actionLabel?: string } | null>(null);

  const showToast = (text: string, action?: () => void, actionLabel?: string) => {
    setToastMsg({ text, action, actionLabel });
    setTimeout(() => {
      setToastMsg((prev) => (prev?.text === text ? null : prev));
    }, 3500);
  };

  // Fetch Supabase or Guest wishlist records
  useEffect(() => {
    async function loadWishlist() {
      interface WishlistServiceRow {
        id: string;
        title?: string;
        description?: string | null;
        is_featured?: boolean;
        category_id?: string | null;
        provider_name?: string | null;
        rating_average?: number | null;
        rating_count?: number | null;
        price_min?: number | null;
        images?: string[] | null;
        slug?: string | null;
        service_plans?: Array<{ price_min?: number | null }> | null;
      }

      const mapServiceToItem = (rowId: string, s: WishlistServiceRow, idx: number): WishlistItem => {
        const cleanDesc = (s.description || '').replace(/<[^>]*>?/gm, '').trim();
        const colors = [
          'from-purple-500 to-fuchsia-600',
          'from-amber-500 to-orange-600',
          'from-emerald-500 to-teal-600',
          'from-cyan-500 to-blue-600',
        ];
        const planPrices = Array.isArray(s.service_plans)
          ? s.service_plans.map((p) => Number(p?.price_min || 0)).filter((v) => v > 0)
          : [];
        const minPrice = Number(s.price_min || 0) || (planPrices.length ? Math.min(...planPrices) : 0);

        return {
          id: rowId,
          serviceId: s.id,
          slug: s.slug || s.id,
          title: s.title || 'Custom Service',
          subtitle: cleanDesc.slice(0, 65) + (cleanDesc.length > 65 ? '...' : ''),
          badge: s.is_featured ? 'Featured' : 'Verified',
          badgeColor: colors[idx % colors.length],
          category: s.category_id ? 'Services' : 'Web Development',
          rating: Number(s.rating_average || 0),
          reviewCount: Number(s.rating_count || 0),
          ordersCount: '',
          price: minPrice > 0 ? `₹${minPrice.toLocaleString('en-IN')}` : 'Custom Quote',
          priceRaw: minPrice,
          thumbnail: s.images?.[0] || '/assets/hero_laptop_clean.png',
        };
      };

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          setCurrentUserId(user.id);
          const { data, error } = await supabase
            .from('wishlists')
            .select('*, services(*, service_plans(price_min))')
            .eq('user_id', user.id);

          if (!error && data && data.length > 0) {
            interface WishlistRow {
              id: string;
              services: WishlistServiceRow | null;
            }
            const mapped: WishlistItem[] = (data as WishlistRow[])
              .filter((row): row is { id: string; services: WishlistServiceRow } => Boolean(row.services))
              .map((row, idx: number) => mapServiceToItem(row.id, row.services, idx));

            setItems(mapped);
          } else {
            setItems([]);
          }
        } else {
          setCurrentUserId(null);
          const guestIds = getGuestWishlistIds();
          if (guestIds.length > 0) {
            const gRes = await fetch(`/api/catalog?mode=by-ids&ids=${encodeURIComponent(guestIds.join(','))}`);
            const gJson = gRes.ok ? await gRes.json() : { data: [] };
            const data = gJson.data as WishlistServiceRow[];

            if (Array.isArray(data) && data.length > 0) {
              setItems(data.map((s, idx) => mapServiceToItem(s.id, s, idx)));
            } else {
              setItems([]);
            }
          } else {
            setItems([]);
          }
        }
      } catch (err) {
        console.warn('Supabase wishlist load notice:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadWishlist();
  }, []);

  // Remove from Wishlist with Undo capability
  const handleRemove = async (id: string) => {
    const idx = items.findIndex((item) => item.id === id);
    if (idx === -1) return;
    const itemToRemove = items[idx];
    setItems((prev) => prev.filter((item) => item.id !== id));

    try {
      if (currentUserId) {
        await supabase.from('wishlists').delete().eq('id', id);
      } else {
        setGuestWishlistIds(getGuestWishlistIds().filter((sid) => sid !== itemToRemove.serviceId));
      }
      window.dispatchEvent(new Event('taliyo_wishlist_updated'));
    } catch (e) {
      console.warn('Wishlist delete item error:', e);
    }

    showToast(
      `Removed "${itemToRemove.title}" from wishlist`,
      async () => {
        setItems((prev) => {
          const updated = [...prev];
          updated.splice(idx, 0, itemToRemove);
          return updated;
        });
        if (currentUserId) {
          await supabase.from('wishlists').insert({ user_id: currentUserId, service_id: itemToRemove.serviceId });
        } else {
          setGuestWishlistIds([itemToRemove.serviceId, ...getGuestWishlistIds()]);
        }
        window.dispatchEvent(new Event('taliyo_wishlist_updated'));
        setToastMsg(null);
      },
      'Undo'
    );
  };

  // Clear all wishlist
  const handleClearAll = async () => {
    setItems([]);
    setIsClearModalOpen(false);

    try {
      if (currentUserId) {
        await supabase.from('wishlists').delete().eq('user_id', currentUserId);
      } else {
        setGuestWishlistIds([]);
      }
      window.dispatchEvent(new Event('taliyo_wishlist_updated'));
    } catch (e) {
      console.warn('Supabase clear wishlist error:', e);
    }

    showToast('All items cleared from your wishlist.');
  };

  // Add to real Cart in localStorage
  const handleAddToCart = (item: WishlistItem) => {
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
      const itemKey = `cart-${item.serviceId}-Standard`;
      const existingIdx = cart.findIndex((c) => c.id === itemKey);
      if (existingIdx !== -1) {
        cart[existingIdx].quantity += 1;
      } else {
        cart.push({
          id: itemKey,
          slug: item.slug,
          title: item.title,
          subtitle: 'By Taliyo Technologies',
          packageName: 'Standard',
          deliveryDays: 14,
          price: item.priceRaw,
          quantity: 1,
          imageSrc: item.thumbnail,
        });
      }
      localStorage.setItem('taliyo_cart', JSON.stringify(cart));
      window.dispatchEvent(new Event('taliyo_cart_updated'));
      showToast(`Added "${item.title}" to cart!`, () => router.push('/cart'), 'View Cart');
    } catch {
      showToast(`Could not add "${item.title}" to cart.`);
    }
  };

  // Filter & Sort calculation
  const filteredItems = useMemo(() => {
    const result = items.filter((item) => {
      const q = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });

    switch (sortBy) {
      case 'price-asc':
        result.sort((a, b) => a.priceRaw - b.priceRaw);
        break;
      case 'price-desc':
        result.sort((a, b) => b.priceRaw - a.priceRaw);
        break;
      case 'rating-desc':
        result.sort((a, b) => b.rating - a.rating);
        break;
      case 'recent':
      default:
        // maintain original sequence
        break;
    }
    return result;
  }, [items, searchQuery, sortBy]);

  const sortLabels: Record<SortOption, string> = {
    recent: 'Recently Added',
    'price-asc': 'Price: Low to High',
    'price-desc': 'Price: High to Low',
    'rating-desc': 'Highest Rated',
  };

  return (
    <div className="min-h-screen bg-[#07070d] text-white flex flex-col relative pb-32">
      {/* Light Glassmorphic Toast Notification */}
      {toastMsg && (
        <div className="fixed top-16 inset-x-0 z-50 flex justify-center px-4 animate-in fade-in slide-in-from-top-3 duration-250 pointer-events-none">
          <div className="bg-[#0b0d1e]/80 backdrop-blur-xl border border-emerald-500/20 text-emerald-200 text-xs font-medium px-3.5 py-1.5 rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.5),0_0_10px_rgba(16,185,129,0.1)] flex items-center gap-2.5 pointer-events-auto transition-all">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="leading-tight">{toastMsg.text}</span>
            {toastMsg.action && (
              <button
                onClick={toastMsg.action}
                className="text-[11px] font-bold text-fuchsia-400 hover:text-fuchsia-300 underline underline-offset-2 ml-1 cursor-pointer"
              >
                {toastMsg.actionLabel || 'Undo'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-[#07070d]/90 backdrop-blur-xl border-b border-purple-500/10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            aria-label="Go Back"
            className="w-10 h-10 rounded-full bg-[#121429] border border-purple-500/20 flex items-center justify-center text-gray-300 hover:text-white hover:border-purple-500/40 hover:bg-[#1a1d3d] transition-all shadow-sm cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-tight">
              My Wishlist
            </h1>
            <p className="text-xs text-gray-400 leading-tight">
              Your saved services and products
            </p>
          </div>
        </div>

        {items.length > 0 && (
          <button
            onClick={() => setIsClearModalOpen(true)}
            aria-label="Clear all wishlist items"
            className="w-10 h-10 rounded-full bg-[#121429] border border-purple-500/20 flex items-center justify-center text-gray-400 hover:text-rose-400 hover:border-rose-500/40 hover:bg-rose-500/10 transition-all shadow-sm cursor-pointer"
            title="Clear Wishlist"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-xl w-full mx-auto px-4 pt-4 flex flex-col gap-4">
        {/* Hero Banner: Your Favorite Services */}
        <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-r from-[#210d44]/90 via-[#180a33]/90 to-[#0c0d1e]/90 border border-purple-500/25 p-4 sm:p-5 shadow-[0_12px_36px_rgba(0,0,0,0.55)]">
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-fuchsia-500/15 border border-fuchsia-500/30 text-fuchsia-400 text-xs font-semibold tracking-wide shadow-sm">
                <Heart className="w-3.5 h-3.5 fill-fuchsia-400 text-fuchsia-400" />
                {items.length} Saved Items
              </span>

              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight mt-2.5 leading-snug">
                Your Favorite Services
              </h2>
              <p className="text-xs text-gray-300/80 mt-1 max-w-[240px] leading-relaxed">
                Quickly access and book the services you&apos;re interested in.
              </p>
            </div>

            {/* Authentic Hero Graphic: Glowing 3D Heart Badge */}
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0 flex items-center justify-center">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-pink-600/30 to-purple-600/30 blur-xl animate-pulse" />
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-[#2a133f] to-[#160c28] border border-pink-500/30 flex items-center justify-center shadow-lg shadow-pink-900/40">
                <Heart className="w-8 h-8 sm:w-10 sm:h-10 text-pink-400 fill-pink-500/30 drop-shadow-[0_4px_12px_rgba(244,63,94,0.6)]" />
              </div>
            </div>
          </div>
        </div>

        {/* Search & Sort Controls */}
        <div className="flex flex-col gap-3">
          {/* Search Input Bar */}
          <div className="relative w-full">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-purple-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in wishlist..."
              className="w-full pl-10 pr-9 py-2.5 rounded-2xl bg-[#0f1123]/90 border border-purple-500/20 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-purple-500/60 transition-all shadow-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Sub-bar: Filter Info & Sort Pill */}
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-gray-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-fuchsia-500" />
              {searchQuery
                ? `Showing ${filteredItems.length} of ${items.length} saved`
                : 'Saved for quick comparison & booking'}
            </span>

            {/* Sort Dropdown Pill */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsSortDropdownOpen((prev) => !prev)}
                className="px-3 py-1.5 rounded-full bg-[#121429] border border-purple-500/20 text-xs font-semibold text-purple-300 hover:border-purple-500/40 hover:bg-[#181a33] transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <span>Sort: {sortLabels[sortBy]}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-purple-400 transition-transform ${isSortDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isSortDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setIsSortDropdownOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-1.5 w-48 rounded-2xl bg-[#0f1124] border border-purple-500/30 p-1.5 shadow-2xl z-30 animate-in fade-in zoom-in-95 duration-150">
                    {(['recent', 'price-asc', 'price-desc', 'rating-desc'] as SortOption[]).map((opt) => (
                      <button
                        key={opt}
                        onClick={() => {
                          setSortBy(opt);
                          setIsSortDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer flex items-center justify-between ${
                          sortBy === opt
                            ? 'bg-purple-600/30 text-fuchsia-300 font-bold'
                            : 'text-gray-300 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <span>{sortLabels[opt]}</span>
                        {sortBy === opt && <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Wishlist Cards List */}
        {isLoading ? (
          /* Wishlist Skeleton */
          <div className="flex flex-col gap-3.5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="overflow-hidden rounded-3xl bg-gradient-to-r from-[#0f1123]/80 to-[#16122e]/80 border border-purple-500/15 p-3.5 sm:p-4 animate-pulse flex gap-3.5 shadow-lg"
              >
                <div className="w-28 sm:w-32 h-28 sm:h-32 rounded-2xl bg-purple-900/30 border border-purple-500/20 shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 bg-purple-800/40 rounded-md w-3/4" />
                  <div className="h-2.5 bg-purple-900/20 rounded-md w-1/2" />
                  <div className="h-3 bg-purple-900/25 rounded-md w-1/3 mt-3" />
                  <div className="h-8 bg-purple-900/30 rounded-xl w-full mt-2" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredItems.length > 0 ? (
          <div className="flex flex-col gap-3.5">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="relative overflow-hidden rounded-3xl bg-[#0f1123]/95 border border-purple-500/20 p-3 sm:p-4 hover:border-purple-500/40 transition-all shadow-[0_8px_24px_rgba(0,0,0,0.45)] group"
              >
                <div className="flex gap-3 sm:gap-4">
                  {/* Thumbnail on Left with Badge */}
                  <Link
                    href={`/services/${item.slug}`}
                    className="relative w-28 sm:w-32 h-28 sm:h-32 rounded-2xl overflow-hidden shrink-0 border border-purple-500/20 bg-[#161833] block"
                  >
                    <Image
                      src={item.thumbnail}
                      alt={item.title}
                      fill
                      unoptimized
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                      sizes="(max-width: 640px) 112px, 128px"
                    />

                    {/* Badge on Thumbnail */}
                    <div className="absolute top-2 left-2 z-10">
                      <span
                        className={`text-[9px] sm:text-[10px] font-bold text-white px-2 py-0.5 rounded-full bg-gradient-to-r ${item.badgeColor} shadow-md backdrop-blur-sm`}
                      >
                        {item.badge}
                      </span>
                    </div>
                  </Link>

                  {/* Content on Right */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    {/* Top Row: Title + Heart Button */}
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/services/${item.slug}`}
                        className="text-sm sm:text-base font-bold text-white tracking-tight leading-snug hover:text-purple-300 transition-colors line-clamp-2"
                      >
                        {item.title}
                      </Link>

                      {/* Wishlist Heart Toggle Button */}
                      <button
                        onClick={() => handleRemove(item.id)}
                        aria-label="Remove from wishlist"
                        className="w-8 h-8 rounded-full bg-[#181a33] border border-purple-500/20 flex items-center justify-center text-fuchsia-400 hover:scale-110 active:scale-90 transition-all shrink-0 hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-400 shadow-sm cursor-pointer"
                        title="Remove from wishlist"
                      >
                        <Heart className="w-4 h-4 fill-fuchsia-400 text-fuchsia-400" />
                      </button>
                    </div>

                    {/* Subtitle */}
                    <p className="text-[11px] sm:text-xs text-gray-400 line-clamp-2 leading-relaxed mt-0.5">
                      {item.subtitle}
                    </p>

                    {/* Meta: Rating */}
                    <div className="flex items-center gap-2 sm:gap-3 text-[11px] text-gray-300 mt-1">
                      <div className="flex items-center gap-1 font-semibold">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        {item.rating > 0 ? (
                          <>
                            <span className="text-white">{item.rating}</span>
                            <span className="text-gray-400 font-normal">({item.reviewCount})</span>
                          </>
                        ) : (
                          <span className="text-gray-400 font-normal">New System</span>
                        )}
                      </div>
                    </div>

                    {/* Bottom Row: Price & Action Buttons */}
                    <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-purple-500/10 flex-wrap">
                      <div className="text-base sm:text-lg font-black text-white tracking-tight">
                        {item.price}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Add to Cart Button */}
                        <button
                          onClick={() => handleAddToCart(item)}
                          className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#181a33] border border-purple-500/25 text-purple-200 text-xs font-semibold hover:bg-[#202347] hover:border-purple-500/45 transition-all flex items-center gap-1 shadow-sm cursor-pointer"
                        >
                          <ShoppingBag className="w-3.5 h-3.5" />
                          <span>Add to Cart</span>
                        </button>

                        {/* View Details Button */}
                        <Link
                          href={`/services/${item.slug}`}
                          className="px-3 sm:px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-500 text-white text-xs font-bold shadow-md shadow-fuchsia-600/30 hover:opacity-95 transition-all flex items-center gap-1 shrink-0"
                        >
                          <span>View Details</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="rounded-3xl bg-[#0f1123]/90 border border-purple-500/20 p-8 text-center flex flex-col items-center gap-4 my-6 shadow-xl">
            <div className="w-16 h-16 rounded-full bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-fuchsia-400 shadow-lg shadow-purple-900/40">
              <Heart className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">Your Wishlist is Empty</h3>
              <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto leading-relaxed">
                {searchQuery
                  ? `No services found matching "${searchQuery}". Try different keywords.`
                  : "Explore popular services and tap the heart icon to save them for later."}
              </p>
            </div>

            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="px-4 py-2 rounded-xl bg-[#181a33] border border-purple-500/30 text-purple-300 text-xs font-semibold hover:bg-[#202242] transition-colors cursor-pointer"
              >
                Clear Search Filter
              </button>
            ) : (
              <Link
                href="/categories"
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white text-xs font-bold shadow-md shadow-fuchsia-600/30 hover:opacity-95 transition-opacity inline-flex items-center gap-2"
              >
                <span>Explore Services</span>
              </Link>
            )}
          </div>
        )}
      </main>

      {/* MODAL: Clear Wishlist Confirmation */}
      {isClearModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm rounded-3xl bg-[#0f1124] border border-rose-500/30 p-6 shadow-2xl flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <Trash2 className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">Clear Wishlist?</h3>
              <p className="text-xs text-gray-400 mt-1">
                Are you sure you want to remove all {items.length} saved services from your wishlist?
              </p>
            </div>

            <div className="flex items-center gap-3 w-full pt-2">
              <button
                type="button"
                onClick={() => setIsClearModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-[#181a33] text-gray-300 text-xs font-semibold hover:bg-[#202242] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-500 transition-colors shadow-lg shadow-rose-600/30 cursor-pointer"
              >
                Yes, Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Bottom Floating Dock */}
      <BottomNav />
    </div>
  );
}
