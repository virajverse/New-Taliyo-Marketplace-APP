'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LayoutGrid, Cpu, Package, User } from 'lucide-react';

export default function BottomNav() {
  const pathname = usePathname();

  const isHome = pathname === '/';
  const isCategories =
    pathname.startsWith('/categories') ||
    pathname.startsWith('/services') ||
    pathname === '/search';
  const isAdvisor = pathname === '/advisor';
  const isOrders = pathname.startsWith('/orders') || pathname.startsWith('/order-status');
  const isProfile =
    pathname === '/profile' ||
    pathname === '/settings' ||
    pathname === '/notifications' ||
    pathname === '/wishlist';

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 flex justify-center px-4 pb-3 pt-4 bg-gradient-to-t from-[#07070d] via-[#07070d]/85 to-transparent pointer-events-none">
      <nav className="pointer-events-auto w-full max-w-md rounded-[28px] bg-[#0c0d1f]/95 border border-purple-500/20 shadow-[0_12px_40px_rgba(0,0,0,0.85)] backdrop-blur-2xl px-5 py-2.5 flex items-center justify-between">
        {/* Home */}
        <Link
          href="/"
          className={`flex flex-col items-center gap-1 transition-all ${
            isHome
              ? 'text-fuchsia-400 drop-shadow-[0_0_10px_rgba(217,70,239,0.6)] font-bold'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Home</span>
        </Link>

        {/* Categories */}
        <Link
          href="/categories"
          className={`flex flex-col items-center gap-1 transition-all ${
            isCategories
              ? 'text-fuchsia-400 drop-shadow-[0_0_10px_rgba(217,70,239,0.6)] font-bold'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <LayoutGrid className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Categories</span>
        </Link>

        {/* Center Project Advisor CTA */}
        <div className="relative -top-3.5 flex flex-col items-center -mb-2.5">
          <Link
            href="/advisor"
            aria-label="AI Project Advisor (Coming Soon)"
            className="flex flex-col items-center gap-0.5 group"
          >
            <div
              className={`relative w-12 h-12 p-0.5 rounded-full bg-gradient-to-tr from-purple-600 via-fuchsia-500 to-pink-500 shadow-[0_8px_20px_rgba(168,85,247,0.4)] ring-4 ring-[#07070d] transition-all group-hover:scale-105 group-active:scale-95 ${
                isAdvisor ? 'ring-purple-500 scale-105' : ''
              }`}
            >
              <div className="w-full h-full rounded-full bg-[#160b30] flex items-center justify-center transition-colors group-hover:bg-[#200e44]">
                <Cpu className="w-5 h-5 text-white" />
              </div>
              <span className="absolute -top-1.5 -right-2 px-1.5 py-0.2 rounded-full bg-amber-500 text-[#07070d] text-[8px] font-black uppercase tracking-tight shadow">
                Soon
              </span>
            </div>
            <span
              className={`text-[9px] tracking-tight ${
                isAdvisor ? 'text-fuchsia-400 font-bold' : 'text-purple-200/80 font-medium'
              }`}
            >
              Advisor
            </span>
          </Link>
        </div>

        {/* Orders */}
        <Link
          href="/orders"
          className={`flex flex-col items-center gap-1 transition-all ${
            isOrders
              ? 'text-fuchsia-400 drop-shadow-[0_0_10px_rgba(217,70,239,0.6)] font-bold'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <Package className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Orders</span>
        </Link>

        {/* Profile */}
        <Link
          href="/profile"
          className={`flex flex-col items-center gap-1 transition-all ${
            isProfile
              ? 'text-fuchsia-400 drop-shadow-[0_0_10px_rgba(217,70,239,0.6)] font-bold'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <User className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Profile</span>
        </Link>
      </nav>
    </div>
  );
}
