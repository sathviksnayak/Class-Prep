"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin, STORAGE_BUCKET, assertPrivateStorageBucket } from "@/lib/supabase";
import type { SectionDraft, TemplateDraft } from "@/lib/test-templates";
import { allocateQuestionSlots, buildChunks, calculateAttemptedMarks, cleanMark, marksEqual, questionsForTemplate, retrieveRelevantChunks, templateGroups, validateGeneratedGroup, validateTemplateForGeneration, type GeneratedQuestion, type GenerationResource, type GroupAllocation, type PaperSection, type SourceChunk } from "@/lib/test-paper-generation";
import { generateGroupQuestions } from "@/lib/question-generation";
import { hasUsableExtractedText } from "@/lib/test-paper-extraction";
import { createGeneratedPaperDocx } from "@/lib/test-paper-docx";

async function requireOwner() {
  const userId = (await auth())?.user?.id;
  if (!userId) throw new Error("Please sign in to generate test papers.");
  return userId;
}

async function readLibraryResource(document: { id: string; name: string; type: string; storagePath: string; extractedText: string | null }): Promise<GenerationResource> {
  let text = document.extractedText ?? "";
  if (!text.trim()) {
    await assertPrivateStorageBucket();
    const { data, error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).download(document.storagePath);
    if (error || !data) throw new Error(`${document.name}: the Library file could not be opened from secure storage.`);
    const buffer = Buffer.from(await data.arrayBuffer());
    try {
      if (document.type.toLowerCase() === "pdf") {
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: buffer });
        try { text = (await parser.getText()).text; } finally { await parser.destroy(); }
      } else if (document.type.toLowerCase() === "docx") {
        const mammoth = await import("mammoth");
        text = (await mammoth.extractRawText({ buffer })).value;
      } else {
        throw new Error("Only PDF and DOCX Library resources can be used for generation.");
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("Only PDF and DOCX")) throw error;
      throw new Error(`${document.name}: text could not be extracted. Scanned or image-only PDFs need OCR and cannot be used yet.`);
    }
  }
  if (!hasUsableExtractedText(text)) throw new Error(`${document.name}: no usable extracted text was found. Scanned/image-only resources need OCR before they can generate questions.`);
  return { id: document.id, name: document.name, text };
}

function validateConfiguration(resourceIds: string[], matrix: Record<string, Record<string, boolean>>, targets: Record<string, number>, groups: GroupAllocation[]) {
  if (!Array.isArray(resourceIds) || resourceIds.length < 1 || resourceIds.length > 12 || resourceIds.some((id) => typeof id !== "string" || id.length > 100) || new Set(resourceIds).size !== resourceIds.length) {
    throw new Error("Select between 1 and 12 distinct Library resources.");
  }
  if (!matrix || typeof matrix !== "object" || !targets || typeof targets !== "object") throw new Error("The resource allocation configuration is invalid.");
  for (const id of resourceIds) {
    const target = targets[id];
    if (typeof target !== "number" || !Number.isFinite(target) || target < 0 || target > 100000) throw new Error("Enter a non-negative numeric mark target for every selected resource.");
  }
  for (const [resourceId, cells] of Object.entries(matrix)) {
    if (!resourceIds.includes(resourceId) || !cells || typeof cells !== "object") throw new Error("The allocation matrix contains an unknown resource.");
    for (const [groupId, allowed] of Object.entries(cells)) {
      if (!groups.some((group) => group.groupId === groupId) || typeof allowed !== "boolean") throw new Error("The allocation matrix contains an invalid group setting.");
    }
  }
}

