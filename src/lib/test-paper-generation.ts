import type { QuestionTypeDraft, SectionDraft } from "@/lib/test-templates";
import { calculateAttemptedMarks, cleanMark, formatMark, marksEqual } from "./mark-calculations.js";
export { calculateAttemptedMarks, cleanMark, formatMark, marksEqual } from "./mark-calculations.js";

export type GenerationResource = { id: string; name: string; text: string };
export type GroupAllocation = { groupId: string; sectionId: string; type: string; label: string; offered: number; attempt: number; marksEach: number };
export type QuestionSlot = { id: string; groupId: string; sectionId: string; questionType: string; marksEach: number; resourceId: string; alternativeIndex: number };
export type AllocationRow = { resourceId: string; targetMarks: number; achievedMarks: number; difference: number; maximumMarks: number };
export type AllocationResult = { slots: QuestionSlot[]; rows: AllocationRow[]; groupAllocations: GroupAllocation[]; paperTotal: number; warnings: string[] };

export type SourceChunk = { id: string; resourceId: string; resourceName: string; heading: string | null; text: string };
export type GeneratedQuestion = {
  id: string; slotId: string; groupId: string; sectionId: string; type: string; marksEach: number;
  resourceId: string; sourceChunkId: string; text: string; answer: string; options?: string[]; correctIndex?: number;
};
export type PaperSection = { id: string; name: string; implicit?: boolean; groups: { id: string; type: string; label: string; offered: number; attempt: number; marksEach: number; questions: GeneratedQuestion[] }[] };

const FIXED = 1_000_000;
function attemptForGeneration(item: QuestionTypeDraft): number | null {
  if (item.attempt !== null) return item.attempt;
  if (!item.extraction) return item.count;
  if (item.extraction.attempt.status === "missing" || item.extraction.attempt.status === "needs_review") return null;
  return item.count;
}
export function isNearDuplicateQuestion(candidate: string, existing: readonly string[]): boolean {
  const tokens = (value: string) => new Set(value.toLowerCase().match(/[a-z0-9]{2,}/g) ?? []);
  const current = tokens(candidate);
  if (!current.size) return false;
  for (const value of existing) {
    if (candidate.toLowerCase().replace(/[^a-z0-9]/g, "") === value.toLowerCase().replace(/[^a-z0-9]/g, "")) return true;
    const prior = tokens(value);
    const union = new Set([...current, ...prior]);
    let intersection = 0;
    for (const token of current) if (prior.has(token)) intersection += 1;
    if (union.size >= 6 && intersection / union.size >= 0.8) return true;
  }
  return false;
}

export function templateGroups(sections: readonly SectionDraft[]): GroupAllocation[] {
  return sections.flatMap((section) => section.questionTypes.map((group) => ({
    groupId: group.id, sectionId: section.id, type: group.type, label: group.label,
    offered: group.count ?? -1,
    attempt: attemptForGeneration(group) ?? -1,
    marksEach: group.marksEach ?? -1,
  })));
}

export function validateTemplateForGeneration(sections: readonly SectionDraft[]): string[] {
  const errors: string[] = [];
  if (!sections.length) return ["The selected template has no sections."];
  for (const section of sections) {
    if (!section.questionTypes.length) errors.push(`${section.name}: add at least one question group.`);
    for (const group of section.questionTypes) {
      const label = `${section.name} — ${group.label}`;
      if (!Number.isInteger(group.count) || (group.count ?? -1) < 1) errors.push(`${label}: enter a known whole-number offered count.`);
      if (group.marksEach === null || !Number.isFinite(group.marksEach) || group.marksEach < 0) errors.push(`${label}: enter known marks per question.`);
      const attempt = attemptForGeneration(group);
      if (!Number.isInteger(attempt) || (attempt ?? -1) < 1 || (group.count !== null && (attempt ?? Infinity) > group.count)) errors.push(`${label}: enter an attempt count from 1 through the offered count.`);
    }
  }
  return errors;
}

