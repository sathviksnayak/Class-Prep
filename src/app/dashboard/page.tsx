import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-[#f5f8f6] p-8">
      <div className="mx-auto w-full max-w-5xl rounded-3xl border border-[#e4eae5] bg-white p-8 shadow-sm shadow-[#edf3ee]">
        <h1 className="text-2xl font-semibold text-[#1f2d27]">Dashboard</h1>
        <p className="mt-2 text-sm text-[#5a6a62]">Signed in as {session.user.email}</p>
      </div>
    </div>
  );
}
