import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { env } from "@/env";

export async function GET(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider");
  const projectId = searchParams.get("projectId");

  if (!provider || !projectId || (provider !== "google" && provider !== "microsoft")) {
    return new Response("Bad Request: missing provider or projectId", { status: 400 });
  }

  const csrfNonce = crypto.randomUUID();
  const statePayload = {
    projectId,
    nonce: csrfNonce,
  };
  const state = Buffer.from(JSON.stringify(statePayload)).toString("base64url");

  let authUrl = "";
  if (provider === "google") {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      return new Response("Google OAuth is not configured on the server", { status: 500 });
    }
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: `${env.APP_URL}/api/auth/callback/google`,
      response_type: "code",
      scope: "openid email https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly",
      access_type: "offline",
      prompt: "consent",
      state,
    });
    authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  } else {
    if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
      return new Response("Microsoft OAuth is not configured on the server", { status: 500 });
    }
    const params = new URLSearchParams({
      client_id: env.MICROSOFT_CLIENT_ID,
      redirect_uri: `${env.APP_URL}/api/auth/callback/microsoft`,
      response_type: "code",
      scope: "openid email offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.Read",
      state,
    });
    authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  }

  const response = NextResponse.redirect(authUrl);
  // Store CSRF nonce in cookie
  response.cookies.set("omni_oauth_csrf", csrfNonce, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  return response;
}
