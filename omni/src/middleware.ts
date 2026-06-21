import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic auth gate. Presence of a valid session cookie lets the request
 * through; full verification happens in server components / actions against
 * the DB. Webhooks and the public unsubscribe endpoint are intentionally
 * excluded from the matcher below.
 */
export function middleware(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const url = new URL("/login", request.url);
    url.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Protect the operator cockpit. Auth pages, API, webhooks, unsubscribe excluded.
  matcher: [
    "/((?!login|register|api|unsubscribe|_next/static|_next/image|favicon.ico).*)",
  ],
};
