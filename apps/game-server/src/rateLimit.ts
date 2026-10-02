/** Fixed-window limiter keyed by e.g. IP. In-memory: per process, which is fine for one instance. */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return function allow(key: string, now = Date.now()): boolean {
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      }
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= limit;
  };
}

/** Client IP behind Fly.io's proxy, or any standard proxy. */
export function clientIp(headers: Headers | undefined): string {
  return (
    headers?.get('fly-client-ip') ??
    headers?.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'local'
  );
}
