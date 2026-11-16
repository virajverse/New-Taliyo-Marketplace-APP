'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Star,
  ShieldCheck,
  ChevronDown,
  Plus,
  CheckCircle2,
  X,
  Loader2,
} from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { supabase, getAuthHeaders } from '@/lib/supabaseClient';
import { invalidateClientCache, subscribeSmartFetch } from '@/lib/clientCache';

interface ReviewItem {
  id: string;
  userName: string;
  userAvatarInitial: string;
  userAvatarColor: string;
  isVerified: boolean;
  isFeatured: boolean;
  rating: number;
  timeAgo: string;
  title: string;
  content: string;
  projectTag: string;
}

type CategoryFilter = 'All' | 'Featured' | '5Stars' | '4Plus';
type SortOption = 'recent' | 'highest';

export default function ReviewsPage() {
  const router = useRouter();

  // Reviews State
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('All');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Write Review Modal State
  const [isWriteModalOpen, setIsWriteModalOpen] = useState(false);
  const [newRating, setNewRating] = useState(5);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newAuthorName, setNewAuthorName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Fetch real reviews with versioned SWR caching
  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        if (user?.user_metadata?.full_name) {
          setNewAuthorName(user.user_metadata.full_name);
        } else if (user?.email) {
          setNewAuthorName(user.email.split('@')[0]);
        }
      })
      .catch(() => {});

    interface ApiReview {
      id: string;
      customer_name?: string;
      review_text?: string;
      created_at?: string;
      rating?: number;
      is_featured?: boolean;
    }

    const avatarGradients = [
      'from-purple-500 to-indigo-600',
      'from-pink-500 to-rose-600',
      'from-cyan-500 to-blue-600',
      'from-amber-500 to-orange-600',
      'from-emerald-500 to-teal-600',
    ];

    return subscribeSmartFetch<{ data?: ApiReview[] }>(
      '/api/reviews',
      'reviews',
      (json) => {
        const data = json?.data;
        if (data && data.length > 0) {
          const formatted: ReviewItem[] = data.map((item, idx: number) => {
            const name = item.customer_name || 'Verified Client';
            const initial = name[0]?.toUpperCase() || 'V';
            const fullText = item.review_text || '';
            const colonIdx = fullText.indexOf(':');
            const parsedTitle = colonIdx !== -1 && colonIdx < 50
              ? fullText.slice(0, colonIdx).trim()
              : fullText.slice(0, 36) + (fullText.length > 36 ? '...' : '');
            const parsedContent = colonIdx !== -1 && colonIdx < 50
              ? fullText.slice(colonIdx + 1).trim()
              : fullText;

            const diff = Date.now() - new Date(item.created_at || Date.now()).getTime();
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const timeAgo = days <= 0 ? 'Just now' : days === 1 ? '1 day ago' : `${days} days ago`;

            return {
              id: item.id,
              userName: name,
              userAvatarInitial: initial,
              userAvatarColor: avatarGradients[idx % avatarGradients.length],
              isVerified: true,
              isFeatured: Boolean(item.is_featured),
              rating: item.rating || 5,
              timeAgo,
              title: parsedTitle || 'Verified Client Review',
              content: parsedContent || fullText,
              projectTag: item.is_featured ? 'Featured Project • Verified' : 'Verified Client',
            };
          });
          setReviews(formatted);
        } else {
          setReviews([]);
        }
        setIsLoading(false);
      },
      {
        onError: (err) => {
          console.warn('Error fetching Supabase reviews:', err);
          setReviews([]);
          setIsLoading(false);
        },
      },
    );
  }, []);

  // Submit new review
  const handleCreateReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const author = newAuthorName.trim() || 'Verified Client';
    const reviewBody = `${newTitle.trim()}: ${newContent.trim()}`;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsSubmitting(false);
        showToast('Please sign in to submit a verified review.');
        return;
      }
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          customer_name: author,
          customer_email: user.email || null,
          rating: newRating,
          review_text: reviewBody,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIsSubmitting(false);
        showToast(json?.error || 'Could not publish review.');
        return;
      }
      invalidateClientCache('reviews');
      invalidateClientCache('catalog');

      const created: ReviewItem = {
        id: json?.data?.id || `rev-${Date.now()}`,
        userName: author,
        userAvatarInitial: author[0]?.toUpperCase() || 'V',
        userAvatarColor: 'from-purple-500 to-fuchsia-600',
        isVerified: true,
        isFeatured: false,
        rating: newRating,
        timeAgo: 'Just now',
        title: newTitle.trim(),
        content: newContent.trim(),
        projectTag: 'Verified Client',
      };

      setReviews([created, ...reviews]);
      setIsSubmitting(false);
      setIsWriteModalOpen(false);
      setNewTitle('');
      setNewContent('');
      showToast('Thank you! Your verified review has been published.');
    } catch (dbErr) {
      console.warn('Review insert notice:', dbErr);
      setIsSubmitting(false);
      showToast('Network error while publishing review.');
    }
  };

  const ratingStats = useMemo(() => {
    const total = reviews.length;
    if (total === 0) {
      return {
        avg: '—',
        total: 0,
        featuredCount: 0,
        fiveStarCount: 0,
        fourPlusCount: 0,
        breakdown: [5, 4, 3, 2, 1].map((stars) => ({ stars, percent: 0 })),
      };
    }
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    return {
      avg: (sum / total).toFixed(1),
      total,
      featuredCount: reviews.filter((r) => r.isFeatured).length,
      fiveStarCount: reviews.filter((r) => r.rating === 5).length,
      fourPlusCount: reviews.filter((r) => r.rating >= 4).length,
      breakdown: [5, 4, 3, 2, 1].map((stars) => ({
        stars,
        percent: Math.round((reviews.filter((r) => r.rating === stars).length / total) * 100),
      })),
    };
  }, [reviews]);

  // Filtered and Sorted Reviews
  const filteredReviews = useMemo(() => {
    const result = reviews.filter((r) => {
      const matchesCat =
        selectedCategory === 'All' ||
        (selectedCategory === 'Featured' && r.isFeatured) ||
        (selectedCategory === '5Stars' && r.rating === 5) ||
        (selectedCategory === '4Plus' && r.rating >= 4);
      const matchesVerified = !verifiedOnly || r.isVerified;
      return matchesCat && matchesVerified;
    });

    if (sortBy === 'highest') {
      result.sort((a, b) => b.rating - a.rating);
    }
    return result;
  }, [reviews, selectedCategory, verifiedOnly, sortBy]);

  const sortLabels: Record<SortOption, string> = {
    recent: 'Most Recent',
    highest: 'Highest Rated',
  };

  return (
    <div className="min-h-screen bg-[#07070d] text-white flex flex-col relative pb-32">
      {/* Light Glassmorphic Toast Notification */}
      {toastMsg && (
        <div className="fixed top-16 inset-x-0 z-50 flex justify-center px-4 animate-in fade-in slide-in-from-top-3 duration-250 pointer-events-none">
          <div className="bg-[#0b0d1e]/80 backdrop-blur-xl border border-emerald-500/20 text-emerald-200 text-xs font-medium px-3.5 py-1.5 rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.5),0_0_10px_rgba(16,185,129,0.1)] flex items-center gap-2 pointer-events-auto transition-all">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="leading-tight">{toastMsg}</span>
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-[#07070d]/90 backdrop-blur-xl border-b border-purple-500/10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go Back"
            className="w-10 h-10 rounded-full bg-[#121429] border border-purple-500/20 flex items-center justify-center text-gray-300 hover:text-white hover:border-purple-500/40 hover:bg-[#1a1d3d] transition-all shadow-sm cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-tight">
              Reviews & Ratings
            </h1>
            <p className="text-xs text-gray-400 leading-tight">
              See what our customers say and share your feedback
            </p>
          </div>
        </div>

        {/* Write Review Button */}
        <button
          type="button"
          onClick={() => setIsWriteModalOpen(true)}
          className="px-3.5 py-1.5 rounded-full bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-500 text-white text-xs font-bold shadow-md shadow-fuchsia-600/30 hover:opacity-95 transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Write Review</span>
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-xl w-full mx-auto px-4 pt-4 flex flex-col gap-4">
        {/* Rating Hero Card */}
        <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-r from-[#210d44]/90 via-[#150c33]/90 to-[#0c0d1e]/90 border border-purple-500/25 p-4 sm:p-5 shadow-[0_12px_36px_rgba(0,0,0,0.55)]">
          {/* Ambient Glow */}
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-fuchsia-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 grid grid-cols-12 gap-4 items-center">
            {/* Left Col: Big Rating */}
            <div className="col-span-5 flex flex-col items-center justify-center text-center pr-2 border-r border-purple-500/15">
              <div className="flex items-center gap-1.5">
                <span className="text-4xl sm:text-5xl font-black text-white tracking-tighter">
                  {ratingStats.avg}
                </span>
                <Star className="w-7 h-7 sm:w-8 sm:h-8 fill-amber-400 text-amber-400" />
              </div>
              <span className="text-xs text-gray-400 mt-1 font-medium">
                ({ratingStats.total} {ratingStats.total === 1 ? 'review' : 'reviews'})
              </span>
              <span className="inline-flex items-center gap-1 mt-2.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold">
                <ShieldCheck className="w-3 h-3" />
                Verified Customers
              </span>
            </div>

            {/* Right Col: Rating Breakdown Bars */}
            <div className="col-span-7 flex flex-col gap-1.5 pl-1">
              {ratingStats.breakdown.map((item) => (
                <div key={item.stars} className="flex items-center gap-2 text-xs">
                  <div className="flex items-center gap-0.5 w-6 text-[11px] font-semibold text-gray-300">
                    <span>{item.stars}</span>
                    <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                  </div>
                  <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-500 rounded-full"
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-gray-400 w-7 text-right">
                    {item.percent}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Filter Tabs & Sub-controls */}
        <div className="flex flex-col gap-3">
          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {[
              { label: `All (${ratingStats.total})`, key: 'All' as CategoryFilter },
              { label: `Featured (${ratingStats.featuredCount})`, key: 'Featured' as CategoryFilter },
              { label: `5 Stars (${ratingStats.fiveStarCount})`, key: '5Stars' as CategoryFilter },
              { label: `4+ Stars (${ratingStats.fourPlusCount})`, key: '4Plus' as CategoryFilter },
            ].map((tab) => {
              const isSelected = selectedCategory === tab.key;
              return (
                <button
                  type="button"
                  key={tab.key}
                  onClick={() => setSelectedCategory(tab.key)}
                  className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-500 text-white shadow-md shadow-fuchsia-600/30'
                      : 'bg-[#121429]/90 border border-purple-500/15 text-gray-400 hover:text-white hover:border-purple-500/35'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Sub-controls: Verified Info & Sort dropdown */}
          <div className="flex items-center justify-between px-1">
            <div className="px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>100% Verified Client Feedback</span>
            </div>

            {/* Sort Dropdown */}
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
                  <div className="absolute right-0 top-full mt-1.5 w-44 rounded-2xl bg-[#0f1124] border border-purple-500/30 p-1.5 shadow-2xl z-30 animate-in fade-in zoom-in-95 duration-150">
                    {(['recent', 'highest'] as SortOption[]).map((opt) => (
                      <button
                        type="button"
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

        {/* Reviews List */}
        <div className="flex flex-col gap-3">
          {isLoading ? (
            /* Reviews Skeleton */
            <>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="p-4 rounded-3xl bg-[#0f1123]/80 border border-purple-500/15 animate-pulse flex flex-col gap-2.5 shadow-lg"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-purple-900/40 shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <div className="h-3.5 bg-purple-800/40 rounded-md w-32" />
                      <div className="h-2.5 bg-purple-900/20 rounded-md w-20" />
                    </div>
                  </div>
                  <div className="h-3 bg-purple-900/20 rounded-md w-3/4 mt-1" />
                  <div className="h-3 bg-purple-900/15 rounded-md w-full" />
                </div>
              ))}
            </>
          ) : filteredReviews.length === 0 ? (
            <div className="py-16 text-center text-xs text-gray-400">
              No reviews found in this category yet. Be the first to write a review!
            </div>
          ) : (
            filteredReviews.map((rev) => (
            <div
              key={rev.id}
              className="p-4 rounded-3xl bg-[#0f1123]/95 border border-purple-500/15 hover:border-purple-500/35 transition-all shadow-[0_8px_24px_rgba(0,0,0,0.4)] flex flex-col gap-2.5"
            >
              {/* Top Row: User Avatar, Name, Rating, Time */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-9 h-9 rounded-full bg-gradient-to-tr ${rev.userAvatarColor} flex items-center justify-center text-white font-bold text-sm shadow-sm`}
                  >
                    {rev.userAvatarInitial}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-white tracking-tight">
                        {rev.userName}
                      </span>
                      {rev.isVerified && (
                        <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-0.5">
                          <ShieldCheck className="w-3 h-3" />
                          Verified
                        </span>
                      )}
                    </div>
                    {/* Stars Row */}
                    <div className="flex items-center gap-1 mt-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-3.5 h-3.5 ${
                            star <= rev.rating
                              ? 'fill-amber-400 text-amber-400'
                              : 'fill-gray-700 text-gray-700'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <span className="text-xs text-gray-500 font-medium">{rev.timeAgo}</span>
              </div>

              {/* Review Title & Content */}
              <div>
                <h4 className="text-sm font-bold text-white tracking-tight">
                  {rev.title}
                </h4>
                <p className="text-xs text-gray-300/85 mt-1 leading-relaxed">
                  {rev.content}
                </p>
              </div>

              {/* Bottom Meta: Project Tag & Explore Link */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-purple-500/10 flex-wrap">
                <span className="text-[11px] font-medium text-purple-300/90 bg-purple-500/10 px-2.5 py-0.5 rounded-full border border-purple-500/20 truncate max-w-[240px]">
                  {rev.projectTag}
                </span>
                <Link
                  href="/categories"
                  className="text-[11px] font-bold text-fuchsia-400 hover:text-fuchsia-300 inline-flex items-center gap-1 transition-colors"
                >
                  <span>Explore Systems</span>
                  <span>→</span>
                </Link>
              </div>
            </div>
          )))}
        </div>

        {/* Layman Conversion Banner */}
        <div className="mt-5 rounded-2xl bg-gradient-to-r from-purple-900/40 via-[#180f33]/90 to-indigo-900/40 border border-purple-500/25 p-4 text-center space-y-2.5 shadow-lg">
          <h4 className="text-sm font-bold text-white tracking-tight">Ready to start your own project?</h4>
          <p className="text-xs text-purple-200/70 max-w-xs mx-auto leading-relaxed">
            Browse verified turn-key software and systems with milestone delivery &amp; full IP code handover.
          </p>
          <div>
            <Link
              href="/categories"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-500 text-white text-xs font-bold shadow-md hover:opacity-95 transition-all"
            >
              <span>Browse All Systems</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </main>

      {/* MODAL: Write Review */}
      {isWriteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-3xl bg-[#0f1124] border border-purple-500/30 p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-purple-500/15 pb-3">
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                <h3 className="text-lg font-bold text-white">Write a Review</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsWriteModalOpen(false)}
                className="w-8 h-8 rounded-full bg-[#181a33] flex items-center justify-center text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateReview} className="flex flex-col gap-3.5">
              {/* Star Rating Picker */}
              <div>
                <label className="text-xs font-semibold text-gray-300 mb-1.5 block">
                  Overall Rating
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      type="button"
                      key={star}
                      onClick={() => setNewRating(star)}
                      className="p-1 hover:scale-110 transition-transform cursor-pointer"
                    >
                      <Star
                        className={`w-7 h-7 ${
                          star <= newRating
                            ? 'fill-amber-400 text-amber-400'
                            : 'fill-gray-700 text-gray-700'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="text-xs font-bold text-amber-300 ml-2">
                    {newRating} / 5 Stars
                  </span>
                </div>
              </div>

              {/* Author Name */}
              <div>
                <label className="text-xs font-semibold text-gray-300 mb-1.5 block">
                  Your Full Name
                </label>
                <input
                  type="text"
                  value={newAuthorName}
                  onChange={(e) => setNewAuthorName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#161833] border border-purple-500/20 text-white text-sm focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              {/* Review Title */}
              <div>
                <label className="text-xs font-semibold text-gray-300 mb-1.5 block">
                  Headline / Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Excellent execution & timely delivery"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#161833] border border-purple-500/20 text-white text-sm focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              {/* Review Content */}
              <div>
                <label className="text-xs font-semibold text-gray-300 mb-1.5 block">
                  Detailed Experience
                </label>
                <textarea
                  rows={3}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Share details of your experience with the team, milestone speed, and quality..."
                  className="w-full px-4 py-2.5 rounded-xl bg-[#161833] border border-purple-500/20 text-white text-sm focus:outline-none focus:border-purple-500 resize-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsWriteModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#181a33] text-gray-300 text-xs font-semibold hover:bg-[#202242] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-500 text-white text-xs font-bold shadow-md shadow-fuchsia-600/30 hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSubmitting ? 'Submitting Review...' : 'Submit Review'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Persistent Bottom Floating Dock */}
      <BottomNav />
    </div>
  );
}
