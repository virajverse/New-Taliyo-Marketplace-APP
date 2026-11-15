'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  MessageCircle,
  Layers,
  Cpu,
  IndianRupee,
  Clock,
  Headphones,
  ArrowRight,
  LayoutGrid,
} from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { subscribeSmartFetch } from '@/lib/clientCache';

const UPCOMING_FEATURES = [
  {
    icon: <Layers className="w-4 h-4 text-fuchsia-400" />,
    title: 'Architecture Blueprints',
    desc: 'Instant system architecture matched to your exact product goals.',
  },
  {
    icon: <Cpu className="w-4 h-4 text-cyan-400" />,
    title: 'Tech Stack & Modules',
    desc: 'Recommended frontend, backend, database, and integrations.',
  },
  {
    icon: <IndianRupee className="w-4 h-4 text-emerald-400" />,
    title: 'Transparent Cost & ETA',
    desc: 'Real marketplace pricing & milestone delivery timeline.',
  },
];

export default function AdvisorPage() {
  const router = useRouter();
  const [supportWhatsApp, setSupportWhatsApp] = useState('917042523611');

  useEffect(() => {
    return subscribeSmartFetch<{ settings?: Record<string, string> }>(
      '/api/site-settings',
      'settings',
      (json) => {
        if (json?.settings?.support_whatsapp) {
          setSupportWhatsApp(json.settings.support_whatsapp);
        }
      },
    );
  }, []);

  const whatsappUrl = `https://wa.me/${supportWhatsApp}?text=${encodeURIComponent(
    'Hello Taliyo Tech Team, I want help planning a custom software/website project.',
  )}`;

  return (
    <div className="min-h-screen bg-[#07070d] text-white flex flex-col items-center">
      <div className="w-full max-w-xl min-h-screen flex flex-col bg-[#07070d] relative shadow-2xl">
        {/* Sticky Top Header */}
        <header className="sticky top-0 z-40 w-full bg-[#07070d]/90 backdrop-blur-xl border-b border-purple-500/10 px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-base sm:text-lg font-black text-white tracking-tight leading-none flex items-center gap-2">
              <span>AI Project Advisor</span>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[9px] font-extrabold uppercase tracking-wider">
                Coming Soon
              </span>
            </h1>
            <p className="text-[10px] text-purple-200/60 font-medium leading-tight mt-0.5">
              Architecture • Tech Stack • Cost Estimator
            </p>
          </div>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold hover:bg-emerald-900/60 active:scale-95 transition-all shadow-sm"
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>WhatsApp</span>
          </a>
        </header>

        {/* Main Coming Soon Content */}
        <main className="flex-1 px-4 pt-5 pb-32 space-y-5">
          {/* Hero Coming Soon Card */}
          <div className="relative rounded-[28px] bg-gradient-to-br from-[#1d0d3d] via-[#120b28] to-[#2b0d4b] border border-purple-500/30 p-6 shadow-2xl overflow-hidden text-center">
            <div className="relative z-10 flex flex-col items-center">
              <div className="relative w-28 h-28 rounded-3xl bg-[#180c36] border border-purple-400/30 p-2 mb-4 flex items-center justify-center overflow-hidden">
                <Image
                  src="/assets/cyborg_clean.png"
                  alt="Project Advisor"
                  width={104}
                  height={104}
                  unoptimized
                  className="w-full h-full object-contain scale-105"
                />
              </div>

              <div className="inline-flex items-center gap-1 text-fuchsia-300 text-xs font-bold mb-1">
                <Cpu className="w-3.5 h-3.5" />
                <span>AI Project Advisor</span>
              </div>

              <h2 className="text-xl font-black text-white tracking-tight leading-snug">
                Automated Project Planner
              </h2>

              <p className="mt-2 text-xs text-purple-100/75 leading-relaxed max-w-xs">
                We are building an automated project planner trained on live Taliyo systems. Until launch, connect directly with our engineering team on WhatsApp or use Customer Support.
              </p>

              {/* Direct WhatsApp CTA */}
              <div className="w-full mt-5 space-y-2.5">
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 transition-all active:scale-98"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Discuss Your Idea on WhatsApp</span>
                </a>

                <div className="grid grid-cols-2 gap-2.5">
                  <Link
                    href="/support"
                    className="py-2.5 px-3 rounded-xl bg-[#161733] border border-purple-500/30 hover:border-purple-400/60 text-purple-100 text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Headphones className="w-3.5 h-3.5 text-fuchsia-400" />
                    <span>Support Chat</span>
                  </Link>
                  <Link
                    href="/categories"
                    className="py-2.5 px-3 rounded-xl bg-[#161733] border border-purple-500/30 hover:border-purple-400/60 text-purple-100 text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                  >
                    <LayoutGrid className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Browse Systems</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Upcoming Capabilities Preview */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">
              What&apos;s Coming in AI Advisor
            </h3>
            <div className="space-y-2.5">
              {UPCOMING_FEATURES.map((feat) => (
                <a
                  key={feat.title}
                  href={`https://wa.me/${supportWhatsApp}?text=${encodeURIComponent(
                    `Hello Taliyo Team, I need help with ${feat.title} for my project.`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3.5 rounded-[20px] bg-[#121326]/95 border border-purple-500/20 hover:border-purple-400/50 transition-all flex items-start gap-3 cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-[#1b1035] border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                    {feat.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs sm:text-sm font-bold text-white leading-snug">
                      {feat.title}
                    </h4>
                    <p className="text-[11px] text-purple-200/65 leading-relaxed mt-0.5">
                      {feat.desc}
                    </p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-purple-400/70 mt-1 flex-shrink-0" />
                </a>
              ))}
            </div>
          </div>
        </main>

        <BottomNav />
      </div>
    </div>
  );
}
