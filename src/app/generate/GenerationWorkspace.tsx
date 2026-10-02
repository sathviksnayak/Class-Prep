"use client";

import { useEffect, useState, useTransition } from "react";
import { allocateQuestionSlots, calculateAttemptedMarks, formatMark, type GeneratedQuestion, type PaperSection } from "@/lib/test-paper-generation";
import { calculateTemplateTotals, type SectionDraft } from "@/lib/test-templates";
import { exportGeneratedPaperDocx, generatePaper, regeneratePaperQuestion, updateGeneratedPaper } from "./generation-actions";

type Template = { id: string; name: string; testTitle?: string | null; sections: SectionDraft[]; maximumMarks: number | null };
type Resource = { id: string; name: string; folderName: string | null };
export type Generated = { id: string; title: string; sections: PaperSection[]; questions: GeneratedQuestion[]; totalMarks: number; resourceRows: { resourceId: string; resourceName: string; targetMarks: number; achievedMarks: number; difference: number; maximumMarks: number }[]; warnings: string[]; validation: { groupId: string; resourceId: string; retries: number; passed: boolean; errors: string[] }[]; status?: string; generationError?: string };
type RecentPaper = { id: string; title: string; status: string; updatedAt: string };
type GenerationProgress = { status?: string; phase: string; completedBatches: number; totalBatches: number; groups: { groupId: string; resourceId: string; passed: boolean; errors: string[] }[]; error?: string };

