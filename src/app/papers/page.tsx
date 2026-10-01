import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { Header } from "@/components/Header";
import { prisma } from "@/lib/prisma";
import { calculateTemplateTotals, type SectionDraft } from "@/lib/test-templates";
import { TemplateActions } from "./TemplateActions";

export const dynamic = "force-dynamic";

export default async function PapersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const templates = await prisma.testTemplate.findMany({
    where: { userId: session.user.id }, orderBy: { updatedAt: "desc" },
  });

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
            <div className="mb-6 flex items-center justify-between gap-4">
              <div><h2 className="text-lg font-semibold text-[#1f2d27]">Test templates</h2><p className="mt-1 text-sm text-[#5a6a62]">Reusable structures, separate from Library resources and generated papers.</p></div>
              <Button href="/generate">Create Test</Button>
            </div>
            {templates.length ? <ul className="divide-y divide-[#edf1ee]">{templates.map((template) => {
              const sections = template.sections as unknown as SectionDraft[];
              const totals = calculateTemplateTotals(sections);
              const summary = sections.map((section) => `${section.name}: ${section.questionTypes.map((item) => `${item.label} ${item.count} offered/${item.attempt ?? "?"} attempt × ${item.marksEach}`).join(", ")}`).join(" · ");
              return <li key={template.id} className="py-4 first:pt-0 last:pb-0"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="font-medium text-[#1f2d27]">{template.name}</h3><p className="mt-1 text-sm text-[#5a6a62]">{totals.totalQuestions} questions offered · {totals.totalMarks ?? "Review attempt counts"} calculated marks{template.maximumMarks !== null ? ` · Paper header: ${template.maximumMarks} marks` : ""}</p><p className="mt-1 text-xs text-[#718078]">{summary || "No question structure"}</p><div className="mt-3"><TemplateActions templateId={template.id} templateName={template.name} /></div></div><time className="text-xs text-[#718078]">{template.updatedAt.toLocaleDateString()}</time></div></li>;
            })}</ul> : <div className="rounded-2xl bg-[#f7faf7] p-8 text-center"><p className="text-sm text-[#5a6a62]">No test templates yet. Create one manually or choose a document from your Library.</p><Button href="/generate" className="mt-5">Create your first test</Button></div>}
          </div>
        </div>
      </div>
    </div>
  );
}
