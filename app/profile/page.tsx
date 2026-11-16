'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Pencil,
  ShieldCheck,
  Mail,
  Phone,
  User,
  Package,
  Heart,
  Bell,
  Settings,
  Headphones,
  LogOut,
  ChevronRight,
  CheckCircle2,
  X,
  Check,
  HelpCircle,
  Shield,
  Tag,
  Copy,
  Percent,
  IndianRupee,
  Download,
} from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { usePwaInstall } from '@/components/PwaInstallProvider';
import { supabase, getAuthHeaders } from '@/lib/supabaseClient';
import { getGuestWishlistIds } from '@/lib/wishlistClient';

interface ProfileUser {
  name: string;
  email: string;
  phone: string;
  avatar: string;
  isVerified: boolean;
}

interface CouponItem {
  id: string;
  code: string;
  description: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_order_amount: number;
  max_discount_amount?: number;
  expiry_date?: string;
  is_active: boolean;
}

const BADGE_AVATAR_STYLES: Record<string, string> = {
  'badge:purple': 'from-purple-600 to-indigo-600',
  'badge:cyan': 'from-cyan-600 to-blue-600',
  'badge:emerald': 'from-emerald-600 to-teal-600',
  'badge:amber': 'from-amber-500 to-orange-600',
  'badge:rose': 'from-rose-500 to-pink-600',
};

const AVATAR_OPTIONS = [
  'badge:purple',
  'badge:cyan',
  'badge:emerald',
  'badge:amber',
  'badge:rose',
];