export function GenerationWorkspace({ templates, resources, initialGenerated, recentPapers = [] }: { templates: Template[]; resources: Resource[]; initialGenerated?: Generated | null; recentPapers?: RecentPaper[] }) {
  const [templateId, setTemplateId] = useState("");
  const [resourceIds, setResourceIds] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<Record<string, Record<string, boolean>>>({});
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [targetsTouched, setTargetsTouched] = useState(false);
  const [generated, setGenerated] = useState<Generated | null>(initialGenerated ?? null);
  const [recent, setRecent] = useState(recentPapers);
  const [generationId, setGenerationId] = useState("");
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [error, setError] = useState("");
  const [answerKeyVisible, setAnswerKeyVisible] = useState(false);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (!pending || !generationId) return;
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch(`/api/generation-progress?id=${encodeURIComponent(generationId)}`, { cache: "no-store" });
        if (!response.ok) return;
        const result = await response.json() as GenerationProgress;
        if (active) setProgress(result);
      } catch { /* The generation request remains authoritative if progress polling is temporarily unavailable. */ }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1200);
    return () => { active = false; window.clearInterval(timer); };
  }, [pending, generationId]);
  const template = templates.find((item) => item.id === templateId);
  const groups = template?.sections.flatMap((section) => section.questionTypes.map((group) => ({ id: group.id, section: section.name, label: group.label, count: group.count, attempt: group.attempt, marksEach: group.marksEach }))) ?? [];
  const templateMarks = template ? calculateTemplateTotals(template.sections).totalMarks : null;
  function makeFeasibility() {
    if (!template || !resourceIds.length || resourceIds.some((id) => !Number.isFinite(targets[id]))) return { allocation: null, error: "Select resources and enter a target for each one." };
    try { return { allocation: allocateQuestionSlots(template.sections, resourceIds, matrix, targets), error: "" }; }
    catch (reason) { return { allocation: null, error: reason instanceof Error ? reason.message : "Allocation is not feasible." }; }
  }
  const feasibility = makeFeasibility();

  function selectTemplate(id: string) {
    setTemplateId(id); setGenerated(null); setError("");
    const next = templates.find((item) => item.id === id);
    if (next && resourceIds.length && !targetsTouched) {
      const total = calculateTemplateTotals(next.sections).totalMarks;
      if (total === null) return;
      setTargets(Object.fromEntries(resourceIds.map((resourceId) => [resourceId, Math.round(total / resourceIds.length * 1e6) / 1e6])));
    }
  }
  function selectResource(id: string) {
    const adding = !resourceIds.includes(id);
    const next = adding ? [...resourceIds, id] : resourceIds.filter((item) => item !== id);
    setResourceIds(next); setGenerated(null); setError("");
    setMatrix((previous) => {
      const nextMatrix = { ...previous };
      if (adding) nextMatrix[id] = Object.fromEntries(groups.map((group) => [group.id, true]));
      else delete nextMatrix[id];
      return nextMatrix;
    });
    setTargets((previous) => {
      const retained = Object.fromEntries(Object.entries(previous).filter(([resourceId]) => next.includes(resourceId)));
      if (adding) {
        const total = templateMarks;
        if (!targetsTouched && total !== null) return Object.fromEntries(next.map((resourceId) => [resourceId, Math.round(total / next.length * 1e6) / 1e6]));
        retained[id] = total === null ? Number.NaN : 0;
      }
      return retained;
    });
  }
  function runGeneration() {
    setError(""); setGenerated(null); setAnswerKeyVisible(false);
    if (!template) { setError("Choose a saved template."); return; }
    if (!feasibility.allocation) { setError(feasibility.error); return; }
    const requestId = crypto.randomUUID();
    setGenerationId(requestId);
    setProgress({ phase: "preparing", completedBatches: 0, totalBatches: 0, groups: [] });
    startTransition(async () => {
      try {
        const result = await generatePaper(template.id, resourceIds, matrix, targets, requestId);
        setGenerated(result as Generated);
        setProgress((current) => ({ phase: "complete", completedBatches: current?.totalBatches ?? result.validation.length, totalBatches: current?.totalBatches ?? result.validation.length, groups: result.validation, status: result.warnings.length ? "review" : "ready" }));
        setRecent((current) => [{ id: result.id, title: result.title, status: result.status, updatedAt: new Date().toISOString() }, ...current.filter((item) => item.id !== result.id)].slice(0, 10));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The paper could not be generated.");
        setProgress((current) => current ? { ...current, status: "failed", phase: "failed", error: reason instanceof Error ? reason.message : "Generation failed." } : current);
        try {
          const response = await fetch(`/api/generation-progress?id=${encodeURIComponent(requestId)}`, { cache: "no-store" });
          if (response.ok) {
            const failed = await response.json() as GenerationProgress;
            if (failed.status === "failed") setRecent((current) => [{ id: requestId, title: template.testTitle || template.name, status: "failed", updatedAt: new Date().toISOString() }, ...current.filter((item) => item.id !== requestId)].slice(0, 10));
            setProgress(failed);
          }
        } catch { /* Show the original generation error if status lookup also fails. */ }
      }
    });
  }
  function updateQuestion(questionId: string, key: "text" | "answer", value: string) {
    setGenerated((current) => current ? ({ ...current, questions: current.questions.map((item) => item.id === questionId ? { ...item, [key]: value } : item), sections: current.sections.map((section) => ({ ...section, groups: section.groups.map((group) => ({ ...group, questions: group.questions.map((item) => item.id === questionId ? { ...item, [key]: value } : item) })) })) }) : current);
  }
  function updateOption(questionId: string, index: number, value: string) {
    setGenerated((current) => current ? ({ ...current, questions: current.questions.map((item) => item.id === questionId ? { ...item, options: item.options?.map((option, optionIndex) => optionIndex === index ? value : option) } : item), sections: current.sections.map((section) => ({ ...section, groups: section.groups.map((group) => ({ ...group, questions: group.questions.map((item) => item.id === questionId ? { ...item, options: item.options?.map((option, optionIndex) => optionIndex === index ? value : option) } : item) })) })) }) : current);
  }
  function updateCorrectOption(questionId: string, correctIndex: number) {
    setGenerated((current) => current ? ({ ...current, questions: current.questions.map((item) => item.id === questionId ? { ...item, correctIndex } : item), sections: current.sections.map((section) => ({ ...section, groups: section.groups.map((group) => ({ ...group, questions: group.questions.map((item) => item.id === questionId ? { ...item, correctIndex } : item) })) })) }) : current);
  }
  function saveEdits() {
    if (!generated) return;
    setError("");
    startTransition(async () => {
      try { await updateGeneratedPaper(generated.id, generated.questions.map(({ id, text, answer, options, correctIndex }) => ({ id, text, answer, options, correctIndex }))); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "Edits could not be saved."); }
    });
  }
  function regenerate(questionId: string) {
    if (!generated) return;
    setError("");
    startTransition(async () => {
      try {
        const replacement = await regeneratePaperQuestion(generated.id, questionId);
        setGenerated((current) => current ? ({ ...current, questions: current.questions.map((item) => item.id === questionId ? replacement : item), sections: current.sections.map((section) => ({ ...section, groups: section.groups.map((group) => ({ ...group, questions: group.questions.map((item) => item.id === questionId ? replacement : item) })) })) }) : current);
      } catch (reason) { setError(reason instanceof Error ? reason.message : "This question could not be regenerated."); }
    });
  }
  function downloadDocx(withAnswers: boolean) {
    if (!generated) return;
    setError("");
    startTransition(async () => {
      try {
        const file = await exportGeneratedPaperDocx(generated.id, withAnswers);
        const binary = atob(file.base64); const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
        const anchor = document.createElement("a"); anchor.href = url; anchor.download = file.fileName; anchor.click(); URL.revokeObjectURL(url);
      } catch (reason) { setError(reason instanceof Error ? reason.message : "The DOCX export failed."); }
    });
  }
  function printPaper(withAnswers: boolean) { setAnswerKeyVisible(withAnswers); window.setTimeout(() => window.print(), 50); }

  return <div className="mt-8 space-y-6 print:mt-0">
    {recent.length ? <section className="rounded-2xl border border-[#e4eae5] bg-white p-5 print:hidden"><h2 className="font-semibold">Recent generated papers</h2><ul className="mt-3 divide-y">{recent.map((paper) => <li key={paper.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><a href={`/generate?paper=${encodeURIComponent(paper.id)}`} className="font-medium text-[#2f6f4b] hover:underline">{paper.title}</a><span className="text-xs text-[#718078]">{paper.status} · {new Date(paper.updatedAt).toLocaleString()}</span></li>)}</ul></section> : null}
    <section className="rounded-3xl border border-[#e4eae5] bg-white p-6 shadow-sm print:hidden">
      <h2 className="text-lg font-semibold">Generate a test paper</h2>
      <p className="mt-1 text-sm text-[#5a6a62]">Choose a saved template, select owned Library resources, then allocate marks before generating.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">1. Test template<select value={templateId} onChange={(event) => selectTemplate(event.target.value)} className="mt-1 block w-full rounded-xl border border-[#d8e0d9] bg-white px-3 py-2.5"><option value="">Choose a saved template</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div className="text-sm"><p className="font-medium">2. Library resources</p><div className="mt-1 max-h-48 space-y-2 overflow-auto rounded-xl border border-[#d8e0d9] p-3">{resources.length ? resources.map((resource) => <label key={resource.id} className="flex items-start gap-2"><input type="checkbox" checked={resourceIds.includes(resource.id)} onChange={() => selectResource(resource.id)} className="mt-1"/><span>{resource.folderName ? `${resource.folderName} / ` : ""}{resource.name}</span></label>) : <p className="text-sm text-[#718078]">No Library resources are available yet. Upload readable PDFs or DOCX files in Library.</p>}</div></div>
      </div>
      {template ? <>
        <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[700px] border-collapse text-left text-sm"><thead><tr className="border-b text-xs uppercase text-[#718078]"><th className="p-2">3. Resource × group</th>{groups.map((group) => <th key={group.id} className="p-2 text-center">{group.label}</th>)}</tr></thead><tbody>{resourceIds.map((resourceId) => <tr key={resourceId} className="border-b last:border-0"><th className="p-2 font-medium">{resources.find((item) => item.id === resourceId)?.name ?? resourceId}</th>{groups.map((group) => <td key={group.id} className="p-2 text-center"><input aria-label={`${resources.find((item) => item.id === resourceId)?.name ?? "Resource"} can supply ${group.label}`} type="checkbox" checked={matrix[resourceId]?.[group.id] !== false} onChange={(event) => setMatrix((current) => ({ ...current, [resourceId]: { ...current[resourceId], [group.id]: event.target.checked } }))} /></td>)}</tr>)}</tbody></table></div>
        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto]">
          <div className="overflow-x-auto"><table className="w-full min-w-[500px] text-left text-sm"><thead><tr className="border-b text-xs uppercase text-[#718078]"><th className="p-2">4. Resource target</th><th className="p-2">Target</th><th className="p-2">Achieved preview</th><th className="p-2">Difference</th></tr></thead><tbody>{resourceIds.map((resourceId) => { const row = feasibility.allocation?.rows.find((item) => item.resourceId === resourceId); return <tr key={resourceId} className="border-b last:border-0"><th className="p-2 font-medium">{resources.find((item) => item.id === resourceId)?.name ?? resourceId}</th><td className="p-2"><input type="number" min={0} step="0.1" value={Number.isFinite(targets[resourceId]) ? targets[resourceId] : ""} onChange={(event) => { setTargetsTouched(true); setTargets((current) => ({ ...current, [resourceId]: event.target.value === "" ? Number.NaN : Number(event.target.value) })); }} className="w-28 rounded-lg border px-2 py-1" aria-label={`Target marks for ${resources.find((item) => item.id === resourceId)?.name ?? "resource"}`} /></td><td className="p-2">{row ? formatMark(row.achievedMarks) : "Cannot verify"}</td><td className={`p-2 ${row && row.difference ? "text-amber-800" : ""}`}>{row ? `${row.difference > 0 ? "+" : ""}${formatMark(row.difference)}` : "Cannot verify"}</td></tr>; })}</tbody></table></div>
          <div className="self-end rounded-xl bg-[#f3f7f4] p-4 text-sm"><p>Template paper total</p><p className="text-xl font-semibold">{templateMarks === null ? "Cannot verify" : `${formatMark(templateMarks)} marks`}</p><p className="mt-1 text-xs text-[#718078]">Calculated from attempted questions × marks each.</p></div>
        </div>
        {feasibility.error ? <p role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{feasibility.error}</p> : null}
        {feasibility.allocation?.warnings.map((warning) => <p key={warning} role="status" className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{warning}</p>)}
        <p className="mt-3 text-xs text-[#718078]">All selected resources start enabled for every group. Initial targets split the paper total evenly; after you edit a target, the app preserves your values. Targets stay unchanged even when an exact match is not possible.</p>
        <button type="button" disabled={pending || !feasibility.allocation} onClick={runGeneration} className="mt-5 rounded-xl bg-[#2f6f4b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Generating and validating…" : "5. Generate test paper"}</button>
      </> : null}
    </section>

    {pending ? <div role="status" aria-live="polite" className="rounded-2xl border bg-white p-5 print:hidden"><p className="font-semibold">{progress?.phase === "preparing" ? "Reading selected resources and preparing allocation…" : "Generating questions from allocated resources…"}</p><p className="mt-1 text-sm text-[#5a6a62]">{progress?.totalBatches ? `Completed ${progress.completedBatches} of ${progress.totalBatches} group/resource batches. ` : "Preparing source chunks. "}Each batch is grounded against its assigned Library chunks and validated before it is saved.</p>{progress?.groups.map((group) => <p key={`${group.groupId}-${group.resourceId}`} className="mt-2 text-xs text-[#485b53]">{groups.find((item) => item.id === group.groupId)?.label ?? group.groupId} · {resources.find((item) => item.id === group.resourceId)?.name ?? group.resourceId}: {group.passed ? "validated" : group.errors.join(" ")}</p>)}<div className="mt-3 h-2 animate-pulse rounded bg-[#dbe9df]" /></div> : null}
    {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 print:hidden">{error}</p> : null}

    {generated ? <section className="space-y-5 rounded-3xl border border-[#e4eae5] bg-white p-6 shadow-sm print:border-0 print:p-0 print:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden"><div><h2 className="text-2xl font-semibold">{generated.title}</h2><p className="mt-1 text-sm text-[#5a6a62]">Generated paper · {formatMark(generated.totalMarks)} marks · {generated.status ?? "review"}</p></div>{generated.status !== "failed" ? <div className="flex flex-wrap gap-2"><button type="button" disabled={pending} onClick={saveEdits} className="rounded-lg border px-3 py-2 text-sm">Save edits</button><button type="button" disabled={pending} onClick={() => downloadDocx(false)} className="rounded-lg border px-3 py-2 text-sm">Download DOCX</button><button type="button" disabled={pending} onClick={() => downloadDocx(true)} className="rounded-lg border px-3 py-2 text-sm">DOCX + answer key</button><button type="button" onClick={() => printPaper(false)} className="rounded-lg border px-3 py-2 text-sm">Print / PDF</button><button type="button" onClick={() => printPaper(true)} className="rounded-lg border px-3 py-2 text-sm">Print answer key</button><label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={answerKeyVisible} onChange={(event) => setAnswerKeyVisible(event.target.checked)} />Show answers</label></div> : null}</div>
      {generated.status === "failed" ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">Generation stopped after a validation or model error. {generated.generationError ?? "The saved questions are incomplete."} Any earlier validated batches remain available for review; this incomplete paper cannot be exported.</p> : null}
      {generated.warnings.map((warning) => <p key={warning} className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{warning}</p>)}
      <div className="overflow-x-auto print:hidden"><table className="w-full min-w-[540px] text-left text-sm"><thead><tr className="border-b text-xs uppercase text-[#718078]"><th className="p-2">Resource</th><th className="p-2">Target</th><th className="p-2">Achieved</th><th className="p-2">Difference</th></tr></thead><tbody>{generated.resourceRows.map((row) => <tr key={row.resourceId} className="border-b"><th className="p-2 font-medium">{row.resourceName}</th><td className="p-2">{formatMark(row.targetMarks)}</td><td className="p-2">{formatMark(row.achievedMarks)}</td><td className={`p-2 ${row.difference ? "text-amber-800" : ""}`}>{row.difference > 0 ? "+" : ""}{formatMark(row.difference)}</td></tr>)}</tbody></table></div>
      {generated.validation.map((result) => <p key={`${result.groupId}-${result.resourceId}`} className="text-xs text-[#718078] print:hidden">{groups.find((group) => group.id === result.groupId)?.label ?? result.groupId} · {resources.find((resource) => resource.id === result.resourceId)?.name ?? result.resourceId}: {result.passed ? "validated" : result.errors.join(" ")}{result.retries ? ` · passed after ${result.retries} retry` : ""}</p>)}
      {generated.sections.map((section) => <article key={section.id} className="break-inside-avoid"><h3 className="border-b pb-2 text-xl font-semibold">{section.implicit ? "Unsectioned" : section.name}</h3>{section.groups.map((group) => <div key={group.id} className="mt-4 break-inside-avoid"><h4 className="font-semibold">{group.label}</h4><p className="mt-1 text-sm text-[#5a6a62]">Answer any {group.attempt} of the following {group.offered} questions. Each question carries {formatMark(group.marksEach)} marks. Group contribution: {formatMark(calculateAttemptedMarks([{ attempt: group.attempt, marksEach: group.marksEach }]))} marks.</p><ol className="mt-3 list-decimal space-y-4 pl-6">{group.questions.map((question) => <li key={question.id} className="pl-1"><div className="print:hidden"><textarea aria-label="Edit question text" value={question.text} onChange={(event) => updateQuestion(question.id, "text", event.target.value)} rows={2} className="w-full rounded-lg border p-2 text-sm" />{question.options?.length ? <fieldset className="mt-2 space-y-2">{question.options.map((option, index) => <label key={index} className="flex items-center gap-2 text-sm"><input type="radio" name={`correct-${question.id}`} checked={question.correctIndex === index} onChange={() => updateCorrectOption(question.id, index)} aria-label={`Mark option ${String.fromCharCode(65 + index)} correct`} /><span>{String.fromCharCode(65 + index)}.</span><input aria-label={`Edit option ${String.fromCharCode(65 + index)}`} value={option} onChange={(event) => updateOption(question.id, index, event.target.value)} className="min-w-0 flex-1 rounded border p-1.5" /></label>)}</fieldset> : null}<div className="mt-2 flex flex-wrap items-center gap-2"><button type="button" disabled={pending} onClick={() => regenerate(question.id)} className="rounded-lg border px-2.5 py-1.5 text-xs">Regenerate content</button><span className="text-xs text-[#718078]">{resources.find((resource) => resource.id === question.resourceId)?.name ?? question.resourceId} · {question.sourceChunkId}</span></div><label className="mt-2 block text-xs text-[#5a6a62]">Answer key<textarea aria-label="Edit answer" value={question.answer} onChange={(event) => updateQuestion(question.id, "answer", event.target.value)} rows={2} className="mt-1 w-full rounded-lg border p-2 text-sm" /></label></div><p className="hidden text-sm print:block">{question.text}</p>{question.options?.length ? <ol type="A" className="hidden list-[upper-alpha] pl-8 print:list-item">{question.options.map((option, index) => <li key={index}>{option}{question.correctIndex === index && answerKeyVisible ? " ✓" : ""}</li>)}</ol> : null}{answerKeyVisible ? <p className="mt-1 text-sm text-[#485b53]"><strong>Answer:</strong> {question.answer}</p> : null}</li>)}</ol></div>)}<p className="mt-4 border-t pt-2 text-right text-sm font-semibold">Section total: {formatMark(calculateAttemptedMarks(section.groups))} marks</p></article>)}
      <p className="border-t pt-3 text-right text-sm font-semibold">Paper total: {formatMark(generated.totalMarks)} marks</p>
    </section> : null}
    <style jsx global>{`@media print { body { background: white !important; } @page { margin: 18mm; } }`}</style>
  </div>;
}
