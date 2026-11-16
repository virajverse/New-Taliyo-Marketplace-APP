'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  MessageCircle,
  MessageSquare,
  Headphones,
  ArrowRight,
  BookOpen,
  FileText,
  Wrench,
  ShieldAlert,
  Clock,
  CheckCircle2,
  Package,
  Layers,
  CreditCard,
  Settings,
  Phone,
  Send,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { supabase, getAuthHeaders } from '@/lib/supabaseClient';
import { subscribeSmartFetch } from '@/lib/clientCache';

interface HelpCategory {
  id: string;
  label: string;
  icon: React.ReactNode;
  prompts: string[];
}

interface SupportAction {
  label: string;
  href: string;
}

interface SupportOrderCard {
  id: string;
  shortId: string;
  title: string;
  status: string;
  amount: number;
  paymentVerified: boolean;
}

interface SupportServiceCard {
  id: string;
  slug?: string | null;
  title: string;
  priceMin: number;
  delivery?: string | null;
}

interface SupportMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  escalateToWhatsApp?: boolean;
  whatsappUrl?: string;
  actions?: SupportAction[];
  orders?: SupportOrderCard[];
  services?: SupportServiceCard[];
  followUps?: string[];
}

const QUICK_CHIPS: HelpCategory[] = [
  {
    id: 'order',
    label: 'Order Help',
    icon: <Package className="w-3.5 h-3.5 text-fuchsia-400" />,
    prompts: ['Track my latest order', 'How does milestone delivery work?', 'Request revision / update'],
  },
  {
    id: 'project',
    label: 'Project Support',
    icon: <Layers className="w-3.5 h-3.5 text-cyan-400" />,
    prompts: ['Website / App pricing', 'Automation & CRM systems', 'Need a custom quote on WhatsApp'],
  },
  {
    id: 'payment',
    label: 'Payment & Billing',
    icon: <CreditCard className="w-3.5 h-3.5 text-emerald-400" />,
    prompts: ['Show active coupons', 'How does UPI & advance payment work?', 'Payment stuck / UTR not verified', 'Refund policy'],
  },
  {
    id: 'tech',
    label: 'Technical Issue',
    icon: <Settings className="w-3.5 h-3.5 text-amber-400" />,
    prompts: ['Login / account update help', 'Source code & IP rights', 'Report technical issue on WhatsApp'],
  },
];

const HELP_TOPICS = [
  {
    id: 'help-center',
    title: 'Help Center',
    href: '/help',
    icon: <BookOpen className="w-5 h-5 text-fuchsia-400" />,
    badge: 'FAQs',
  },
  {
    id: 'guides',
    title: 'Order Guide',
    href: '/orders',
    icon: <FileText className="w-5 h-5 text-cyan-400" />,
    badge: 'Live Track',
  },
  {
    id: 'setup-help',
    title: 'Service Catalog',
    href: '/categories',
    icon: <Wrench className="w-5 h-5 text-amber-400" />,
    badge: 'Explore',
  },
  {
    id: 'policies',
    title: 'Privacy & IP',
    href: '/privacy',
    icon: <ShieldAlert className="w-5 h-5 text-emerald-400" />,
    badge: 'Policies',
  },
];

function formatPhoneReadable(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return raw;
}

function isSupportCurrentlyOnline(): boolean {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      hour: 'numeric',
      hour12: false,
    }).formatToParts(new Date());
    const day = parts.find((p) => p.type === 'weekday')?.value || '';
    const hour = Number(parts.find((p) => p.type === 'hour')?.value || '0');
    return day !== 'Sun' && hour >= 10 && hour < 19;
  } catch {
    return false;
  }
}

