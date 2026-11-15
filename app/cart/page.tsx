'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Trash2,
  Minus,
  Plus,
  Clock,
  Info,
  ShieldCheck,
  ArrowRight,
  ShoppingBag,
} from 'lucide-react';
import BottomNav from '@/components/BottomNav';

interface CartItem {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  packageName: string;
  deliveryDays: number;
  price: number;
  quantity: number;
  imageSrc: string;
}

export default function CartPage() {
  const router = useRouter();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showFeeInfo, setShowFeeInfo] = useState(false);

  // Load real items from persistent client storage
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('taliyo_cart');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setCartItems(parsed);
          }
        }
      }
    } catch (e) {
      console.warn('Cart load error:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateCartStorage = (newItems: CartItem[]) => {
    setCartItems(newItems);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('taliyo_cart', JSON.stringify(newItems));
        window.dispatchEvent(new Event('taliyo_cart_updated'));
      }
    } catch {}
  };

  // Update item quantity
  const handleUpdateQuantity = (id: string, delta: number) => {
    const updated = cartItems
      .map((item) => {
        if (item.id === id) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        }
        return item;
      })
      .filter((item): item is CartItem => item !== null);
    updateCartStorage(updated);
  };

  // Delete single item
  const handleRemoveItem = (id: string) => {
    const updated = cartItems.filter((item) => item.id !== id);
    updateCartStorage(updated);
  };

  // Clear entire cart
  const handleClearCart = () => {
    updateCartStorage([]);
    setShowClearConfirm(false);
  };

  // Dynamic calculations
  const totalItemsCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);
  const subtotal = cartItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const totalAmount = subtotal; // Platform fee is free (waived)

  const handleProceedToOrder = () => {
    router.push('/checkout');
  };

  return (
    <div className="min-h-screen bg-[#07070d] text-white flex flex-col items-center">
      <div className="w-full max-w-xl min-h-screen flex flex-col bg-[#07070d] relative shadow-2xl">
        {/* Sticky Top Header */}
        <header className="sticky top-0 z-40 w-full bg-[#07070d]/90 backdrop-blur-xl border-b border-purple-500/10 px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Go Back"
              className="w-9 h-9 rounded-full bg-[#121326] border border-purple-500/20 flex items-center justify-center text-gray-300 hover:text-white hover:border-purple-400 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-lg font-black text-white tracking-tight leading-none">
                Cart
              </h1>
              <p className="text-[11px] text-purple-200/60 font-medium leading-tight mt-0.5">
                Review your selected services
              </p>
            </div>
          </div>

          {/* Right Action: Clear Cart */}
          {cartItems.length > 0 && (
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              aria-label="Clear All Items"
              title="Clear Cart"
              className="px-3 py-1.5 rounded-full bg-[#121326] border border-purple-500/20 flex items-center gap-1.5 text-xs font-bold text-gray-300 hover:text-rose-400 hover:border-rose-500/40 hover:bg-rose-950/20 transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
        </header>

        {/* Clear Cart Confirmation Modal */}
        {showClearConfirm && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-3xl bg-[#121326] border border-purple-500/30 p-5 space-y-4 shadow-2xl text-center">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-white">Clear Shopping Cart?</h3>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Are you sure you want to remove all {cartItems.length} selected service{cartItems.length === 1 ? '' : 's'} from your cart?
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  className="py-2.5 rounded-xl bg-[#1b1c36] border border-purple-500/20 text-xs font-bold text-gray-300 hover:text-white cursor-pointer"
                >
                  Keep Items
                </button>
                <button
                  type="button"
                  onClick={handleClearCart}
                  className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white shadow-lg shadow-rose-950/50 cursor-pointer"
                >
                  Yes, Clear All
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Cart Body */}
        <main className="flex-1 px-4 pt-3 space-y-4 pb-28">
          {isLoading ? (
            /* Cart Skeleton Loader */
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="p-3.5 rounded-[22px] bg-gradient-to-r from-[#121226]/80 via-[#161630]/80 to-[#1c183b]/80 border border-purple-500/15 animate-pulse flex gap-3 overflow-hidden shadow-lg"
                >
                  <div className="w-20 h-20 rounded-2xl bg-purple-900/30 border border-purple-500/20 shrink-0" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-4 bg-purple-800/40 rounded-md w-3/4" />
                    <div className="h-3 bg-purple-900/20 rounded-md w-1/2" />
                    <div className="h-3.5 bg-purple-900/30 rounded-md w-1/3 mt-2" />
                  </div>
                </div>
              ))}
            </div>
          ) : cartItems.length === 0 ? (
            /* Empty Cart State */
            <div className="flex flex-col items-center justify-center py-20 text-center px-4">
              <div className="w-20 h-20 rounded-3xl bg-purple-900/20 border border-purple-500/30 flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(168,85,247,0.2)]">
                <ShoppingBag className="w-10 h-10 text-fuchsia-400" />
              </div>
              <h2 className="text-base font-bold text-white">Your Cart is Empty</h2>
              <p className="text-xs text-purple-200/60 mt-1 max-w-xs leading-relaxed">
                Explore our catalog of websites, mobile apps, and automation services to get started.
              </p>
              <Link
                href="/categories"
                className="mt-5 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-500 text-white text-xs font-bold shadow-lg shadow-purple-900/40 hover:opacity-95 transition-all"
              >
                <span>Browse Services</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <>
              {/* Cart Items List */}
              <div className="space-y-3">
                {cartItems.map((item) => (
                  <div
                    key={item.id}
                    className="relative p-3.5 rounded-[22px] bg-gradient-to-r from-[#121226]/95 via-[#161630]/95 to-[#1c183b]/95 border border-purple-500/20 shadow-md hover:border-purple-400/40 transition-all flex gap-3 overflow-hidden"
                  >
                    {/* Left Thumbnail 3D Illustration */}
                    <div className="relative w-20 h-20 rounded-2xl bg-[#1b1035] border border-purple-500/25 p-1 flex-shrink-0 flex items-center justify-center overflow-hidden">
                      <Image
                        src={item.imageSrc}
                        alt={item.title}
                        width={80}
                        height={80}
                        className="w-full h-full object-contain"
                      />
                    </div>

                    {/* Middle Details & Right Actions */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      {/* Top Row: Title & Price */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            href={`/services/${item.slug}`}
                            className="text-xs sm:text-sm font-bold text-white hover:text-purple-300 transition-colors line-clamp-2 leading-snug"
                          >
                            {item.title}
                          </Link>
                          <span className="text-[10px] text-gray-400 block mt-0.5">
                            {item.subtitle}
                          </span>
                        </div>

                        {/* Price */}
                        <div className="text-right flex-shrink-0">
                          <span className="text-sm font-black text-white">
                            ₹{(item.price * item.quantity).toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>

                      {/* Middle Metadata: Package & Delivery */}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="inline-block px-2 py-0.5 rounded-full bg-purple-900/40 border border-purple-400/25 text-[10px] font-semibold text-purple-200">
                          Package: {item.packageName}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                          <Clock className="w-3 h-3 text-fuchsia-400" />
                          <span>Delivery: {item.deliveryDays} Days</span>
                        </span>
                      </div>

                      {/* Bottom Row: Change Plan & Remove Button */}
                      <div className="mt-2.5 flex items-center justify-between gap-3 pt-1.5 border-t border-purple-500/10">
                        <Link
                          href={`/services/${item.slug}`}
                          className="text-[11px] font-bold text-purple-300 hover:text-fuchsia-300 transition-colors"
                        >
                          Change Plan →
                        </Link>

                        {/* Trash Delete Button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          aria-label={`Remove ${item.title}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#121326] border border-purple-500/20 text-[11px] font-semibold text-gray-400 hover:text-rose-400 hover:border-rose-500/40 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Order Summary Card */}
              <div className="rounded-[24px] bg-[#111226]/90 border border-purple-500/20 p-4 sm:p-5 shadow-xl space-y-3.5">
                <h2 className="text-sm font-bold text-white tracking-tight">
                  Order Summary
                </h2>

                <div className="space-y-2 text-xs">
                  {/* Subtotal */}
                  <div className="flex items-center justify-between text-gray-300">
                    <span>Subtotal ({totalItemsCount} {totalItemsCount === 1 ? 'Item' : 'Items'})</span>
                    <span className="font-bold text-white">
                      ₹{subtotal.toLocaleString('en-IN')}
                    </span>
                  </div>

                  {/* Platform & IP Protection Fee */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-gray-300">
                      <button
                        type="button"
                        onClick={() => setShowFeeInfo((prev) => !prev)}
                        className="inline-flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
                      >
                        <span>Platform &amp; IP Protection Fee</span>
                        <Info className="w-3.5 h-3.5 text-purple-400" />
                      </button>
                      <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                        Free (Waived)
                      </span>
                    </div>
                    {showFeeInfo && (
                      <p className="p-2.5 rounded-xl bg-[#161836] border border-purple-500/25 text-[11px] text-purple-200/80 leading-relaxed">
                        Includes 100% source code ownership transfer, milestone verification, and zero platform commission fee.
                      </p>
                    )}
                  </div>

                  {/* Divider */}
                  <div className="border-t border-purple-500/15 pt-2 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white block">Total Amount</span>
                      <span className="text-[10px] text-gray-400 block mt-0.5">All taxes & deployment included</span>
                    </div>
                    <span className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-purple-100 to-fuchsia-300">
                      ₹{totalAmount.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Proceed to Order CTA Button */}
                <button
                  type="button"
                  onClick={handleProceedToOrder}
                  className="w-full mt-2 py-3 rounded-full bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-500 text-white font-extrabold text-xs sm:text-sm shadow-[0_0_25px_rgba(217,70,239,0.5)] hover:opacity-95 hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Proceed to Order</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}
        </main>

        {/* Floating Bottom Navigation */}
        <BottomNav />
      </div>
    </div>
  );
}
