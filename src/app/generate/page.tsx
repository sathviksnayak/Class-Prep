import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { type SectionDraft, type TemplateDraft } from "@/lib/test-templates";
import { CreateTestForm } from "./CreateTestForm";
import { TemplateHub } from "./TemplateHub";

export const dynamic = "force-dynamic";

export default async function GeneratePage({ searchParams }: { searchParams: Promise<{ mode?: string; edit?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { mode = "hub", edit } = await searchParams;
  const userId = session.user.id;

  if (edit) {
    const template = await prisma.testTemplate.findFirst({ where: { id: edit, userId } });
    if (!template) redirect("/papers");
    const initialDraft: TemplateDraft = {
      name: template.name, schoolName: template.schoolName ?? "", testTitle: template.testTitle ?? "",
      className: template.className ?? "", subject: template.subject ?? "", examName: template.examName ?? "",
      academicYear: template.academicYear ?? "", duration: template.duration ?? "", maximumMarks: template.maximumMarks,
      rawHeaderText: template.rawHeaderText ?? "", sections: template.sections as unknown as SectionDraft[],
    };
    return <main className="min-h-screen bg-[#f5f8f6] p-4 md:p-8"><div className="mx-auto max-w-4xl"><Link href="/papers" className="text-sm font-medium text-[#2f6f4b] hover:underline">← My Templates</Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#1f2d27]">Edit Test Template</h1><CreateTestForm initialDraft={initialDraft} templateId={template.id} /></div></main>;
  }

  if (mode === "new" || mode === "extract") {
    return <main className="min-h-screen bg-[#f5f8f6] p-4 md:p-8"><div className="mx-auto max-w-4xl"><Link href="/generate" className="text-sm font-medium text-[#2f6f4b] hover:underline">← Create Test</Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#1f2d27]">{mode === "extract" ? "Extract Template from Test Paper" : "Create New Template"}</h1><p className="mt-2 text-sm text-[#5a6a62]">Create a reusable structure. Question generation will be a separate step.</p><CreateTestForm extractionEnabled={mode === "extract"} /></div></main>;
  }

  const [ownedTemplates, docs, folders] = await Promise.all([
    prisma.testTemplate.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, select: { id: true, name: true, sections: true, totalMarks: true, maximumMarks: true } }),
    prisma.document.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { id: true, name: true, folderId: true } }),
    prisma.folder.findMany({ where: { userId }, select: { id: true, name: true, parentId: true } }),
  ]);
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const resources = docs.map((doc) => {
    const path: string[] = []; let folderId = doc.folderId;
    while (folderId) { const folder = folderById.get(folderId); if (!folder) break; path.unshift(folder.name); folderId = folder.parentId; }
    return { id: doc.id, name: doc.name, folderName: path.length ? path.join(" / ") : null };
  });
  const templates = ownedTemplates.map((template) => ({ ...template, sections: template.sections as unknown as SectionDraft[] }));

  return <main className="min-h-screen bg-[#f5f8f6] p-4 md:p-8"><div className="mx-auto max-w-6xl"><Link href="/papers" className="text-sm font-medium text-[#2f6f4b] hover:underline">My Papers</Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#1f2d27]">Create Test</h1><p className="mt-2 text-sm text-[#5a6a62]">Choose a template workflow. A template is a reusable structure, separate from its source material.</p><TemplateHub templates={templates} resources={resources} /></div></main>;
}
