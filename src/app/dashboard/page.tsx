import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { Header } from "@/components/Header";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const firstName = session.user.name?.split(" ")[0] ?? "Teacher";

  return (
    <div className="flex min-h-screen bg-[#f5f8f6]">
      <div className="flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <Header
            title={`Welcome back, ${firstName}`}
            subtitle="Your classroom workspace is ready."
            action={<Button href="/generate">Create New Test</Button>}
          />

          <section className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-[#e4eae5] bg-white p-6 shadow-sm shadow-[#edf3ee]">
              <p className="text-sm font-medium uppercase tracking-[0.12em] text-[#5a6a62]">Signed in as</p>
              <p className="mt-2 truncate text-lg font-semibold text-[#1f2d27]">{session.user.email}</p>
            </div>
            <div className="rounded-3xl border border-[#e4eae5] bg-white p-6 shadow-sm shadow-[#edf3ee]">
              <p className="text-sm font-medium uppercase tracking-[0.12em] text-[#5a6a62]">Library</p>
              <p className="mt-2 text-lg font-semibold text-[#1f2d27]">Manage Files</p>
              <Button href="/library" variant="secondary" className="mt-4 w-full text-sm">
                Open Library
              </Button>
            </div>
            <div className="rounded-3xl border border-[#e4eae5] bg-white p-6 shadow-sm shadow-[#edf3ee]">
              <p className="text-sm font-medium uppercase tracking-[0.12em] text-[#5a6a62]">Test Generator</p>
              <p className="mt-2 text-lg font-semibold text-[#1f2d27]">Create Papers</p>
              <Button href="/generate" variant="secondary" className="mt-4 w-full text-sm">
                Create Test
              </Button>
            </div>
          </section>

          <section className="mt-10">
            <div className="rounded-3xl border border-[#e4eae5] bg-white p-6 shadow-sm shadow-[#edf3ee] md:p-8">
              <p className="text-sm font-medium text-[#5a6a62]">
                Papers and test history will appear here once the test generation feature is available.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
