'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Search,
  Package,
  CreditCard,
  User,
  Layers,
  ChevronDown,
  ChevronUp,
  Headphones,
  MessageCircle,
  X,
} from 'lucide-react';
import BottomNav from '@/components/BottomNav';

interface FAQItem {
  id: string;
  category: 'orders' | 'payments' | 'account' | 'services';
  question: string;
  answer: string;
}

const FAQS: FAQItem[] = [
  {
    id: 'faq-1',
    category: 'orders',
    question: 'How do I place an order?',
    answer:
      'Browse services, select the one you need, click "Add to Cart" and then "Place Order". You can track your order from the Orders section.',
  },
  {
    id: 'faq-2',
    category: 'payments',
    question: 'What payment methods do you support?',
    answer:
      'We support 0% convenience fee UPI payments (GPay, PhonePe, Paytm, BHIM via QR code or direct UPI app launch), a 30% Advance Milestone Payment option, and direct Bank NEFT / IMPS transfers with instant UTR verification.',
  },
  {
    id: 'faq-3',
    category: 'orders',
    question: 'How can I track my order?',
    answer:
      'Navigate to "My Orders" from the bottom navigation dock. Click on your active project to view the live Order Milestone Tracker, deliverable stages, and direct WhatsApp support with your team.',
  },
  {
    id: 'faq-4',
    category: 'payments',
    question: 'Can I get a refund?',
    answer:
      'Yes! We offer a 100% milestone-based guarantee. If an agreed milestone deliverable fails to meet specifications, you can request an instant review, revision, or dispute resolution from our support team.',
  },
  {
    id: 'faq-5',
    category: 'account',
    question: 'How do I update my profile name, phone or avatar?',
    answer:
      'Go to "My Profile" and tap the "Edit Profile" button in the top right to update your Full Name, Contact Phone Number, or Avatar. For security reasons, your registered login email is locked and can be updated via Customer Support.',
  },
  {
    id: 'faq-6',
    category: 'services',
    question: 'Can I request a custom feature not listed in plans?',
    answer:
      'Absolutely! Reach out via Customer Support or direct WhatsApp with your project requirements to receive a tailored architecture and pricing proposal quickly.',
  },
];

