'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  Clock,
  CheckCircle2,
  Hourglass,
  Circle,
  MessageCircle,
  MessageSquare,
} from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { subscribeSmartFetch } from '@/lib/clientCache';

interface Milestone {
  id: number;
  title: string;
  description: string;
  status: 'completed' | 'in-progress' | 'pending';
  dateLabel?: string;
}

interface BookingInfo {
  id: string;
  orderNumber: string;
  title: string;
  planName: string;
  provider: string;
  startedDate: string;
  targetDate: string;
  status: string;
}

export default function OrderMilestoneTrackerPage() {
  const router = useRouter();
  const params = useParams();
  const rawId = (params?.id as string) || '';

  const [isLoading, setIsLoading] = useState(true);
  const [isNotFound, setIsNotFound] = useState(false);
  const [bookingInfo, setBookingInfo] = useState<BookingInfo>({
    id: rawId,
    orderNumber: rawId ? `#TLY${rawId.slice(0, 6).toUpperCase()}` : '#TLY',
    title: 'Service Order',
    planName: 'Custom Plan',
    provider: 'Taliyo Technologies',
    startedDate: '—',
    targetDate: 'Standard Timeline',
    status: 'pending',
  });

  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [supportWhatsApp, setSupportWhatsApp] = useState('917042523611');

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

  useEffect(() => {
    async function loadRealOrder() {
      setIsLoading(true);
      try {
        if (!rawId) return;

        // Fetch booking from API (backed by supabaseAdmin to bypass anon RLS)
        const res = await fetch(`/api/bookings?id=${encodeURIComponent(rawId)}`);
        const json = await res.json();
        const booking = json.data && json.data.length > 0 ? json.data[0] : null;

        if (booking) {
          const started = booking.created_at
            ? new Date(booking.created_at).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })
            : 'Recent';

          const cleanPrice = booking.service_price
            ? booking.service_price.toString().startsWith('₹')
              ? booking.service_price
              : `₹${booking.service_price}`
            : 'Verified Custom Plan';

          setBookingInfo({
            id: booking.id,
            orderNumber: `#TLY${booking.id.slice(0, 6).toUpperCase()}`,
            title: booking.service_title || 'Service Order',
            planName: cleanPrice,
            provider: booking.provider_name || 'Taliyo Technologies',
            startedDate: started,
            targetDate: '10–14 Days',
            status: booking.status || 'pending',
          });

          // Fetch progress steps from Redis-cached catalog API
          const stepsRes = await fetch('/api/catalog?mode=milestones');
          const stepsJson = stepsRes.ok ? await stepsRes.json() : { data: [] };
          const steps = (Array.isArray(stepsJson.data) ? stepsJson.data : []) as Array<{
            label?: string;
            step_key?: string;
          }>;

          if (steps && steps.length > 0) {
            const rawStatus = String(booking.status || 'pending').toLowerCase();
            const mappedSteps: Milestone[] = steps.map((s, idx) => {
              let st: Milestone['status'] = 'pending';
              let dateLabel = 'Upcoming';

              if (rawStatus === 'delivered' || rawStatus === 'completed') {
                st = 'completed';
                dateLabel = 'Completed';
              } else if (rawStatus === 'cancelled') {
                st = 'pending';
                dateLabel = 'Cancelled';
              } else if (rawStatus === 'work_started' || rawStatus === 'in_progress') {
                if (idx < 3) {
                  st = 'completed';
                  dateLabel = 'Completed';
                } else if (idx === 3) {
                  st = 'in-progress';
                  dateLabel = 'Current Sprint';
                }
              } else if (rawStatus === 'confirmed') {
                if (idx === 0) {
                  st = 'completed';
                  dateLabel = 'Completed';
                } else if (idx === 1) {
                  st = 'in-progress';
                  dateLabel = 'Current Sprint';
                }
              } else {
                // Pending review / payment verification
                if (idx === 0) {
                  st = 'in-progress';
                  dateLabel = 'Awaiting Verification';
                }
              }

              return {
                id: idx + 1,
                title: s.label || (s.step_key || 'milestone').replace('_', ' ').toUpperCase(),
                description: `Verified milestone stage: ${s.label}`,
                status: st,
                dateLabel,
              };
            });
            setMilestones(mappedSteps);
          }
        } else {
          setIsNotFound(true);
        }
      } catch (err) {
        console.error('Failed to load real booking:', err);
        setIsNotFound(true);
      } finally {
        setIsLoading(false);
      }
    }

    loadRealOrder();
  }, [rawId]);

  const completedCount = milestones.filter((m) => m.status === 'completed').length;
  const progressPercentage = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;

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
                Order Milestone Tracker
              </h1>
              <p className="text-[10px] text-purple-200/60 font-medium leading-tight mt-0.5">
                Track real-time progress of your project
              </p>
            </div>
          </div>

          {/* Right Status Pill */}
          {(() => {
            const s = (bookingInfo.status || 'pending').toLowerCase();
            if (s === 'delivered' || s === 'completed') {
              return (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Delivered</span>
                </div>
              );
            }
            if (s === 'cancelled') {
              return (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-950/70 border border-rose-500/40 text-rose-300 text-[10px] font-bold shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  <span>Cancelled</span>
                </div>
              );
            }
            if (s === 'pending') {
              return (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950/70 border border-amber-500/40 text-amber-300 text-[10px] font-bold shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span>Pending Review</span>
                </div>
              );
            }
            return (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-950/70 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span>{s === 'confirmed' ? 'Confirmed' : 'In Progress'}</span>
              </div>
            );
          })()}
        </header>

        {/* Main Content Area */}
        <main className="flex-1 px-4 pt-3 space-y-4 pb-28">
          {isLoading ? (
            /* Milestone Skeleton Loader */
            <div className="space-y-4 animate-pulse">
              {/* Hero skeleton */}
              <div className="rounded-[24px] bg-[#1c0d3a]/60 border border-purple-500/20 p-4 space-y-3 shadow-xl">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-purple-800/40 rounded-full w-28" />
                    <div className="h-5 bg-purple-700/30 rounded-md w-3/4" />
                    <div className="h-3 bg-purple-900/30 rounded-md w-1/2" />
                  </div>
                  <div className="w-20 h-20 rounded-2xl bg-purple-900/30 shrink-0" />
                </div>
                <div className="h-10 bg-purple-950/50 rounded-xl w-full" />
              </div>

              {/* Progress skeleton */}
              <div className="rounded-[22px] bg-[#121326]/80 border border-purple-500/15 p-4 space-y-2.5">
                <div className="flex justify-between">
                  <div className="h-3 bg-purple-900/30 rounded-md w-32" />
                  <div className="h-4 bg-purple-900/40 rounded-md w-12" />
                </div>
                <div className="h-2 bg-purple-900/25 rounded-full w-full" />
              </div>

              {/* Milestones list skeleton */}
              <div className="space-y-3 pt-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex gap-3 items-center">
                    <div className="w-5 h-5 rounded-full bg-purple-900/40 shrink-0" />
                    <div className="flex-1 h-12 rounded-2xl bg-[#121326]/60 border border-purple-500/10" />
                  </div>
                ))}
              </div>
            </div>
          ) : isNotFound ? (
            <div className="py-16 text-center space-y-3">
              <p className="text-sm font-bold text-white">Order not found</p>
              <p className="text-xs text-gray-400">
                This booking ID could not be loaded from the database.
              </p>
              <Link
                href="/orders"
                className="inline-block px-4 py-2 rounded-full bg-purple-600 text-white text-xs font-bold"
              >
                Back to Orders
              </Link>
            </div>
          ) : (
            <>
              {/* Project Summary Hero Card */}
              <div className="relative rounded-[24px] bg-gradient-to-r from-[#1c0d3a] via-[#140a28] to-[#2c0e4c] border border-purple-500/25 p-4 shadow-xl overflow-hidden">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0 pr-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-900/60 border border-purple-400/30 text-purple-200 text-[10px] font-bold mb-1.5">
                  <span>Order ID: {bookingInfo.orderNumber}</span>
                </div>

                <h2 className="text-sm sm:text-base font-extrabold text-white tracking-tight leading-snug">
                  {bookingInfo.title}
                </h2>

                <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-300">
                  <span className="text-purple-300 font-semibold">{bookingInfo.planName}</span>
                  <span className="text-gray-600">•</span>
                  <span className="text-gray-400 text-[10px]">{bookingInfo.provider}</span>
                </div>
              </div>

              {/* Right 3D Laptop Art */}
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 flex items-center justify-center">
                <Image
                  src="/assets/tracker_hero_laptop.png"
                  alt="Project Thumbnail"
                  width={96}
                  height={96}
                  className="w-full h-full object-contain drop-shadow-[0_0_20px_rgba(217,70,239,0.4)]"
                />
              </div>
            </div>

            {/* Timeline & Days Left Pill Strip */}
            <div className="mt-3.5 pt-3 border-t border-purple-500/15 flex items-center justify-between text-[10px] gap-2">
              <div className="flex items-center gap-1.5 text-gray-400">
                <Calendar className="w-3.5 h-3.5 text-fuchsia-400" />
                <div>
                  <span className="text-gray-400 block leading-tight">Started</span>
                  <span className="font-bold text-white leading-tight">{bookingInfo.startedDate}</span>
                </div>
              </div>

              <div className="w-[1px] h-6 bg-purple-500/20" />

              <div className="flex items-center gap-1.5 text-gray-400">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <div>
                  <span className="text-gray-400 block leading-tight">Timeline</span>
                  <span className="font-bold text-white leading-tight">{bookingInfo.targetDate}</span>
                </div>
              </div>

              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-950/70 border border-amber-500/40 text-amber-300 font-extrabold text-[10px] uppercase">
                <Hourglass className="w-3 h-3 text-amber-400" />
                <span>{bookingInfo.status.replace('_', ' ')}</span>
              </div>
            </div>
          </div>

          {/* Overall Progress Card */}
          <div className="rounded-[22px] bg-[#121326]/95 border border-purple-500/20 p-4 shadow-lg space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white block">
                  Overall Progress
                </span>
                <span className="text-[10px] text-purple-200/60 block mt-0.5">
                  {completedCount} of {milestones.length} Milestones Completed
                </span>
              </div>

              <span className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-300 via-pink-300 to-white">
                {progressPercentage}%
              </span>
            </div>

            {/* Glowing Gradient Progress Bar */}
            <div className="w-full h-2 rounded-full bg-[#1b1035] overflow-hidden p-0.5">
              <div
                className="h-full bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500 rounded-full shadow-[0_0_15px_rgba(217,70,239,0.5)] transition-all duration-700"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>

          {/* Vertical Milestones Timeline */}
          <div className="space-y-3 pt-1">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">
              Project Milestones
            </h3>

            <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-[2px] before:bg-gradient-to-b before:from-purple-500 before:via-fuchsia-500 before:to-gray-800">
              {milestones.map((milestone) => (
                <div key={milestone.id} className="relative group">
                  {/* Status Node Icon Indicator */}
                  <div className="absolute -left-6 top-1">
                    {milestone.status === 'completed' && (
                      <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white ring-4 ring-[#07070d] shadow-sm shadow-emerald-500/50">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                    )}

                    {milestone.status === 'in-progress' && (
                      <div className="w-5 h-5 rounded-full bg-fuchsia-500 flex items-center justify-center text-white ring-4 ring-[#07070d] shadow-[0_0_12px_rgba(217,70,239,0.7)] animate-pulse">
                        <span className="w-2 h-2 rounded-full bg-white" />
                      </div>
                    )}

                    {milestone.status === 'pending' && (
                      <div className="w-5 h-5 rounded-full bg-[#1c1d38] border border-gray-600 flex items-center justify-center text-gray-400 ring-4 ring-[#07070d]">
                        <Circle className="w-2.5 h-2.5" />
                      </div>
                    )}
                  </div>

                  {/* Milestone Card Content */}
                  <div
                    className={`rounded-2xl p-3.5 border transition-all duration-200 ${
                      milestone.status === 'in-progress'
                        ? 'bg-[#181135]/95 border-fuchsia-500/40 shadow-lg shadow-purple-950/40'
                        : milestone.status === 'completed'
                        ? 'bg-[#121326]/90 border-purple-500/20'
                        : 'bg-[#0f1021]/60 border-purple-500/10 opacity-75'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-purple-300">
                            Stage {milestone.id}
                          </span>
                          {milestone.status === 'in-progress' && (
                            <span className="px-2 py-0.2 rounded-full bg-fuchsia-950/80 border border-fuchsia-500/40 text-fuchsia-300 text-[9px] font-extrabold animate-pulse">
                              Active
                            </span>
                          )}
                        </div>

                        <h4 className="text-xs sm:text-sm font-extrabold text-white mt-0.5">
                          {milestone.title}
                        </h4>
                      </div>

                      {milestone.dateLabel && (
                        <span className="text-[10px] text-gray-400 font-mono shrink-0">
                          {milestone.dateLabel}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-gray-300 mt-1 leading-relaxed">
                      {milestone.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions Strip */}
          <div className="pt-2 grid grid-cols-2 gap-2.5">
            <Link
              href="/support"
              className="py-3 px-3 rounded-2xl bg-[#14102c] border border-purple-500/25 hover:border-purple-400 text-purple-200 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95"
            >
              <MessageSquare className="w-4 h-4 text-fuchsia-400" />
              <span>Support Chat</span>
            </Link>

            <a
              href={`https://wa.me/${supportWhatsApp}?text=${encodeURIComponent(`Hello Taliyo Support, I need an update on Order ${bookingInfo.orderNumber}.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="py-3 px-3 rounded-2xl bg-[#0e1f18] border border-emerald-500/30 hover:border-emerald-400 text-emerald-300 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95"
            >
              <MessageCircle className="w-4 h-4 text-emerald-400" />
              <span>Direct WhatsApp</span>
            </a>
          </div>
        </>
      )}
    </main>

        {/* Floating Bottom Navigation */}
        <BottomNav />
      </div>
    </div>
  );
}
