import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { rateLimiter } from "@/lib/rate-limit";

import { resolveClientIp } from "@/lib/client-ip";

/**
 * Optimistic auth gate, Request/Correlation ID propagation, and Sliding-Window Rate Limiting.
 */
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // 1. Sliding-Window Rate Limiting
  let routeType: string | null = null;
  let limit = 0;
  const windowMs = 60000; // 1 minute window

  if (path.startsWith("/api/webhooks")) {
    routeType = "webhook";
    limit = 120;
  } else if (
    path.startsWith("/api/auth") ||
    path.startsWith("/login") ||
    path.startsWith("/register")
  ) {
    routeType = "auth";
    limit = 30;
  } else if (path.startsWith("/unsubscribe")) {
    routeType = "unsubscribe";
    limit = 15;
  }

  if (routeType) {
    const ip = resolveClientIp(request);
    const rateLimitKey = `rl:${routeType}:${ip}`;

    const result = await rateLimiter.isRateLimited(rateLimitKey, limit, windowMs);

    if (result.limited) {
      const response = new NextResponse("Too Many Requests", {
        status: 429,
        headers: {
          "Content-Type": "text/plain",
          "Retry-After": Math.max(
            1,
            Math.ceil((result.resetMs - Date.now()) / 1000)
          ).toString(),
          "X-RateLimit-Limit": limit.toString(),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": result.resetMs.toString(),
        },
      });
      return response;
    }
  }

  // 2. Request/Correlation ID generation
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const correlationId =
    request.headers.get("x-correlation-id") ||
    request.headers.get("x-request-id") ||
    requestId;

  const isExcluded =
    path.startsWith("/login") ||
    path.startsWith("/register") ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/reset-password") ||
    path.startsWith("/verify-email") ||
    path.startsWith("/api") ||
    path.startsWith("/unsubscribe") ||
    path === "/favicon.ico";

  if (!isExcluded) {
    const sessionCookie = getSessionCookie(request, {
      cookiePrefix: "omni",
    });
    if (!sessionCookie) {
      const url = new URL("/login", request.url);
      url.searchParams.set("redirect", request.nextUrl.pathname);
      const redirectResponse = NextResponse.redirect(url);
      redirectResponse.headers.set("x-request-id", requestId);
      redirectResponse.headers.set("x-correlation-id", correlationId);
      return redirectResponse;
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-correlation-id", correlationId);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set("x-request-id", requestId);
  response.headers.set("x-correlation-id", correlationId);

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
