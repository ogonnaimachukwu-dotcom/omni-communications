import * as suppressions from "@/core/suppressions/suppression.service";

export const runtime = "nodejs";

/**
 * Public, unauthenticated unsubscribe endpoint (the List-Unsubscribe target).
 * POST = RFC 8058 one-click (mail clients). GET = a human clicking the link.
 * Both record a suppression(reason=unsubscribe) and flip the distributor's
 * status. A suppressed address is never resubscribed by a later campaign.
 */

async function unsubscribe(token: string): Promise<boolean> {
  const target = await suppressions.resolveUnsubscribeToken(token);
  if (!target) return false;
  await suppressions.suppress(target.projectId, { email: target.email, reason: "unsubscribe", source: "one_click" });
  return true;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  await unsubscribe(token); // always 200 for one-click, even if already removed
  return new Response(null, { status: 200 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const ok = await unsubscribe(token);
  const message = ok
    ? "You've been unsubscribed. You won't receive further emails from this sender."
    : "This unsubscribe link is invalid or has expired.";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title></head><body style="font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:0 24px;color:#111"><h1 style="font-size:20px">${ok ? "Unsubscribed" : "Link not found"}</h1><p style="color:#555;line-height:1.5">${message}</p></body></html>`;
  return new Response(html, {
    status: ok ? 200 : 404,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