export default function ProfilePage() {
  const router = useRouter();
  const { canInstallNative, isIos, isInstalled, triggerInstall } = usePwaInstall();

  // Auth & User State
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<ProfileUser>({
    name: '',
    email: '',
    phone: '',
    avatar: 'badge:purple',
    isVerified: false,
  });

  // Active Modals
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isCouponsOpen, setIsCouponsOpen] = useState(false);
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);

  // Edit Profile Form State
  const [editName, setEditName] = useState(user.name);
  const [editEmail, setEditEmail] = useState(user.email);
  const [editPhone, setEditPhone] = useState(user.phone);
  const [selectedAvatar, setSelectedAvatar] = useState(user.avatar);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Real Order Stats from Database
  const [realOrderStats, setRealOrderStats] = useState<{
    total: number | null;
    active: number;
    pending: number;
  }>({
    total: null,
    active: 0,
    pending: 0,
  });

  const [wishlistCount, setWishlistCount] = useState<number>(0);
  const [liveCoupons, setLiveCoupons] = useState<CouponItem[]>([]);
  const [copiedCoupon, setCopiedCoupon] = useState<string | null>(null);

  // Load real profile, order stats, wishlist count and live coupons
  useEffect(() => {
    async function loadRealStats(userId: string, email: string) {
      try {
        const params = new URLSearchParams({ userId });
        if (email) params.set('email', email);
        const authHeaders = await getAuthHeaders();
        const res = await fetch(`/api/bookings?${params.toString()}`, {
          cache: 'no-store',
          headers: authHeaders,
        });
        const json = await res.json();
        if (json.data) {
          interface BookingStatusRow {
            status?: string;
          }
          const list = json.data as BookingStatusRow[];
          const active = list.filter(
            (b) =>
              b.status === 'confirmed' ||
              b.status === 'work_started' ||
              b.status === 'in_progress'
          ).length;
          const pending = list.filter((b) => b.status === 'pending').length;

          setRealOrderStats({
            total: list.length,
            active,
            pending,
          });
        }
      } catch (e) {
        console.warn('Real stats notice:', e);
      }
    }

    async function loadAuthProfile() {
      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();

        if (authUser) {
          setIsAuthenticated(true);
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', authUser.id)
            .maybeSingle();

          const loadedEmail = authUser.email || '';
          const loadedName =
            profile?.name ||
            authUser.user_metadata?.full_name ||
            loadedEmail.split('@')[0] ||
            'Account';

          const loadedPhone = profile?.phone || authUser.phone || '';
          const loadedAvatar =
            (profile?.avatar_url && profile.avatar_url !== '/assets/profile_avatar_user.png' && profile.avatar_url) ||
            (authUser.user_metadata?.avatar_url && authUser.user_metadata.avatar_url !== '/assets/profile_avatar_user.png' && authUser.user_metadata.avatar_url) ||
            'badge:purple';

          setUser({
            name: loadedName,
            email: loadedEmail,
            phone: loadedPhone,
            avatar: loadedAvatar,
            isVerified: !!authUser.email_confirmed_at,
          });

          setEditName(loadedName);
          setEditEmail(loadedEmail);
          setEditPhone(loadedPhone);
          setSelectedAvatar(loadedAvatar);

          loadRealStats(authUser.id, loadedEmail);
          loadCoupons();

          try {
            const { count } = await supabase
              .from('wishlists')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', authUser.id);
            if (count !== null) setWishlistCount(count);
          } catch {}
        } else {
          setIsAuthenticated(false);
          setRealOrderStats({ total: 0, active: 0, pending: 0 });
          setWishlistCount(getGuestWishlistIds().length);
          loadCoupons();
        }
      } catch (err) {
        console.warn('Notice loading auth profile:', err);
        setIsAuthenticated(false);
        setRealOrderStats({ total: 0, active: 0, pending: 0 });
        loadCoupons();
      } finally {
        setIsAuthLoading(false);
      }
    }

    async function loadCoupons() {
      try {
        const authHeaders = await getAuthHeaders();
        const res = await fetch('/api/coupons', { cache: 'no-store', headers: authHeaders });
        const json = await res.json();
        if (json.data && Array.isArray(json.data)) {
          setLiveCoupons(json.data);
        }
      } catch (e) {
        console.warn('Notice loading coupons:', e);
      }
    }

    loadAuthProfile();
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const formatPhoneDisplay = (rawPhone: string) => {
    const trimmed = rawPhone.trim();
    if (!trimmed) return '';
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length === 10) {
      return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
    }
    if (digits.length === 12 && digits.startsWith('91')) {
      return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
    }
    return trimmed;
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCoupon(code);
    showToast(`Coupon code ${code} copied!`);
    setTimeout(() => setCopiedCoupon(null), 2000);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setUser((prev) => ({
      ...prev,
      name: editName,
      email: editEmail,
      phone: editPhone,
      avatar: selectedAvatar,
    }));

    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (authUser) {
        await Promise.all([
          supabase.from('profiles').upsert({
            id: authUser.id,
            name: editName,
            phone: editPhone,
            avatar_url: selectedAvatar,
            updated_at: new Date().toISOString(),
          }),
          supabase.auth.updateUser({
            data: { full_name: editName, phone: editPhone, avatar_url: selectedAvatar },
          }),
        ]);
      }
      showToast('Profile updated successfully!');
      setIsEditProfileOpen(false);
    } catch (err) {
      console.error('Failed to update Supabase profile:', err);
      showToast('Profile updated locally.');
      setIsEditProfileOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07070d] text-white flex flex-col relative pb-32">
      {/* Ultra-Light Dynamic Island Toast (Positioned gracefully below header, zero overlap) */}
      {toastMsg && (
        <div className="fixed top-16 inset-x-0 z-50 flex justify-center px-4 animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-none">
          <div className="bg-[#0b0d1e]/80 backdrop-blur-xl border border-emerald-500/20 text-emerald-200 text-xs font-medium px-3.5 py-1.5 rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.5),0_0_10px_rgba(16,185,129,0.1)] flex items-center gap-2 pointer-events-auto transition-all">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="leading-tight tracking-wide">{toastMsg}</span>
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-[#07070d]/90 backdrop-blur-xl border-b border-purple-500/10 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-tight">
            My Profile
          </h1>
          <p className="text-xs text-gray-400 leading-tight">
            Manage your account, orders & preferences
          </p>
        </div>

        {isAuthenticated ? (
          <button
            type="button"
            onClick={() => setIsEditProfileOpen(true)}
            aria-label="Edit Profile"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#151733] border border-purple-500/30 text-purple-200 text-xs font-bold hover:bg-[#1f2247] hover:text-white transition-all shadow-sm cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Edit Profile</span>
          </button>
        ) : (
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white text-xs font-bold shadow-md hover:opacity-95 transition-all"
          >
            <span>Sign In</span>
          </Link>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-xl w-full mx-auto px-4 pt-4 flex flex-col gap-5">
        {/* Profile Card */}
        <div className="relative rounded-3xl bg-gradient-to-b from-[#141630] to-[#0c0d1e] border border-purple-500/20 p-5 shadow-[0_10px_35px_rgba(0,0,0,0.5)] overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

          {isAuthLoading ? (
            <div className="relative flex items-center gap-4 animate-pulse">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-purple-900/30 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-purple-800/40 rounded w-1/2" />
                <div className="h-3 bg-purple-900/30 rounded w-2/3" />
              </div>
            </div>
          ) : !isAuthenticated ? (
            <div className="relative flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-14 h-14 rounded-2xl bg-[#1e2040] border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0">
                  <User className="w-7 h-7" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-white tracking-tight">
                    Sign in to your account
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5 leading-snug">
                    Access your live orders, saved wishlist, and profile settings.
                  </p>
                </div>
              </div>
              <Link
                href="/login"
                className="shrink-0 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white text-xs font-bold shadow-lg shadow-fuchsia-600/25 hover:opacity-95 transition-all"
              >
                Login / Sign Up
              </Link>
            </div>
          ) : (
            <div className="relative flex items-center gap-4">
              {/* Avatar */}
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#1e2040] border-2 border-purple-500/40 p-0.5 shadow-lg shrink-0">
                <div className="relative w-full h-full rounded-[14px] overflow-hidden bg-[#0a0a14]">
                  {BADGE_AVATAR_STYLES[user.avatar] ? (
                    <div
                      className={`w-full h-full bg-gradient-to-br ${BADGE_AVATAR_STYLES[user.avatar]} flex items-center justify-center text-2xl font-black text-white`}
                    >
                      {(user.name || 'T').charAt(0).toUpperCase()}
                    </div>
                  ) : (
                    <Image
                      src={user.avatar}
                      alt={user.name}
                      fill
                      unoptimized
                      className="object-cover"
                      sizes="80px"
                      priority
                    />
                  )}
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-white truncate tracking-tight">
                    {user.name}
                  </h2>
                  {user.isVerified ? (
                    <span
                      title="Verified Account"
                      className="inline-flex items-center text-cyan-400 shrink-0"
                    >
                      <ShieldCheck className="w-4 h-4" />
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-purple-300/70 bg-purple-500/15 border border-purple-500/25 px-2 py-0.5 rounded-full shrink-0">
                      Member
                    </span>
                  )}
                </div>

                {user.email && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-300 mt-1 truncate">
                    <Mail className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </div>
                )}

                {user.phone ? (
                  <div className="flex items-center gap-1.5 text-xs text-gray-300 mt-1 truncate">
                    <Phone className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span>{formatPhoneDisplay(user.phone)}</span>
                  </div>
                ) : (
                  <div className="text-[11px] text-purple-300/60 mt-1">
                    Tap Edit Profile to add phone number
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* =========================================
            SECTION 1: ORDERS & DELIVERABLES
        ========================================= */}
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">
            Orders & Purchases
          </h3>
          <div className="rounded-[22px] bg-[#0f1123]/95 border border-purple-500/15 divide-y divide-purple-500/10 overflow-hidden shadow-sm">
            {/* 1. My Orders & Bookings */}
            <Link
              href="/orders"
              className="flex items-center justify-between p-3.5 hover:bg-[#161833] transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-full bg-[#2a1740] border border-purple-500/25 flex items-center justify-center text-purple-300 shrink-0 group-hover:scale-105 transition-transform">
                  <Package className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white group-hover:text-purple-200 transition-colors">
                      My Orders & Bookings
                    </span>
                    {realOrderStats.total !== null && realOrderStats.total > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-200 text-[10px] font-bold">
                        {realOrderStats.total} Total
                      </span>
                    )}
                    {realOrderStats.active > 0 ? (
                      <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[10px] font-bold">
                        {realOrderStats.active} Active
                      </span>
                    ) : realOrderStats.pending > 0 ? (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold">
                        {realOrderStats.pending} Pending
                      </span>
                    ) : realOrderStats.total === 0 ? (
                      <span className="px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-[10px] font-bold">
                        0 Orders
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-gray-400 truncate mt-0.5">
                    Track deliverables, milestones &amp; order history
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors shrink-0 ml-2" />
            </Link>

            {/* 2. My Wishlist */}
            <Link
              href="/wishlist"
              className="flex items-center justify-between p-3.5 hover:bg-[#161833] transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-full bg-[#2a1740] border border-purple-500/25 flex items-center justify-center text-pink-400 shrink-0 group-hover:scale-105 transition-transform">
                  <Heart className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white group-hover:text-pink-200 transition-colors">
                      Saved Services (Wishlist)
                    </span>
                    {wishlistCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-pink-500/15 border border-pink-500/30 text-pink-300 text-[10px] font-bold">
                        {wishlistCount} Saved
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 truncate mt-0.5">
                    Bookmarked services &amp; custom packages
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors shrink-0 ml-2" />
            </Link>

            {/* 3. Live Coupons & Offers */}
            <button
              type="button"
              onClick={() => setIsCouponsOpen(true)}
              className="w-full flex items-center justify-between p-3.5 hover:bg-[#161833] transition-colors group cursor-pointer text-left"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-full bg-[#2a1740] border border-purple-500/25 flex items-center justify-center text-amber-300 shrink-0 group-hover:scale-105 transition-transform">
                  <Tag className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white group-hover:text-amber-200 transition-colors">
                      Coupons & Discounts
                    </span>
                    {liveCoupons.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold">
                        {liveCoupons.length} Available
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 truncate mt-0.5">
                    Apply promo codes &amp; exclusive discount offers
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors shrink-0 ml-2" />
            </button>
          </div>
        </div>

        {/* =========================================
            SECTION 2: ACCOUNT & SECURITY
        ========================================= */}
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">
            Account & Security
          </h3>
          <div className="rounded-[22px] bg-[#0f1123]/95 border border-purple-500/15 divide-y divide-purple-500/10 overflow-hidden shadow-sm">
            {/* App Settings & Security */}
            <Link
              href="/settings"
              className="flex items-center justify-between p-3.5 hover:bg-[#161833] transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-full bg-[#2a1740] border border-purple-500/25 flex items-center justify-center text-sky-300 shrink-0 group-hover:scale-105 transition-transform">
                  <Settings className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white group-hover:text-sky-200 transition-colors">
                    App Settings & Security
                  </div>
                  <div className="text-xs text-gray-400 truncate mt-0.5">
                    Password update, cache &amp; legal info
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors shrink-0 ml-2" />
            </Link>
          </div>
        </div>

        {/* =========================================
            SECTION 3: SUPPORT & PRIVACY
        ========================================= */}
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">
            Support & Privacy
          </h3>
          <div className="rounded-[22px] bg-[#0f1123]/95 border border-purple-500/15 divide-y divide-purple-500/10 overflow-hidden shadow-sm">
            {/* 1. Notification Center */}
            <Link
              href="/notifications"
              className="flex items-center justify-between p-3.5 hover:bg-[#161833] transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-full bg-[#2a1740] border border-purple-500/25 flex items-center justify-center text-indigo-300 shrink-0 group-hover:scale-105 transition-transform">
                  <Bell className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white group-hover:text-indigo-200 transition-colors">
                    Notification Inbox
                  </div>
                  <div className="text-xs text-gray-400 truncate mt-0.5">
                    Project updates, milestones &amp; alerts
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors shrink-0 ml-2" />
            </Link>

            {/* 2. Customer Care & WhatsApp */}
            <Link
              href="/support"
              className="flex items-center justify-between p-3.5 hover:bg-[#161833] transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-full bg-[#2a1740] border border-purple-500/25 flex items-center justify-center text-teal-300 shrink-0 group-hover:scale-105 transition-transform">
                  <Headphones className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white group-hover:text-teal-200 transition-colors">
                    Dedicated Support
                  </div>
                  <div className="text-xs text-gray-400 truncate mt-0.5">
                    Direct WhatsApp &amp; priority team support
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors shrink-0 ml-2" />
            </Link>

            {/* 3. Help Center & FAQs */}
            <Link
              href="/help"
              className="flex items-center justify-between p-3.5 hover:bg-[#161833] transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-full bg-[#2a1740] border border-purple-500/25 flex items-center justify-center text-amber-300 shrink-0 group-hover:scale-105 transition-transform">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white group-hover:text-amber-200 transition-colors">
                    Help Center & FAQs
                  </div>
                  <div className="text-xs text-gray-400 truncate mt-0.5">
                    Guides, delivery process &amp; common FAQs
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors shrink-0 ml-2" />
            </Link>

            {/* 4. Privacy & Compliance */}
            <Link
              href="/privacy"
              className="flex items-center justify-between p-3.5 hover:bg-[#161833] transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-full bg-[#2a1740] border border-purple-500/25 flex items-center justify-center text-emerald-300 shrink-0 group-hover:scale-105 transition-transform">
                  <Shield className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white group-hover:text-emerald-200 transition-colors">
                    Privacy & Data Protection
                  </div>
                  <div className="text-xs text-gray-400 truncate mt-0.5">
                    Data security &amp; client confidentiality
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors shrink-0 ml-2" />
            </Link>

            {/* 5. Install App (PWA) */}
            {!isInstalled && (canInstallNative || isIos) && (
              <button
                type="button"
                onClick={triggerInstall}
                className="w-full flex items-center justify-between p-3.5 hover:bg-[#161833] transition-colors group cursor-pointer text-left"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#2a1740] border border-purple-500/25 flex items-center justify-center text-purple-300 shrink-0 group-hover:scale-105 transition-transform">
                    <Download className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white group-hover:text-purple-200 transition-colors">
                      Install Taliyo App
                    </div>
                    <div className="text-xs text-gray-400 truncate mt-0.5">
                      Add to home screen for faster app-like access
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors shrink-0 ml-2" />
              </button>
            )}
          </div>
        </div>

        {/* Log Out */}
        {isAuthenticated && (
        <div className="flex flex-col gap-2">
          <div className="rounded-[22px] bg-[#0f1123]/95 border border-purple-500/15 overflow-hidden shadow-sm">
            <button
              type="button"
              onClick={() => setIsLogoutOpen(true)}
              className="w-full flex items-center justify-between p-3.5 hover:bg-rose-500/[0.08] transition-colors group cursor-pointer text-left"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-full bg-[#4a122e] border border-rose-500/35 flex items-center justify-center text-rose-400 shrink-0 group-hover:scale-105 transition-transform">
                  <LogOut className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-rose-400 group-hover:text-rose-300 transition-colors">
                    Log Out
                  </div>
                  <div className="text-xs text-rose-300/60 truncate mt-0.5">
                    Sign out safely from this device
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-rose-500/50 group-hover:text-rose-400 transition-colors shrink-0 ml-2" />
            </button>
          </div>
        </div>
        )}
      </main>

      {/* ========================================================
          MODAL 1: EDIT PROFILE (Personal Info + Avatar Picker)
      ======================================================== */}
      {isEditProfileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-3xl bg-[#0f1124] border border-purple-500/30 p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto no-scrollbar">
            <div className="flex items-center justify-between border-b border-purple-500/15 pb-3">
              <div className="flex items-center gap-2.5">
                <User className="w-5 h-5 text-purple-400" />
                <h3 className="text-lg font-bold text-white">Personal Information</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditProfileOpen(false)}
                className="w-8 h-8 rounded-full bg-[#181a33] flex items-center justify-center text-gray-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Avatar Picker */}
            <div>
              <label className="text-xs font-semibold text-gray-300 mb-2 block">Choose Avatar</label>
              <div className="flex items-center gap-3 overflow-x-auto pb-2 no-scrollbar">
                {AVATAR_OPTIONS.map((avUrl, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedAvatar(avUrl)}
                    className={`relative w-12 h-12 rounded-xl overflow-hidden border-2 shrink-0 transition-all cursor-pointer ${
                      selectedAvatar === avUrl
                        ? 'border-fuchsia-400 ring-2 ring-fuchsia-500/50 scale-105'
                        : 'border-purple-500/20 hover:border-purple-500/50'
                    }`}
                  >
                    {BADGE_AVATAR_STYLES[avUrl] ? (
                      <div
                        className={`w-full h-full bg-gradient-to-br ${BADGE_AVATAR_STYLES[avUrl]} flex items-center justify-center text-base font-black text-white`}
                      >
                        {(editName || user.name || 'T').charAt(0).toUpperCase()}
                      </div>
                    ) : (
                      <Image src={avUrl} alt={`Avatar option ${i + 1}`} fill className="object-cover" sizes="48px" />
                    )}
                    {selectedAvatar === avUrl && (
                      <div className="absolute inset-0 bg-fuchsia-600/30 flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="flex flex-col gap-3.5 pt-1">
              <div>
                <label className="text-xs font-semibold text-gray-300 mb-1.5 block">Full Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-[#161833] border border-purple-500/20 text-white text-sm focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-300 mb-1.5 block">Email Address</label>
                <input
                  type="email"
                  value={editEmail}
                  disabled
                  className="w-full px-4 py-2.5 rounded-xl bg-[#111226] border border-purple-500/10 text-gray-400 text-sm cursor-not-allowed"
                />
                <span className="text-[10px] text-gray-400 mt-1 block">
                  Email is linked to your registered account.
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-300 mb-1.5 block">Contact Phone / WhatsApp</label>
                <input
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-[#161833] border border-purple-500/20 text-white text-sm focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-purple-500/15">
                <button
                  type="button"
                  onClick={() => setIsEditProfileOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#161833] text-gray-300 text-sm font-semibold hover:bg-[#1f2247] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white text-sm font-bold shadow-md shadow-fuchsia-600/30 hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 2: LIVE COUPONS & OFFERS (Real Supabase Coupons)
      ======================================================== */}
      {isCouponsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-3xl bg-[#0f1124] border border-purple-500/30 p-6 shadow-2xl flex flex-col gap-4 max-h-[85vh] overflow-y-auto no-scrollbar">
            <div className="flex items-center justify-between border-b border-purple-500/15 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <Tag className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-lg font-bold text-white">Coupons & Discounts</h3>
                  <p className="text-[11px] text-gray-400">Official promotional codes</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCouponsOpen(false)}
                className="w-8 h-8 rounded-full bg-[#181a33] flex items-center justify-center text-gray-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Coupons List */}
            <div className="flex flex-col gap-3">
              {liveCoupons.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <Tag className="w-10 h-10 text-gray-600 mx-auto" />
                  <p className="text-sm font-semibold text-gray-300">No active coupons available right now</p>
                  <p className="text-xs text-gray-400 max-w-xs mx-auto">
                    Check back soon! New promotional offers and seasonal vouchers will appear here.
                  </p>
                </div>
              ) : (
                liveCoupons.map((coupon) => (
                  <div
                    key={coupon.id}
                    className="p-4 rounded-2xl bg-[#141630]/90 border border-purple-500/25 flex flex-col gap-3 relative overflow-hidden"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                          {coupon.discount_type === 'percentage' ? (
                            <Percent className="w-5 h-5" />
                          ) : (
                            <IndianRupee className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <div className="text-base font-black text-white">
                            {coupon.discount_type === 'percentage'
                              ? `${coupon.discount_value}% OFF`
                              : `₹${Number(coupon.discount_value).toLocaleString('en-IN')} FLAT OFF`}
                          </div>
                          <div className="text-xs text-gray-300 mt-0.5">
                            {coupon.min_order_amount > 0
                              ? `On orders above ₹${Number(coupon.min_order_amount).toLocaleString('en-IN')}`
                              : 'No minimum order required'}
                          </div>
                        </div>
                      </div>

                      {/* Copy Code Button */}
                      <button
                        type="button"
                        onClick={() => handleCopyCode(coupon.code)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer ${
                          copiedCoupon === coupon.code
                            ? 'bg-emerald-500 text-white shadow-md'
                            : 'bg-purple-600/30 border border-purple-400/40 text-purple-200 hover:bg-purple-600 hover:text-white'
                        }`}
                      >
                        {copiedCoupon === coupon.code ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>COPIED</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>{coupon.code}</span>
                          </>
                        )}
                      </button>
                    </div>

                    {coupon.description && (
                      <p className="text-xs text-gray-400 leading-relaxed border-t border-purple-500/10 pt-2">
                        {coupon.description}
                      </p>
                    )}

                    {coupon.expiry_date && (
                      <div className="text-[10px] text-purple-300/70">
                        Valid till: {new Date(coupon.expiry_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 3: LOGOUT CONFIRMATION
      ======================================================== */}
      {isLogoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm rounded-3xl bg-[#0f1124] border border-rose-500/30 p-6 shadow-2xl flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <LogOut className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">Sign Out?</h3>
              <p className="text-xs text-gray-400 mt-1">
                Are you sure you want to log out from this device?
              </p>
            </div>

            <div className="flex items-center gap-3 w-full pt-2">
              <button
                type="button"
                onClick={() => setIsLogoutOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-[#181a33] text-gray-300 text-xs font-semibold hover:bg-[#202242] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsLogoutOpen(false);
                  try {
                    await supabase.auth.signOut();
                    localStorage.removeItem('taliyo_saved_addresses');
                    localStorage.removeItem('taliyo_saved_payments');
                    localStorage.removeItem('taliyo_cart');
                  } catch {}
                  showToast('You have been logged out.');
                  setTimeout(() => router.push('/login'), 800);
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-500 transition-colors shadow-lg shadow-rose-600/30 cursor-pointer"
              >
                Log Out
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
