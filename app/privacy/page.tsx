'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Shield,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';
import BottomNav from '@/components/BottomNav';

interface PolicySection {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  details: string;
}

const POLICY_SECTIONS: PolicySection[] = [
  {
    id: 'sec-1',
    number: '1.',
    title: 'Information We Collect',
    subtitle: 'The types of data we collect from you',
    details:
      'We collect personal details including your name, email address, phone number, and billing information when you register or order services. We also collect device telemetry and usage logs to optimize platform latency and security.',
  },
  {
    id: 'sec-2',
    number: '2.',
    title: 'How We Use Information',
    subtitle: 'How your data helps us provide and improve our services',
    details:
      'Your information is used strictly to fulfill orders, process payments, deliver AI project recommendations, send critical milestone status updates, and continuously improve platform performance.',
  },
  {
    id: 'sec-3',
    number: '3.',
    title: 'Information Sharing',
    subtitle: 'When and with whom we share your data',
    details:
      'We do NOT sell your data. We share relevant project specs only with assigned verified developers and certified banking/payment networks (UPI, IMPS/NEFT settlement partners) under strict confidentiality agreements.',
  },
  {
    id: 'sec-4',
    number: '4.',
    title: 'Data Security',
    subtitle: 'How we protect your information',
    details:
      'All data in transit is encrypted using TLS 1.3 and at rest with AES-256 bit encryption. Regular penetration tests and automated audits guarantee maximum infrastructure compliance.',
  },
  {
    id: 'sec-5',
    number: '5.',
    title: 'Data Retention',
    subtitle: 'How long we keep your data',
    details:
      'We retain your account details and order records as long as your account is active or needed for legal and tax compliance. You may request account and data removal at any time.',
  },
  {
    id: 'sec-6',
    number: '6.',
    title: 'Your Rights',
    subtitle: 'Control, update or delete your information',
    details:
      'You hold full rights to view, export, rectify, or permanently delete your personal information. Manage your credentials directly under Account Settings or submit a data removal ticket.',
  },
  {
    id: 'sec-7',
    number: '7.',
    title: 'Policy Updates',
    subtitle: 'Changes to this Privacy Policy',
    details:
      'Any policy modifications will be published here with an updated revision date. Critical updates will also be broadcast via in-app push notifications and registered email.',
  },
  {
    id: 'sec-8',
    number: '8.',
    title: 'Contact Us',
    subtitle: 'Get in touch with our privacy team',
    details:
      'For any questions or compliance inquiries regarding this Privacy Policy, please contact our team at support@taliyotechnologies.com or reach out via Customer Support.',
  },
];

export default function PrivacyPolicyPage() {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string>('sec-1');

  const toggleSection = (id: string) => {
    setExpandedId((prev) => (prev === id ? '' : id));
  };

  return (
    <div className="min-h-screen bg-[#07070d] text-white flex flex-col relative pb-32">
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
              Privacy Policy
            </h1>
            <p className="text-xs text-gray-400 leading-tight">
              How we collect, use and protect your information
            </p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-xl w-full mx-auto px-4 pt-4 flex flex-col gap-4">
        {/* Hero Card */}
        <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-r from-[#210d44]/90 via-[#160a33]/90 to-[#0c0d1e]/90 border border-purple-500/25 p-5 shadow-[0_12px_36px_rgba(0,0,0,0.55)]">
          {/* Ambient Glow */}
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-fuchsia-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-fuchsia-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-fuchsia-600/30">
              <Shield className="w-6 h-6" />
            </div>

            <div>
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-[10px] font-semibold">
                Effective: March 2025
              </span>
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight mt-1.5 leading-snug">
                We are committed to keeping your data safe, secure and transparent.
              </h2>
            </div>
          </div>
        </div>

        {/* 8 Privacy Policy Accordion Cards */}
        <div className="flex flex-col gap-2.5">
          {POLICY_SECTIONS.map((sec) => {
            const isExpanded = expandedId === sec.id;
            return (
              <div
                key={sec.id}
                className={`rounded-2xl border transition-all overflow-hidden ${
                  isExpanded
                    ? 'bg-[#141632]/95 border-purple-500/35 shadow-md'
                    : 'bg-[#0f1123]/90 border-purple-500/15 hover:border-purple-500/25'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleSection(sec.id)}
                  className="w-full p-4 flex items-center justify-between gap-3 text-left cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-white tracking-tight">
                      {sec.number} {sec.title}
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {sec.subtitle}
                    </p>
                  </div>

                  <span className="text-gray-400 shrink-0">
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-fuchsia-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </span>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 text-xs text-gray-300/85 leading-relaxed border-t border-purple-500/10 animate-in fade-in duration-200">
                    {sec.details}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom Disclaimer & Direct Support Link */}
        <div className="p-4 rounded-2xl bg-[#0f1123]/80 border border-purple-500/15 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400 leading-relaxed">
          <div className="flex items-start gap-2.5">
            <Info className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
            <span>
              By using Taliyo Marketplace, you agree to the terms of this Privacy Policy and client data protection guidelines.
            </span>
          </div>
          <Link
            href="/support"
            className="shrink-0 px-3 py-1.5 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-200 text-xs font-bold hover:bg-purple-600/35 hover:text-white transition-all"
          >
            Contact Support →
          </Link>
        </div>
      </main>

      {/* Persistent Bottom Floating Dock */}
      <BottomNav />
    </div>
  );
}
