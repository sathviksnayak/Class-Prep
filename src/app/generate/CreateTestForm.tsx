"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { extractTestPaper, saveTestTemplate } from "./actions";
import { calculateTemplateTotals, emptyTemplateDraft, type QuestionTypeDraft, type SectionDraft, type TemplateDraft } from "@/lib/test-templates";

const COMMON_TYPES = [
  ["mcq", "Multiple Choice Questions"], ["fill-in-the-blanks", "Fill in the Blanks"],
  ["true-false", "True / False"], ["short-answer", "Short Answer"], ["long-answer", "Long Answer"],
];
const blankQuestion = (label: string, type: string): QuestionTypeDraft => ({ id: crypto.randomUUID(), type, label, count: 0, attempt: 0, marksEach: 1 });
const textFields: { key: keyof TemplateDraft; label: string }[] = [
  { key: "schoolName", label: "School / Institution" }, { key: "testTitle", label: "Test Title" },
  { key: "className", label: "Class" }, { key: "subject", label: "Subject" },
  { key: "examName", label: "Exam / Assessment Name" }, { key: "academicYear", label: "Academic Year" },
  { key: "duration", label: "Duration" },
];

export function CreateTestForm({ initialDraft, templateId, extractionEnabled = false }: { initialDraft?: TemplateDraft; templateId?: string; extractionEnabled?: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<TemplateDraft>(initialDraft ?? emptyTemplateDraft());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [extractWarning, setExtractWarning] = useState("");
  const [extractedText, setExtractedText] = useState("");
  const [pending, startTransition] = useTransition();
  const [extracting, startExtractTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const totals = calculateTemplateTotals(draft.sections);
  const totalMismatch = draft.maximumMarks !== null && totals.totalMarks !== null && draft.maximumMarks !== totals.totalMarks;

  const update = <K extends keyof TemplateDraft>(key: K, value: TemplateDraft[K]) => setDraft((previous) => ({ ...previous, [key]: value }));
  const updateSection = (sectionId: string, callback: (section: SectionDraft) => SectionDraft) => update("sections", draft.sections.map((section) => section.id === sectionId ? callback(section) : section));
  const updateQuestion = (sectionId: string, questionId: string, patch: Partial<QuestionTypeDraft>) => updateSection(sectionId, (section) => ({ ...section, questionTypes: section.questionTypes.map((question) => question.id === questionId ? { ...question, ...patch } : question) }));

  function addSection() {
    setDraft((previous) => ({ ...previous, sections: [...previous.sections, { id: crypto.randomUUID(), name: `Section ${String.fromCharCode(65 + previous.sections.length)}`, questionTypes: [] }] }));
  }
  function addQuestion(sectionId: string, type: string, label: string) {
    updateSection(sectionId, (section) => ({ ...section, questionTypes: [...section.questionTypes, blankQuestion(label, type)] }));
  }

  function submit() {
    setError(""); setNotice("");
    startTransition(async () => {
      try {
        await saveTestTemplate(draft, templateId);
        setNotice("Template saved.");
        router.push("/papers");
        router.refresh();
      } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save this template"); }
    });
  }

  function extract() {
    const file = fileInput.current?.files?.[0];
    if (!file) { setExtractWarning("Choose a PDF or DOCX test paper first."); return; }
    setError(""); setExtractWarning(""); setExtractedText("");
    const formData = new FormData(); formData.set("file", file);
    startExtractTransition(async () => {
      try {
        const result = await extractTestPaper(formData);
        setDraft(result.draft);
        setExtractedText(result.extractedText);
        setExtractWarning(result.warning ?? "Extraction made a draft. Review every value before saving.");
      } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not extract this paper"); }
    });
  }

  return <div className="mt-7 space-y-6">
    {extractionEnabled ? <section className="rounded-2xl border border-[#dfe7e1] bg-white p-5">
      <h2 className="font-semibold text-[#1f2d27]">Import an existing test paper</h2>
      <p className="mt-1 text-sm text-[#5a6a62]">Extract readable PDF/DOCX text into an editable template draft. The imported paper is a structural reference, separate from a Library resource used for question generation.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3"><input ref={fileInput} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="max-w-full text-sm" /><button type="button" onClick={extract} disabled={extracting} className="rounded-xl bg-[#2f6f4b] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{extracting ? "Extracting…" : "Extract structure"}</button></div>
      <p className="mt-2 text-xs text-[#718078]">Scanned PDFs need OCR; OCR is not supported. No readable text means the selected file stays available in this form for manual correction.</p>
      {extractWarning ? <p role="status" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{extractWarning}</p> : null}
      {extractedText ? <details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-[#2f6f4b]">Review extracted source text</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-[#f5f8f6] p-3 text-xs text-[#485b53]">{extractedText}</pre></details> : null}
    </section> : null}

    <section className="rounded-2xl border border-[#e4eae5] bg-white p-5 md:p-6">
      <h2 className="font-semibold text-[#1f2d27]">Template information</h2>
      <p className="mt-1 text-sm text-[#5a6a62]">A template stores a reusable paper structure. Choose a Library resource later when you use it.</p>
      <label className="mt-4 block text-sm font-medium text-[#1f2d27]" htmlFor="template-name">Template Name</label>
      <input id="template-name" value={draft.name} onChange={(event) => update("name", event.target.value)} maxLength={120} placeholder="e.g. 25 Mark Standard Test" className="mt-1.5 w-full rounded-xl border border-[#d8e0d9] px-3.5 py-2.5 text-sm outline-none focus:border-[#2f6f4b]" />
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {textFields.map(({ key, label }) => <label key={key} className="block text-sm font-medium text-[#1f2d27]">{label}<input value={draft[key] as string} onChange={(event) => update(key, event.target.value as never)} className="mt-1.5 w-full rounded-xl border border-[#d8e0d9] px-3 py-2 text-sm font-normal" /></label>)}
        <label className="block text-sm font-medium text-[#1f2d27]">Maximum Marks on Paper<input type="number" min={0} step={1} value={draft.maximumMarks ?? ""} onChange={(event) => update("maximumMarks", event.target.value === "" ? null : Math.max(0, Number.parseInt(event.target.value, 10) || 0))} className="mt-1.5 w-full rounded-xl border border-[#d8e0d9] px-3 py-2 text-sm font-normal" placeholder="Optional" /></label>
      </div>
      {draft.rawHeaderText || extractionEnabled ? <label className="mt-4 block text-sm font-medium text-[#1f2d27]">Raw extracted header text <span className="font-normal text-[#718078]">(editable; helps preserve uncertain wording)</span><textarea value={draft.rawHeaderText} onChange={(event) => update("rawHeaderText", event.target.value)} rows={4} className="mt-1.5 w-full rounded-xl border border-[#d8e0d9] px-3 py-2 text-sm font-normal" /></label> : null}
    </section>

    <section className="rounded-2xl border border-[#e4eae5] bg-white p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-[#1f2d27]">Question structure</h2><p className="mt-1 text-sm text-[#5a6a62]">Marks use Attempt × Marks each. Attempt defaults to the number offered.</p></div><button type="button" onClick={addSection} className="rounded-xl border border-[#d8e0d9] px-3 py-2 text-sm font-medium text-[#2f6f4b]">+ Add Section</button></div>
      <div className="mt-5 space-y-4">{draft.sections.map((section) => {
        const sectionTotal = totals.sections.find(({ id }) => id === section.id)?.totalMarks;
        return <div key={section.id} className="rounded-2xl border border-[#dfe7e1] p-4">
          <div className="flex items-center gap-3"><input aria-label="Section name" value={section.name} onChange={(event) => updateSection(section.id, (item) => ({ ...item, name: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-[#d8e0d9] px-3 py-2 text-sm font-semibold" />{draft.sections.length > 1 ? <button type="button" onClick={() => update("sections", draft.sections.filter(({ id }) => id !== section.id))} className="text-sm text-red-700">Remove section</button> : null}</div>
          <div className="mt-3 space-y-3">{section.questionTypes.map((question) => <div key={question.id} className="rounded-xl bg-[#f7faf7] p-3">
            <div className="mb-3 flex items-center justify-between gap-3"><input aria-label="Question type name" value={question.label} onChange={(event) => updateQuestion(section.id, question.id, { label: event.target.value })} className="min-w-0 flex-1 rounded-lg border border-[#d8e0d9] bg-white px-3 py-2 text-sm font-medium" /><button type="button" onClick={() => updateSection(section.id, (item) => ({ ...item, questionTypes: item.questionTypes.filter(({ id }) => id !== question.id) }))} className="text-sm text-red-700">Remove</button></div>
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="text-xs font-medium text-[#5a6a62]">Questions offered<input type="number" min={0} step={1} value={question.count} onChange={(event) => { const count = Math.max(0, Number.parseInt(event.target.value, 10) || 0); updateQuestion(section.id, question.id, { count, attempt: question.attempt === null ? null : question.attempt === question.count ? count : Math.min(question.attempt, count) }); }} className="mt-1 block w-full rounded-lg border border-[#d8e0d9] bg-white px-2.5 py-2 text-sm text-[#1f2d27]" /></label>
              <label className="text-xs font-medium text-[#5a6a62]">Attempt<input type="number" min={0} max={question.count} step={1} value={question.attempt ?? ""} onChange={(event) => updateQuestion(section.id, question.id, { attempt: event.target.value === "" ? null : Math.max(0, Math.min(question.count, Number.parseInt(event.target.value, 10) || 0)) })} className="mt-1 block w-full rounded-lg border border-[#d8e0d9] bg-white px-2.5 py-2 text-sm text-[#1f2d27]" placeholder="Review" /></label>
              <label className="text-xs font-medium text-[#5a6a62]">Marks each<input type="number" min={0} step={1} value={question.marksEach} onChange={(event) => updateQuestion(section.id, question.id, { marksEach: Math.max(0, Number.parseInt(event.target.value, 10) || 0) })} className="mt-1 block w-full rounded-lg border border-[#d8e0d9] bg-white px-2.5 py-2 text-sm text-[#1f2d27]" /></label>
              <div className="self-end pb-2 text-sm font-medium text-[#1f5d3d]">Total: {question.attempt === null ? "Review" : question.attempt * question.marksEach}</div>
            </div>
            {question.attempt !== null && question.attempt !== question.count ? <p className="mt-2 text-xs text-[#718078]">Students answer {question.attempt} of {question.count} questions offered.</p> : null}
          </div>)}</div>
          <div className="mt-3 flex flex-wrap items-center gap-2"><select aria-label={`Add question type to ${section.name}`} defaultValue="" onChange={(event) => { const entry = COMMON_TYPES.find(([type]) => type === event.target.value); if (entry) addQuestion(section.id, entry[0], entry[1]); event.target.value = ""; }} className="rounded-lg border border-[#d8e0d9] bg-white px-3 py-2 text-sm"><option value="">+ Add common question type</option>{COMMON_TYPES.map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select><button type="button" onClick={() => { const label = window.prompt("Name this question type"); if (label?.trim()) addQuestion(section.id, `custom:${label.trim().toLowerCase()}`, label.trim()); }} className="rounded-lg border border-[#d8e0d9] px-3 py-2 text-sm text-[#2f6f4b]">+ Add Custom Type</button><span className="ml-auto text-xs text-[#5a6a62]">Section marks: {sectionTotal ?? "Review attempt counts"}</span></div>
        </div>;
      })}</div>
      <div className="mt-5 flex flex-wrap gap-3 rounded-xl bg-[#f3f7f4] px-4 py-3 text-sm font-semibold text-[#1f5d3d]"><span>Total Questions: {totals.totalQuestions}</span><span>Total Marks: {totals.totalMarks ?? "Review attempt counts"}</span></div>
      {totalMismatch ? <p role="alert" className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">Extracted question structure totals {totals.totalMarks} marks, but the paper header says {draft.maximumMarks} marks. Please review the extracted structure.</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="mt-4 rounded-xl bg-[#e7f1ea] px-4 py-3 text-sm text-[#1f5d3d]">{notice}</p> : null}
      <div className="mt-5 flex flex-wrap justify-end gap-3"><a href="/papers" className="rounded-xl border border-[#d8e0d9] px-4 py-2.5 text-sm font-medium text-[#485b53]">Cancel</a><button type="button" disabled={pending || totals.totalQuestions === 0} onClick={submit} className="rounded-xl bg-[#2f6f4b] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">{pending ? "Saving…" : templateId ? "Save Changes" : "Save Template"}</button></div>
    </section>
  </div>;
}
