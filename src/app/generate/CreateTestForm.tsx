"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { extractTestPaper, saveTestTemplate } from "./actions";
import { calculateTemplateTotals, emptyTemplateDraft, type ExtractionStatus, type QuestionTypeDraft, type SectionDraft, type TemplateDraft } from "@/lib/test-templates";

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
const statusName = (status?: ExtractionStatus) => ({ detected: "Detected", inferred: "Inferred", needs_review: "Needs review", missing: "Missing", edited: "Edited" })[status ?? "missing"];
function StatusBadge({ status }: { status?: ExtractionStatus }) {
  return <span className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${status === "detected" ? "bg-emerald-100 text-emerald-800" : status === "inferred" ? "bg-sky-100 text-sky-800" : status === "edited" ? "bg-violet-100 text-violet-800" : status === "needs_review" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600"}`}>{statusName(status)}</span>;
}

export function CreateTestForm({ initialDraft, templateId, extractionEnabled = false }: { initialDraft?: TemplateDraft; templateId?: string; extractionEnabled?: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<TemplateDraft>(initialDraft ?? emptyTemplateDraft());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [extractWarning, setExtractWarning] = useState("");
  const [extractedText, setExtractedText] = useState("");
  const [hasExtractedText, setHasExtractedText] = useState(false);
  const [extractNeedsReview, setExtractNeedsReview] = useState(false);
  const [pending, startTransition] = useTransition();
  const [extracting, startExtractTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const totals = calculateTemplateTotals(draft.sections);
  const totalMismatch = draft.maximumMarks !== null && totals.totalMarks !== null && draft.maximumMarks !== totals.totalMarks;
  const showEditor = !extractionEnabled || hasExtractedText;

  const update = <K extends keyof TemplateDraft>(key: K, value: TemplateDraft[K]) => setDraft((previous) => {
    const headerKey = key === "maximumMarks" || ["schoolName", "testTitle", "className", "subject", "examName", "academicYear", "duration"].includes(key);
    if (!headerKey || !previous.extractionMetadata) return { ...previous, [key]: value };
    const nextValue = typeof value === "number" ? value : value === null ? null : String(value);
    const current = previous.extractionMetadata.header[String(key)];
    return {
      ...previous,
      [key]: value,
      extractionMetadata: {
        ...previous.extractionMetadata,
        header: { ...previous.extractionMetadata.header, [String(key)]: { ...(current ?? { raw: null }), value: nextValue, status: "edited" } },
      },
    };
  });
  const updateSection = (sectionId: string, callback: (section: SectionDraft) => SectionDraft) => update("sections", draft.sections.map((section) => section.id === sectionId ? callback(section) : section));
  const updateQuestion = (sectionId: string, questionId: string, patch: Partial<QuestionTypeDraft>) => updateSection(sectionId, (section) => ({
    ...section,
    questionTypes: section.questionTypes.map((question) => {
      if (question.id !== questionId) return question;
      const next = { ...question, ...patch };
      if (!question.extraction) return next;
      const extraction = { ...question.extraction };
      for (const [draftKey, fieldKey] of [["count", "offered"], ["attempt", "attempt"], ["marksEach", "marksEach"]] as const) {
        if (draftKey in patch) {
          const value = next[draftKey];
          extraction[fieldKey] = { ...extraction[fieldKey], value, status: value === null ? "missing" : "edited", alternate: undefined };
        }
      }
      const needsReview = extraction.offered.value === null || extraction.attempt.value === null || extraction.marksEach.value === null || extraction.groupMarks.status === "needs_review";
      return { ...next, extraction: { ...extraction, needsReview, reviewReason: needsReview ? "Complete or confirm the fields marked for review." : null } };
    }),
  }));

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
    setError(""); setExtractWarning(""); setExtractedText(""); setHasExtractedText(false); setExtractNeedsReview(false);
    const formData = new FormData(); formData.set("file", file);
    startExtractTransition(async () => {
      try {
        const result = await extractTestPaper(formData);
        setDraft(result.draft);
        setExtractedText(result.extractedText);
        setHasExtractedText(result.hasText);
        setExtractNeedsReview(result.needsReview);
        setExtractWarning(result.warning ?? "Extraction made a draft. Review every value before saving.");
      } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not extract this paper"); }
    });
  }

  const alternateText = (value: number | null | undefined) => value === undefined ? "no change" : value === null ? "not verified" : String(value);

  return <div className="mt-7 space-y-6">
    {extractionEnabled ? <section className="rounded-2xl border border-[#dfe7e1] bg-white p-5">
      <h2 className="text-lg font-semibold text-[#1f2d27]">Upload a test paper</h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-[#5a6a62]">Create a reusable test-paper structure from an existing PDF or DOCX. The original paper is used only as a structural reference; it will not become a Library resource for question generation.</p>
      <div className="mt-5 rounded-xl border border-dashed border-[#cbd8ce] bg-[#f8faf8] p-4">
        <label htmlFor="test-paper-file" className="block text-sm font-medium text-[#1f2d27]">Test paper <span className="font-normal text-[#718078]">(PDF or DOCX)</span></label>
        <div className="mt-2 flex flex-wrap items-center gap-3"><input id="test-paper-file" ref={fileInput} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={extracting} className="block min-w-0 flex-1 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-[#2f6f4b]" /><button type="button" onClick={extract} disabled={extracting} className="rounded-xl bg-[#2f6f4b] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{extracting ? "Extracting…" : "Extract paper"}</button></div>
        <p className="mt-2 text-xs text-[#718078]">Supported formats: PDF and DOCX. Scanned PDFs require OCR, which is not currently supported.</p>
      </div>
      {extracting ? <div role="status" aria-live="polite" className="mt-4 rounded-xl bg-[#f3f7f4] p-4 text-sm text-[#1f5d3d]"><p className="font-semibold">Extracting test paper…</p><p className="mt-1">Reading document, detecting the heading, and analyzing question structure.</p></div> : null}
      {extractWarning && hasExtractedText ? <p role="status" className={`mt-4 rounded-xl px-4 py-3 text-sm ${extractNeedsReview ? "bg-amber-50 text-amber-900" : "bg-[#e7f1ea] text-[#1f5d3d]"}`}>{extractWarning}</p> : null}
      {extractWarning && !hasExtractedText ? <div role="status" className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900"><p>{extractWarning}</p><a className="mt-2 inline-block font-semibold underline" href="/generate?mode=new">Create Template Manually</a></div> : null}
      {error ? <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {extractedText ? <details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-[#2f6f4b]">Review extracted document text</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-[#f5f8f6] p-3 text-xs text-[#485b53]">{extractedText}</pre></details> : null}
    </section> : null}

    {showEditor ? <>
    <section className="rounded-2xl border border-[#e4eae5] bg-white p-5 md:p-6">
      <h2 className="font-semibold text-[#1f2d27]">Template information</h2>
      <p className="mt-1 text-sm text-[#5a6a62]">A template stores a reusable paper structure. Choose a Library resource later when you use it.</p>
      <label className="mt-4 block text-sm font-medium text-[#1f2d27]" htmlFor="template-name">Template Name</label>
      <input id="template-name" value={draft.name} onChange={(event) => update("name", event.target.value)} maxLength={120} placeholder="e.g. 25 Mark Standard Test" className="mt-1.5 w-full rounded-xl border border-[#d8e0d9] px-3.5 py-2.5 text-sm outline-none focus:border-[#2f6f4b]" />
      {extractedText ? <div className="mt-5 rounded-xl bg-[#f3f7f4] px-4 py-3"><h3 className="text-sm font-semibold text-[#1f2d27]">Detected heading information</h3><p className="mt-1 text-sm text-[#5a6a62]">Review and correct the values before saving. Anything unclear has been left blank.</p></div> : null}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {textFields.map(({ key, label }) => <label key={key} className="block text-sm font-medium text-[#1f2d27]"><span className="block">{label}{extractedText ? <StatusBadge status={draft.extractionMetadata?.header[key]?.status} /> : null}</span><input value={draft[key] as string} onChange={(event) => update(key, event.target.value as never)} className="mt-1.5 block w-full rounded-xl border border-[#d8e0d9] px-3 py-2.5 text-sm font-normal" placeholder={draft.extractionMetadata?.header[key]?.status === "missing" ? "Not detected" : undefined} /></label>)}
        <label className="block text-sm font-medium text-[#1f2d27]"><span className="block">Maximum Marks on Paper{extractedText ? <StatusBadge status={draft.extractionMetadata?.header.maximumMarks?.status} /> : null}</span><input type="number" min={0} step="0.1" value={draft.maximumMarks ?? ""} onChange={(event) => update("maximumMarks", event.target.value === "" ? null : Math.max(0, Number(event.target.value)))} className="mt-1.5 block w-full rounded-xl border border-[#d8e0d9] px-3 py-2.5 text-sm font-normal" placeholder="Not detected" /></label>
      </div>
      {draft.rawHeaderText || extractionEnabled ? <label className="mt-4 block text-sm font-medium text-[#1f2d27]">Raw extracted header <span className="font-normal text-[#718078]">(editable; helps preserve uncertain wording)</span><textarea value={draft.rawHeaderText} onChange={(event) => update("rawHeaderText", event.target.value)} rows={4} className="mt-1.5 w-full rounded-xl border border-[#d8e0d9] px-3 py-2 text-sm font-normal" /></label> : null}
    </section>

    <section className="rounded-2xl border border-[#e4eae5] bg-white p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-[#1f2d27]">Question structure</h2><p className="mt-1 text-sm text-[#5a6a62]">Marks use Attempt × Marks each. Attempt defaults to the number offered.</p></div><button type="button" onClick={addSection} className="rounded-xl border border-[#d8e0d9] px-3 py-2 text-sm font-medium text-[#2f6f4b]">+ Add Section</button></div>
      <div className="mt-5 space-y-4">{draft.sections.map((section) => {
        const sectionTotal = totals.sections.find(({ id }) => id === section.id)?.totalMarks ?? null;
        return <div key={section.id} className="rounded-2xl border border-[#dfe7e1] p-4">
          <div className="flex flex-wrap items-center gap-3"><input aria-label="Section name" value={section.implicit ? "Unsectioned" : section.name} onChange={(event) => updateSection(section.id, (item) => ({ ...item, name: event.target.value, implicit: false }))} className="min-w-0 flex-1 rounded-lg border border-[#d8e0d9] px-3 py-2 text-sm font-semibold" />{section.extraction?.needsReview ? <StatusBadge status="needs_review" /> : null}{draft.sections.length > 1 ? <button type="button" onClick={() => update("sections", draft.sections.filter(({ id }) => id !== section.id))} className="text-sm text-red-700">Remove section</button> : null}</div>
          <div className="mt-3 space-y-3">{section.questionTypes.map((question) => <div key={question.id} className="rounded-xl bg-[#f7faf7] p-3">
            <div className="mb-3 flex items-center justify-between gap-3"><div className="min-w-0 flex-1"><input aria-label="Question type name" value={question.label} onChange={(event) => updateQuestion(section.id, question.id, { label: event.target.value })} className="w-full rounded-lg border border-[#d8e0d9] bg-white px-3 py-2 text-sm font-medium" />{question.extraction?.needsReview ? <p className="mt-2 text-xs text-amber-800">{question.extraction.reviewReason ?? "Review this detected group before saving."}</p> : null}</div><button type="button" onClick={() => updateSection(section.id, (item) => ({ ...item, questionTypes: item.questionTypes.filter(({ id }) => id !== question.id) }))} className="text-sm text-red-700">Remove</button></div>
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="text-xs font-medium text-[#5a6a62]">Questions offered{question.extraction ? <StatusBadge status={question.extraction.offered.status} /> : null}<input type="number" min={0} step={1} value={question.count ?? ""} placeholder="Cannot verify" onChange={(event) => { const count = event.target.value === "" ? null : Math.max(0, Number.parseInt(event.target.value, 10) || 0); updateQuestion(section.id, question.id, { count, attempt: question.count !== null && question.attempt === question.count && count !== null ? count : question.attempt }); }} className="mt-1 block w-full rounded-lg border border-[#d8e0d9] bg-white px-2.5 py-2 text-sm text-[#1f2d27]" /></label>
              <label className="text-xs font-medium text-[#5a6a62]">Questions to attempt{question.extraction ? <StatusBadge status={question.extraction.attempt.status} /> : null}<input type="number" min={0} max={question.count ?? undefined} step={1} value={question.attempt ?? ""} placeholder="Cannot verify" onChange={(event) => updateQuestion(section.id, question.id, { attempt: event.target.value === "" ? null : Math.max(0, Math.min(question.count ?? 10000, Number.parseInt(event.target.value, 10) || 0)) })} className="mt-1 block w-full rounded-lg border border-[#d8e0d9] bg-white px-2.5 py-2 text-sm text-[#1f2d27]" /></label>
              <label className="text-xs font-medium text-[#5a6a62]">Marks each{question.extraction ? <StatusBadge status={question.extraction.marksEach.status} /> : null}<input type="number" min={0} step="0.1" value={question.marksEach ?? ""} placeholder="Cannot verify" onChange={(event) => updateQuestion(section.id, question.id, { marksEach: event.target.value === "" ? null : Math.max(0, Number(event.target.value)) })} className="mt-1 block w-full rounded-lg border border-[#d8e0d9] bg-white px-2.5 py-2 text-sm text-[#1f2d27]" /></label>
              <div className="self-end pb-2 text-sm font-medium text-[#1f5d3d]">Group marks: {question.attempt !== null && question.marksEach !== null ? question.attempt * question.marksEach : "Cannot verify"}</div>
            </div>
            {question.attempt !== null && question.attempt !== question.count ? <p className="mt-2 text-xs text-[#718078]">Students answer {question.attempt} of {question.count} questions offered.</p> : null}
            {question.extraction?.offered.alternate !== undefined || question.extraction?.attempt.alternate !== undefined || question.extraction?.marksEach.alternate !== undefined ? <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Structured review suggested {alternateText(question.extraction.offered.alternate)} offered, {alternateText(question.extraction.attempt.alternate)} to attempt, and {alternateText(question.extraction.marksEach.alternate)} marks each. The deterministic values are retained for your review.</p> : null}
            {question.extraction?.groupMarks.status === "needs_review" ? <p className="mt-2 text-xs text-amber-800">Printed marks cue {question.extraction.groupMarks.raw} may be a group total. Marks each were left blank.</p> : null}
            {question.extraction?.sourceQuote ? <details className="mt-2"><summary className="cursor-pointer text-xs font-medium text-[#2f6f4b]">View source wording</summary><blockquote className="mt-1 border-l-2 border-[#cbd8ce] pl-3 text-xs text-[#5a6a62]">{question.extraction.sourceQuote}{question.extraction.choiceWording ? ` · Choice: ${question.extraction.choiceWording}` : ""}</blockquote></details> : null}
          </div>)}</div>
          <div className="mt-3 flex flex-wrap items-center gap-2"><select aria-label={`Add question type to ${section.name}`} defaultValue="" onChange={(event) => { const entry = COMMON_TYPES.find(([type]) => type === event.target.value); if (entry) addQuestion(section.id, entry[0], entry[1]); event.target.value = ""; }} className="rounded-lg border border-[#d8e0d9] bg-white px-3 py-2 text-sm"><option value="">+ Add common question type</option>{COMMON_TYPES.map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select><button type="button" onClick={() => { const label = window.prompt("Name this question type"); if (label?.trim()) addQuestion(section.id, `custom:${label.trim().toLowerCase()}`, label.trim()); }} className="rounded-lg border border-[#d8e0d9] px-3 py-2 text-sm text-[#2f6f4b]">+ Add Custom Type</button><span className="ml-auto text-xs text-[#5a6a62]">Section marks: {sectionTotal ?? "Cannot verify"}</span></div>
        </div>;
      })}</div>
      <div className="mt-5 flex flex-wrap gap-3 rounded-xl bg-[#f3f7f4] px-4 py-3 text-sm font-semibold text-[#1f5d3d]"><span>Total Questions: {totals.totalQuestions ?? "Cannot verify"}</span><span>Total Marks: {totals.totalMarks ?? "Cannot verify"}</span></div>
      {totalMismatch ? <div role="alert" className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900"><p className="font-semibold">Check the extracted marks</p><p className="mt-1">Maximum marks in heading: {draft.maximumMarks}. Calculated from structure: {totals.totalMarks}. These values don’t match. Please review the question structure before saving.</p></div> : null}
      {extractedText && !totalMismatch && (draft.maximumMarks === null || totals.totalMarks === null) ? <p role="status" className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">Cannot verify total marks against the paper maximum. Review the unknown counts and marks before saving.</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="mt-4 rounded-xl bg-[#e7f1ea] px-4 py-3 text-sm text-[#1f5d3d]">{notice}</p> : null}
      <div className="mt-5 flex flex-wrap justify-end gap-3"><a href="/papers" aria-disabled={extracting} className={`rounded-xl border border-[#d8e0d9] px-4 py-2.5 text-sm font-medium text-[#485b53] ${extracting ? "pointer-events-none opacity-50" : ""}`}>Cancel</a><button type="button" disabled={pending || extracting || draft.sections.every((section) => section.questionTypes.length === 0)} onClick={submit} className="rounded-xl bg-[#2f6f4b] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">{pending ? "Saving…" : templateId ? "Save Changes" : "Save Template"}</button></div>
    </section>
    </> : null}
  </div>;
}
