"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { BUILTIN_TEMPLATES, calculateTemplateTotals, cloneBuiltinTemplate, type TemplateDraft } from "@/lib/test-templates";
import { parseTestPaperText } from "@/lib/test-paper-extraction";
import { enrichWithStructuredModel } from "@/lib/test-paper-llm";

async function requireOwner() {
  const userId = (await auth())?.user?.id;
  if (!userId) throw new Error("Please sign in to manage test templates");
  return userId;
}

function validateDraft(draft: TemplateDraft) {
  if (!draft || typeof draft !== "object") throw new Error("Template details are required");
  if (typeof draft.name !== "string" || !draft.name.trim()) throw new Error("Enter a template name");
  if (draft.name.trim().length > 120) throw new Error("Template name must be 120 characters or fewer");
  const textKeys: (keyof TemplateDraft)[] = ["schoolName", "testTitle", "className", "subject", "examName", "academicYear", "duration", "rawHeaderText"];
  for (const key of textKeys) {
    const value = draft[key];
    if (typeof value !== "string") throw new Error(`Invalid ${key} value`);
    if (value.length > (key === "rawHeaderText" ? 50000 : 200)) throw new Error(`${key} is too long`);
  }
  if (!Array.isArray(draft.sections) || draft.sections.length < 1) throw new Error("Add at least one section");
  for (const [sectionIndex, section] of draft.sections.entries()) {
    if (!section || typeof section !== "object" || typeof section.id !== "string" || typeof section.name !== "string" || !section.name.trim() || section.name.length > 100) throw new Error(`Enter a valid name for section ${sectionIndex + 1}`);
    if (!Array.isArray(section.questionTypes)) throw new Error("Invalid question type list");
    for (const item of section.questionTypes) {
      if (!item || typeof item !== "object" || typeof item.id !== "string" || typeof item.type !== "string" || typeof item.label !== "string" || !item.label.trim() || item.label.length > 80) throw new Error("Question type names must be 1–80 characters");
      if (item.count !== null && (!Number.isInteger(item.count) || item.count < 0 || item.count > 10000)) throw new Error("Question counts must be whole numbers from 0 to 10000");
      if (item.marksEach !== null && (!Number.isFinite(item.marksEach) || item.marksEach < 0 || item.marksEach > 1000)) throw new Error("Marks per question must be a number from 0 to 1000");
      if (item.attempt !== null && (!Number.isInteger(item.attempt) || item.attempt < 0 || (item.count !== null && item.attempt > item.count))) throw new Error("Attempt count must be between 0 and the number of questions offered");
    }
  }
  if (draft.maximumMarks !== null && (!Number.isFinite(draft.maximumMarks) || draft.maximumMarks < 0 || draft.maximumMarks > 10000)) throw new Error("Maximum marks must be a number from 0 to 10000");
  const totals = calculateTemplateTotals(draft.sections);
  if (!draft.sections.some((section) => section.questionTypes.length > 0)) throw new Error("Add at least one question group to the template");
  return { ...draft, name: draft.name.trim(), totalMarks: totals.totalMarks };
}

export async function saveTestTemplate(draft: TemplateDraft, templateId?: string) {
  const userId = await requireOwner();
  const validated = validateDraft(draft);
  const { totalMarks, ...fields } = validated;
  const totals = calculateTemplateTotals(fields.sections);
  const storedSections = fields.sections.map((section) => {
    const total = totals.sections.find((item) => item.id === section.id)?.totalMarks ?? null;
    if (!section.extraction) return { ...section };
    const hasEditedGroup = section.questionTypes.some((item) =>
      Object.values(item.extraction ?? {}).some((value) => value && typeof value === "object" && "status" in value && value.status === "edited"),
    );
    return {
      ...section,
      extraction: {
        ...section.extraction,
        marks: {
          value: total,
          raw: total === null ? section.extraction.marks.raw : String(total),
          status: total === null ? "needs_review" as const : hasEditedGroup ? "edited" as const : "inferred" as const,
        },
        needsReview: total === null || section.questionTypes.some((item) => item.extraction?.needsReview),
      },
    };
  });
  if (fields.extractionMetadata && storedSections.length) {
    const totalMarksField = {
      value: totalMarks,
      raw: totalMarks === null ? null : String(totalMarks),
      status: totalMarks === null ? "needs_review" as const : "inferred" as const,
    };
    storedSections[0] = {
      ...storedSections[0],
      templateExtraction: { header: fields.extractionMetadata.header, totalMarks: totalMarksField },
    };
  }
  const data = {
    name: fields.name,
    schoolName: fields.schoolName.trim() || null,
    testTitle: fields.testTitle.trim() || null,
    className: fields.className.trim() || null,
    subject: fields.subject.trim() || null,
    examName: fields.examName.trim() || null,
    academicYear: fields.academicYear.trim() || null,
    duration: fields.duration.trim() || null,
    maximumMarks: fields.maximumMarks,
    // The JSON sections are authoritative; this legacy non-null aggregate is
    // refreshed only when a total is known. Null states remain in the JSON.
    ...(totalMarks === null ? {} : { totalMarks }),
    rawHeaderText: fields.rawHeaderText.trim() || null,
    sections: storedSections as unknown as Prisma.InputJsonValue,
  };
  if (templateId) {
    const owned = await prisma.testTemplate.findFirst({ where: { id: templateId, userId }, select: { id: true } });
    if (!owned) throw new Error("Template not found");
    const result = await prisma.testTemplate.update({ where: { id: owned.id }, data, select: { id: true } });
    revalidatePath("/generate"); revalidatePath("/papers");
    return result;
  }
  const result = await prisma.testTemplate.create({ data: { ...data, userId }, select: { id: true } });
  revalidatePath("/generate"); revalidatePath("/papers");
  return result;
}

