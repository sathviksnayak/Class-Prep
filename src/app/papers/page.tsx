import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/Button";
import { Header } from "@/components/Header";
import { PaperTable } from "@/components/PaperTable";

const papers = [
  {
    title: "Unit Test 1 - Algebra",
    className: "Class 9",
    subject: "Mathematics",
    date: "18 Aug 2026",
    marks: "40 Marks",
  },
  {
    title: "Half Yearly Science Review",
    className: "Class 10",
    subject: "Science",
    date: "10 Aug 2026",
    marks: "50 Marks",
  },
  {
    title: "English Reading Comprehension",
    className: "Class 8",
    subject: "English",
    date: "04 Aug 2026",
    marks: "30 Marks",
  },
  {
    title: "History Chapter Revision",
    className: "Class 7",
    subject: "History",
    date: "29 Jul 2026",
    marks: "35 Marks",
  },
];

export default async function PapersPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-[#f5f8f6]">
      <div className="flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <Header
            title="My Papers"
            subtitle="Review and manage the tests you have created."
            action={<Button href="/generate">Create Test</Button>}
          />

          <div className="mt-8 rounded-3xl border border-[#e4eae5] bg-white p-6 shadow-sm shadow-[#edf3ee] md:p-8">
            <PaperTable papers={papers} />
          </div>
        </div>
      </div>
    </div>
  );
}
