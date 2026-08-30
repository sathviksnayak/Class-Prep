import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-[#f5f8f6]">
      <div className="flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-4xl">
          <Header
            title="Settings"
            subtitle="Configure classroom preferences and defaults for test generation."
          />

          <div className="mt-8 rounded-3xl border border-[#e4eae5] bg-white p-6 shadow-sm shadow-[#edf3ee] md:p-8">
            <div className="space-y-4 text-sm text-[#485b53]">
              <div className="rounded-2xl border border-[#e4eae5] bg-[#f7faf7] p-4">
                <p className="font-medium text-[#1f2d27]">Default grading</p>
                <p className="mt-1">Marks distribution, answer keys, and review settings.</p>
              </div>
              <div className="rounded-2xl border border-[#e4eae5] bg-[#f7faf7] p-4">
                <p className="font-medium text-[#1f2d27]">Academic standards</p>
                <p className="mt-1">Set your preferred difficulty and classroom-level defaults.</p>
              </div>
              <div className="rounded-2xl border border-[#e4eae5] bg-[#f7faf7] p-4">
                <p className="font-medium text-[#1f2d27]">Saved templates</p>
                <p className="mt-1">Manage reusable question patterns and test formats.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