export async function duplicateTestTemplate(templateId: string) {
  const userId = await requireOwner();
  const template = await prisma.testTemplate.findFirst({ where: { id: templateId, userId } });
  if (!template) throw new Error("Template not found");
  const copy = await prisma.testTemplate.create({
    data: {
      userId, name: `${template.name} (copy)`, schoolName: template.schoolName, testTitle: template.testTitle,
      className: template.className, subject: template.subject, examName: template.examName,
      academicYear: template.academicYear, duration: template.duration, maximumMarks: template.maximumMarks,
      totalMarks: template.totalMarks, sections: template.sections as Prisma.InputJsonValue, rawHeaderText: template.rawHeaderText,
    }, select: { id: true },
  });
  revalidatePath("/papers");
  return copy;
}

export async function deleteTestTemplate(templateId: string) {
  const userId = await requireOwner();
  const result = await prisma.testTemplate.deleteMany({ where: { id: templateId, userId } });
  if (!result.count) throw new Error("Template not found");
  revalidatePath("/papers");
}

export async function prepareTemplateForResource(templateId: string, resourceId: string) {
  const userId = await requireOwner();
  const [template, resource] = await Promise.all([
    prisma.testTemplate.findFirst({ where: { id: templateId, userId }, select: { name: true, sections: true, totalMarks: true } }),
    prisma.document.findFirst({ where: { id: resourceId, userId }, select: { name: true } }),
  ]);
  if (!template) throw new Error("Template not found");
  if (!resource) throw new Error("That Library resource is unavailable");
  const totals = calculateTemplateTotals(template.sections as unknown as TemplateDraft["sections"]);
  return { templateName: template.name, resourceName: resource.name, totalQuestions: totals.totalQuestions, totalMarks: totals.totalMarks };
}

export async function createBuiltinCopy(builtinId: string) {
  await requireOwner();
  const draft = cloneBuiltinTemplate(builtinId);
  if (!draft || !BUILTIN_TEMPLATES.some((item) => item.id === builtinId)) throw new Error("Starter template not found");
  return saveTestTemplate(draft);
}

export async function extractTestPaper(formData: FormData) {
  await requireOwner();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Choose a PDF or DOCX test paper");
  if (file.size > 20 * 1024 * 1024) throw new Error("Test papers must be 20 MB or smaller");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "pdf" && extension !== "docx") throw new Error("Upload a PDF or DOCX test paper");
  const buffer = Buffer.from(await file.arrayBuffer());
  let text = "";
  let pageCount = 1;
  if (extension === "pdf") {
    try {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        text = result.text;
        pageCount = result.total || 1;
      } finally { await parser.destroy(); }
    } catch {
      throw new Error("We couldn't read this PDF. Please try another readable PDF or create the template manually.");
    }
  } else {
    try {
      const mammoth = await import("mammoth");
      text = (await mammoth.extractRawText({ buffer })).value;
    } catch {
      throw new Error("We couldn't read this DOCX file. Please check that it opens correctly, or create the template manually.");
    }
  }
  const parsed = parseTestPaperText(text, file.name, pageCount);
  parsed.sections = await enrichWithStructuredModel(text, parsed.normalizedText, parsed.sections);
  const hasModelConflict = parsed.sections.some((section) => section.questionTypes.some((item) => item.extraction?.needsReview));
  if (hasModelConflict && parsed.extractionMetadata) {
    parsed.extractionMetadata.status = "needs_review";
    parsed.extractionMetadata.warnings = [...new Set([
      ...parsed.extractionMetadata.warnings,
      "A structured extraction suggestion conflicted with the document text. The deterministic values were kept; review the highlighted question groups.",
    ])];
  }
  const hasDetectedHeading = Boolean(parsed.schoolName || parsed.testTitle || parsed.className || parsed.subject || parsed.duration || parsed.maximumMarks !== null);
  return {
    draft: parsed,
    warning: !parsed.hasText
      ? extension === "pdf"
        ? "Text could not be reliably extracted from this PDF. OCR is not currently supported. Create the template manually."
        : "No readable text was found in this DOCX file. Please check the document or create the template manually."
      : parsed.extractionMetadata?.warnings.length
        ? parsed.extractionMetadata.warnings.join(" ")
        : !hasDetectedHeading
        ? "The text was extracted, but we couldn't confidently detect the paper heading. Review the blank fields and raw header before saving."
        : "Here's what we detected from the paper. Please review it before saving. Some information may be blank if it wasn't clear in the document.",
    needsReview: parsed.extractionMetadata?.status !== "detected",
    extractedText: text.slice(0, 30000),
    hasText: parsed.hasText,
  };
}
