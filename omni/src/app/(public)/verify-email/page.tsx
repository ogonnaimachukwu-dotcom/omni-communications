"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, PenSquare, AlertCircle, CheckCircle2 } from "lucide-react";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const effectRan = useRef(false);

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying your email address...");

  useEffect(() => {
    if (effectRan.current) return;
    effectRan.current = true;

    if (!token) {
      setStatus("error");
      setMessage("Verification token is missing from the URL.");
      return;
    }

    async function verify() {
      try {
        const { error } = await authClient.verifyEmail({
          query: {
            token,
            callbackURL: "/projects",
          },
        });

        if (error) {
          setStatus("error");
          setMessage(error.message || "Email verification failed. The link may have expired.");
          return;
        }

        setStatus("success");
        setMessage("Your email address has been verified successfully!");
        setTimeout(() => {
          router.push("/projects");
        }, 3000);
      } catch (err: unknown) {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "An unexpected error occurred during verification.");
      }
    }

    verify();
  }, [token, router]);

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="space-y-1 text-center">
        <div className="flex justify-center pb-4">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <PenSquare className="size-6" />
          </div>
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight">Email verification</CardTitle>
        <CardDescription>
          Confirming your registration with Omni Communications
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center py-6 text-center">
        {status === "loading" && (
          <div className="space-y-4">
            <Loader2 className="size-10 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground">{message}</p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <CheckCircle2 className="size-12 text-green-500 animate-bounce mx-auto" />
            <p className="font-medium text-foreground">{message}</p>
            <p className="text-xs text-muted-foreground">Redirecting to dashboard...</p>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <AlertCircle className="size-12 text-destructive mx-auto animate-pulse" />
            <p className="font-medium text-destructive">{message}</p>
            <div className="pt-4">
              <Link href="/login" className="text-sm text-primary hover:underline font-medium">
                Go to Sign In
              </Link>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Suspense fallback={
        <div className="flex size-10 items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      }>
        <VerifyEmailContent />
      </Suspense>
    </div>
  );
}
