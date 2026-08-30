"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/Button";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f8f6] px-4">
      <div className="w-full max-w-md rounded-3xl border border-[#e4eae5] bg-white p-8 shadow-sm shadow-[#edf3ee]">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2f6f4b] text-lg font-semibold text-white">
            C
          </div>
          <div>
            <p className="text-xl font-semibold text-[#1f2d27]">ClassPrep</p>
          </div>
        </div>

        <h1 className="mt-8 text-2xl font-semibold text-[#1f2d27]">Welcome back</h1>
        <p className="mt-2 text-sm text-[#5a6a62]">
          Sign in to organize teaching materials, build assessments, and manage your classroom workflow.
        </p>

        <Button
          type="button"
          className="mt-8 w-full"
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        >
          Continue with Google
        </Button>
      </div>
    </div>
  );
}