export function allocateQuestionSlots(
  sections: readonly SectionDraft[], resourceIds: readonly string[], matrix: Record<string, Record<string, boolean>>,
  targetByResource: Record<string, number>,
): AllocationResult {
  const errors = validateTemplateForGeneration(sections);
  if (!resourceIds.length) errors.push("Select at least one Library resource.");
  for (const id of resourceIds) {
    if (!Number.isFinite(targetByResource[id]) || targetByResource[id] < 0) errors.push("Enter a non-negative numeric mark target for every selected resource.");
  }
  const groups = templateGroups(sections);
  const paperTotal = calculateAttemptedMarks(groups.map((group) => ({ attempt: Math.max(0, group.attempt), marksEach: Math.max(0, group.marksEach) })));
  const targetTotal = cleanMark(resourceIds.reduce((sum, id) => sum + (Number.isFinite(targetByResource[id]) ? targetByResource[id] : 0), 0));
  if (resourceIds.length && !marksEqual(targetTotal, paperTotal)) errors.push(`Resource targets total ${formatMark(targetTotal)} marks; the template contributes ${formatMark(paperTotal)} marks. Adjust the targets to match.`);
  for (const group of groups) {
    const eligible = resourceIds.filter((resourceId) => matrix[resourceId]?.[group.groupId] !== false);
    if (!eligible.length) errors.push(`${group.label}: allow at least one selected resource for this group.`);
  }
  if (errors.length) throw new Error(errors.join(" "));

  const maximumByResource = new Map(resourceIds.map((id) => [id, 0]));
  for (const group of groups) {
    for (const resourceId of resourceIds) {
      if (matrix[resourceId]?.[group.groupId] !== false) maximumByResource.set(resourceId, cleanMark((maximumByResource.get(resourceId) ?? 0) + group.attempt * group.marksEach));
    }
  }
  for (const id of resourceIds) {
    if (targetByResource[id] > (maximumByResource.get(id) ?? 0) + 1 / FIXED) {
      throw new Error(`${id}: target ${formatMark(targetByResource[id])} exceeds the ${formatMark(maximumByResource.get(id) ?? 0)} marks available from allowed groups.`);
    }
  }

  const slots: QuestionSlot[] = [];
  const achieved = new Map(resourceIds.map((id) => [id, 0]));
  // Reserve groups with only one eligible source first, then distribute flexible slots largest-mark-first.
  // This avoids spending a resource's target on flexible work that another resource cannot supply.
  const ordered = [...groups].sort((a, b) => b.marksEach - a.marksEach);
  const eligibleFor = (group: GroupAllocation) => resourceIds.filter((resourceId) => matrix[resourceId]?.[group.groupId] !== false);
  for (const group of [...ordered.filter((item) => eligibleFor(item).length === 1), ...ordered.filter((item) => eligibleFor(item).length > 1)]) {
    const eligible = resourceIds.filter((resourceId) => matrix[resourceId]?.[group.groupId] !== false);
    for (let index = 0; index < group.attempt; index++) {
      eligible.sort((a, b) => {
        const gapA = targetByResource[a] - (achieved.get(a) ?? 0);
        const gapB = targetByResource[b] - (achieved.get(b) ?? 0);
        return gapB - gapA || resourceIds.indexOf(a) - resourceIds.indexOf(b);
      });
      const resourceId = eligible[0];
      const id = `${group.groupId}:slot:${index + 1}`;
      slots.push({ id, groupId: group.groupId, sectionId: group.sectionId, questionType: group.type, marksEach: group.marksEach, resourceId, alternativeIndex: index });
      achieved.set(resourceId, cleanMark((achieved.get(resourceId) ?? 0) + group.marksEach));
    }
  }

  const rows = resourceIds.map((resourceId) => {
    const targetMarks = cleanMark(targetByResource[resourceId]);
    const achievedMarks = cleanMark(achieved.get(resourceId) ?? 0);
    return { resourceId, targetMarks, achievedMarks, difference: cleanMark(achievedMarks - targetMarks), maximumMarks: cleanMark(maximumByResource.get(resourceId) ?? 0) };
  });
  const warnings = rows.filter((row) => !marksEqual(row.targetMarks, row.achievedMarks)).map((row) => `Resource ${row.resourceId} target ${formatMark(row.targetMarks)}; achieved ${formatMark(row.achievedMarks)} (difference ${row.difference > 0 ? "+" : ""}${formatMark(row.difference)}). Review the allocation.`);
  return { slots, rows, groupAllocations: groups, paperTotal, warnings };
}

export function buildChunks(resources: readonly GenerationResource[], maxChunkLength = 1400, overlap = 160): SourceChunk[] {
  const chunks: SourceChunk[] = [];
  const overlapSize = Math.max(0, Math.min(overlap, Math.floor(maxChunkLength / 3)));
  for (const resource of resources) {
    const paragraphs = resource.text.replace(/\r/g, "").split(/\n+/).map((item) => item.trim()).filter(Boolean);
    let heading: string | null = null;
    let buffer = "";
    let index = 0;
    const flush = (keepOverlap = true) => {
      if (!buffer.trim()) return;
      const text = buffer.trim();
      chunks.push({ id: `${resource.id}:chunk:${index++}`, resourceId: resource.id, resourceName: resource.name, heading, text });
      buffer = keepOverlap && overlapSize ? text.slice(-overlapSize) : "";
    };
    const append = (content: string) => {
      let remaining = content;
      while (remaining.length) {
        let room = maxChunkLength - buffer.length;
        if (room <= 0) { flush(); room = maxChunkLength - buffer.length; }
        if (remaining.length <= room) { buffer += remaining; return; }
        const window = remaining.slice(0, room);
        const cut = Math.max(window.lastIndexOf(". "), window.lastIndexOf(" "));
        const take = cut > room * 0.55 ? cut + 1 : room;
        buffer += remaining.slice(0, take);
        flush();
        remaining = remaining.slice(take).trimStart();
      }
    };
    for (const paragraph of paragraphs) {
      if (/^(chapter\s+\S+|unit\s+\S+|\d+(?:\.\d+)*\s+[A-Z][^.!?]{0,80})$/i.test(paragraph) && paragraph.length < 120) {
        flush(false); heading = paragraph; buffer = `${heading}\n`;
        continue;
      }
      append(`${paragraph}\n`);
    }
    flush(false);
  }
  return chunks;
}

