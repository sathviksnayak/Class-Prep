export type QuestionTypeDraft = {
  id: string;
  type: string;
  label: string;
  count: number;
  attempt: number | null;
  marksEach: number;
};

export type SectionDraft = { id: string; name: string; questionTypes: QuestionTypeDraft[] };
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
};

export type TemplateTotals = { totalQuestions: number; totalMarks: number | null; sections: { id: string; totalQuestions: number; totalMarks: number | null }[] };

export function calculateTemplateTotals(sections: readonly SectionDraft[]): TemplateTotals {
  let totalQuestions = 0;
  let allMarksKnown = true;
  let totalMarks = 0;
  const sectionTotals = sections.map((section) => {
    let sectionQuestions = 0;
    let sectionMarks = 0;
    let sectionMarksKnown = true;
    for (const item of section.questionTypes) {
      sectionQuestions += item.count;
      totalQuestions += item.count;
      if (item.attempt === null) {
        sectionMarksKnown = false;
        allMarksKnown = false;
      } else {
        const marks = item.attempt * item.marksEach;
        sectionMarks += marks;
        totalMarks += marks;
      }
    }
    return { id: section.id, totalQuestions: sectionQuestions, totalMarks: sectionMarksKnown ? sectionMarks : null };
  });
  return { totalQuestions, totalMarks: allMarksKnown ? totalMarks : null, sections: sectionTotals };
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
