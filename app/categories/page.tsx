'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Search, ArrowRight, Loader2, LayoutGrid } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { subscribeSmartFetch } from '@/lib/clientCache';

interface CategoryCard {
  id: string;
  name: string;
  description: string;
  filterTag: string;
  slug: string;
  imageSrc: string;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryCard[]>([]);
  const [activeFilter, setActiveFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    interface CategoryRow {
      id: string;
      name: string;
      description?: string | null;
      slug?: string | null;
    }

    const images = [
      '/assets/cat_illust_3.png',
      '/assets/cat_illust_7.png',
      '/assets/cat_illust_6.png',
      '/assets/cat_illust_1.png',
    ];

    return subscribeSmartFetch<{ data?: CategoryRow[] }>(
      '/api/catalog?mode=categories',
      'catalog',
      (json) => {
        const data = Array.isArray(json?.data) ? json.data : [];
        if (data.length > 0) {
          const mapped: CategoryCard[] = data.map((cat, idx) => ({
            id: cat.id,
            name: cat.name,
            description: cat.description || 'End-to-end software development and deployment.',
            filterTag: 'Systems',
            slug: cat.slug || cat.id,
            imageSrc: images[idx % images.length],
          }));
          setCategories(mapped);
        } else {
          setCategories([]);
        }
        setIsLoading(false);
      },
      {
        onError: (err) => {
          console.error('Failed to fetch categories:', err);
          setCategories([]);
          setIsLoading(false);
        },
      },
    );
  }, []);

  const filterTabs = ['All', ...Array.from(new Set(categories.map((c) => c.filterTag)))];

  const filteredCategories = categories.filter((cat) => {
    const matchesFilter = activeFilter === 'All' || cat.filterTag === activeFilter;
    const matchesSearch =
      cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cat.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-[#07070d] text-white flex flex-col items-center">
      <div className="w-full max-w-md min-h-screen flex flex-col bg-[#07070d] relative shadow-2xl">
        {/* Sticky Header */}
        <header className="sticky top-0 z-40 w-full bg-[#07070d]/90 backdrop-blur-xl border-b border-purple-500/10 px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-base sm:text-lg font-black text-white tracking-tight leading-none">
              Explore Categories
            </h1>
            <p className="text-[10px] text-purple-200/60 font-medium leading-tight mt-0.5">
              Browse verified software &amp; digital services
            </p>
          </div>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-900/40 border border-purple-400/30 text-purple-200 text-[10px] font-bold">
            <LayoutGrid className="w-3 h-3 text-fuchsia-400" />
            <span>{categories.length} Categories</span>
          </div>
        </header>

        {/* Search Bar */}
        <div className="px-4 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search category or system..."
              className="w-full pl-10 pr-4 py-2.5 rounded-full bg-[#121326] border border-purple-500/20 text-xs text-white placeholder-gray-400 focus:outline-none focus:border-purple-400 transition-colors"
            />
          </div>
        </div>

        {/* Filter Chips */}
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
          {filterTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveFilter(tab)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                activeFilter === tab
                  ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-md shadow-purple-900/40'
                  : 'bg-[#121326] border border-purple-500/20 text-gray-400 hover:text-gray-200 hover:border-purple-400/40'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Category Cards List */}
        <main className="flex-1 px-4 pt-2 space-y-3 pb-28">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-8 h-8 text-fuchsia-400 animate-spin" />
              <p className="text-xs text-purple-200/60 font-medium">
                Loading categories from Supabase...
              </p>
            </div>
          ) : (
            filteredCategories.map((cat) => (
              <Link
                key={cat.id}
                href={`/categories/${cat.slug}`}
                className="group relative rounded-[22px] bg-[#111226]/90 border border-purple-500/20 hover:border-purple-400/50 p-4 shadow-xl flex items-center justify-between gap-3 transition-all duration-300 hover:scale-[1.01] overflow-hidden cursor-pointer"
              >
                <div className="flex-1 min-w-0 pr-1">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-purple-900/40 border border-purple-400/25 text-[9px] font-bold text-purple-300 uppercase tracking-wider mb-1">
                    {cat.filterTag}
                  </span>

                  <h3 className="text-sm font-extrabold text-white tracking-tight group-hover:text-fuchsia-300 transition-colors">
                    {cat.name}
                  </h3>

                  <p className="text-[11px] text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                    {cat.description}
                  </p>

                  <div className="mt-2.5 flex items-center gap-1 text-[11px] font-bold text-fuchsia-400 group-hover:text-fuchsia-300">
                    <span>View Systems</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>

                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#1b143a]/80 border border-purple-500/20 flex-shrink-0 flex items-center justify-center p-2 relative overflow-hidden group-hover:scale-105 transition-transform">
                  <Image
                    src={cat.imageSrc}
                    alt={cat.name}
                    width={70}
                    height={70}
                    className="w-full h-full object-contain drop-shadow-[0_4px_12px_rgba(217,70,239,0.3)]"
                  />
                </div>
              </Link>
            ))
          )}
        </main>

        {/* Floating Bottom Navigation */}
        <BottomNav />
      </div>
    </div>
  );
}
