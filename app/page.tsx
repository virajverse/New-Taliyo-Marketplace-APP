import React from 'react';
import Header from '@/components/Header';
import HeroBanner, { type ApiBannerInput } from '@/components/HeroBanner';
import SearchBar from '@/components/SearchBar';
import CategoryGrid, { type CategoryGridInput } from '@/components/CategoryGrid';
import FeaturedServices, { type FeaturedRowInput } from '@/components/FeaturedServices';
import AiAdvisorCard from '@/components/AiAdvisorCard';
import BottomNav from '@/components/BottomNav';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let initialBanners: ApiBannerInput[] = [];
  let initialCategories: CategoryGridInput[] = [];
  let initialServices: FeaturedRowInput[] = [];

  try {
    const [bannersRes, categoriesRes, servicesRes] = await Promise.all([
      supabaseAdmin
        .from('banners')
        .select('id, image_url, cta_text, cta_url, alt_text')
        .eq('active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(10),
      supabaseAdmin
        .from('categories')
        .select('id, name, slug')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .limit(7),
      supabaseAdmin
        .from('services')
        .select('id, title, price_min, rating_average, rating_count, images, provider_name, slug, is_featured, service_plans(price_min)')
        .eq('is_active', true)
        .limit(6),
    ]);

    initialBanners = (bannersRes.data || []) as ApiBannerInput[];
    initialCategories = (categoriesRes.data || []) as CategoryGridInput[];
    initialServices = (servicesRes.data || []) as FeaturedRowInput[];
  } catch {
    // Graceful client SWR fallback if SSR DB fails
  }

  return (
    <div className="min-h-screen bg-[#07070d] text-white flex flex-col items-center">
      {/* Mobile container centered on larger screens */}
      <div className="w-full max-w-xl min-h-screen flex flex-col bg-[#07070d] relative shadow-2xl">
        {/* Top Header */}
        <Header />

        {/* Main Content Area */}
        <main className="flex-1 px-4 pt-4 pb-28 space-y-5">
          {/* Hero Banner */}
          <HeroBanner initialBanners={initialBanners} />

          {/* Search Bar with Voice Mic */}
          <SearchBar />

          {/* Category Grid */}
          <CategoryGrid initialCategories={initialCategories} />

          {/* Featured Services */}
          <FeaturedServices initialServices={initialServices} />

          {/* AI Advisor Card */}
          <AiAdvisorCard />
        </main>

        {/* Bottom Navigation */}
        <BottomNav />
      </div>
    </div>
  );
}
