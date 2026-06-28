export interface RateLimitResult {
  limited: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}

export interface RateLimiter {
  isRateLimited(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

class InMemorySlidingWindowLimiter implements RateLimiter {
  private store = new Map<string, number[]>();

  constructor() {
    // Periodically clean up expired entries to prevent memory leaks
    if (typeof setInterval !== "undefined") {
      const interval = setInterval(() => {
        const now = Date.now();
        for (const [key, timestamps] of this.store.entries()) {
          // Keep timestamps within the last 1 hour max for cleanup
          const activeTimestamps = timestamps.filter((ts) => ts > now - 3600000);
          if (activeTimestamps.length === 0) {
            this.store.delete(key);
          } else {
            this.store.set(key, activeTimestamps);
          }
        }
      }, 600000); // Every 10 minutes

      // Unref the timer so it doesn't prevent process exit in tests
      if (interval && typeof interval.unref === "function") {
        interval.unref();
      }
    }
  }

  async isRateLimited(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - windowMs;

    let timestamps = this.store.get(key) || [];
    
    // Filter out timestamps outside the sliding window
    timestamps = timestamps.filter((ts) => ts > windowStart);

    const count = timestamps.length;
    let limited = false;
    
    if (count >= limit) {
      limited = true;
      rateLimitHits++;
    } else {
      timestamps.push(now);
      this.store.set(key, timestamps);
    }

    const remaining = Math.max(0, limit - timestamps.length);
    const oldestTimestamp = timestamps[0] || now;
    const resetMs = oldestTimestamp + windowMs;

    return {
      limited,
      limit,
      remaining,
      resetMs,
    };
  }
}

let rateLimitHits = 0;

export function getRateLimitHitsCount(): number {
  return rateLimitHits;
}

export const rateLimiter: RateLimiter = new InMemorySlidingWindowLimiter();
