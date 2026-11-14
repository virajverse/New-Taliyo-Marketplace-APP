'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  LayoutGrid,
  Terminal,
  Cog,
  Eye,
  Globe,
  Code2,
  Smartphone,
  Cpu,
} from 'lucide-react';
import { subscribeSmartFetch } from '@/lib/clientCache';

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  icon: React.ReactNode;
  href: string;
  isActive?: boolean;
}

const ALL_SYSTEMS_TILE: CategoryItem = {
  id: 'all',
  name: 'All Systems',
  slug: 'all',
  icon: <LayoutGrid className="w-5 h-5 text-white" />,
  href: '/categories',
  isActive: true,
};

export default function CategoryGrid() {
  const [categories, setCategories] = useState<CategoryItem[]>([ALL_SYSTEMS_TILE]);

  useEffect(() => {
    const iconList = [
      <Terminal key="1" className="w-5 h-5 text-fuchsia-400" />,
      <Cog key="2" className="w-5 h-5 text-cyan-400" />,
      <Eye key="3" className="w-5 h-5 text-amber-400" />,
      <Globe key="4" className="w-5 h-5 text-emerald-400" />,
      <Code2 key="5" className="w-5 h-5 text-purple-300" />,
      <Smartphone key="6" className="w-5 h-5 text-purple-300" />,
      <Cpu key="7" className="w-5 h-5 text-fuchsia-300" />,
    ];

    return subscribeSmartFetch<{
      data?: Array<{ id: string; name: string; slug?: string | null }>;
    }>(
      '/api/catalog?mode=categories',
      'catalog',
      (json) => {
        const data = (Array.isArray(json?.data) ? json.data : []).slice(0, 7);
        if (data.length > 0) {
          const mapped: CategoryItem[] = [
            ALL_SYSTEMS_TILE,
            ...data.map((cat, idx) => ({
              id: cat.id,
              name: cat.name.replace(' Systems', '').replace(' ', '\n'),
              slug: cat.slug || cat.id,
              icon: iconList[idx % iconList.length],
              href: `/categories/${cat.slug || cat.id}`,
            })),
          ];
          setCategories(mapped);
        } else {
          setCategories([ALL_SYSTEMS_TILE]);
        }
      },
      { onError: () => setCategories([ALL_SYSTEMS_TILE]) },
    );
  }, []);

  return (
    <section className="w-full">
      <div className="grid grid-cols-4 gap-2.5">
        {categories.map((cat) => (
          <Link
            key={cat.id}
            href={cat.href}
            className={`group relative flex flex-col items-center justify-center p-2.5 rounded-2xl border transition-all duration-200 cursor-pointer ${
              cat.isActive
                ? 'bg-[#1e133d] border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.35)]'
                : 'bg-[#111226]/85 border-purple-500/20 hover:border-purple-400/50 hover:bg-[#1a1b38]'
            }`}
          >
            {/* Subtle glow for active card */}
            {cat.isActive && (
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-purple-500/20 to-transparent pointer-events-none" />
            )}

            {/* Icon Container */}
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-200 ${
                cat.isActive
                  ? 'bg-gradient-to-tr from-purple-600 to-fuchsia-600 shadow-md shadow-fuchsia-900/50'
                  : 'bg-[#181935] border border-purple-500/20'
              }`}
            >
              {cat.icon}
            </div>

            {/* Category Label */}
            <span
              className={`mt-2 text-[11px] font-bold text-center leading-tight whitespace-pre-line tracking-tight ${
                cat.isActive ? 'text-white' : 'text-gray-300 group-hover:text-white'
              }`}
            >
              {cat.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
