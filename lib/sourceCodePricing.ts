export interface SourceCodeProductSpec {
  slug: string;
  sourceCodeInr: number;
  sourceCodeUsd: number;
  stackLabel: string;
  editionLabel: string;
  routesBadge: string;
  note: string;
}

export const SOURCE_CODE_PRICING_MAP: Record<string, SourceCodeProductSpec> = {
  'taliyo-ai-agent-studio': {
    slug: 'taliyo-ai-agent-studio',
    sourceCodeInr: 5499,
    sourceCodeUsd: 69,
    stackLabel: 'Static HTML5 / CSS / JS SPA',
    editionLabel: 'Static Web Theme',
    routesBadge: '105 UI Screens',
    note: 'Instant static HTML/CSS/JS frontend code handover (no backend setup included).',
  },
  'taliyo-neural-ai-agency': {
    slug: 'taliyo-neural-ai-agency',
    sourceCodeInr: 4499,
    sourceCodeUsd: 55,
    stackLabel: 'React / Next.js + Tailwind UI',
    editionLabel: 'Next.js Theme Sale',
    routesBadge: '18+ Sections & Pages',
    note: 'Instant React/Next.js frontend source code handover (ready to deploy or customize).',
  },
  'taliyo-ai-ops-command-center': {
    slug: 'taliyo-ai-ops-command-center',
    sourceCodeInr: 8999,
    sourceCodeUsd: 109,
    stackLabel: 'Next.js 16 + React 19 + TypeScript',
    editionLabel: 'Next.js Suite Code',
    routesBadge: '51 LLMOps Views',
    note: 'Full 51-route Next.js 16 App Router frontend UI source package (instant handover).',
  },
  'taliyo-glass-commerce-desk': {
    slug: 'taliyo-glass-commerce-desk',
    sourceCodeInr: 3999,
    sourceCodeUsd: 49,
    stackLabel: 'Next.js / React Glassmorphism UI',
    editionLabel: 'Next.js Theme Sale',
    routesBadge: 'D2C Order Desk UI',
    note: 'Instant frontend dashboard & order kanban source code (UI template only).',
  },
  'taliyo-finops-payments-portal': {
    slug: 'taliyo-finops-payments-portal',
    sourceCodeInr: 5499,
    sourceCodeUsd: 69,
    stackLabel: 'Next.js + TypeScript',
    editionLabel: 'Next.js Theme Sale',
    routesBadge: 'FinOps & Risk UI',
    note: 'Instant Next.js + TS frontend code for FinOps payments & payouts UI.',
  },
  'taliyo-audiovisual-motion-lab': {
    slug: 'taliyo-audiovisual-motion-lab',
    sourceCodeInr: 2999,
    sourceCodeUsd: 39,
    stackLabel: 'Static HTML5 + Canvas 2D + WebAudio',
    editionLabel: 'Static Web Theme',
    routesBadge: '60 FPS Motion Lab',
    note: 'Instant static HTML5, Canvas 2D particle engine & WebAudio source code.',
  },
  'taliyo-3d-webgl-showcase': {
    slug: 'taliyo-3d-webgl-showcase',
    sourceCodeInr: 4499,
    sourceCodeUsd: 55,
    stackLabel: 'Three.js + WebGL Shaders + Vite',
    editionLabel: '3D WebGL Theme',
    routesBadge: '3D Orbital Scene',
    note: 'Instant Three.js / Vite frontend source code with custom GLSL shaders.',
  },
  'taliyo-b2b-studio-platform': {
    slug: 'taliyo-b2b-studio-platform',
    sourceCodeInr: 3999,
    sourceCodeUsd: 49,
    stackLabel: 'Static Nuxt / Vue + Tailwind CSS',
    editionLabel: 'Static Web Theme',
    routesBadge: '8+ Studio Pages',
    note: 'Instant static HTML/Nuxt frontend theme with interactive architecture diagrams.',
  },
  'taliyo-enterprise-hospital-erp': {
    slug: 'taliyo-enterprise-hospital-erp',
    sourceCodeInr: 9999,
    sourceCodeUsd: 119,
    stackLabel: 'React 19 + Vite + TypeScript',
    editionLabel: '13-in-1 ERP Source',
    routesBadge: '152 ERP Pages',
    note: 'Full 13-in-1 Hospital ERP & multi-dashboard React 19 UI codebase (instant zip/git).',
  },
  'taliyo-product-design-portal': {
    slug: 'taliyo-product-design-portal',
    sourceCodeInr: 4999,
    sourceCodeUsd: 59,
    stackLabel: 'Next.js / Nuxt Static Export',
    editionLabel: 'Next.js / Static Theme',
    routesBadge: '10 Case-Study Pages',
    note: 'Instant multi-page case-study & design system frontend source code.',
  },
  'taliyo-gamified-story-engine': {
    slug: 'taliyo-gamified-story-engine',
    sourceCodeInr: 3999,
    sourceCodeUsd: 49,
    stackLabel: 'Static HTML5 + SVG Motion + WebAudio',
    editionLabel: 'Static Web Theme',
    routesBadge: '12 Story Scenes',
    note: 'Instant static HTML5/SPA narrative & interactive soundboard source code.',
  },
  'taliyo-kinetic-typography-studio': {
    slug: 'taliyo-kinetic-typography-studio',
    sourceCodeInr: 2999,
    sourceCodeUsd: 39,
    stackLabel: 'Modular JS + Static HTML/CSS',
    editionLabel: 'Static Web Theme',
    routesBadge: '4+ Kinetic Pages',
    note: 'Instant static HTML/JS draggable physics & kinetic typography template.',
  },
  'taliyo-bento-store-suite': {
    slug: 'taliyo-bento-store-suite',
    sourceCodeInr: 4499,
    sourceCodeUsd: 55,
    stackLabel: 'Next.js + TypeScript Bento UI',
    editionLabel: 'Next.js Theme Sale',
    routesBadge: 'Store + Admin UI',
    note: 'Instant Next.js Bento storefront & inventory console frontend code.',
  },
  'taliyo-3d-editorial-magazine': {
    slug: 'taliyo-3d-editorial-magazine',
    sourceCodeInr: 4999,
    sourceCodeUsd: 59,
    stackLabel: 'Three.js / WebGPU + Vite',
    editionLabel: '3D WebGPU Theme',
    routesBadge: '3D Editorial UI',
    note: 'Instant Three.js / WebGPU luxury editorial frontend source code.',
  },
  'taliyo-minimal-motion-showcase': {
    slug: 'taliyo-minimal-motion-showcase',
    sourceCodeInr: 3499,
    sourceCodeUsd: 45,
    stackLabel: 'Nuxt / Next + WebGL Displacement',
    editionLabel: 'WebGL Motion Theme',
    routesBadge: '12 Project Views',
    note: 'Instant minimalist WebGL displacement portfolio frontend source code.',
  },
  'taliyo-php-enterprise-crm': {
    slug: 'taliyo-php-enterprise-crm',
    sourceCodeInr: 7499,
    sourceCodeUsd: 89,
    stackLabel: 'PHP 8.3 MVC + Bootstrap 5',
    editionLabel: 'PHP 8 Source Theme',
    routesBadge: '80 CRM Screens',
    note: 'Instant 80-page PHP 8.3 MVC template & UI views (without custom server wiring).',
  },
  'taliyo-physics-creative-agency': {
    slug: 'taliyo-physics-creative-agency',
    sourceCodeInr: 3499,
    sourceCodeUsd: 45,
    stackLabel: 'Static HTML5 + Matter.js 2D Physics',
    editionLabel: 'Static Web Theme',
    routesBadge: '9+ Physics Pages',
    note: 'Instant static HTML/JS Matter.js gravity physics agency template.',
  },
  'taliyo-react-analytics-suite': {
    slug: 'taliyo-react-analytics-suite',
    sourceCodeInr: 6999,
    sourceCodeUsd: 85,
    stackLabel: 'React 19 + Vite + TypeScript',
    editionLabel: 'React 19 Theme Sale',
    routesBadge: '62 SPA Routes',
    note: 'Instant React 19 + Vite + Bootstrap 5 multi-layout dashboard source code.',
  },
  'taliyo-solar-sales-crm': {
    slug: 'taliyo-solar-sales-crm',
    sourceCodeInr: 5999,
    sourceCodeUsd: 75,
    stackLabel: 'React 19 + Vite + TypeScript',
    editionLabel: 'React 19 Theme Sale',
    routesBadge: '8 CRM Modules',
    note: 'Instant CleanTech Solar CRM & ROI calculator React frontend source code.',
  },
  'taliyo-spatial-3d-cosmos': {
    slug: 'taliyo-spatial-3d-cosmos',
    sourceCodeInr: 5499,
    sourceCodeUsd: 69,
    stackLabel: 'Next.js Export + Three.js Starfield',
    editionLabel: 'Next.js 3D Theme',
    routesBadge: '24 Spatial Pages',
    note: 'Instant 24-page Next.js + Three.js starfield universe frontend source code.',
  },
  'taliyo-accessibility-vision-suite': {
    slug: 'taliyo-accessibility-vision-suite',
    sourceCodeInr: 5499,
    sourceCodeUsd: 69,
    stackLabel: 'Nuxt / WebGL + SVG Matrix Filters',
    editionLabel: 'Static / Nuxt Theme',
    routesBadge: '10+ Simulator Views',
    note: 'Instant optical vision simulator frontend source code & SVG filter matrices.',
  },
};