export async function generatePaper(templateId: string, resourceIds: string[], matrix: Record<string, Record<string, boolean>>, targets: Record<string, number>, generationId: string) {
  const userId = await requireOwner();
  if (typeof templateId !== "string" || !templateId) throw new Error("Choose a saved test template.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(generationId)) throw new Error("Invalid generation request. Please try again.");
  const template = await prisma.testTemplate.findFirst({ where: { id: templateId, userId } });
  if (!template) throw new Error("That test template is unavailable.");
  const sections = template.sections as unknown as SectionDraft[];
  const templateErrors = validateTemplateForGeneration(sections);
  if (templateErrors.length) throw new Error(`Complete the template before generating: ${templateErrors.join(" ")}`);
  const groups = templateGroups(sections);
  validateConfiguration(resourceIds, matrix, targets, groups);

  const documents = await prisma.document.findMany({
    where: { id: { in: resourceIds }, userId },
    select: { id: true, name: true, type: true, storagePath: true, extractedText: true },
  });
  if (documents.length !== resourceIds.length) throw new Error("One or more selected Library resources are unavailable. Check ownership and selection, then try again.");
  const resources = await Promise.all(resourceIds.map((id) => readLibraryResource(documents.find((doc) => doc.id === id)!)));
  const chunks = buildChunks(resources);
  const chunkCountByResource = new Map(resourceIds.map((id) => [id, chunks.filter((chunk) => chunk.resourceId === id).length]));
  for (const resource of resources) if (!chunkCountByResource.get(resource.id)) throw new Error(`${resource.name}: no readable chunks were produced, so it cannot supply questions.`);

  const allocation = allocateQuestionSlots(sections, resourceIds, matrix, targets);
  const questionAssignments: { group: GroupAllocation; resourceId: string; slotId: string }[] = [];
  for (const group of allocation.groupAllocations) {
    const slots = allocation.slots.filter((slot) => slot.groupId === group.groupId);
    if (!slots.length) throw new Error(`${group.label}: no attempted slots could be allocated.`);
    for (let index = 0; index < group.offered; index++) {
      // Offered alternatives reuse an attempted allocation slot, keeping every choice in that same resource context.
      const slot = slots[index % slots.length];
      questionAssignments.push({ group, resourceId: slot.resourceId, slotId: slot.id });
    }
  }

  const questions: GeneratedQuestion[] = [];
  const validationResults: { groupId: string; resourceId: string; retries: number; passed: boolean; errors: string[] }[] = [];
  const pairs = new Map<string, typeof questionAssignments>();
  for (const assignment of questionAssignments) {
    const key = `${assignment.group.groupId}\u0000${assignment.resourceId}`;
    pairs.set(key, [...(pairs.get(key) ?? []), assignment]);
  }
  const title = template.testTitle || template.name;
  const resourceRows = allocation.rows.map((row) => ({ ...row, resourceName: resources.find((item) => item.id === row.resourceId)?.name ?? row.resourceId }));
  const record = await prisma.generatedPaper.create({
    data: {
      id: generationId, userId, templateId,
      templateSnapshot: { id: template.id, versionUpdatedAt: template.updatedAt.toISOString(), name: template.name, testTitle: template.testTitle, schoolName: template.schoolName, className: template.className, subject: template.subject, examName: template.examName, academicYear: template.academicYear, duration: template.duration, maximumMarks: template.maximumMarks, sections } as Prisma.InputJsonValue,
      configuration: {
        selectedResources: resources.map(({ id, name }) => ({ id, name })), matrix, targets: resourceIds.map((id) => ({ resourceId: id, targetMarks: cleanMark(targets[id]) })),
        resourceGroupAttemptedMarks: allocation.rows, slotAssignments: allocation.slots,
        questionAssignments: questionAssignments.map((assignment, index) => ({ questionIndex: index, groupId: assignment.group.groupId, resourceId: assignment.resourceId, slotId: assignment.slotId })), sourceChunks: [],
      } as unknown as Prisma.InputJsonValue,
      paper: { title, sections: [], questions: [], totalMarks: allocation.paperTotal, resourceRows, warnings: [] } as unknown as Prisma.InputJsonValue,
      validation: { passed: false, expectedQuestionCount: questionAssignments.length, actualQuestionCount: 0, groups: [], phase: "generating", completedBatches: 0, totalBatches: pairs.size, warnings: [] } as Prisma.InputJsonValue,
      status: "generating",
    }, select: { id: true },
  });
  for (const assignments of pairs.values()) {
    const first = assignments[0];
    const groupLabel = `${first.group.label} ${template.subject ?? ""} ${template.testTitle ?? ""}`;
    const resourceChunks = retrieveRelevantChunks(chunks.filter((chunk) => chunk.resourceId === first.resourceId), groupLabel);
    const before = [...questions.map((question) => question.text)];
    let generated;
    try {
      generated = await generateGroupQuestions({
        group: first.group, resourceId: first.resourceId, chunks: resourceChunks,
        assignments: assignments.map(({ slotId }) => ({ slotId })), existingTexts: before,
      });
    } catch (error) {
      const message = `${first.group.label} from ${resources.find((item) => item.id === first.resourceId)?.name}: ${error instanceof Error ? error.message : "generation failed"}`;
      await prisma.generatedPaper.update({ where: { id: record.id }, data: { status: "failed", validation: { passed: false, expectedQuestionCount: questionAssignments.length, actualQuestionCount: questions.length, groups: validationResults, phase: "failed", completedBatches: validationResults.length, totalBatches: pairs.size, generationError: message } as Prisma.InputJsonValue } });
      throw new Error(message);
    }
    const groupValidation = validateGeneratedGroup(generated.questions, assignments.length, first.group, first.resourceId, resourceChunks, before);
    validationResults.push({ groupId: first.group.groupId, resourceId: first.resourceId, retries: generated.retries, passed: groupValidation.length === 0, errors: groupValidation });
    if (groupValidation.length) {
      const message = `${first.group.label}: generated questions failed validation. ${groupValidation.join(" ")}`;
      await prisma.generatedPaper.update({ where: { id: record.id }, data: { status: "failed", validation: { passed: false, expectedQuestionCount: questionAssignments.length, actualQuestionCount: questions.length, groups: validationResults, phase: "failed", completedBatches: validationResults.length, totalBatches: pairs.size, generationError: message } as Prisma.InputJsonValue } });
      throw new Error(message);
    }
    questions.push(...generated.questions);
    const partialIds = new Set(questions.map((question) => question.sourceChunkId));
    const sourceChunks = chunks.filter((chunk) => partialIds.has(chunk.id));
    await prisma.generatedPaper.update({
      where: { id: record.id },
      data: {
        paper: { title, sections: questionsForTemplate(sections, questions), questions, totalMarks: allocation.paperTotal, resourceRows, warnings: [] } as unknown as Prisma.InputJsonValue,
        configuration: { selectedResources: resources.map(({ id, name }) => ({ id, name })), matrix, targets: resourceIds.map((id) => ({ resourceId: id, targetMarks: cleanMark(targets[id]) })), resourceGroupAttemptedMarks: allocation.rows, slotAssignments: allocation.slots, questionAssignments: questionAssignments.map((assignment, index) => ({ questionIndex: index, groupId: assignment.group.groupId, resourceId: assignment.resourceId, slotId: assignment.slotId })), sourceChunks } as unknown as Prisma.InputJsonValue,
        validation: { passed: false, expectedQuestionCount: questionAssignments.length, actualQuestionCount: questions.length, groups: validationResults, phase: "generating", completedBatches: validationResults.length, totalBatches: pairs.size } as Prisma.InputJsonValue,
      },
    });
  }

  const expectedCount = allocation.groupAllocations.reduce((sum, group) => sum + group.offered, 0);
  if (questions.length !== expectedCount) throw new Error(`Generation validation failed: expected ${expectedCount} offered questions but received ${questions.length}.`);
  const paperSections = questionsForTemplate(sections, questions);
  const expectedTotal = calculateAttemptedMarks(allocation.groupAllocations);
  if (!marksEqual(expectedTotal, allocation.paperTotal)) throw new Error("The final paper total did not match the template. Nothing was saved.");
  const usedChunkIds = [...new Set(questions.map((question) => question.sourceChunkId))];
  const usedChunks = chunks.filter((chunk) => usedChunkIds.includes(chunk.id));
  const warnings = [...allocation.warnings];
  if (allocation.rows.some((row) => !marksEqual(row.targetMarks, row.achievedMarks))) warnings.push("Exact resource targets are not always reachable with the allowed question marks. Targets were preserved; review achieved values and differences.");

  await prisma.generatedPaper.update({
    where: { id: record.id },
    data: {
      configuration: { selectedResources: resources.map(({ id, name }) => ({ id, name })), matrix, targets: resourceIds.map((id) => ({ resourceId: id, targetMarks: cleanMark(targets[id]) })), resourceGroupAttemptedMarks: allocation.rows, slotAssignments: allocation.slots, questionAssignments: questionAssignments.map((assignment, index) => ({ questionIndex: index, groupId: assignment.group.groupId, resourceId: assignment.resourceId, slotId: assignment.slotId })), sourceChunks: usedChunks } as unknown as Prisma.InputJsonValue,
      paper: { title, sections: paperSections, questions, totalMarks: expectedTotal, resourceRows, warnings } as unknown as Prisma.InputJsonValue,
      validation: { passed: validationResults.every((result) => result.passed), expectedQuestionCount: expectedCount, actualQuestionCount: questions.length, expectedTotal, calculatedTotal: calculateAttemptedMarks(allocation.groupAllocations), groups: validationResults, phase: "complete", completedBatches: pairs.size, totalBatches: pairs.size, warnings } as Prisma.InputJsonValue,
      status: warnings.length ? "review" : "ready",
    },
  });
  revalidatePath("/generate");
  return { id: record.id, title, sections: paperSections, questions, totalMarks: expectedTotal, resourceRows, warnings, validation: validationResults, status: warnings.length ? "review" : "ready" };
}

export async function updateGeneratedPaper(paperId: string, proposed: Pick<GeneratedQuestion, "id" | "text" | "answer" | "options" | "correctIndex">[]) {
  const userId = await requireOwner();
  const record = await prisma.generatedPaper.findFirst({ where: { id: paperId, userId } });
  if (!record) throw new Error("Generated paper not found.");
  if (!Array.isArray(proposed) || proposed.length > 1000) throw new Error("Invalid paper edit payload.");
  const saved = record.paper as unknown as { questions: GeneratedQuestion[]; sections: PaperSection[]; warnings: string[]; totalMarks: number; resourceRows: unknown[] };
  const byId = new Map(proposed.map((item) => [item.id, item]));
  if (byId.size !== saved.questions.length || saved.questions.some((question) => !byId.has(question.id))) throw new Error("The paper structure changed. Reload before saving edits.");
  const questions = saved.questions.map((question) => {
    const edited = byId.get(question.id)!;
    if (typeof edited.text !== "string" || edited.text.trim().length < 3 || edited.text.length > 5000 || typeof edited.answer !== "string" || edited.answer.trim().length < 1 || edited.answer.length > 5000) throw new Error("Question text and answers must be between 1 and 5000 characters.");
    if (question.options) {
      if (!Array.isArray(edited.options) || edited.options.length !== 4 || edited.options.some((option) => typeof option !== "string" || !option.trim() || option.length > 1000)) throw new Error("MCQ edits must retain four non-empty options.");
      if (!Number.isInteger(edited.correctIndex) || (edited.correctIndex ?? -1) < 0 || (edited.correctIndex ?? 9) >= edited.options.length) throw new Error("Choose exactly one correct MCQ option.");
      if (edited.answer.trim().toLowerCase() !== edited.options[edited.correctIndex!].trim().toLowerCase()) throw new Error("The answer key must match the selected correct MCQ option.");
    }
    if (/fill/i.test(question.type) && !/_{2,}|\[blank\]|<blank>|\(\s*\)/i.test(edited.text)) throw new Error("Fill-in questions must keep a visible blank marker.");
    if (/true.?false/i.test(question.type) && !/^(true|false)$/i.test(edited.answer.trim())) throw new Error("True/False answers must be True or False.");
    return { ...question, text: edited.text.trim(), answer: edited.answer.trim(), ...(question.options ? { options: edited.options!.map((option) => option.trim()), correctIndex: edited.correctIndex! } : {}) };
  });
  for (let index = 0; index < questions.length; index += 1) {
    if (questions.some((question, otherIndex) => otherIndex < index && question.text.toLowerCase().replace(/[^a-z0-9]/g, "") === questions[index].text.toLowerCase().replace(/[^a-z0-9]/g, ""))) throw new Error("Question edits created a duplicate. Make each question distinct.");
  }
  const paperSections = (record.paper as unknown as { sections: PaperSection[] }).sections.map((section) => ({ ...section, groups: section.groups.map((group) => ({ ...group, questions: questions.filter((question) => question.groupId === group.id) })) }));
  const validation = record.validation as unknown as Record<string, unknown>;
  await prisma.generatedPaper.update({ where: { id: paperId }, data: { paper: { ...saved, questions, sections: paperSections } as unknown as Prisma.InputJsonValue, validation: { ...validation, teacherEdited: true } as Prisma.InputJsonValue, status: "review" } });
  revalidatePath("/generate");
  return { ok: true };
}

export async function regeneratePaperQuestion(paperId: string, questionId: string) {
  const userId = await requireOwner();
  const record = await prisma.generatedPaper.findFirst({ where: { id: paperId, userId } });
  if (!record) throw new Error("Generated paper not found.");
  const saved = record.paper as unknown as { questions: GeneratedQuestion[]; sections: PaperSection[]; totalMarks: number; warnings: string[]; resourceRows: unknown[] };
  const old = saved.questions.find((item) => item.id === questionId);
  if (!old) throw new Error("Question not found in this paper.");
  const configuration = record.configuration as unknown as { selectedResources: { id: string; name: string }[]; sourceChunks: SourceChunk[] };
  const chunk = configuration.sourceChunks.find((item) => item.id === old.sourceChunkId);
  if (!chunk) throw new Error("The original source chunk was not saved, so this question cannot be regenerated safely.");
  const group = templateGroups((record.templateSnapshot as unknown as TemplateDraft).sections).find((item) => item.groupId === old.groupId);
  if (!group) throw new Error("The original question group is missing from this generation record.");
  const { questions } = await generateGroupQuestions({ group, resourceId: old.resourceId, chunks: [chunk], assignments: [{ slotId: old.slotId }], existingTexts: saved.questions.filter((item) => item.id !== old.id).map((item) => item.text) });
  const replacement = { ...questions[0], id: old.id, slotId: old.slotId, groupId: old.groupId, sectionId: old.sectionId, type: old.type, marksEach: old.marksEach, resourceId: old.resourceId, sourceChunkId: old.sourceChunkId };
  const content = { ...saved, questions: saved.questions.map((item) => item.id === old.id ? replacement : item), sections: saved.sections.map((section) => ({ ...section, groups: section.groups.map((item) => ({ ...item, questions: item.questions.map((question) => question.id === old.id ? replacement : question) })) })) };
  const validation = record.validation as unknown as Record<string, unknown>;
  await prisma.generatedPaper.update({ where: { id: paperId }, data: { paper: content as unknown as Prisma.InputJsonValue, validation: { ...validation, regeneratedQuestionId: questionId } as Prisma.InputJsonValue, status: "review" } });
  revalidatePath("/generate");
  return replacement;
}

export async function exportGeneratedPaperDocx(paperId: string, includeAnswers: boolean) {
  const userId = await requireOwner();
  const record = await prisma.generatedPaper.findFirst({ where: { id: paperId, userId } });
  if (!record) throw new Error("Generated paper not found.");
  const paper = record.paper as unknown as { title: string; sections: PaperSection[]; totalMarks: number };
  const docx = createGeneratedPaperDocx(paper, includeAnswers);
  return { fileName: docx.fileName, base64: docx.buffer.toString("base64") };
}

export async function loadGeneratedPaper(paperId: string) {
  const userId = await requireOwner();
  const record = await prisma.generatedPaper.findFirst({ where: { id: paperId, userId }, select: { id: true, paper: true, validation: true, status: true } });
  if (!record) throw new Error("Generated paper not found.");
  return { id: record.id, ...(record.paper as unknown as Record<string, unknown>), validation: record.validation, status: record.status };
}
