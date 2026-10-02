"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBuiltinCopy } from "./actions";
import { BUILTIN_TEMPLATES, calculateTemplateTotals, type SectionDraft } from "@/lib/test-templates";
import { GenerationWorkspace, type Generated } from "./GenerationWorkspace";

type SavedTemplate = { id: string; name: string; sections: SectionDraft[]; totalMarks: number; maximumMarks: number | null };
type Resource = { id: string; name: string; folderName: string | null };

export function TemplateHub({ templates, resources, initialGenerated, recentPapers }: { templates: SavedTemplate[]; resources: Resource[]; initialGenerated?: Generated | null; recentPapers?: { id: string; title: string; status: string; updatedAt: string }[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleBuiltin(id: string) {
    setPendingId(id);
    setError("");
    startTransition(async () => {
      try { const copy = await createBuiltinCopy(id); router.push(`/generate?edit=${copy.id}`); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "Could not copy the starter template"); }
      finally { setPendingId(""); }
    });
  }

  return <div className="mt-8 space-y-6">
    <section className="grid gap-4 md:grid-cols-3">
      <Link href="/generate?mode=new" className="rounded-2xl border border-[#dfe7e1] bg-white p-5 hover:border-[#bcd4c2]"><h2 className="font-semibold">Create New Template</h2><p className="mt-2 text-sm text-[#5a6a62]">Build sections and set question counts, attempt counts, and marks.</p></Link>
      <Link href="/generate?mode=extract" className="rounded-2xl border border-[#dfe7e1] bg-white p-5 hover:border-[#bcd4c2]"><h2 className="font-semibold">Extract from Test Paper</h2><p className="mt-2 text-sm text-[#5a6a62]">Import a PDF/DOCX paper and review an editable structure draft.</p></Link>
      <a href="#paper-generation" className="rounded-2xl border border-[#dfe7e1] bg-white p-5 hover:border-[#bcd4c2]"><h2 className="font-semibold">Generate Test Paper</h2><p className="mt-2 text-sm text-[#5a6a62]">Choose a saved structure, source materials, and marks allocation.</p></a>
    </section>

    <section className="rounded-3xl border border-[#e4eae5] bg-white p-6 shadow-sm"><div className="mb-4"><h2 className="text-lg font-semibold">Starter templates</h2><p className="mt-1 text-sm text-[#5a6a62]">Using one creates an editable copy in your templates. The built-in stays unchanged.</p></div>
      <div className="grid gap-3 md:grid-cols-3">{BUILTIN_TEMPLATES.map((builtin) => { const totals = calculateTemplateTotals(builtin.sections); return <article key={builtin.id} className="rounded-2xl border border-[#e4eae5] p-4"><h3 className="font-medium">{builtin.name}</h3><p className="mt-1 text-sm text-[#5a6a62]">{totals.totalQuestions} questions · {totals.totalMarks} marks</p><p className="mt-1 text-xs text-[#718078]">{builtin.sections.map((section) => `${section.name}: ${section.questionTypes.map((type) => `${type.count}×${type.marksEach}`).join(" + ")}`).join(" · ")}</p><button type="button" disabled={pending} onClick={() => handleBuiltin(builtin.id)} className="mt-4 rounded-xl bg-[#2f6f4b] px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{pendingId === builtin.id ? "Preparing…" : "Use Template"}</button></article>; })}</div>
    </section>
    {error ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

    <div id="paper-generation"><GenerationWorkspace templates={templates} resources={resources} initialGenerated={initialGenerated} recentPapers={recentPapers} /></div>

    <section className="flex justify-end"><Link href="/papers" className="text-sm font-medium text-[#2f6f4b] hover:underline">View saved templates →</Link></section>
  </div>;
}
