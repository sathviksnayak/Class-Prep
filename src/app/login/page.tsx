"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  const handleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await signIn("google", { callbackUrl: "/dashboard" });
      if (result?.error) {
        setError("Authentication failed. Please try again.");
        setIsLoading(false);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  if (status === "loading" || status === "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f8f6]">
        <p className="text-sm text-[#5a6a62]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f8f6] px-4">
      <div className="w-full max-w-md rounded-3xl border border-[#e4eae5] bg-white p-8 shadow-sm shadow-[#edf3ee]">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2f6f4b] text-lg font-semibold text-white">
            C
          </div>
          <p className="text-xl font-semibold text-[#1f2d27]">ClassPrep</p>
        </div>

        <h1 className="mt-8 text-2xl font-semibold text-[#1f2d27]">Welcome back</h1>
        <p className="mt-2 text-sm text-[#5a6a62]">
          Sign in with your Google account to access your teaching workspace.
        </p>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Button
          type="button"
          className="mt-8 w-full"
          onClick={handleSignIn}
          disabled={isLoading}
        >
          {isLoading ? "Redirecting to Google…" : "Continue with Google"}
        </Button>
      </div>
    </div>
  );
}
