"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBuiltinCopy, prepareTemplateForResource } from "./actions";
import { BUILTIN_TEMPLATES, calculateTemplateTotals, type SectionDraft } from "@/lib/test-templates";

type SavedTemplate = { id: string; name: string; sections: SectionDraft[]; totalMarks: number; maximumMarks: number | null };
type Resource = { id: string; name: string; folderName: string | null };

export function TemplateHub({ templates, resources }: { templates: SavedTemplate[]; resources: Resource[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState("");
  const [pending, startTransition] = useTransition();
  const [templateId, setTemplateId] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [prepared, setPrepared] = useState<{ templateName: string; resourceName: string; totalQuestions: number; totalMarks: number | null } | null>(null);
  const [error, setError] = useState("");
  const selected = templates.find((item) => item.id === templateId);
  const resource = resources.find((item) => item.id === resourceId);

  function handleBuiltin(id: string) {
    setPendingId(id);
    setError("");
    startTransition(async () => {
      try { const copy = await createBuiltinCopy(id); router.push(`/generate?edit=${copy.id}`); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "Could not copy the starter template"); }
      finally { setPendingId(""); }
    });
  }

  function applyTemplate() {
    if (!selected || !resource) return;
    setError(""); setPrepared(null);
    startTransition(async () => {
      try { setPrepared(await prepareTemplateForResource(selected.id, resource.id)); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "Could not prepare this template"); }
    });
  }

  return <div className="mt-8 space-y-6">
    <section className="grid gap-4 md:grid-cols-3">
      <Link href="/generate?mode=new" className="rounded-2xl border border-[#dfe7e1] bg-white p-5 hover:border-[#bcd4c2]"><h2 className="font-semibold">Create New Template</h2><p className="mt-2 text-sm text-[#5a6a62]">Build sections and set question counts, attempt counts, and marks.</p></Link>
      <Link href="/generate?mode=extract" className="rounded-2xl border border-[#dfe7e1] bg-white p-5 hover:border-[#bcd4c2]"><h2 className="font-semibold">Extract from Test Paper</h2><p className="mt-2 text-sm text-[#5a6a62]">Import a PDF/DOCX paper and review an editable structure draft.</p></Link>
      <a href="#reuse-template" className="rounded-2xl border border-[#dfe7e1] bg-white p-5 hover:border-[#bcd4c2]"><h2 className="font-semibold">Create from Template</h2><p className="mt-2 text-sm text-[#5a6a62]">Select one of your templates and a Library resource.</p></a>
    </section>

    <section className="rounded-3xl border border-[#e4eae5] bg-white p-6 shadow-sm"><div className="mb-4"><h2 className="text-lg font-semibold">Starter templates</h2><p className="mt-1 text-sm text-[#5a6a62]">Using one creates an editable copy in your templates. The built-in stays unchanged.</p></div>
      <div className="grid gap-3 md:grid-cols-3">{BUILTIN_TEMPLATES.map((builtin) => { const totals = calculateTemplateTotals(builtin.sections); return <article key={builtin.id} className="rounded-2xl border border-[#e4eae5] p-4"><h3 className="font-medium">{builtin.name}</h3><p className="mt-1 text-sm text-[#5a6a62]">{totals.totalQuestions} questions · {totals.totalMarks} marks</p><p className="mt-1 text-xs text-[#718078]">{builtin.sections.map((section) => `${section.name}: ${section.questionTypes.map((type) => `${type.count}×${type.marksEach}`).join(" + ")}`).join(" · ")}</p><button type="button" disabled={pending} onClick={() => handleBuiltin(builtin.id)} className="mt-4 rounded-xl bg-[#2f6f4b] px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{pendingId === builtin.id ? "Preparing…" : "Use Template"}</button></article>; })}</div>
    </section>
    {error ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

    <section id="reuse-template" className="rounded-3xl border border-[#e4eae5] bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold">Use a saved template with a Library resource</h2><p className="mt-1 text-sm text-[#5a6a62]">Applying a template does not change it or generate questions. It prepares the selected structure and resource for a future generation feature.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Template<select value={templateId} onChange={(event) => { setTemplateId(event.target.value); setPrepared(null); }} className="mt-1.5 block w-full rounded-xl border border-[#d8e0d9] bg-white px-3 py-2.5"><option value="">Choose a saved template</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm font-medium">Library resource<select value={resourceId} onChange={(event) => { setResourceId(event.target.value); setPrepared(null); }} className="mt-1.5 block w-full rounded-xl border border-[#d8e0d9] bg-white px-3 py-2.5"><option value="">Choose a document</option>{resources.map((item) => <option key={item.id} value={item.id}>{item.folderName ? `${item.folderName} / ` : ""}{item.name}</option>)}</select></label></div>
      <button type="button" disabled={pending || !selected || !resource} onClick={applyTemplate} className="mt-4 rounded-xl bg-[#2f6f4b] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{pending && !pendingId ? "Preparing…" : "Use Template"}</button>
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
      {prepared ? <div role="status" className="mt-4 rounded-xl bg-[#e7f1ea] p-4 text-sm text-[#1f5d3d]"><p className="font-semibold">Template prepared for {prepared.resourceName}</p><p className="mt-1">{prepared.templateName} · {prepared.totalQuestions} questions · {prepared.totalMarks ?? "Review attempt counts"} marks. The saved template remains unchanged. Question generation is not enabled yet.</p></div> : null}
    </section>

    <section className="flex justify-end"><Link href="/papers" className="text-sm font-medium text-[#2f6f4b] hover:underline">View saved templates →</Link></section>
  </div>;
}
