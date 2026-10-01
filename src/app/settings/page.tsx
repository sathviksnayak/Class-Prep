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
            subtitle="Classroom preferences are not connected yet."
          />

          <div className="mt-8 rounded-3xl border border-[#e4eae5] bg-white p-6 shadow-sm shadow-[#edf3ee] md:p-8">
            <div className="space-y-4 text-sm text-[#485b53]">
              <div className="rounded-2xl border border-[#e4eae5] bg-[#f7faf7] p-4">
                <p className="font-medium text-[#1f2d27]">Default grading</p>
                <p className="mt-1">Grading preferences will be available when settings are implemented.</p>
              </div>
              <div className="rounded-2xl border border-[#e4eae5] bg-[#f7faf7] p-4">
                <p className="font-medium text-[#1f2d27]">Academic standards</p>
                <p className="mt-1">Academic preferences are not saved yet.</p>
              </div>
              <div className="rounded-2xl border border-[#e4eae5] bg-[#f7faf7] p-4">
                <p className="font-medium text-[#1f2d27]">Saved templates</p>
                <p className="mt-1">Template management is not available yet.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
