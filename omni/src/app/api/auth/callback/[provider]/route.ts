import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { env } from "@/env";
import { sealToString, openFromString } from "@/lib/crypto/envelope";
import * as mailboxRepo from "@/core/mailboxes/mailbox.repository";
import { auth } from "@/lib/auth";
import { requireProject } from "@/core/projects/project.service";

import { withLogging, logStorage, logger } from "@/lib/logger";
import { trace } from "@/lib/tracing";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
): Promise<Response> {
  return withLogging(request, async () => {
    return trace("api.auth.callback", async () => {
    const { provider } = await params;
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

  const cookieStore = await cookies();
  const csrfCookie = cookieStore.get("omni_oauth_csrf")?.value;

  if (error) {
    return new Response(`OAuth Error: ${error}`, { status: 400 });
  }

  if (!code || !state || !csrfCookie) {
    return new Response("Missing code, state, or session token", { status: 400 });
  }

  let statePayload: { projectId: string; nonce: string };
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf-8");
    statePayload = JSON.parse(decoded);
  } catch {
    return new Response("Invalid state parameter format", { status: 400 });
  }

  if (statePayload.nonce !== csrfCookie) {
    return new Response("CSRF validation failed", { status: 400 });
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { projectId } = statePayload;

  const store = logStorage.getStore();
  if (store) {
    store.userId = session.user.id;
    store.projectId = projectId;
  }

  try {
    await requireProject(projectId, session.user.id);
  } catch (err) {
    const error = err as { code?: string };
    if (error.code === "not_found") {
      return new Response("Project not found", { status: 404 });
    }
    return new Response("Forbidden", { status: 403 });
  }


  let email = "";
  let credentialsStr = "";
  let expiresAt: Date | undefined;

  try {
    if (provider === "google") {
      // Exchange code for Google token
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID || "",
          client_secret: env.GOOGLE_CLIENT_SECRET || "",
          redirect_uri: `${env.APP_URL}/api/auth/callback/google`,
          grant_type: "authorization_code",
        }).toString(),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        throw new Error(`Google token exchange failed: ${err}`);
      }

      const tokenData = await tokenRes.json();
      
      // Fetch user profile email
      const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!profileRes.ok) {
        throw new Error("Failed to retrieve Google profile info");
      }

      const profileData = await profileRes.json();
      email = profileData.email;

      credentialsStr = sealToString(
        JSON.stringify({
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
        })
      );
      expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
    } else if (provider === "microsoft") {
      // Exchange code for Microsoft Graph token
      const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: env.MICROSOFT_CLIENT_ID || "",
          client_secret: env.MICROSOFT_CLIENT_SECRET || "",
          redirect_uri: `${env.APP_URL}/api/auth/callback/microsoft`,
          grant_type: "authorization_code",
        }).toString(),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        throw new Error(`Microsoft token exchange failed: ${err}`);
      }

      const tokenData = await tokenRes.json();

      // Fetch Microsoft user profile
      const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!profileRes.ok) {
        throw new Error("Failed to retrieve Microsoft profile info");
      }

      const profileData = await profileRes.json();
      email = profileData.mail || profileData.userPrincipalName;

      credentialsStr = sealToString(
        JSON.stringify({
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
        })
      );
      expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
    } else {
      return new Response("Unknown provider", { status: 400 });
    }

    // Connect mailbox to DB
    const existing = await mailboxRepo.findByEmail(projectId, email);
    if (existing) {
      // Keep existing refresh token if new one is not returned in callback (Google sometimes skips it if already consented)
      const parsedExisting = JSON.parse(openFromString(existing.credentials));
      const parsedNew = JSON.parse(openFromString(credentialsStr));
      
      const mergedCredentials = {
        accessToken: parsedNew.accessToken,
        refreshToken: parsedNew.refreshToken || parsedExisting.refreshToken,
      };

      await mailboxRepo.update(existing.id, {
        credentials: sealToString(JSON.stringify(mergedCredentials)),
        tokenExpiresAt: expiresAt,
        status: "active",
      });
    } else {
      await mailboxRepo.create({
        projectId,
        email,
        provider: provider as "gmail" | "outlook",
        credentials: credentialsStr,
        tokenExpiresAt: expiresAt,
      });
    }
  } catch (err) {
    logger.error("OAuth Callback Error", err);
    return new Response(err instanceof Error ? err.message : "Authentication failed", { status: 500 });
  }

  // Redirect client back to the project cockpit mailboxes page
  const response = NextResponse.redirect(`${env.APP_URL}/projects/${projectId}/mailboxes`);
  response.cookies.delete("omni_oauth_csrf");
  return response;
    });
  });
}
