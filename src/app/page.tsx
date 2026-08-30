import { Button } from "@/components/Button";
import { Header } from "@/components/Header";
import { PaperCard } from "@/components/PaperCard";
import { StatCard } from "@/components/StatCard";

const recentPapers = [
  {
    title: "Unit Test 1 - Algebra",
    className: "Class 9",
    subject: "Mathematics",
    marks: "40 M",
    updatedAt: "2h ago",
  },
  {
    title: "Science Revision Quiz",
    className: "Class 10",
    subject: "Science",
    marks: "35 M",
    updatedAt: "Yesterday",
  },
  {
    title: "History Essay Set",
    className: "Class 8",
    subject: "History",
    marks: "25 M",
    updatedAt: "3 days ago",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen bg-[#f5f8f6]">
      <div className="flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <Header
            title="Welcome back, Aisha"
            subtitle="Your classroom workflow is organised and ready for the next assessment."
            action={<Button href="/generate">Create New Test</Button>}
          />

          <section className="mt-8 grid gap-4 md:grid-cols-3">
            <StatCard label="Total Papers" value="24" detail="Across 6 classes" />
            <StatCard label="Recent Papers" value="5" detail="This month" />
            <StatCard label="Saved Templates" value="12" detail="Reusable formats" />
          </section>

          <section className="mt-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-[#1f2d27]">Recent papers</h2>
              <Button href="/papers" variant="secondary" className="px-3 py-2 text-xs">
                View all
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {recentPapers.map((paper) => (
                <PaperCard
                  key={paper.title}
                  title={paper.title}
                  className={paper.className}
                  subject={paper.subject}
                  marks={paper.marks}
                  updatedAt={paper.updatedAt}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
