import { randomUUID } from "node:crypto";
import type { GeneratedQuestion, GroupAllocation, SourceChunk } from "@/lib/test-paper-generation";

type QuestionContent = { text: string; answer: string; sourceChunkId: string; options: string[]; correctIndex: number | null };
function isNearDuplicateQuestion(candidate: string, existing: readonly string[]): boolean {
  const tokens = (value: string) => new Set(value.toLowerCase().match(/[a-z0-9]{2,}/g) ?? []);
  const current = tokens(candidate);
  return existing.some((value) => {
    if (candidate.toLowerCase().replace(/[^a-z0-9]/g, "") === value.toLowerCase().replace(/[^a-z0-9]/g, "")) return true;
    const prior = tokens(value); const union = new Set([...current, ...prior]);
    let intersection = 0; for (const token of current) if (prior.has(token)) intersection += 1;
    return union.size >= 6 && intersection / union.size >= 0.8;
  });
}
const schema = {
  type: "object", additionalProperties: false, required: ["questions"], properties: {
    questions: { type: "array", items: { type: "object", additionalProperties: false,
      required: ["text", "answer", "sourceChunkId", "options", "correctIndex"], properties: {
        text: { type: "string" }, answer: { type: "string" }, sourceChunkId: { type: "string" },
        options: { type: "array", items: { type: "string" }, maxItems: 8 },
        correctIndex: { anyOf: [{ type: "integer", minimum: 0, maximum: 7 }, { type: "null" }] },
      } } },
  },
};

function parseContent(raw: string, expected: number): QuestionContent[] {
  const result: unknown = JSON.parse(raw);
  if (!result || typeof result !== "object" || !Array.isArray((result as { questions?: unknown }).questions)) throw new Error("The model returned malformed question JSON.");
  const questions = (result as { questions: unknown[] }).questions;
  if (questions.length !== expected) throw new Error(`The model returned ${questions.length} questions; ${expected} were required.`);
  return questions.map((value) => {
    if (!value || typeof value !== "object") throw new Error("A generated question is malformed.");
    const item = value as Record<string, unknown>;
    if (![item.text, item.answer, item.sourceChunkId].every((entry) => typeof entry === "string" && entry.trim())
      || !Array.isArray(item.options) || !item.options.every((entry) => typeof entry === "string")
      || !(item.correctIndex === null || Number.isInteger(item.correctIndex))) throw new Error("A generated question is missing required fields.");
    return item as QuestionContent;
  });
}

export async function generateGroupQuestions(args: {
  group: GroupAllocation; resourceId: string; chunks: SourceChunk[]; assignments: { slotId: string }[];
  existingTexts: string[]; fetcher?: typeof fetch;
}): Promise<{ questions: GeneratedQuestion[]; validationErrors: string[]; retries: number }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("AI question generation is not configured on the server. Please contact your administrator to set up GROQ_API_KEY.");
  if (!args.chunks.length) throw new Error("The assigned resource has no readable text chunks.");
  const fetcher = args.fetcher ?? fetch;
  const isMcq = /mcq|multiple.choice/i.test(args.group.type);
  const kind = /fill/i.test(args.group.type) ? "fill in the blank, using ____ as the visible blank marker"
    : /true.?false/i.test(args.group.type) ? "true/false, with answer exactly True or False"
    : /short/i.test(args.group.type) ? "short answer"
    : /long/i.test(args.group.type) ? "long answer"
    : /match/i.test(args.group.type) ? "matching question"
    : isMcq ? "multiple choice with four plausible options and one correct answer"
    : `${args.group.label} question`;
  let lastError = "Question generation failed.";
  for (let retry = 0; retry <= 1; retry++) {
    try {
      const response = await fetcher("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || process.env.TEST_GENERATION_MODEL || "llama-3.3-70b-versatile",
          temperature: retry ? 0.2 : 0.4,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: `Write exactly ${args.assignments.length} original ${kind} questions from the provided source chunks only. Generate content and answer only; never write numbering, marks, sections, totals, or resource assignments. Every question must be directly supported by one supplied chunk and cite that exact chunk id. Avoid duplicates. For non-MCQ use options=[] and correctIndex=null. For MCQ provide exactly four options, set the unique correctIndex, and make answer exactly match the text of that option. For fill-in questions include ____ in question text. For true/false answers use exactly True or False. Output valid JSON in the format: {"questions": [{"text": "...", "answer": "...", "sourceChunkId": "...", "options": [...], "correctIndex": 0}]}.` },
            { role: "user", content: JSON.stringify({ group: args.group.label, sourceChunks: args.chunks.map(({ id, heading, text }) => ({ id, heading, text })), count: args.assignments.length, existingQuestionTexts: args.existingTexts.slice(0, 150) }) },
          ],
        }),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw new Error("AI service access was rejected. Check your GROQ_API_KEY configuration.");
        if (response.status === 429) throw new Error("AI question service rate limit reached. Please wait a moment before trying again.");
        if (response.status >= 500) throw new Error(`AI question service is temporarily unavailable (Status ${response.status}). Please try again later.`);
        throw new Error(`AI question service returned status ${response.status}.`);
      }
      const payload = await response.json() as { choices?: { message?: { content?: string | null } }[] };
      const raw = payload.choices?.[0]?.message?.content;
      if (!raw) throw new Error("The AI question service returned an empty response.");
      const content = parseContent(raw, args.assignments.length);
      const chunkIds = new Set(args.chunks.map((chunk) => chunk.id));
      const questions = content.map((item, index): GeneratedQuestion => ({
        id: randomUUID(), slotId: args.assignments[index].slotId, groupId: args.group.groupId,
        sectionId: args.group.sectionId, type: args.group.type, marksEach: args.group.marksEach,
        resourceId: args.resourceId, sourceChunkId: item.sourceChunkId,
        text: item.text.trim(), answer: item.answer.trim(), ...(item.options.length ? { options: item.options } : {}),
        ...(item.correctIndex === null ? {} : { correctIndex: item.correctIndex }),
      }));
      const errors: string[] = [];
      for (const [index, question] of questions.entries()) {
        if (!chunkIds.has(question.sourceChunkId)) errors.push(`Question ${index + 1} cited a chunk outside its assigned resource.`);
        if (isMcq && (!question.options || question.options.length !== 4 || !Number.isInteger(question.correctIndex) || (question.correctIndex ?? 9) >= question.options.length)) errors.push(`MCQ ${index + 1} needs four options and one correct answer.`);
        if (isMcq && question.options && Number.isInteger(question.correctIndex) && question.answer.trim().toLowerCase() !== question.options[question.correctIndex!]?.trim().toLowerCase()) errors.push(`MCQ ${index + 1} answer must match its selected correct option.`);
        if (/fill/i.test(question.type) && !/_{2,}|\[blank\]|<blank>|\(\s*\)/i.test(question.text)) errors.push(`Fill-in question ${index + 1} has no blank marker.`);
        if (/true.?false/i.test(question.type) && !/^(true|false)$/i.test(question.answer)) errors.push(`True/False question ${index + 1} has an invalid answer.`);
      }
      const dedupe = [...args.existingTexts];
      for (const question of questions) {
        if (isNearDuplicateQuestion(question.text, dedupe)) errors.push("Generated questions contain a duplicate or near-duplicate.");
        dedupe.push(question.text);
      }
      if (errors.length) throw new Error(errors.join(" "));
      return { questions, validationErrors: [], retries: retry };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Question generation failed.";
    }
  }
  throw new Error(`Could not generate a valid ${args.group.label} batch after one retry. ${lastError}`);
}