export default function SupportPage() {
  const router = useRouter();
  const [activeChip, setActiveChip] = useState<string>('order');
  const [chatOpen, setChatOpen] = useState<boolean>(true);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [supportWhatsApp, setSupportWhatsApp] = useState('917042523611');
  const [supportPhone, setSupportPhone] = useState('+917042523611');
  const [supportTemplate, setSupportTemplate] = useState('Hi! I need help with Taliyo Marketplace services.');
  const chatBoxRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const sp = new URLSearchParams(window.location.search);
      const orderId = sp.get('orderId');
      const title = sp.get('title');
      if (orderId) {
        setChatOpen(true);
        setActiveChip('order');
        setMessages([
          {
            id: 'order-greeting',
            sender: 'bot',
            text: `Hello! I see you need assistance with Order ${orderId}${title ? ` ("${title}")` : ''}. How can we help you with this project today?`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            actions: [
              {
                label: 'View Milestone Tracker',
                href: `/orders/${orderId.replace(/^#TLY/i, '')}`,
              },
            ],
            followUps: [
              `What is the current delivery status of ${orderId}?`,
              `Request revision or update on ${orderId}`,
              `Connect with assigned engineer on WhatsApp`,
            ],
          },
        ]);
      }
    } catch (e) {
      console.warn('Notice reading order query params:', e);
    }
  }, []);

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data: authData }) => {
        if (authData?.user) {
          setUserId(authData.user.id);
          setUserEmail(authData.user.email || null);
        }
      })
      .catch(() => {});

    return subscribeSmartFetch<{ settings?: Record<string, string> }>(
      '/api/site-settings',
      'settings',
      (json) => {
        const s = json?.settings || {};
        if (s.support_whatsapp) setSupportWhatsApp(String(s.support_whatsapp).replace(/\D/g, '') || '917042523611');
        if (s.support_phone) setSupportPhone(s.support_phone);
        if (s.support_whatsapp_message_template) setSupportTemplate(s.support_whatsapp_message_template);
      },
    );
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [messages, isSending]);

  const currentChipObj = QUICK_CHIPS.find((c) => c.id === activeChip) || QUICK_CHIPS[0];
  const whatsappUrl = `https://wa.me/${supportWhatsApp}?text=${encodeURIComponent(
    `${supportTemplate} (Topic: ${currentChipObj.label})`,
  )}`;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  const openChatPanel = () => {
    setChatOpen(true);
    setTimeout(() => {
      chatBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const sendSupportQuery = async (customText?: string) => {
    const query = (customText ?? inputText).trim();
    if (!query || isSending) return;

    setChatOpen(true);
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: SupportMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: nowTime,
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customText) setInputText('');
    setIsSending(true);

    try {
      const authHeaders = await getAuthHeaders();
      const deviceId =
        typeof window !== 'undefined' ? localStorage.getItem('pwa_device_id') || 'web-support' : 'web-support';
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          message: query,
          topic: currentChipObj.label,
          conversationId,
          deviceId,
          userId,
          email: userEmail,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Support busy');
      }
      if (data.conversationId) {
        setConversationId(String(data.conversationId));
      }

      const botMsg: SupportMessage = {
        id: `b-${Date.now()}`,
        sender: 'bot',
        text: data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        escalateToWhatsApp: Boolean(data.escalateToWhatsApp),
        whatsappUrl: data.whatsappUrl || whatsappUrl,
        actions: Array.isArray(data.actions) ? data.actions : undefined,
        orders: Array.isArray(data.orders) ? data.orders : undefined,
        services: Array.isArray(data.services) ? data.services : undefined,
        followUps: Array.isArray(data.followUps) ? data.followUps : undefined,
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      const fallbackWa = `https://wa.me/${supportWhatsApp}?text=${encodeURIComponent(
        `Hi Taliyo Support Team,\nTopic: ${currentChipObj.label}\nQuery: ${query}`,
      )}`;
      setMessages((prev) => [
        ...prev,
        {
          id: `b-err-${Date.now()}`,
          sender: 'bot',
          text: 'Direct instant lookup hit a snag — tap WhatsApp below and your message will open pre-filled for our support team!',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          escalateToWhatsApp: true,
          whatsappUrl: fallbackWa,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07070d] text-white flex flex-col items-center">
      <div className="w-full max-w-xl min-h-screen flex flex-col bg-[#07070d] relative shadow-2xl">
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
              <h1 className="text-base sm:text-lg font-black text-white tracking-tight leading-none flex items-center gap-1.5">
                <span>Customer Support</span>
              </h1>
              <p className="text-[10px] text-purple-200/60 font-medium leading-tight mt-0.5">
                Instant answers + direct WhatsApp escalation
              </p>
            </div>
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

        {/* Glassmorphic Toast */}
        {toastMessage && (
          <div className="fixed top-16 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
            <div className="bg-[#0b0d1e]/90 backdrop-blur-xl border border-emerald-500/20 text-emerald-200 text-xs font-medium px-3.5 py-1.5 rounded-full shadow-lg flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="leading-tight">{toastMessage}</span>
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 px-4 pt-3 space-y-4 pb-28">
          {/* Top Hero Banner */}
          <div className="relative rounded-[24px] bg-gradient-to-r from-[#1c0d3a] via-[#140a28] to-[#2c0e4c] border border-purple-500/25 p-4 shadow-xl overflow-hidden">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-900/60 border border-purple-400/30 text-purple-200 text-[10px] font-bold mb-2">
              <Headphones className="w-3 h-3 text-fuchsia-400" />
              <span>Taliyo Support Desk</span>
              <span className="text-gray-400">• Instant + WhatsApp</span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 pr-1">
                <h2 className="text-sm sm:text-base font-extrabold text-white tracking-tight leading-snug">
                  How can we help you
                  <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 via-pink-400 to-purple-300">
                    today?
                  </span>
                </h2>
                <p className="mt-1 text-[11px] text-purple-200/70 leading-relaxed line-clamp-2">
                  Instant order status, coupons, UPI & pricing checks — complex issues go straight to WhatsApp.
                </p>
              </div>

              <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0 rounded-3xl bg-gradient-to-br from-purple-600 via-fuchsia-600 to-pink-500 p-0.5 shadow-xl shadow-fuchsia-950/60 flex items-center justify-center">
                <div className="w-full h-full bg-[#140a2d] rounded-[22px] flex items-center justify-center">
                  <Headphones className="w-8 h-8 sm:w-10 sm:h-10 text-fuchsia-400 drop-shadow-[0_0_12px_rgba(217,70,239,0.8)]" />
                </div>
              </div>
            </div>
          </div>

          {/* Quick Help Category Chips */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {QUICK_CHIPS.map((chip) => {
              const isActive = activeChip === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => {
                    setActiveChip(chip.id);
                    setChatOpen(true);
                    showToast(`Topic: ${chip.label}`);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all shadow-sm active:scale-95 cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-[0_0_15px_rgba(217,70,239,0.4)]'
                      : 'bg-[#121326] text-gray-300 hover:text-white border border-purple-500/20'
                  }`}
                >
                  {chip.icon}
                  <span>{chip.label}</span>
                </button>
              );
            })}
          </div>

          {/* Interactive Smart Support Desk (Zero External API Key Needed) */}
          <section
            ref={chatBoxRef}
            className="rounded-[24px] bg-[#101124]/95 border border-purple-500/25 shadow-xl overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setChatOpen((v) => !v)}
              className="w-full px-4 py-3 flex items-center justify-between border-b border-purple-500/15 bg-[#151633]/80 cursor-pointer"
            >
              <div className="flex items-center gap-2.5 text-left">
                <div className="w-9 h-9 rounded-xl bg-[#221045] border border-purple-500/30 flex items-center justify-center text-fuchsia-400">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                    <span>Help Desk Chat</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[9px] font-bold">
                      LIVE
                    </span>
                  </h3>
                  <p className="text-[10px] text-purple-200/60">
                    {currentChipObj.label} • Unresolved queries escalate directly to WhatsApp
                  </p>
                </div>
              </div>
              {chatOpen ? (
                <ChevronUp className="w-4 h-4 text-purple-300" />
              ) : (
                <ChevronDown className="w-4 h-4 text-purple-300" />
              )}
            </button>

            {chatOpen && (
              <div className="p-3.5 space-y-3">
                {/* Topic Starter Prompts */}
                <div className="flex flex-wrap gap-1.5">
                  {currentChipObj.prompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => sendSupportQuery(prompt)}
                      className="px-2.5 py-1.5 rounded-xl bg-[#181a38] border border-purple-500/25 hover:border-fuchsia-400/50 text-[11px] font-medium text-purple-100 transition-all cursor-pointer active:scale-95"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>

                {/* Conversation Thread */}
                {messages.length > 0 && (
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-1 pt-1">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                      >
                        {msg.sender === 'user' ? (
                          <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-gradient-to-r from-[#2c1559] to-[#3f1875] border border-purple-400/30 px-3.5 py-2.5 text-xs text-white leading-relaxed">
                            <p>{msg.text}</p>
                            <span className="block text-right text-[9px] text-purple-200/60 mt-1">
                              {msg.timestamp}
                            </span>
                          </div>
                        ) : (
                          <div className="max-w-[95%] w-full rounded-2xl rounded-tl-sm bg-[#161733] border border-purple-500/25 p-3.5 space-y-2.5">
                            <p className="text-xs text-purple-100 whitespace-pre-line leading-relaxed">
                              {msg.text}
                            </p>

                            {/* Matched Orders */}
                            {msg.orders && msg.orders.length > 0 && (
                              <div className="space-y-1.5 pt-1">
                                {msg.orders.map((ord) => (
                                  <Link
                                    key={ord.id}
                                    href={`/orders/${ord.id}`}
                                    className="flex items-center justify-between p-2.5 rounded-xl bg-[#0e1024] border border-purple-500/25 hover:border-purple-400 transition-all"
                                  >
                                    <div className="min-w-0 pr-2">
                                      <p className="text-[11px] font-bold text-white truncate">
                                        #{ord.shortId} • {ord.title}
                                      </p>
                                      <p className="text-[10px] text-purple-200/70">
                                        Status: <span className="uppercase font-bold text-fuchsia-300">{ord.status}</span>
                                        {ord.amount > 0 ? ` • ₹${ord.amount.toLocaleString('en-IN')}` : ''}
                                      </p>
                                    </div>
                                    <ArrowRight className="w-3.5 h-3.5 text-purple-300 shrink-0" />
                                  </Link>
                                ))}
                              </div>
                            )}

                            {/* Matched Services */}
                            {msg.services && msg.services.length > 0 && (
                              <div className="space-y-1.5 pt-1">
                                {msg.services.map((svc) => (
                                  <Link
                                    key={svc.id}
                                    href={`/services/${svc.slug || svc.id}`}
                                    className="flex items-center justify-between p-2.5 rounded-xl bg-[#0e1024] border border-purple-500/25 hover:border-fuchsia-400 transition-all"
                                  >
                                    <div className="min-w-0 pr-2">
                                      <p className="text-[11px] font-bold text-white truncate">{svc.title}</p>
                                      <p className="text-[10px] text-emerald-300 font-semibold">
                                        From ₹{svc.priceMin.toLocaleString('en-IN')}
                                        {svc.delivery ? ` • ${svc.delivery}` : ''}
                                      </p>
                                    </div>
                                    <ArrowRight className="w-3.5 h-3.5 text-purple-300 shrink-0" />
                                  </Link>
                                ))}
                              </div>
                            )}

                            {/* Action Pills */}
                            {(msg.actions?.length || msg.whatsappUrl) && (
                              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                {msg.actions?.map((act) => (
                                  <Link
                                    key={act.href + act.label}
                                    href={act.href}
                                    className="px-2.5 py-1 rounded-lg bg-[#221a46] border border-purple-400/30 text-[10px] font-bold text-purple-100 hover:bg-purple-700/40 transition-all"
                                  >
                                    {act.label} →
                                  </Link>
                                ))}

                                {msg.whatsappUrl && (
                                  <a
                                    href={msg.whatsappUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                                      msg.escalateToWhatsApp
                                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-950/60'
                                        : 'bg-emerald-950/70 border border-emerald-500/35 text-emerald-300 hover:bg-emerald-900/60'
                                    }`}
                                  >
                                    <MessageCircle className="w-3 h-3" />
                                    <span>
                                      {msg.escalateToWhatsApp ? 'Continue on WhatsApp' : 'Ask on WhatsApp'}
                                    </span>
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                              </div>
                            )}

                            {/* Suggested Follow-Ups */}
                            {msg.followUps && msg.followUps.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-1 border-t border-purple-500/15">
                                {msg.followUps.map((f) => (
                                  <button
                                    key={f}
                                    type="button"
                                    onClick={() => sendSupportQuery(f)}
                                    className="px-2 py-1 rounded-md bg-[#111228] text-[10px] text-purple-200/80 hover:text-white border border-purple-500/20 cursor-pointer"
                                  >
                                    {f}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    {isSending && (
                      <div className="text-[11px] text-purple-300/80 px-2 py-1">Checking live info...</div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                )}

                {/* Input Bar */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendSupportQuery();
                  }}
                  className="flex items-center gap-2 rounded-2xl bg-[#0a0b18] border border-purple-500/30 px-3 py-1.5"
                >
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Ask order status, coupons, UPI, pricing..."
                    className="flex-1 bg-transparent text-xs text-white placeholder-gray-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!inputText.trim() || isSending}
                    aria-label="Send Support Question"
                    className="w-8 h-8 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 disabled:opacity-40 flex items-center justify-center text-white cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            )}
          </section>

          {/* Direct Channels Section */}
          <div className="space-y-2.5">
            <h3 className="text-sm font-bold text-white tracking-tight px-1">
              Direct Channels
            </h3>

            {/* Card 1: WhatsApp Support */}
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex items-center justify-between p-3.5 rounded-[22px] bg-gradient-to-r from-[#121226]/95 via-[#161630]/95 to-[#1c183b]/95 border border-purple-500/20 hover:border-emerald-400/50 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[#0d2a1d] border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white">
                    WhatsApp Support
                  </h4>
                  <p className="text-[11px] text-purple-200/60 leading-tight mt-0.5">
                    Direct chat on WhatsApp ({formatPhoneReadable(supportWhatsApp)})
                  </p>
                </div>
              </div>

              <div className="w-8 h-8 rounded-full bg-[#1e1c3b] border border-purple-500/30 flex items-center justify-center text-gray-300 flex-shrink-0 ml-2">
                <ArrowRight className="w-4 h-4" />
              </div>
            </a>

            {/* Card 2: Talk to Support Team */}
            <a
              href={`tel:${supportPhone}`}
              className="group relative flex items-center justify-between p-3.5 rounded-[22px] bg-gradient-to-r from-[#121226]/95 via-[#161630]/95 to-[#1c183b]/95 border border-purple-500/20 hover:border-cyan-400/50 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[#0e243b] border border-cyan-500/30 flex items-center justify-center text-cyan-400 flex-shrink-0">
                  <Headphones className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white">
                    Talk to Support Team
                  </h4>
                  <p className="text-[11px] text-purple-200/60 leading-tight mt-0.5">
                    Call {formatPhoneReadable(supportPhone)} directly
                  </p>
                </div>
              </div>

              <div className="w-8 h-8 rounded-full bg-[#1e1c3b] border border-purple-500/30 flex items-center justify-center text-gray-300 flex-shrink-0 ml-2">
                <Phone className="w-4 h-4 text-cyan-300" />
              </div>
            </a>
          </div>

          {/* Browse Help Topics */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-bold text-white tracking-tight">
                Browse Help Topics
              </h3>
              <Link
                href="/help"
                className="text-[11px] font-bold text-purple-300 hover:text-white transition-colors"
              >
                View FAQs
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {HELP_TOPICS.map((topic) => (
                <Link
                  key={topic.id}
                  href={topic.href}
                  className="p-3.5 rounded-[20px] bg-[#121326]/95 border border-purple-500/20 hover:border-purple-400/40 hover:bg-[#181935] transition-all cursor-pointer flex flex-col justify-between h-24 shadow-md group"
                >
                  <div className="flex items-center justify-between">
                    <div className="p-2 rounded-xl bg-[#1b1035] border border-purple-500/30">
                      {topic.icon}
                    </div>
                    <span className="text-[9px] font-bold text-purple-300/80 bg-purple-950/60 px-1.5 py-0.5 rounded-md border border-purple-500/20">
                      {topic.badge}
                    </span>
                  </div>

                  <span className="text-xs font-bold text-white group-hover:text-purple-300 transition-colors">
                    {topic.title}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* Support Hours */}
          <div className="rounded-[20px] bg-[#121326]/95 border border-purple-500/20 p-3.5 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-900/40 border border-purple-400/30 flex items-center justify-center text-purple-200 flex-shrink-0">
                <Clock className="w-4 h-4 text-fuchsia-400" />
              </div>
              <div>
                <span className="text-xs font-bold text-white block leading-tight">
                  Our Support Hours
                </span>
                <span className="text-[10px] text-gray-400 block mt-0.5">
                  Mon - Sat, 10:00 AM - 7:00 PM (IST)
                </span>
              </div>
            </div>

            {isSupportCurrentlyOnline() ? (
              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Online Now</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-950/70 border border-amber-500/40 text-amber-300 text-[10px] font-bold shadow-sm">
                <span>Leave Message</span>
              </div>
            )}
          </div>
        </main>

        <BottomNav />
      </div>
    </div>
  );
}
