import { NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { getRedisClient } from '@/lib/redisCache';

export type LimiterName =
  | 'advisor'
  | 'bookings'
  | 'authSignup'
  | 'couponValidate'
  | 'paymentOrder'
  | 'reviewsPost'
  | 'tracking';

interface LimiterPolicy {
  max: number;
  windowLabel: '10 s' | '1 m' | '5 m';
  windowMs: number;
  prefix: string;
}

const POLICIES: Record<LimiterName, LimiterPolicy> = {
  advisor: { max: 20, windowLabel: '1 m', windowMs: 60_000, prefix: 'taliyo:rl:advisor' },
  bookings: { max: 15, windowLabel: '1 m', windowMs: 60_000, prefix: 'taliyo:rl:bookings' },
  authSignup: { max: 10, windowLabel: '5 m', windowMs: 300_000, prefix: 'taliyo:rl:signup' },
  couponValidate: { max: 30, windowLabel: '1 m', windowMs: 60_000, prefix: 'taliyo:rl:coupon' },
  paymentOrder: { max: 15, windowLabel: '1 m', windowMs: 60_000, prefix: 'taliyo:rl:payorder' },
  reviewsPost: { max: 10, windowLabel: '1 m', windowMs: 60_000, prefix: 'taliyo:rl:reviews' },
  tracking: { max: 120, windowLabel: '1 m', windowMs: 60_000, prefix: 'taliyo:rl:track' },
};

const globalForRl = globalThis as typeof globalThis & {
  __taliyoRateLimiters?: Partial<Record<LimiterName, Ratelimit>>;
  __taliyoEphemeralRlCache?: Map<string, number>;
  __taliyoMemoryBuckets?: Map<string, { count: number; resetAt: number }>;
};

const ephemeralCache = (globalForRl.__taliyoEphemeralRlCache ??= new Map<string, number>());
const limiters = (globalForRl.__taliyoRateLimiters ??= {});
const memoryBuckets = (globalForRl.__taliyoMemoryBuckets ??= new Map<string, { count: number; resetAt: number }>());

function getLimiter(name: LimiterName): Ratelimit | null {
  if (limiters[name]) return limiters[name]!;
  const redis = getRedisClient();
  if (!redis) return null;

  const p = POLICIES[name];
  const instance = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(p.max, p.windowLabel),
    prefix: p.prefix,
    ephemeralCache,
    analytics: false,
    timeout: 1500,
  });
  limiters[name] = instance;
  return instance;
}

export function extractClientIp(req: Request): string {
  const fwd = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const realIp = (req.headers.get('x-real-ip') || '').trim();
  return fwd || realIp || 'anonymous';
}

function checkLocalFallback(name: LimiterName, key: string): {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
} {
  const policy = POLICIES[name];
  const now = Date.now();
  const bucketKey = `${name}:${key}`;
  const current = memoryBuckets.get(bucketKey);

  if (!current || now > current.resetAt) {
    const resetAt = now + policy.windowMs;
    if (memoryBuckets.size > 5000) memoryBuckets.clear();
    memoryBuckets.set(bucketKey, { count: 1, resetAt });
    return { success: true, limit: policy.max, remaining: policy.max - 1, reset: resetAt };
  }

  current.count += 1;
  const remaining = Math.max(0, policy.max - current.count);
  return {
    success: current.count <= policy.max,
    limit: policy.max,
    remaining,
    reset: current.resetAt,
  };
}

/**
 * Enforces sliding-window Upstash Redis rate limiting (with ephemeral blocking & local fallback).
 * Returns a 429 NextResponse if limit is exceeded, or null when allowed.
 */
export async function enforceRateLimit(
  req: Request,
  name: LimiterName,
  identifier?: string,
): Promise<NextResponse | null> {
  const ip = extractClientIp(req);
  const key = identifier ? `${ip}:${identifier}` : ip;

  let result: { success: boolean; limit: number; remaining: number; reset: number };
  const rl = getLimiter(name);

  if (rl) {
    try {
      const res = await rl.limit(key, {
        ip: ip === 'anonymous' ? undefined : ip,
        userAgent: req.headers.get('user-agent') || undefined,
      });
      result = {
        success: res.success,
        limit: res.limit,
        remaining: res.remaining,
        reset: res.reset,
      };
    } catch (err) {
      console.warn(`RateLimit Redis notice [${name}], using local fallback:`, err);
      result = checkLocalFallback(name, key);
    }
  } else {
    result = checkLocalFallback(name, key);
  }

  if (!result.success) {
    const retryAfterSec = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
    return NextResponse.json(
      {
        error: 'Too many requests. Please wait a few seconds and try again.',
        retryAfter: retryAfterSec,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSec),
          'X-RateLimit-Limit': String(result.limit),
          'X-RateLimit-Remaining': String(result.remaining),
          'X-RateLimit-Reset': String(result.reset),
        },
      },
    );
  }

  return null;
}
