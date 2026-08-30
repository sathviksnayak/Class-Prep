import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/Button";
import { FormField } from "@/components/FormField";
import { Header } from "@/components/Header";

const questionTypes = [
  { label: "MCQ", value: "mcq" },
  { label: "Short Answer", value: "short-answer" },
  { label: "Long Answer", value: "long-answer" },
];

export default async function GeneratePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-[#f5f8f6]">
      <div className="flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-5xl">
          <Header
            title="Create a new test"
            subtitle="Design a paper with the right mix of questions, marks, and duration."
            action={<Button variant="secondary">Save Draft</Button>}
          />

          <div className="mt-8 rounded-3xl border border-[#e4eae5] bg-white p-6 shadow-sm shadow-[#edf3ee] md:p-8">
            <div className="grid gap-6 md:grid-cols-2">
              <FormField label="Class" id="class" value="Class 9" type="select" options={[{ label: "Class 9", value: "Class 9" }, { label: "Class 10", value: "Class 10" }, { label: "Class 11", value: "Class 11" }, { label: "Class 12", value: "Class 12" }]} />
              <FormField label="Subject" id="subject" value="Mathematics" type="select" options={[{ label: "Mathematics", value: "Mathematics" }, { label: "Science", value: "Science" }, { label: "English", value: "English" }, { label: "History", value: "History" }]} />
              <FormField label="Chapter / Topic" id="topic" placeholder="Example: Quadratic Equations" />
              <FormField label="Total Marks" id="marks" type="number" value={40} />
              <FormField label="Duration" id="duration" placeholder="90 minutes" />
              <FormField label="Difficulty" id="difficulty" type="select" value="Moderate" options={[{ label: "Moderate", value: "Moderate" }, { label: "Easy", value: "Easy" }, { label: "Advanced", value: "Advanced" }]} />
            </div>

            <div className="mt-8">
              <p className="mb-3 text-sm font-medium text-[#1f2d27]">Question Types</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {questionTypes.map((type) => (
                  <label
                    key={type.value}
                    className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[#dfe7e1] bg-[#f7faf7] px-4 py-3 text-sm text-[#1f2d27]"
                  >
                    <input type="checkbox" defaultChecked={type.value === "mcq"} className="h-4 w-4 accent-[#2f6f4b]" />
                    {type.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-8 max-w-xs">
              <FormField label="Number of Questions" id="questions" type="number" value={20} />
            </div>

            <div className="mt-8 flex flex-col gap-3 border-t border-[#e4eae5] pt-6 sm:flex-row sm:justify-end">
              <Button variant="secondary" className="w-full sm:w-auto">
                Preview
              </Button>
              <Button className="w-full sm:w-auto" disabled>
                Generate Test
              </Button>
            </div>

            <p className="mt-4 text-xs text-[#5a6a62]">
              Frontend-only placeholder: generation is not connected yet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
