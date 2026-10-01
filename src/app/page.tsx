import { Button } from "@/components/Button";
import { Header } from "@/components/Header";

export default function HomePage() {
  return (
    <div className="flex min-h-screen bg-[#f5f8f6]">
      <div className="flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <Header
            title="ClassPrep"
            subtitle="A teacher productivity platform for organizing materials and creating assessments."
            action={<Button href="/dashboard">Go to Dashboard</Button>}
          />

          <section className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-[#e4eae5] bg-white p-6 shadow-sm shadow-[#edf3ee]">
              <p className="text-sm font-medium uppercase tracking-[0.12em] text-[#5a6a62]">Library</p>
              <p className="mt-2 text-lg font-semibold text-[#1f2d27]">Organize Materials</p>
              <p className="mt-1 text-sm text-[#5a6a62]">Upload and manage your teaching documents.</p>
            </div>
            <div className="rounded-3xl border border-[#e4eae5] bg-white p-6 shadow-sm shadow-[#edf3ee]">
              <p className="text-sm font-medium uppercase tracking-[0.12em] text-[#5a6a62]">Test Generator</p>
              <p className="mt-2 text-lg font-semibold text-[#1f2d27]">Create Assessments</p>
              <p className="mt-1 text-sm text-[#5a6a62]">Design papers with custom questions and marks.</p>
            </div>
            <div className="rounded-3xl border border-[#e4eae5] bg-white p-6 shadow-sm shadow-[#edf3ee]">
              <p className="text-sm font-medium uppercase tracking-[0.12em] text-[#5a6a62]">My Papers</p>
              <p className="mt-2 text-lg font-semibold text-[#1f2d27]">Paper History</p>
              <p className="mt-1 text-sm text-[#5a6a62]">Paper history will appear here when the feature is available.</p>
            </div>
          </section>

          <div className="mt-8 flex gap-4">
            <Button href="/login">Sign In</Button>
            <Button href="/dashboard" variant="secondary">Dashboard</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
