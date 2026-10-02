import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { type SectionDraft, type TemplateDraft } from "@/lib/test-templates";
import { CreateTestForm } from "./CreateTestForm";
import { TemplateHub } from "./TemplateHub";
import type { Generated } from "./GenerationWorkspace";

export const dynamic = "force-dynamic";

export default async function GeneratePage({ searchParams }: { searchParams: Promise<{ mode?: string; edit?: string; paper?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { mode = "hub", edit, paper: generatedPaperId } = await searchParams;
  const userId = session.user.id;

  if (edit) {
    const template = await prisma.testTemplate.findFirst({ where: { id: edit, userId } });
    if (!template) redirect("/papers");
    const storedSections = template.sections as unknown as SectionDraft[];
    const initialDraft: TemplateDraft = {
      name: template.name, schoolName: template.schoolName ?? "", testTitle: template.testTitle ?? "",
      className: template.className ?? "", subject: template.subject ?? "", examName: template.examName ?? "",
      academicYear: template.academicYear ?? "", duration: template.duration ?? "", maximumMarks: template.maximumMarks,
      rawHeaderText: template.rawHeaderText ?? "", sections: storedSections,
      extractionMetadata: storedSections[0]?.templateExtraction ? {
        status: "needs_review",
        warnings: [],
        header: storedSections[0].templateExtraction.header,
        totalMarks: storedSections[0].templateExtraction.totalMarks,
      } : undefined,
    };
    return <main className="min-h-screen bg-[#f5f8f6] p-4 md:p-8"><div className="mx-auto max-w-4xl"><Link href="/papers" className="text-sm font-medium text-[#2f6f4b] hover:underline">← My Templates</Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#1f2d27]">Edit Test Template</h1><CreateTestForm initialDraft={initialDraft} templateId={template.id} /></div></main>;
  }

  if (mode === "new" || mode === "extract") {
    return <main className="min-h-screen bg-[#f5f8f6] p-4 md:p-8"><div className="mx-auto max-w-4xl"><Link href="/generate" className="text-sm font-medium text-[#2f6f4b] hover:underline">← Create Test</Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#1f2d27]">{mode === "extract" ? "Extract Template from Test Paper" : "Create New Template"}</h1><p className="mt-2 text-sm text-[#5a6a62]">Create a reusable structure. Question generation will be a separate step.</p><CreateTestForm extractionEnabled={mode === "extract"} /></div></main>;
  }

  const [ownedTemplates, docs, folders, recentRecords, requestedRecord] = await Promise.all([
    prisma.testTemplate.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, select: { id: true, name: true, sections: true, totalMarks: true, maximumMarks: true } }),
    prisma.document.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { id: true, name: true, folderId: true } }),
    prisma.folder.findMany({ where: { userId }, select: { id: true, name: true, parentId: true } }),
    prisma.generatedPaper.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 10, select: { id: true, paper: true, status: true, updatedAt: true } }),
    generatedPaperId ? prisma.generatedPaper.findFirst({ where: { id: generatedPaperId, userId }, select: { id: true, paper: true, validation: true, status: true } }) : Promise.resolve(null),
  ]);
  if (generatedPaperId && !requestedRecord) redirect("/generate");
  const initialGenerated: Generated | null = requestedRecord ? (() => {
    const paper = requestedRecord.paper as unknown as Omit<Generated, "id" | "validation">;
    const validation = requestedRecord.validation as unknown as { groups?: Generated["validation"]; generationError?: string };
    return { ...paper, id: requestedRecord.id, validation: validation.groups ?? [], status: requestedRecord.status, generationError: validation.generationError } as Generated;
  })() : null;
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const resources = docs.map((doc) => {
    const path: string[] = []; let folderId = doc.folderId;
    while (folderId) { const folder = folderById.get(folderId); if (!folder) break; path.unshift(folder.name); folderId = folder.parentId; }
    return { id: doc.id, name: doc.name, folderName: path.length ? path.join(" / ") : null };
  });
  const templates = ownedTemplates.map((template) => ({ ...template, sections: template.sections as unknown as SectionDraft[] }));
  const recentPapers = recentRecords.map((record) => {
    const paper = record.paper as unknown as { title?: string };
    return { id: record.id, title: paper.title || "Generated test paper", status: record.status, updatedAt: record.updatedAt.toISOString() };
  });

  return <main className="min-h-screen bg-[#f5f8f6] p-4 md:p-8"><div className="mx-auto max-w-6xl"><Link href="/papers" className="text-sm font-medium text-[#2f6f4b] hover:underline">My Papers</Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#1f2d27]">Create Test</h1><p className="mt-2 text-sm text-[#5a6a62]">Choose a saved paper structure, source materials, and marks allocation.</p><TemplateHub templates={templates} resources={resources} initialGenerated={initialGenerated} recentPapers={recentPapers} /></div></main>;
}
