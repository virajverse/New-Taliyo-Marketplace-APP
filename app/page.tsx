import React from 'react';
import Header from '@/components/Header';
import HeroBanner from '@/components/HeroBanner';
import SearchBar from '@/components/SearchBar';
import CategoryGrid from '@/components/CategoryGrid';
import FeaturedServices from '@/components/FeaturedServices';
import AiAdvisorCard from '@/components/AiAdvisorCard';
import BottomNav from '@/components/BottomNav';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#07070d] text-white flex flex-col items-center">
      {/* Mobile container centered on larger screens */}
      <div className="w-full max-w-xl min-h-screen flex flex-col bg-[#07070d] relative shadow-2xl">
        {/* Top Header */}
        <Header />

        {/* Main Content Area */}
        <main className="flex-1 px-4 pt-4 pb-28 space-y-5">
          {/* Hero Banner */}
          <HeroBanner />

          {/* Search Bar with Voice Mic */}
          <SearchBar />

          {/* Category Grid */}
          <CategoryGrid />

          {/* Featured Services */}
          <FeaturedServices />

          {/* AI Advisor Card */}
          <AiAdvisorCard />
        </main>

        {/* Bottom Navigation */}
        <BottomNav />
      </div>
    </div>
  );
}
