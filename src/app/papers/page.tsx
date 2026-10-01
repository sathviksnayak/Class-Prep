import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { Header } from "@/components/Header";

export const dynamic = "force-dynamic";

export default async function PapersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="flex min-h-screen bg-[#f5f8f6]">
      <div className="flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <Header
            title="My Papers"
            subtitle="Review and manage the tests you have created."
            action={<Button href="/generate">Create Test</Button>}
          />

          <div className="mt-8 rounded-3xl border border-[#e4eae5] bg-white p-12 shadow-sm shadow-[#edf3ee] text-center">
            <p className="text-[#5a6a62] text-sm">
              Paper history is not available yet. Test generation is still a frontend placeholder.
            </p>
            <Button href="/generate" className="mt-6">
              Create your first test
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
