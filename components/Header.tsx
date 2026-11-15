'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Bell, ShoppingBag, Download, Heart, UserCheck, LogIn } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { usePwaInstall } from '@/components/PwaInstallProvider';
import { subscribeSmartFetch } from '@/lib/clientCache';
import { fetchSavedWishlistServiceIds } from '@/lib/wishlistClient';

export default function Header() {
  const { canInstallNative, isIos, isInstalled, triggerInstall } = usePwaInstall();
  const [cartCount, setCartCount] = useState(0);
  const [wishlistCount, setWishlistCount] = useState(0);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    const syncCart = () => {
      try {
        const raw = localStorage.getItem('taliyo_cart');
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) {
          const total = parsed.reduce((sum, item) => sum + (Number(item?.quantity) || 1), 0);
          setCartCount(total);
        } else {
          setCartCount(0);
        }
      } catch {
        setCartCount(0);
      }
    };

    const syncWishlist = async () => {
      try {
        const { serviceIds } = await fetchSavedWishlistServiceIds();
        setWishlistCount(serviceIds.length);
      } catch {
        setWishlistCount(0);
      }
    };

    let unsubNotifications: (() => void) | undefined;
    let disposed = false;

    const loadUserAndNotifications = async () => {
      let uid: string | null = null;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          uid = user.id;
          const metaName =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split('@')[0] ||
            'Member';
          setUserName(String(metaName).trim().split(' ')[0]);
        } else {
          setUserName(null);
        }
      } catch {
        setUserName(null);
      }

      if (disposed) return;
      const qs = uid ? `?userId=${encodeURIComponent(uid)}` : '';
      unsubNotifications = subscribeSmartFetch<{ data?: Array<{ is_read?: boolean }> }>(
        `/api/notifications${qs}`,
        'notifications',
        (json) => {
          const list = Array.isArray(json?.data) ? json.data : [];
          setUnreadNotificationsCount(list.filter((n) => n.is_read === false).length);
        },
        { onError: () => setUnreadNotificationsCount(0) },
      );
    };

    syncCart();
    void syncWishlist();
    void loadUserAndNotifications();

    window.addEventListener('storage', syncCart);
    window.addEventListener('focus', syncCart);
    window.addEventListener('taliyo_cart_updated', syncCart);
    window.addEventListener('taliyo_wishlist_updated', syncWishlist);
    return () => {
      disposed = true;
      unsubNotifications?.();
      window.removeEventListener('storage', syncCart);
      window.removeEventListener('focus', syncCart);
      window.removeEventListener('taliyo_cart_updated', syncCart);
      window.removeEventListener('taliyo_wishlist_updated', syncWishlist);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full bg-[#080811]/90 backdrop-blur-xl border-b border-purple-500/10 px-4 py-3 flex items-center justify-between">
      {/* Brand Logo & Name */}
      <Link href="/" className="flex items-center gap-2.5 group">
        <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 via-fuchsia-600 to-pink-500 shadow-md shadow-purple-900/40 p-0.5 transition-transform group-hover:scale-105">
          <div className="w-full h-full bg-white rounded-[14px] overflow-hidden flex items-center justify-center">
            <Image
              src="/icons/icon-192.png"
              alt="Taliyo Marketplace"
              width={40}
              height={40}
              className="w-full h-full object-cover scale-110"
              priority
            />
          </div>
        </div>
        <div className="flex flex-col">
          <span className="font-black text-white text-base tracking-tight leading-none group-hover:text-purple-300 transition-colors">
            Taliyo
          </span>
          <span className="text-[10px] font-bold text-gray-400 tracking-widest uppercase leading-tight mt-0.5">
            Marketplace
          </span>
        </div>
      </Link>

      {/* Action Icons Row */}
      <div className="flex items-center gap-2">
        {/* PWA Install button (only shown when direct native prompt or iOS install is available) */}
        {!isInstalled && (canInstallNative || isIos) && (
          <button
            type="button"
            onClick={triggerInstall}
            aria-label="Install App"
            title="Install Taliyo App"
            className="h-9 px-3 rounded-full bg-purple-600/20 border border-purple-500/40 flex items-center gap-1.5 text-purple-200 hover:text-white hover:bg-purple-600/35 hover:border-purple-400 transition-all text-[11px] font-bold shadow-sm cursor-pointer shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Install</span>
          </button>
        )}

        {/* Account / Login Status Pill */}
        <Link
          href={userName ? '/profile' : '/login'}
          aria-label={userName ? `Signed in as ${userName}` : 'Sign In'}
          className="hidden xs:inline-flex sm:inline-flex h-9 px-2.5 rounded-full bg-[#15162a]/90 border border-purple-500/20 items-center gap-1.5 text-[11px] font-bold text-gray-200 hover:text-white hover:border-purple-500/50 transition-all"
        >
          {userName ? (
            <>
              <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="max-w-[72px] truncate">{userName}</span>
            </>
          ) : (
            <>
              <LogIn className="w-3.5 h-3.5 text-purple-400" />
              <span>Sign In</span>
            </>
          )}
        </Link>

        {/* Wishlist */}
        <Link
          href="/wishlist"
          aria-label="Saved Services Wishlist"
          className="relative w-9 h-9 rounded-full bg-[#15162a]/90 border border-purple-500/20 flex items-center justify-center text-gray-300 hover:text-white hover:border-purple-500/50 hover:bg-[#1f203d] transition-all shadow-sm cursor-pointer"
        >
          <Heart className="w-4 h-4" />
          {wishlistCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-rose-500 text-[10px] font-black text-white flex items-center justify-center shadow-lg shadow-rose-600/50 ring-2 ring-[#080811]">
              {wishlistCount}
            </span>
          )}
        </Link>

        {/* Notifications */}
        <Link
          href="/notifications"
          aria-label="Notifications"
          className="relative w-9 h-9 rounded-full bg-[#15162a]/90 border border-purple-500/20 flex items-center justify-center text-gray-300 hover:text-white hover:border-purple-500/50 hover:bg-[#1f203d] transition-all shadow-sm cursor-pointer"
        >
          <Bell className="w-4 h-4" />
          {unreadNotificationsCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-gradient-to-r from-fuchsia-500 to-pink-500 text-[10px] font-black text-white flex items-center justify-center shadow-lg shadow-pink-600/50 ring-2 ring-[#080811]">
              {unreadNotificationsCount}
            </span>
          )}
        </Link>

        {/* Cart with badge */}
        <Link
          href="/cart"
          aria-label="Shopping Cart"
          className="relative w-9 h-9 rounded-full bg-[#15162a]/90 border border-purple-500/20 flex items-center justify-center text-gray-300 hover:text-white hover:border-purple-500/50 hover:bg-[#1f203d] transition-all shadow-sm"
        >
          <ShoppingBag className="w-4 h-4" />
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-600 text-[10px] font-black text-white flex items-center justify-center shadow-lg shadow-fuchsia-600/50 ring-2 ring-[#080811]">
              {cartCount}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