export default function HelpFAQPage() {
  const router = useRouter();

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string>('faq-1');
  const [showAllFaqs, setShowAllFaqs] = useState(false);

  const toggleAccordion = (id: string) => {
    setExpandedId((prev) => (prev === id ? '' : id));
  };

  const filteredFaqs = FAQS.filter((faq) => {
    const matchesSearch =
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'all' || faq.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const visibleFaqs = showAllFaqs ? filteredFaqs : filteredFaqs.slice(0, 4);

  return (
    <div className="min-h-screen bg-[#07070d] text-white flex flex-col relative pb-32">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-[#07070d]/90 backdrop-blur-xl border-b border-purple-500/10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            aria-label="Go Back"
            className="w-10 h-10 rounded-full bg-[#121429] border border-purple-500/20 flex items-center justify-center text-gray-300 hover:text-white hover:border-purple-500/40 hover:bg-[#1a1d3d] transition-all shadow-sm cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-tight">
              Help & FAQ
            </h1>
            <p className="text-xs text-gray-400 leading-tight">
              Get answers, support and guidance
            </p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-xl w-full mx-auto px-4 pt-4 flex flex-col gap-5">
        {/* Search Hero Card */}
        <div className="flex flex-col gap-2.5">
          <p className="text-xs text-gray-400 px-1 leading-relaxed">
            Find answers, guides or talk to our support team.
          </p>

          <div className="relative w-full">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-purple-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search help articles, FAQs..."
              className="w-full pl-10 pr-9 py-3 rounded-2xl bg-[#0f1123]/95 border border-purple-500/20 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-purple-500/60 transition-all shadow-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* 4 Category Help Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            {
              id: 'orders',
              title: 'Orders & Delivery',
              icon: <Package className="w-5 h-5 text-purple-300" />,
              color: 'bg-purple-500/15 border-purple-500/25',
            },
            {
              id: 'payments',
              title: 'Payments & Refunds',
              icon: <CreditCard className="w-5 h-5 text-cyan-300" />,
              color: 'bg-cyan-500/15 border-cyan-500/25',
            },
            {
              id: 'account',
              title: 'Account & Profile',
              icon: <User className="w-5 h-5 text-fuchsia-300" />,
              color: 'bg-fuchsia-500/15 border-fuchsia-500/25',
            },
            {
              id: 'services',
              title: 'Services & Features',
              icon: <Layers className="w-5 h-5 text-emerald-300" />,
              color: 'bg-emerald-500/15 border-emerald-500/25',
            },
          ].map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(selectedCategory === cat.id ? 'all' : cat.id)}
                className={`p-3.5 rounded-2xl border transition-all flex flex-col items-center justify-center text-center gap-2 cursor-pointer ${
                  isSelected
                    ? 'bg-purple-600/25 border-purple-500 shadow-md scale-102'
                    : 'bg-[#0f1123]/90 border-purple-500/15 hover:border-purple-500/35 hover:bg-[#141630]'
                }`}
              >
                <div
                  className={`w-11 h-11 rounded-2xl border flex items-center justify-center shadow-sm ${cat.color}`}
                >
                  {cat.icon}
                </div>
                <span className="text-xs font-bold text-white tracking-tight leading-tight">
                  {cat.title}
                </span>
              </button>
            );
          })}
        </div>

        {/* Frequently Asked Questions Accordion */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
              Frequently Asked Questions
            </h2>
            <button
              onClick={() => setShowAllFaqs((prev) => !prev)}
              className="text-xs font-bold text-fuchsia-400 hover:text-fuchsia-300 transition-colors cursor-pointer"
            >
              {showAllFaqs ? 'Show Less' : 'View All >'}
            </button>
          </div>

          <div className="flex flex-col gap-2.5">
            {visibleFaqs.length === 0 ? (
              <div className="rounded-2xl bg-[#0f1123]/90 border border-purple-500/15 p-6 text-center space-y-2.5">
                <p className="text-sm font-bold text-white">No matching FAQs found</p>
                <p className="text-xs text-gray-400">
                  Try searching with a different keyword or contact our support team below.
                </p>
                {(searchQuery || selectedCategory !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('all');
                    }}
                    className="px-4 py-1.5 rounded-full bg-purple-600 text-white text-xs font-bold cursor-pointer"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            ) : (
            visibleFaqs.map((faq) => {
              const isExpanded = expandedId === faq.id;
              return (
                <div
                  key={faq.id}
                  className={`rounded-2xl border transition-all overflow-hidden ${
                    isExpanded
                      ? 'bg-[#141632]/95 border-purple-500/35 shadow-md'
                      : 'bg-[#0f1123]/90 border-purple-500/15 hover:border-purple-500/25'
                  }`}
                >
                  <button
                    onClick={() => toggleAccordion(faq.id)}
                    className="w-full p-4 flex items-center justify-between gap-3 text-left cursor-pointer"
                  >
                    <span className="text-sm font-semibold text-white tracking-tight">
                      {faq.question}
                    </span>
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
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            }))}
          </div>
        </div>

        {/* Still Need Help? Action Banner */}
        <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-r from-[#210d44]/90 via-[#160a33]/90 to-[#0c0d1e]/90 border border-purple-500/25 p-5 shadow-[0_12px_36px_rgba(0,0,0,0.55)] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0 w-full sm:w-auto">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-fuchsia-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-fuchsia-600/30">
              <Headphones className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                Need personalized help?
              </h3>
              <p className="text-xs text-gray-300/80 mt-0.5 leading-tight">
                Connect directly with our team on WhatsApp or Support Desk.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <a
              href="https://wa.me/917042523611?text=Hi%20Taliyo%20Support!%20I%20have%20a%20question%20from%20the%20Help%20Center."
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-none px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-all flex items-center justify-center gap-1.5"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </a>
            <Link
              href="/support"
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white text-xs font-bold shadow-md hover:opacity-95 transition-all text-center"
            >
              Support Desk
            </Link>
          </div>
        </div>
      </main>

      {/* Persistent Bottom Floating Dock */}
      <BottomNav />
    </div>
  );
}
