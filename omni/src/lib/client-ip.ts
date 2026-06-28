/**
 * Resolves the client IP address using a secure, trusted proxy strategy.
 * Priority hierarchy:
 * 1. CF-Connecting-IP (Directly from Cloudflare)
 * 2. X-Real-IP (Typically set/overwritten by Nginx/Caddy)
 * 3. X-Forwarded-For (Parsed from right-to-left based on TRUST_PROXY list)
 *
 * TRUST_PROXY environment variable options:
 * - "true" / "1": Trust X-Forwarded-For leftmost IP address.
 * - Comma-separated list (e.g. "10.0.0.1,10.0.0.2"): Trust proxy chain, skipping specified IPs from the right.
 * - "false" / "0" / undefined: Do not trust X-Forwarded-For, fall back to connection IP.
 */
export function resolveClientIpFromHeaders(headers: Headers): string {
  // 1. Cloudflare Connecting IP (header injected by Cloudflare)
  const cfIp = headers.get("cf-connecting-ip");
  if (cfIp) {
    return cfIp.trim();
  }

  // 2. X-Real-IP (typically set by local reverse proxy like Nginx or Caddy)
  const realIp = headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  // 3. X-Forwarded-For (client, proxy1, proxy2, ...)
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ips = forwardedFor.split(",").map((ip) => ip.trim());
    const trustProxy = process.env.TRUST_PROXY;

    if (trustProxy === "true" || trustProxy === "1") {
      // Trust the leftmost IP (first hop)
      if (ips[0]) return ips[0];
    } else if (trustProxy && trustProxy !== "false" && trustProxy !== "0") {
      const trustedSet = new Set(trustProxy.split(",").map((p) => p.trim()));
      // Walk from right-to-left, skipping trusted proxy hops
      for (let i = ips.length - 1; i >= 0; i--) {
        const ip = ips[i];
        if (ip && !trustedSet.has(ip)) {
          return ip;
        }
      }
      // If all hops are trusted proxies, return the first one
      if (ips[0]) return ips[0];
    }
  }

  return "127.0.0.1";
}

export function resolveClientIp(req: Request): string {
  const ipFromHeaders = resolveClientIpFromHeaders(req.headers);
  if (ipFromHeaders !== "127.0.0.1") {
    return ipFromHeaders;
  }

  // Fallback to connection socket address (set by NextRequest in Next.js middleware)
  const socketIp = (req as { ip?: string }).ip;
  if (socketIp) {
    return socketIp;
  }

  return "127.0.0.1";
}
