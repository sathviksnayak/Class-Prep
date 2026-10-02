import type { ExtractionField, QuestionTypeDraft, SectionDraft } from "@/lib/test-templates";

type ModelGroup = {
  label: string;
  sourceQuote: string;
  offered: number | null;
  attempt: number | null;
  marksEach: number | null;
  choiceWording: string | null;
};
type ModelResult = { sections: { name: string; implicit: boolean; groups: ModelGroup[] }[] };

const integerOrNull = { anyOf: [{ type: "integer", minimum: 0, maximum: 10000 }, { type: "null" }] };
const marksEachSchema = { anyOf: [{ type: "number", minimum: 0, maximum: 1000 }, { type: "null" }] };
const modelSchema = {
  type: "object", additionalProperties: false, required: ["sections"],
  properties: {
    sections: {
      type: "array", maxItems: 40, items: {
        type: "object", additionalProperties: false, required: ["name", "implicit", "groups"],
        properties: {
          name: { type: "string" }, implicit: { type: "boolean" },
          groups: {
            type: "array", maxItems: 150, items: {
              type: "object", additionalProperties: false, required: ["label", "sourceQuote", "offered", "attempt", "marksEach", "choiceWording"],
              properties: {
                label: { type: "string" }, sourceQuote: { type: "string" }, offered: integerOrNull,
                attempt: integerOrNull, marksEach: marksEachSchema, choiceWording: { anyOf: [{ type: "string" }, { type: "null" }] },
              },
            },
          },
        },
      },
    },
  },
};

function isModelResult(value: unknown): value is ModelResult {
  if (!value || typeof value !== "object" || !Array.isArray((value as ModelResult).sections)) return false;
  const sections = (value as ModelResult).sections;
  if (sections.length > 40) return false;
  return sections.every((section) => section && typeof section.name === "string" && typeof section.implicit === "boolean"
    && Array.isArray(section.groups) && section.groups.length <= 150
    && section.groups.every((group) => group && typeof group.label === "string" && typeof group.sourceQuote === "string"
      && [group.offered, group.attempt].every((item) => item === null || (Number.isInteger(item) && item >= 0 && item <= 10000))
      && (group.marksEach === null || (Number.isFinite(group.marksEach) && group.marksEach >= 0 && group.marksEach <= 1000))
      && (group.choiceWording === null || typeof group.choiceWording === "string")
      && (group.offered === null || group.attempt === null || group.attempt <= group.offered)));
}

function mergeField(deterministic: ExtractionField | undefined, proposed: number | null): { field: ExtractionField; conflict: boolean } {
  const current = deterministic ?? { value: null, raw: null, status: "missing" as const };
  if (proposed === current.value) return { field: current, conflict: false };
  return {
    field: { ...current, status: "needs_review", alternate: proposed },
    conflict: current.value !== null,
  };
}

/** Optional structured second pass. Any timeout, API/schema error, or invalid source quote returns deterministic groups. */
export async function enrichWithStructuredModel(
  rawText: string,
  normalizedText: string,
  deterministicSections: SectionDraft[],
  fetcher: typeof fetch = fetch,
): Promise<SectionDraft[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || deterministicSections.every((section) => section.questionTypes.length === 0)) return deterministicSections;

  try {
    const response = await fetcher("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        model: process.env.TEST_PAPER_EXTRACTION_MODEL || "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_schema", json_schema: { name: "test_paper_structure", strict: true, schema: modelSchema } },
        messages: [
          { role: "system", content: "Extract only supported test-paper section and question-group facts. Keep every numeric field null when the exact text does not support it. Never convert a group total mark into marks per question. Include an exact verbatim sourceQuote substring for every group. Preserve the supplied section hierarchy; do not create sections/groups without textual evidence." },
          { role: "user", content: JSON.stringify({
            normalizedText: normalizedText.slice(0, 24000),
            deterministicCandidates: deterministicSections.map((section) => ({
              name: section.name, implicit: Boolean(section.implicit),
              groups: section.questionTypes.map((group) => ({
                label: group.label,
                offered: group.extraction?.offered ?? { value: group.count, raw: null, status: group.count === null ? "missing" : "inferred" },
                attempt: group.extraction?.attempt ?? { value: group.attempt, raw: null, status: group.attempt === null ? "missing" : "inferred" },
                marksEach: group.extraction?.marksEach ?? { value: group.marksEach, raw: null, status: group.marksEach === null ? "missing" : "inferred" },
                groupMarksCue: group.extraction?.groupMarks ?? null,
                numberedCount: group.count, sourceQuote: group.extraction?.sourceQuote ?? "",
                choiceWording: group.extraction?.choiceWording ?? null,
              })),
            })),
          }, null, 2) },
        ],
      }),
    });
    if (!response.ok) return deterministicSections;
    const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return deterministicSections;
    const parsed: unknown = JSON.parse(content);
    if (!isModelResult(parsed)) return deterministicSections;

    return deterministicSections.map((section, sectionIndex) => {
      const modelSection = parsed.sections[sectionIndex];
      if (!modelSection) return section;
      const questionTypes: QuestionTypeDraft[] = section.questionTypes.map((group) => {
        const sourceQuote = group.extraction?.sourceQuote ?? "";
        const modelGroup = modelSection.groups.find((candidate) => candidate.sourceQuote === sourceQuote && rawText.includes(candidate.sourceQuote));
        if (!modelGroup || !sourceQuote || !rawText.includes(sourceQuote)) return group;
        const offered = mergeField(group.extraction?.offered, modelGroup.offered);
        const attempt = mergeField(group.extraction?.attempt, modelGroup.attempt);
        const marksEach = mergeField(group.extraction?.marksEach, modelGroup.marksEach);
        const conflict = offered.conflict || attempt.conflict || marksEach.conflict
          || offered.field.alternate !== undefined || attempt.field.alternate !== undefined || marksEach.field.alternate !== undefined
          || modelGroup.label !== group.label;
        if (!conflict) return group;
        const reason = "The structured review disagreed with deterministic parsing. Confirm the original wording and values.";
        return {
          ...group,
          extraction: {
            offered: offered.field, attempt: attempt.field, marksEach: marksEach.field,
            groupMarks: group.extraction?.groupMarks ?? { value: null, raw: null, status: "missing" },
            sourceQuote,
            choiceWording: group.extraction?.choiceWording ?? modelGroup.choiceWording,
            needsReview: true,
            reviewReason: reason,
            alternateLabel: modelGroup.label !== group.label ? modelGroup.label : null,
          },
        };
      });
      return { ...section, questionTypes };
    });
  } catch {
    return deterministicSections;
  }
}
