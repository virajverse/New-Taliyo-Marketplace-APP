'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Bell,
  CheckCheck,
  Package,
  MessageSquare,
  Cpu,
  CheckCircle2,
  Tag,
  AlertCircle,
  Clock,
  Trash2,
} from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { supabase, getAuthHeaders } from '@/lib/supabaseClient';
import { invalidateClientCache, subscribeSmartFetch } from '@/lib/clientCache';

const DISMISSED_NOTIF_KEY = 'taliyo_dismissed_notifications';

type NotificationCategory = 'All' | 'Orders' | 'Messages' | 'Updates' | 'Offers';

interface NotificationItem {
  id: string;
  category: 'Orders' | 'Messages' | 'Updates' | 'Offers';
  title: string;
  description: string;
  time: string;
  isUnread: boolean;
  link?: string;
  iconType: 'order' | 'message' | 'ai' | 'milestone' | 'offer' | 'platform' | 'alert';
}

function formatTimeAgo(isoString?: string | null): string {
  if (!isoString) return 'Recent';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<NotificationCategory>('All');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const PAGE_SIZE = 8;
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeCategory]);

  // Load notifications with versioned SWR caching
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let disposed = false;

    interface ApiNotification {
      id: string;
      type?: string;
      related_type?: string;
      related_id?: string;
      title: string;
      message?: string;
      created_at: string;
      is_read?: boolean;
    }

    async function loadNotifications() {
      let uid: string | null = null;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) {
          uid = user.id;
          if (!disposed) setCurrentUserId(user.id);
        }
      } catch {}

      if (disposed) return;
      const qs = uid ? `?userId=${encodeURIComponent(uid)}` : '';
      unsub = subscribeSmartFetch<{ data?: ApiNotification[] }>(
        `/api/notifications${qs}`,
        'notifications',
        (json) => {
          const data = json?.data;
          let dismissedIds: string[] = [];
          try {
            const rawDismissed = localStorage.getItem(DISMISSED_NOTIF_KEY);
            const parsed = rawDismissed ? JSON.parse(rawDismissed) : [];
            if (Array.isArray(parsed)) dismissedIds = parsed;
          } catch {}

          if (data && data.length > 0) {
            const mapped: NotificationItem[] = data
              .filter((item) => !dismissedIds.includes(item.id))
              .map((item) => {
                let cat: NotificationItem['category'] = 'Updates';
                let icon: NotificationItem['iconType'] = 'platform';

                if (item.type === 'promotion') {
                  cat = 'Offers';
                  icon = 'offer';
                } else if (item.type === 'order' || item.related_type === 'booking') {
                  cat = 'Orders';
                  icon = 'order';
                } else if (item.type === 'message') {
                  cat = 'Messages';
                  icon = 'message';
                }

                return {
                  id: item.id,
                  category: cat,
                  title: item.title,
                  description: (item.message || '').replace(/<[^>]*>?/gm, ''),
                  time: formatTimeAgo(item.created_at),
                  isUnread: !item.is_read,
                  link: item.related_id ? `/orders/${item.related_id}` : undefined,
                  iconType: icon,
                };
              });

            setNotifications(mapped);
          } else {
            setNotifications([]);
          }
          setIsLoading(false);
        },
        {
          getHeaders: uid ? getAuthHeaders : undefined,
          onError: (err) => {
            console.error('Failed to fetch notifications:', err);
            setIsLoading(false);
          },
        },
      );
    }

    void loadNotifications();
    return () => {
      disposed = true;
      unsub?.();
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleMarkAllAsRead = async () => {
    try {
      setNotifications((prev) => prev.map((n) => ({ ...n, isUnread: false })));
      showToast('All notifications marked as read');
      const authHeaders = await getAuthHeaders();
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ mark_all: true, userId: currentUserId }),
      });
      invalidateClientCache('notifications');
    } catch {
      // quiet
    }
  };

  const handleClearAll = () => {
    try {
      const existing = JSON.parse(localStorage.getItem(DISMISSED_NOTIF_KEY) || '[]');
      const merged = Array.from(new Set([...(Array.isArray(existing) ? existing : []), ...notifications.map((n) => n.id)]));
      localStorage.setItem(DISMISSED_NOTIF_KEY, JSON.stringify(merged));
    } catch {}
    setNotifications([]);
    setShowClearConfirm(false);
    showToast('Inbox cleared on this device');
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    if (notif.isUnread) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, isUnread: false } : n))
      );
      try {
        const authHeaders = await getAuthHeaders();
        await fetch('/api/notifications', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ id: notif.id }),
        });
        invalidateClientCache('notifications');
      } catch {}
    }
    if (notif.link) {
      router.push(notif.link);
    }
  };

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => n.isUnread).length;
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    if (activeCategory === 'All') return notifications;
    return notifications.filter((n) => n.category === activeCategory);
  }, [notifications, activeCategory]);

  const categories: NotificationCategory[] = ['All', 'Orders', 'Messages', 'Updates', 'Offers'];

  const renderIcon = (type: NotificationItem['iconType']) => {
    switch (type) {
      case 'order':
        return (
          <div className="w-10 h-10 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-fuchsia-400">
            <Package className="w-5 h-5" />
          </div>
        );
      case 'message':
        return (
          <div className="w-10 h-10 rounded-2xl bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <MessageSquare className="w-5 h-5" />
          </div>
        );
      case 'offer':
        return (
          <div className="w-10 h-10 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Tag className="w-5 h-5" />
          </div>
        );
      case 'alert':
        return (
          <div className="w-10 h-10 rounded-2xl bg-amber-600/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <AlertCircle className="w-5 h-5" />
          </div>
        );
      case 'ai':
        return (
          <div className="w-10 h-10 rounded-2xl bg-pink-600/20 border border-pink-500/30 flex items-center justify-center text-pink-400">
            <Cpu className="w-5 h-5" />
          </div>
        );
      default:
        return (
          <div className="w-10 h-10 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
            <Bell className="w-5 h-5" />
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#07070d] text-white flex flex-col items-center">
      <div className="w-full max-w-xl min-h-screen flex flex-col bg-[#07070d] relative shadow-2xl pb-24">
        {/* Light Glassmorphic Toast Notification */}
        {toastMessage && (
          <div className="fixed top-16 inset-x-0 z-50 flex justify-center px-4 animate-in fade-in slide-in-from-top-3 duration-250 pointer-events-none">
            <div className="bg-[#0b0d1e]/80 backdrop-blur-xl border border-emerald-500/20 text-emerald-200 text-xs font-medium px-3.5 py-1.5 rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.5),0_0_10px_rgba(16,185,129,0.1)] flex items-center gap-2 pointer-events-auto transition-all">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="leading-tight">{toastMessage}</span>
            </div>
          </div>
        )}

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
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
                Notifications
              </h1>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-600 text-[10px] font-bold text-white shadow-sm shadow-fuchsia-600/40">
                  {unreadCount} New
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                title="Mark all as read"
                className="px-2.5 py-1.5 rounded-full bg-[#141029] border border-purple-500/20 text-purple-200 hover:text-white hover:border-purple-400 text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5 text-fuchsia-400" />
                <span className="hidden sm:inline">Mark read</span>
              </button>
            )}

            {notifications.length > 0 && (
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                title="Clear all"
                className="w-8 h-8 rounded-full bg-[#141029] border border-purple-500/20 text-gray-400 hover:text-rose-400 hover:border-rose-400/40 flex items-center justify-center transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </header>

        {/* Clear All Notifications Confirmation Modal */}
        {showClearConfirm && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-3xl bg-[#121326] border border-purple-500/30 p-5 space-y-4 shadow-2xl text-center">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-white">Clear All Notifications?</h3>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Are you sure you want to dismiss all {notifications.length} notification{notifications.length === 1 ? '' : 's'} from your inbox?
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  className="py-2.5 rounded-xl bg-[#1b1c36] border border-purple-500/20 text-xs font-bold text-gray-300 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white shadow-lg shadow-rose-950/50 cursor-pointer"
                >
                  Clear All
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Category Tabs */}
        <div className="px-4 pt-3 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                activeCategory === cat
                  ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-md shadow-purple-900/40'
                  : 'bg-[#121326] border border-purple-500/20 text-gray-400 hover:text-gray-200 hover:border-purple-400/40'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Notification Stream */}
        <main className="flex-1 px-4 pt-2 space-y-2.5">
          {isLoading ? (
            /* Notifications Skeleton Loader */
            <div className="space-y-2.5">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="p-3.5 rounded-2xl bg-[#0f1021]/80 border border-purple-500/15 animate-pulse flex items-start gap-3 shadow-md"
                >
                  <div className="w-9 h-9 rounded-xl bg-purple-900/30 border border-purple-500/20 shrink-0" />
                  <div className="flex-1 space-y-1.5 py-0.5">
                    <div className="h-3.5 bg-purple-800/40 rounded-md w-3/5" />
                    <div className="h-3 bg-purple-900/20 rounded-md w-full" />
                    <div className="h-2.5 bg-purple-900/15 rounded-md w-20 mt-1" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-3xl bg-purple-900/20 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-3 shadow-[0_0_30px_rgba(168,85,247,0.15)]">
                <Bell className="w-8 h-8" />
              </div>
              <h3 className="text-sm font-bold text-white">No notifications</h3>
              <p className="text-xs text-gray-400 mt-1 max-w-xs">
                You are all caught up! New updates, milestones, and order alerts will appear here.
              </p>
            </div>
          ) : (() => {
            const pagedNotifications = filteredNotifications.slice(0, visibleCount);
            const hasMore = filteredNotifications.length > visibleCount;

            return (
              <>
                {pagedNotifications.map((notif) => (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer flex items-start gap-3 relative ${
                      notif.isUnread
                        ? 'bg-[#150f2e]/90 border-purple-500/40 shadow-lg shadow-purple-950/30'
                        : 'bg-[#0f1021]/80 border-purple-500/15 hover:border-purple-500/30'
                    }`}
                  >
                    {/* Left Icon */}
                    <div className="shrink-0">{renderIcon(notif.iconType)}</div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center justify-between gap-1">
                        <h3
                          className={`text-xs sm:text-sm font-bold truncate ${
                            notif.isUnread ? 'text-white' : 'text-gray-300'
                          }`}
                        >
                          {notif.title}
                        </h3>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-gray-400 font-medium flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            <span>{notif.time}</span>
                          </span>
                          {notif.isUnread && (
                            <span className="w-2 h-2 rounded-full bg-fuchsia-400 ring-2 ring-purple-950 shrink-0" />
                          )}
                        </div>
                      </div>

                      <p className="text-[11px] text-gray-300 mt-1 leading-relaxed line-clamp-2">
                        {notif.description}
                      </p>
                    </div>
                  </div>
                ))}

                {hasMore ? (
                  <div className="pt-4 pb-2 flex flex-col items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                      className="px-5 py-2.5 rounded-full bg-[#181a33] hover:bg-[#202242] border border-purple-500/30 hover:border-purple-400 text-white text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-2"
                    >
                      <span>Load More Notifications</span>
                      <span className="text-[10px] text-fuchsia-400 bg-fuchsia-950/60 px-2 py-0.5 rounded-full">
                        +{Math.min(PAGE_SIZE, filteredNotifications.length - visibleCount)}
                      </span>
                    </button>
                    <span className="text-[10px] text-gray-500 font-medium">
                      Showing {Math.min(visibleCount, filteredNotifications.length)} of {filteredNotifications.length} notifications
                    </span>
                  </div>
                ) : filteredNotifications.length > PAGE_SIZE ? (
                  <div className="pt-4 pb-2 text-center text-[11px] text-gray-500 font-medium">
                    All {filteredNotifications.length} notifications loaded
                  </div>
                ) : null}
              </>
            );
          })()}
        </main>

        {/* Floating Bottom Navigation */}
        <BottomNav />
      </div>
    </div>
  );
}
