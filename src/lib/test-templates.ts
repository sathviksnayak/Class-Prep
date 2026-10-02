import { calculateAttemptedMarks } from "./mark-calculations.js";

export type QuestionTypeDraft = {
  id: string;
  type: string;
  label: string;
  count: number | null;
  attempt: number | null;
  marksEach: number | null;
  extraction?: {
    offered: ExtractionField<number>;
    attempt: ExtractionField<number>;
    marksEach: ExtractionField<number>;
    groupMarks: ExtractionField<number>;
    sourceQuote: string;
    choiceWording: string | null;
    needsReview: boolean;
    reviewReason?: string | null;
    alternateLabel?: string | null;
  };
};

export type ExtractionStatus = "detected" | "inferred" | "needs_review" | "missing" | "edited";
export type ExtractionField<T extends number | string = number> = { value: T | null; raw: string | null; status: ExtractionStatus; alternate?: T | null };
export type SectionDraft = {
  id: string;
  name: string;
  questionTypes: QuestionTypeDraft[];
  implicit?: boolean;
  extraction?: { marks: ExtractionField<number>; sourceQuote: string | null; needsReview: boolean };
  templateExtraction?: { header: Record<string, ExtractionField<string | number>>; totalMarks: ExtractionField<number> };
};
export type TemplateExtractionMetadata = {
  status: "detected" | "needs_review" | "missing";
  warnings: string[];
  header: Record<string, ExtractionField<string | number>>;
  totalMarks: ExtractionField<number>;
};
export type TemplateDraft = {
  name: string;
  schoolName: string;
  testTitle: string;
  className: string;
  subject: string;
  examName: string;
  academicYear: string;
  duration: string;
  maximumMarks: number | null;
  rawHeaderText: string;
  sections: SectionDraft[];
  extractionMetadata?: TemplateExtractionMetadata;
};

export type TemplateTotals = { totalQuestions: number | null; totalMarks: number | null; sections: { id: string; totalQuestions: number | null; totalMarks: number | null }[] };

export function effectiveAttemptCount(item: QuestionTypeDraft): number | null {
  if (item.attempt !== null) return item.attempt;
  if (!item.extraction) return item.count;
  if (item.extraction.attempt.status === "missing" || item.extraction.attempt.status === "needs_review") return null;
  return item.count;
}

export function calculateTemplateTotals(sections: readonly SectionDraft[]): TemplateTotals {
  let totalQuestions: number | null = 0;
  let allQuestionsKnown = true;
  let allMarksKnown = true;
  const totalMarkGroups: { attempt: number; marksEach: number }[] = [];
  const sectionTotals = sections.map((section) => {
    let sectionQuestions = 0;
    let sectionQuestionsKnown = true;
    const sectionMarkGroups: { attempt: number; marksEach: number }[] = [];
    let sectionMarksKnown = true;
    if (section.questionTypes.length === 0) {
      sectionMarksKnown = false;
      sectionQuestionsKnown = false;
      allQuestionsKnown = false;
      allMarksKnown = false;
    }
    for (const item of section.questionTypes) {
      if (item.count === null) {
        sectionQuestionsKnown = false;
        allQuestionsKnown = false;
      } else {
        sectionQuestions += item.count;
      }
      const attempt = effectiveAttemptCount(item);
      if (attempt === null || item.marksEach === null) {
        sectionMarksKnown = false;
        allMarksKnown = false;
      } else {
        sectionMarkGroups.push({ attempt, marksEach: item.marksEach });
        totalMarkGroups.push({ attempt, marksEach: item.marksEach });
      }
    }
    return { id: section.id, totalQuestions: sectionQuestionsKnown ? sectionQuestions : null, totalMarks: sectionMarksKnown ? calculateAttemptedMarks(sectionMarkGroups) : null };
  });
  totalQuestions = allQuestionsKnown && sections.length > 0 ? sectionTotals.reduce((sum, item) => sum + (item.totalQuestions ?? 0), 0) : null;
  return { totalQuestions, totalMarks: allMarksKnown && sections.length > 0 ? calculateAttemptedMarks(totalMarkGroups) : null, sections: sectionTotals };
}

const q = (id: string, type: string, label: string, count: number, marksEach: number): QuestionTypeDraft => ({ id, type, label, count, attempt: count, marksEach });
const section = (id: string, name: string, questionTypes: QuestionTypeDraft[]): SectionDraft => ({ id, name, questionTypes });
const makeBuiltin = (id: string, name: string, sections: SectionDraft[]): Readonly<{ id: string; name: string; sections: readonly SectionDraft[] }> => Object.freeze({
  id, name,
  sections: Object.freeze(sections.map((item) => Object.freeze({
    ...item,
    questionTypes: Object.freeze(item.questionTypes.map((question) => Object.freeze({ ...question }))) as unknown as QuestionTypeDraft[],
  }))) as unknown as readonly SectionDraft[],
});

export const BUILTIN_TEMPLATES = Object.freeze([
  makeBuiltin("25", "25 Marks", [
    section("25-a", "Section A", [q("25-mcq", "mcq", "Multiple Choice Questions", 5, 1)]),
    section("25-b", "Section B", [q("25-fill", "fill-in-the-blanks", "Fill in the Blanks", 5, 1)]),
    section("25-c", "Section C", [q("25-short", "short-answer", "Short Answer", 3, 2)]),
    section("25-d", "Section D", [q("25-long", "long-answer", "Long Answer", 1, 9)]),
  ]),
  makeBuiltin("40", "40 Marks", [
    section("40-a", "Section A", [q("40-mcq", "mcq", "Multiple Choice Questions", 10, 1)]),
    section("40-b", "Section B", [q("40-fill", "fill-in-the-blanks", "Fill in the Blanks", 5, 1)]),
    section("40-c", "Section C", [q("40-short", "short-answer", "Short Answer", 5, 2)]),
    section("40-d", "Section D", [q("40-long", "long-answer", "Long Answer", 3, 5)]),
  ]),
  makeBuiltin("50", "50 Marks", [
    section("50-a", "Section A", [q("50-mcq", "mcq", "Multiple Choice Questions", 10, 1), q("50-fill", "fill-in-the-blanks", "Fill in the Blanks", 10, 1)]),
    section("50-b", "Section B", [q("50-short", "short-answer", "Short Answer", 5, 2)]),
    section("50-c", "Section C", [q("50-long", "long-answer", "Long Answer", 4, 5)]),
  ]),
]);

export function emptyTemplateDraft(): TemplateDraft {
  return { name: "", schoolName: "", testTitle: "", className: "", subject: "", examName: "", academicYear: "", duration: "", maximumMarks: null, rawHeaderText: "", sections: [section("section-1", "Section A", [])] };
}

export function cloneBuiltinTemplate(builtinId: string): TemplateDraft | null {
  const template = BUILTIN_TEMPLATES.find((item) => item.id === builtinId);
  if (!template) return null;
  return {
    ...emptyTemplateDraft(), name: template.name, testTitle: template.name, maximumMarks: calculateTemplateTotals(template.sections).totalMarks,
    sections: template.sections.map((group, si) => ({
      ...group, id: `section-copy-${si}-${Date.now()}`,
      questionTypes: group.questionTypes.map((item, qi) => ({ ...item, id: `question-copy-${si}-${qi}-${Date.now()}` })),
    })),
  };
}
