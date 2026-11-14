'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Plus,
  MessageCircle,
  Calendar,
  Clock,
  CheckCircle2,
  X,
  Star,
  Activity,
  Package,
} from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { supabase } from '@/lib/supabaseClient';
import { subscribeSmartFetch } from '@/lib/clientCache';

type OrderStatus = 'all' | 'active' | 'completed' | 'pending' | 'cancelled';

interface OrderItem {
  id: string;
  orderNumber: string;
  title: string;
  provider: string;
  status: 'active' | 'completed' | 'pending' | 'cancelled';
  statusLabel: string;
  planName: string;
  description: string;
  bookedDate: string;
  deliveryDate: string;
  deliveryLabel: string;
  imageSrc: string;
  progressPercent: number;
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authUser, setAuthUser] = useState<{ id: string; email?: string } | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [supportWhatsApp, setSupportWhatsApp] = useState('917042523611');
  const [activeTab, setActiveTab] = useState<OrderStatus>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Load real WhatsApp number from Admin Site Settings (SWR cached)
  useEffect(() => {
    return subscribeSmartFetch<{ settings?: Record<string, string> }>(
      '/api/site-settings',
      'settings',
      (json) => {
        const num = json?.settings?.support_whatsapp;
        if (typeof num === 'string' && num.trim()) {
          setSupportWhatsApp(num.replace(/\D/g, '') || '917042523611');
        }
      },
    );
  }, []);

  // Fetch authenticated user's real bookings from Database API
  useEffect(() => {
    async function fetchBookings() {
      setIsLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setIsAuthenticated(false);
          setAuthUser(null);
          setOrders([]);
          return;
        }

        setIsAuthenticated(true);
        setAuthUser({ id: user.id, email: user.email });
        const params = new URLSearchParams({ userId: user.id });
        if (user.email) params.set('email', user.email);
        const res = await fetch(`/api/bookings?${params.toString()}`, { cache: 'no-store' });
        const json = await res.json();
        const data = json.data;

        if (data && data.length > 0) {
          interface ApiBooking {
            id: string;
            status?: string;
            created_at?: string;
            service_price?: string | number;
            service_title?: string;
            provider_name?: string;
            requirements?: string;
          }
          const mapped: OrderItem[] = (data as ApiBooking[]).map((b, idx: number) => {
            let st: OrderItem['status'] = 'pending';
            let stLabel = 'Pending';
            let pct = 20;

            if (b.status === 'confirmed' || b.status === 'work_started' || b.status === 'in_progress') {
              st = 'active';
              stLabel = 'Active';
              pct = 65;
            } else if (b.status === 'delivered' || b.status === 'completed') {
              st = 'completed';
              stLabel = 'Completed';
              pct = 100;
            } else if (b.status === 'cancelled') {
              st = 'cancelled';
              stLabel = 'Cancelled';
              pct = 0;
            }

            const createdDate = b.created_at
              ? new Date(b.created_at).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })
              : 'Recent';

            const cleanPrice = b.service_price
              ? b.service_price.toString().startsWith('₹')
                ? String(b.service_price)
                : `₹${b.service_price}`
              : 'Verified Custom Plan';

            return {
              id: b.id,
              orderNumber: `#TLY${b.id.slice(0, 6).toUpperCase()}`,
              title: b.service_title || 'Service Order',
              provider: b.provider_name || 'Taliyo Technologies',
              status: st,
              statusLabel: stLabel,
              planName: cleanPrice,
              description:
                b.requirements ||
                'Custom project delivery with source code ownership.',
              bookedDate: createdDate,
              deliveryDate: 'Scheduled',
              deliveryLabel: st === 'completed' ? 'Delivered on' : 'Scheduled',
              imageSrc:
                idx % 3 === 0
                  ? '/assets/order_thumb_1.png'
                  : idx % 3 === 1
                  ? '/assets/order_thumb_2.png'
                  : '/assets/order_thumb_3.png',
              progressPercent: pct,
            };
          });
          setOrders(mapped);
        } else {
          setOrders([]);
        }
      } catch (err) {
        console.error('Error fetching real bookings:', err);
        setOrders([]);
      } finally {
        setIsLoading(false);
      }
    }

    fetchBookings();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const handleCancelOrder = async (order: OrderItem) => {
    if (!authUser) {
      showToast('Please sign in again to cancel this order.');
      return;
    }
    setCancellingId(order.id);
    try {
      const res = await fetch('/api/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: order.id,
          action: 'cancel',
          userId: authUser.id,
          email: authUser.email,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json?.error || 'Could not cancel order.');
        return;
      }
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? { ...o, status: 'cancelled', statusLabel: 'Cancelled', progressPercent: 0 }
            : o,
        ),
      );
      showToast(`Order ${order.orderNumber} cancelled.`);
    } catch {
      showToast('Network error while cancelling order.');
    } finally {
      setCancellingId(null);
    }
  };

  const filteredOrders = orders.filter((order) => {
    if (activeTab === 'all') return true;
    return order.status === activeTab;
  });

  const activeCount = orders.filter((o) => o.status === 'active').length;
  const completedCount = orders.filter((o) => o.status === 'completed').length;
  const pendingCount = orders.filter((o) => o.status === 'pending').length;
  const cancelledCount = orders.filter((o) => o.status === 'cancelled').length;

  return (
    <div className="min-h-screen bg-[#07070d] text-white flex flex-col items-center">
      <div className="w-full max-w-md min-h-screen flex flex-col bg-[#07070d] relative shadow-2xl">
        {/* Sticky Top Header */}
        <header className="sticky top-0 z-40 w-full bg-[#07070d]/90 backdrop-blur-xl border-b border-purple-500/10 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
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
                My Orders
              </h1>
              <p className="text-[10px] text-purple-200/60 font-medium leading-tight mt-0.5">
                Track, manage and view all your orders
              </p>
            </div>
          </div>

          {/* Top Right: + Custom Order */}
          <Link
            href="/advisor"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white text-[11px] font-bold shadow-md shadow-purple-900/40 hover:opacity-95 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Custom Order</span>
          </Link>
        </header>

        {/* Filter Tabs Strip */}
        <div className="px-4 pt-3 pb-1 border-b border-purple-500/10">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-[0_0_15px_rgba(217,70,239,0.4)]'
                  : 'bg-[#121326] text-gray-400 hover:text-gray-200 border border-purple-500/15'
              }`}
            >
              All Orders ({isLoading ? '…' : orders.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('active')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'active'
                  ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-[0_0_15px_rgba(217,70,239,0.4)]'
                  : 'bg-[#121326] text-gray-400 hover:text-gray-200 border border-purple-500/15'
              }`}
            >
              Active ({isLoading ? '…' : activeCount})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('pending')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'pending'
                  ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-[0_0_15px_rgba(217,70,239,0.4)]'
                  : 'bg-[#121326] text-gray-400 hover:text-gray-200 border border-purple-500/15'
              }`}
            >
              Pending ({isLoading ? '…' : pendingCount})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('completed')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'completed'
                  ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-[0_0_15px_rgba(217,70,239,0.4)]'
                  : 'bg-[#121326] text-gray-400 hover:text-gray-200 border border-purple-500/15'
              }`}
            >
              Completed ({isLoading ? '…' : completedCount})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('cancelled')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'cancelled'
                  ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-[0_0_15px_rgba(217,70,239,0.4)]'
                  : 'bg-[#121326] text-gray-400 hover:text-gray-200 border border-purple-500/15'
              }`}
            >
              Cancelled ({isLoading ? '…' : cancelledCount})
            </button>
          </div>
        </div>

        {/* Light Glassmorphic Toast Alert */}
        {toastMessage && (
          <div className="fixed top-16 inset-x-0 z-50 flex justify-center px-4 animate-in fade-in slide-in-from-top-3 duration-250 pointer-events-none">
            <div className="bg-[#0b0d1e]/80 backdrop-blur-xl border border-emerald-500/20 text-emerald-200 text-xs font-medium px-3.5 py-1.5 rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.5),0_0_10px_rgba(16,185,129,0.1)] flex items-center gap-2 pointer-events-auto transition-all">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="leading-tight">{toastMessage}</span>
            </div>
          </div>
        )}

        {/* Orders List Container */}
        <main className="flex-1 px-4 py-3 space-y-3.5 pb-28">
          {isLoading ? (
            /* Orders Skeleton Loader */
            <div className="space-y-3.5">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="rounded-[24px] bg-gradient-to-r from-[#121226]/80 via-[#161630]/80 to-[#1c183b]/80 border border-purple-500/20 p-4 space-y-3 animate-pulse overflow-hidden shadow-xl"
                >
                  {/* Top: Thumbnail + Header lines + Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-14 h-14 rounded-2xl bg-purple-900/30 border border-purple-500/20 shrink-0" />
                      <div className="flex-1 space-y-2 pt-1">
                        <div className="h-4 bg-purple-800/40 rounded-md w-3/4" />
                        <div className="h-2.5 bg-purple-900/30 rounded-md w-1/2" />
                        <div className="h-2.5 bg-purple-900/20 rounded-md w-1/3" />
                      </div>
                    </div>
                    <div className="w-16 h-6 rounded-full bg-purple-900/40 border border-purple-500/20 shrink-0" />
                  </div>

                  {/* Description lines */}
                  <div className="space-y-1.5 pt-1">
                    <div className="h-4 bg-purple-900/35 rounded-full w-24" />
                    <div className="h-3 bg-purple-900/20 rounded-md w-full" />
                    <div className="h-3 bg-purple-900/15 rounded-md w-4/5" />
                  </div>

                  {/* Progress bar skeleton */}
                  <div className="space-y-1.5 pt-2 border-t border-purple-500/10">
                    <div className="flex justify-between">
                      <div className="h-2.5 bg-purple-900/30 rounded-md w-24" />
                      <div className="h-2.5 bg-purple-900/30 rounded-md w-10" />
                    </div>
                    <div className="h-2 bg-purple-900/25 rounded-full w-full" />
                  </div>

                  {/* Action buttons skeleton */}
                  <div className="flex items-center gap-2 pt-1">
                    <div className="h-9 flex-1 bg-purple-900/30 rounded-xl" />
                    <div className="h-9 w-24 bg-purple-900/20 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="py-16 px-4 text-center flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-3xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-3 shadow-inner">
                <Package className="w-8 h-8" />
              </div>
              <h3 className="text-sm font-bold text-white mb-1">
                {!isAuthenticated
                  ? 'Sign in to view your orders'
                  : activeTab === 'all'
                  ? 'No orders found'
                  : `No ${activeTab} orders`}
              </h3>
              <p className="text-xs text-purple-200/60 max-w-xs mb-4">
                {!isAuthenticated
                  ? 'Log in with your client account to track bookings, payment status, and live milestones.'
                  : activeTab === 'all'
                  ? 'Ready to build your next website, app or system? Browse verified turn-key products now.'
                  : `There are currently no orders under the "${activeTab}" filter tab.`}
              </p>
              {!isAuthenticated ? (
                <Link
                  href="/login"
                  className="px-4 py-2 rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white text-xs font-bold shadow-lg hover:opacity-95 transition-all"
                >
                  Sign In
                </Link>
              ) : activeTab === 'all' && (
                <Link
                  href="/"
                  className="px-4 py-2 rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white text-xs font-bold shadow-lg hover:opacity-95 transition-all"
                >
                  Explore Services
                </Link>
              )}
            </div>
          ) : (
            filteredOrders.map((order) => {
              const isActive = order.status === 'active';
              const isCompleted = order.status === 'completed';
              const isPending = order.status === 'pending';
              const isCancelled = order.status === 'cancelled';

              return (
                <div
                  key={order.id}
                  className="rounded-[24px] bg-gradient-to-r from-[#121226]/95 via-[#161630]/95 to-[#1c183b]/95 border border-purple-500/20 shadow-xl p-4 space-y-3 hover:border-purple-400/40 transition-all overflow-hidden"
                >
                  {/* Top Row: Thumbnail + Title & Status Badge */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-3 min-w-0">
                      {/* 3D Order Thumbnail */}
                      <div className="w-14 h-14 rounded-2xl bg-[#1b1035] border border-purple-500/30 p-1 flex-shrink-0 flex items-center justify-center overflow-hidden">
                        <Image
                          src={order.imageSrc}
                          alt={order.title}
                          width={56}
                          height={56}
                          className="w-full h-full object-contain"
                        />
                      </div>

                      <div className="min-w-0">
                        <h2 className="text-xs sm:text-sm font-extrabold text-white leading-snug line-clamp-1">
                          {order.title}
                        </h2>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                          <span className="font-mono text-purple-300 font-semibold">
                            Order ID: {order.orderNumber}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-400 block mt-0.5">
                          Provider: {order.provider}
                        </span>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="flex-shrink-0">
                      {isActive && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-950/70 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold shadow-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                          <span>Active</span>
                        </span>
                      )}
                      {isCompleted && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold shadow-sm">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Completed</span>
                        </span>
                      )}
                      {isPending && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950/70 border border-amber-500/40 text-amber-300 text-[10px] font-bold shadow-sm">
                          <Clock className="w-3 h-3 text-amber-400" />
                          <span>Pending</span>
                        </span>
                      )}
                      {isCancelled && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-950/70 border border-rose-500/40 text-rose-300 text-[10px] font-bold shadow-sm">
                          <X className="w-3 h-3 text-rose-400" />
                          <span>Cancelled</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Plan Badge & Description */}
                  <div className="pt-0.5">
                    <span className="inline-block px-2 py-0.5 rounded-full bg-purple-900/50 border border-purple-400/30 text-[10px] font-bold text-purple-200 mb-1">
                      {order.planName}
                    </span>
                    <p className="text-[11px] text-purple-200/70 leading-relaxed line-clamp-2">
                      {order.description}
                    </p>
                  </div>

                  {/* Dates Strip */}
                  <div className="p-2.5 rounded-xl bg-[#0c0d1c] border border-purple-500/15 flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5 text-gray-400">
                      <Calendar className="w-3.5 h-3.5 text-fuchsia-400" />
                      <div>
                        <span className="text-gray-400 block leading-tight">Booked on</span>
                        <span className="font-bold text-white leading-tight">
                          {order.bookedDate}
                        </span>
                      </div>
                    </div>

                    <div className="w-[1px] h-6 bg-purple-500/20" />

                    <div className="flex items-center gap-1.5 text-gray-400 text-right">
                      <div>
                        <span className="text-gray-400 block leading-tight">
                          {order.deliveryLabel}
                        </span>
                        <span className="font-bold text-white leading-tight">
                          {order.deliveryDate}
                        </span>
                      </div>
                      <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    </div>
                  </div>

                  {/* Action Buttons Row */}
                  <div className="pt-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {/* WhatsApp Help */}
                      <a
                        href={`https://wa.me/${supportWhatsApp}?text=${encodeURIComponent(`Hello Taliyo Support, I have an inquiry regarding Order ${order.orderNumber}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#1b1c36] border border-purple-500/30 text-purple-200 hover:text-white text-[11px] font-bold transition-all"
                      >
                        <MessageCircle className="w-3 h-3 text-emerald-400" />
                        <span>WhatsApp Help</span>
                      </a>

                      {/* Cancel option for active/pending */}
                      {!isCompleted && !isCancelled && (
                        <button
                          type="button"
                          disabled={cancellingId === order.id}
                          onClick={() => handleCancelOrder(order)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-gray-400 hover:text-rose-400 disabled:opacity-50 text-[11px] font-medium transition-colors cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                          <span>{cancellingId === order.id ? 'Cancelling…' : 'Cancel'}</span>
                        </button>
                      )}
                    </div>

                    {/* Primary Action Button */}
                    <div>
                      {isCompleted ? (
                        <Link
                          href="/reviews"
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-[11px] font-bold shadow-md shadow-emerald-950/50 hover:opacity-95 active:scale-95 transition-all"
                        >
                          <Star className="w-3 h-3" />
                          <span>Rate Service</span>
                        </Link>
                      ) : (
                        <Link
                          href={`/orders/${order.id}`}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-500 text-white text-[11px] font-bold shadow-md shadow-purple-900/50 hover:opacity-95 active:scale-95 transition-all cursor-pointer"
                        >
                          <Activity className="w-3 h-3" />
                          <span>Track Status</span>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </main>

        {/* Floating Bottom Navigation */}
        <BottomNav />
      </div>
    </div>
  );
}