export function getSourceCodeSpec(slug: string, fallbackStarterInr = 0): SourceCodeProductSpec {
  const normalized = (slug || '').trim().toLowerCase();
  if (SOURCE_CODE_PRICING_MAP[normalized]) {
    return SOURCE_CODE_PRICING_MAP[normalized];
  }
  const computedInr = fallbackStarterInr > 0 ? Math.max(2499, Math.round((fallbackStarterInr * 0.35) / 100) * 100 - 1) : 2999;
  const computedUsd = Math.max(35, Math.round(computedInr / 83));
  return {
    slug: normalized || 'custom-system',
    sourceCodeInr: computedInr,
    sourceCodeUsd: computedUsd,
    stackLabel: 'Static HTML / Next.js / React',
    editionLabel: 'Theme Sale',
    routesBadge: 'Full UI Kit',
    note: 'Instant frontend source code handover (UI template code only, no backend customization).',
  };
}

/**
 * Extracts USD price from a service_plans description or includes array
 * (e.g. "Intl: $179 USD | ..." or "Intl Rate: $179–$259 USD"), or derives a clean USD estimate.
 */
export function extractUsdFromPlan(
  description?: string | null,
  includes?: string[] | null,
  inrPrice = 0,
): { usdMin: number; usdRangeLabel?: string; inrRangeLabel?: string; cleanSubtitle: string } {
  const desc = (description || '').trim();
  const inc0 = Array.isArray(includes) && includes.length > 0 ? String(includes[0] || '') : '';

  let usdMin = 0;
  let usdRangeLabel: string | undefined;
  let inrRangeLabel: string | undefined;

  const intlRangeMatch = inc0.match(/Intl Rate:\s*(\$[0-9,]+(?:[–-]\$[0-9,]+)?\s*USD)/i);
  if (intlRangeMatch) {
    usdRangeLabel = intlRangeMatch[1];
  }
  const inrRangeMatch = inc0.match(/Indian Rate:\s*(₹[0-9,]+(?:[–-]₹[0-9,]+)?\s*INR)/i);
  if (inrRangeMatch) {
    inrRangeLabel = inrRangeMatch[1];
  }

  const descUsdMatch = desc.match(/Intl:\s*\$([0-9,]+)\s*USD/i) || inc0.match(/\$([0-9,]+)/);
  if (descUsdMatch) {
    usdMin = Number(descUsdMatch[1].replace(/,/g, '')) || 0;
  } else if (inrPrice > 0) {
    usdMin = Math.max(19, Math.round(inrPrice / 83));
  }

  const cleanSubtitle = desc.replace(/^Intl:\s*\$[0-9,]+\s*USD\s*\|\s*/i, '').trim();
  return { usdMin, usdRangeLabel, inrRangeLabel, cleanSubtitle };
}
