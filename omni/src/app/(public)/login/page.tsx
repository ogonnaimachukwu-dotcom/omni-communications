"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn, authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, PenSquare, AlertCircle } from "lucide-react";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect") || "/projects";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [showTwoFactor, setShowTwoFactor] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (showTwoFactor) {
        const { error: totpError } = await authClient.twoFactor.verifyTotp({
          code: twoFactorCode,
        });

        if (totpError) {
          setError(totpError.message || "Invalid 2FA code");
          setLoading(false);
          return;
        }

        router.push(redirectUrl);
      } else {
        const { error: signInError, data } = await signIn.email({
          email,
          password,
          callbackURL: redirectUrl,
          fetchOptions: {
            redirect: "manual",
          },
        });

        if (signInError) {
          setError(signInError.message || "Invalid email or password");
          setLoading(false);
          return;
        }

        if (data && (data as { twoFactorRedirect?: boolean }).twoFactorRedirect) {
          setShowTwoFactor(true);
          setLoading(false);
          return;
        }

        router.push(redirectUrl);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="space-y-1 text-center">
        <div className="flex justify-center pb-4">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <PenSquare className="size-6" />
          </div>
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight">Welcome back</CardTitle>
        <CardDescription>
          {showTwoFactor ? "Enter your 2FA security code" : "Enter your credentials to access the operator cockpit"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleLogin} className="space-y-4">
          {searchParams.has("redirect") && !showTwoFactor && !error && (
            <div className="flex items-center gap-2 rounded-md bg-yellow-500/10 p-3 text-sm text-yellow-700 border border-yellow-500/20">
              <AlertCircle className="size-4 shrink-0 text-yellow-700" />
              <span>Your session has expired. Please sign in again to continue.</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!showTwoFactor ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="operator@omni.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="2fa">Authenticator Code</Label>
              <Input
                id="2fa"
                type="text"
                placeholder="000000"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value)}
                maxLength={6}
                required
                autoFocus
              />
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
            {showTwoFactor ? "Verify & Sign In" : "Sign In"}
          </Button>
        </form>

        {!showTwoFactor && (
          <div className="mt-4 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="font-medium text-foreground hover:underline">
              Sign up
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Suspense fallback={
        <div className="flex size-10 items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      }>
        <LoginContent />
      </Suspense>
    </div>
  );
}
