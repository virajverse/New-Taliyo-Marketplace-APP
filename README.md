# Taliyo Marketplace App

Production customer-facing digital services marketplace built with **Next.js 16 (App Router)**, **React 19**, **Tailwind CSS**, **Supabase**, and **Upstash Redis**.

## Features

- **Curated Digital Systems Catalog:** Categories, subcategories, search filters, service packages, ratings, and approved client reviews.
- **Zero-Flicker Versioned Caching:** Server L1 + Upstash Redis (`lib/redisCache.ts`) paired with versioned client SWR (`lib/clientCache.ts`) and `/api/cache/revalidate` webhook sync so admin updates propagate immediately without repeated page loading.
- **Checkout & Coupon Validation Engine:** Multi-step checkout with live UPI QR / deep-link generation, UTR auto-verification, optional Razorpay card fallback, 30% advance calculation, and scoped/scheduled coupon validation (`lib/couponServer.ts`).
- **Installable PWA:** Pre-hydration `beforeinstallprompt` capture (`components/PwaInstallProvider.tsx`), live Service Worker (`public/sw.js`), and web app manifest (`app/manifest.ts`).
- **Customer Portal & AI Advisor:** Authenticated orders & milestone tracking, wishlist sync, notifications, support assistant, and Groq/Gemini project advisor.

## Local Development

```bash
# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local
# Populate Supabase, Upstash Redis, AI, and ADMIN_API_TOKEN values

# Start development server on http://localhost:3002
npm run dev
```

## Scripts

- `npm run dev` — Start local Next.js dev server on port `3002`
- `npm run build` — Create production bundle
- `npm run start` — Serve production build on port `3002`
- `npm run lint` — Run ESLint across `app/`, `components/`, and `lib/`
- `npm run typecheck` — Run strict TypeScript check (`tsc --noEmit`)

## Project Structure

- `app/` — App Router pages, layouts, and API route handlers
- `components/` — Reusable UI and PWA/cache providers
- `lib/` — Server/client caching, Supabase helpers, coupons, rate limiting, and payment configuration
- `public/` — Static assets, app icons, and PWA service worker (`sw.js`)
- `supabase/` — Database schema, seed data, and SQL migrations

## License

See [LICENSE](./LICENSE).
