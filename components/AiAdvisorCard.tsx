'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Cpu } from 'lucide-react';

export default function AiAdvisorCard() {
  return (
    <Link
      href="/advisor"
      className="group relative block w-full rounded-[26px] p-4 sm:p-5 bg-gradient-to-r from-[#1c0d3b] via-[#130928] to-[#2b0e4f] border border-purple-500/30 shadow-2xl shadow-purple-950/50 hover:border-purple-400/60 transition-all overflow-hidden"
    >
      <div className="relative z-10 flex items-center justify-between gap-3">
        {/* Left: Cyborg Avatar */}
        <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0 flex items-center justify-center rounded-2xl overflow-hidden">
          <Image
            src="/assets/cyborg_clean.png"
            alt="Project Advisor"
            width={80}
            height={80}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Middle: Content */}
        <div className="flex-1 min-w-0 pr-1">
          {/* Badge */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-900/60 border border-purple-400/40 text-purple-200 text-[10px] font-bold shadow-sm">
              <Cpu className="w-2.5 h-2.5 text-fuchsia-400" />
              <span>Project Advisor</span>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[9px] font-extrabold uppercase tracking-wider">
              Coming Soon
            </span>
          </div>

          <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight leading-snug group-hover:text-purple-300 transition-colors">
            Solution Architect
          </h3>

          <p className="mt-0.5 text-[11px] sm:text-xs text-purple-200/70 line-clamp-2 leading-relaxed">
            Coming soon — meanwhile explore systems or connect on WhatsApp for instant planning.
          </p>
        </div>

        {/* Right: Circular CTA Button */}
        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-600 flex items-center justify-center text-white shadow-lg shadow-purple-900/60 group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(217,70,239,0.6)] transition-all flex-shrink-0">
          <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </Link>
  );
}
