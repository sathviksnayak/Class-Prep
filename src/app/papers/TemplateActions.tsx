"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTestTemplate, duplicateTestTemplate } from "@/app/generate/actions";

export function TemplateActions({ templateId, templateName }: { templateId: string; templateName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  async function run(action: () => Promise<unknown>) {
    setError("");
    startTransition(async () => { try { await action(); router.refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Template action failed"); } });
  }
  return <div className="flex flex-wrap gap-2">
    <button type="button" onClick={() => router.push(`/generate?edit=${templateId}`)} className="rounded-lg border border-[#d8e0d9] px-3 py-1.5 text-xs font-medium">Edit</button>
    <button type="button" disabled={pending} onClick={() => run(() => duplicateTestTemplate(templateId))} className="rounded-lg border border-[#d8e0d9] px-3 py-1.5 text-xs font-medium disabled:opacity-50">Duplicate</button>
    <button type="button" disabled={pending} onClick={() => { if (window.confirm(`Delete template “${templateName}”?`)) run(() => deleteTestTemplate(templateId)); }} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 disabled:opacity-50">Delete</button>
    {error ? <span role="alert" className="basis-full text-xs text-red-700">{error}</span> : null}
  </div>;
}