export function retrieveRelevantChunks(chunks: readonly SourceChunk[], query: string, limit = 8): SourceChunk[] {
  if (!chunks.length) return [];
  const stop = new Set(["the", "and", "for", "with", "from", "that", "this", "question", "questions", "answer", "answers", "marks", "each", "following", "section"]);
  const terms = [...new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])].filter((term) => !stop.has(term));
  const ranked = chunks.map((chunk, index) => {
    const haystack = `${chunk.heading ?? ""} ${chunk.text}`.toLowerCase();
    const score = terms.reduce((sum, term) => sum + (haystack.match(new RegExp(`\\b${term}\\b`, "g"))?.length ?? 0), 0);
    return { chunk, index, score };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = ranked.slice(0, Math.min(limit, ranked.length));
  if (selected.every((item) => item.score === 0) && ranked.length > limit) {
    const covered = new Set<number>();
    const spread = Array.from({ length: limit }, (_, index) => Math.floor(index * (ranked.length - 1) / Math.max(1, limit - 1)));
    for (const index of spread) covered.add(index);
    return [...covered].map((index) => ranked[index].chunk);
  }
  return selected.map((item) => item.chunk);
}

export function validateGeneratedGroup(
  questions: GeneratedQuestion[], expected: number, group: GroupAllocation, assignedResourceId: string,
  chunks: readonly SourceChunk[], alreadyGeneratedTexts: readonly string[],
): string[] {
  const errors: string[] = [];
  if (questions.length !== expected) errors.push(`Expected ${expected} questions; received ${questions.length}.`);
  const chunksById = new Map(chunks.map((item) => [item.id, item]));
  const seen: string[] = [...alreadyGeneratedTexts];
  for (const [index, question] of questions.entries()) {
    const chunk = chunksById.get(question.sourceChunkId);
    if (!chunk) errors.push(`Question ${index + 1} cites a missing source chunk.`);
    else if (chunk.resourceId !== assignedResourceId || question.resourceId !== assignedResourceId) errors.push(`Question ${index + 1} cites a source outside its assigned resource.`);
    if (question.groupId !== group.groupId || question.type !== group.type) errors.push(`Question ${index + 1} is assigned to the wrong group.`);
    if (!question.text?.trim() || !question.answer?.trim()) errors.push(`Question ${index + 1} is missing question text or answer.`);
    if (isNearDuplicateQuestion(question.text, seen)) errors.push(`Question ${index + 1} duplicates or closely resembles another question.`);
    seen.push(question.text);
    if (/mcq|multiple.choice/i.test(group.type)) {
      const options = question.options ?? [];
      const correctIndex = question.correctIndex;
      if (options.length !== 4 || options.some((item) => !item.trim())) errors.push(`MCQ ${index + 1} needs exactly four non-empty options.`);
      if (!Number.isInteger(correctIndex) || correctIndex === undefined || correctIndex < 0 || correctIndex >= options.length) errors.push(`MCQ ${index + 1} needs exactly one correct option index.`);
      else if (question.answer.trim().toLowerCase() !== options[correctIndex].trim().toLowerCase()) errors.push(`MCQ ${index + 1} answer must match its selected correct option.`);
    }
    if (/fill/i.test(group.type) && !/_{2,}|\[blank\]|<blank>|\(\s*\)/i.test(question.text)) errors.push(`Fill-in question ${index + 1} needs a visible blank marker.`);
    if (/true.?false/i.test(group.type) && !/^(true|false)$/i.test(question.answer.trim())) errors.push(`True/False answer ${index + 1} must be True or False.`);
  }
  return [...new Set(errors)];
}

export function questionsForTemplate(sections: readonly SectionDraft[], questions: GeneratedQuestion[]): PaperSection[] {
  return sections.map((section) => ({
    id: section.id, name: section.name, implicit: section.implicit,
    groups: section.questionTypes.map((group) => ({
      id: group.id, type: group.type, label: group.label, offered: group.count ?? 0,
      attempt: group.attempt ?? group.count ?? 0, marksEach: group.marksEach ?? 0,
      questions: questions.filter((item) => item.groupId === group.id).sort((a, b) => a.slotId.localeCompare(b.slotId, undefined, { numeric: true })),
    })),
  }));
}
