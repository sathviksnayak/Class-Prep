import type { ExtractionField, ExtractionStatus, QuestionTypeDraft, SectionDraft, TemplateDraft, TemplateExtractionMetadata } from "@/lib/test-templates";

type SourceLine = { text: string; raw: string; index: number };
type Candidate = { line: SourceLine; label: string; marker?: string };
export type ExtractedTemplateDraft = TemplateDraft & { hasText: boolean; normalizedText: string };

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20,
};
const ROMAN_SOURCE = "(?=[MDCLXVI])M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})";
const TYPE_RULES: [RegExp, string, string][] = [
  [/multiple\s*choice|\bmcq\b|choose\s+the\s+correct/i, "mcq", "Multiple Choice Questions"],
  [/fill\s+in\s+(?:the\s+)?blanks?/i, "fill-in-the-blanks", "Fill in the Blanks"],
  [/true\s*(?:\/|or\s+)?\s*false/i, "true-false", "True / False"],
  [/short\s+answer|answer\s+briefly/i, "short-answer", "Short Answer"],
  [/long\s+answer|essay|detailed\s+answer/i, "long-answer", "Long Answer"],
  [/match\s+the\s+following|matching/i, "match-the-following", "Match the Following"],
  [/answer\s+the\s+following/i, "answer-following", "Answer the Following"],
  [/write\s+the\s+alphabet/i, "write-alphabet", "Write the alphabet"],
];
const STATUS: Record<string, ExtractionStatus> = { missing: "missing", detected: "detected", inferred: "inferred", review: "needs_review" };

function field(value: number | null, raw: string | null, status: ExtractionStatus, alternate?: number | null): ExtractionField {
  return { value, raw, status, ...(alternate === undefined ? {} : { alternate }) };
}

function calculateExtractedMarks(sections: SectionDraft[]) {
  const sectionMarks = sections.map((section) => {
    if (!section.questionTypes.length) return null;
    let total = 0;
    for (const group of section.questionTypes) {
      if (group.attempt === null || group.marksEach === null) return null;
      total += group.attempt * group.marksEach;
    }
    return total;
  });
  return { sectionMarks, totalMarks: sectionMarks.length && sectionMarks.every((item) => item !== null) ? sectionMarks.reduce<number>((sum, item) => sum + (item ?? 0), 0) : null };
}

function parseNumber(input: string | undefined): number | null {
  if (!input) return null;
  return /^\d+$/.test(input) ? Number(input) : NUMBER_WORDS[input.toLowerCase()] ?? null;
}

function romanValue(input: string): number | null {
  if (!new RegExp(`^${ROMAN_SOURCE}$`, "i").test(input)) return null;
  const values: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  const chars = input.toLowerCase();
  let total = 0;
  for (let index = 0; index < chars.length; index += 1) {
    const current = values[chars[index]];
    const next = values[chars[index + 1]] ?? 0;
    total += current < next ? -current : current;
  }
  return total;
}

/** Normalize layout noise while retaining line boundaries and a separate untouched source string. */
export function normalizeTestPaperText(rawText: string): string {
  const pages = rawText.replace(/\r\n?/g, "\n").split("\f");
  const pageLines = pages.map((page) => page.split("\n").map((line) => line
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/[•●▪◦‣]/g, "•")
    .replace(/[\t\u00a0 ]+/g, " ")
    .trim()));

  const repeatedMargins = new Set<string>();
  if (pageLines.length > 1) {
    const marginCounts = new Map<string, number>();
    for (const lines of pageLines) {
      const margins = new Set([...lines.slice(0, 2), ...lines.slice(-2)].filter(Boolean));
      for (const line of margins) marginCounts.set(line, (marginCounts.get(line) ?? 0) + 1);
    }
    for (const [line, count] of marginCounts) if (count > 1 && line.length > 2) repeatedMargins.add(line);
  }

  const cleanLines = pageLines.flatMap((lines) => lines.filter((line) => {
    if (!line || /^(?:page\s*)?\d+\s*(?:of\s*\d+)?$/i.test(line)) return false;
    return !repeatedMargins.has(line);
  }));
  const joined: string[] = [];
  const boundary = new RegExp("^(?:section\\b|part\\b|" + ROMAN_SOURCE + "[.)]|[A-Z][.)]|\\d{1,3}[.)])", "i");
  for (const line of cleanLines) {
    const previous = joined.at(-1);
    if (previous && !boundary.test(previous) && !boundary.test(line) && !/[.!?:;)]\s*$/.test(previous) && !/^•\s*/.test(line)
      && (/^[a-z]/.test(line) || /[-—/]\s*$/.test(previous))) {
      joined[joined.length - 1] = previous + " " + line;
    } else {
      joined.push(line);
    }
  }
  return joined.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function hasUsableExtractedText(text: string, pageCount = 1): boolean {
  const cleaned = text.replace(/[\s\u0000-\u001f\u007f]/g, "");
  if (!cleaned.length || cleaned.length / Math.max(1, pageCount) < 12) return false;
  const readable = cleaned.match(/[\p{L}\p{N}\p{P}\p{S}]/gu)?.length ?? 0;
  return readable / cleaned.length >= 0.7 && (text.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 8;
}

function linesWithSource(rawText: string, normalizedText: string): SourceLine[] {
  const source = rawText.replace(/\r\n?/g, "\n").split("\n");
  const normalized = normalizedText.split("\n");
  const result: SourceLine[] = [];
  for (const text of normalized) {
    if (!text) continue;
    const target = text.replace(/\s+/g, " ").trim();
    const normalizeLine = (line: string) => line.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/[\t\u00a0 ]+/g, " ").trim();
    const found = source.find((line) => normalizeLine(line) === target)
      ?? source.find((line) => target.startsWith(normalizeLine(line)) && normalizeLine(line).length > 0);
    const raw = found ?? text;
    result.push({ text, raw, index: result.length });
  }
  return result;
}

function detectExplicitSections(lines: SourceLine[]) {
  return lines.flatMap((line, index) => {
    const match = /^\s*(?:section|part)\s+([a-z]|\d+|[ivxlcdm]+)\b\s*[:.\-]?\s*(.*)$/i.exec(line.text);
    return match ? [{ index, key: match[1], label: `Section ${match[1].toUpperCase()}`, raw: line.raw }] : [];
  });
}

function numberedSequence(lines: SourceLine[], kind: "roman" | "alpha") {
  const candidates = lines.flatMap((line, index) => {
    const match = kind === "roman"
      ? new RegExp(`^\\s*(${ROMAN_SOURCE})[.)]\\s*(.*)$`, "i").exec(line.text)
      : /^\s*([A-Z])[.)]\s*(.*)$/.exec(line.text);
    return match ? [{ index, key: match[1], tail: match[2] ?? "", raw: line.raw }] : [];
  });
  const values = candidates.map((item) => kind === "roman" ? romanValue(item.key) : item.key.toUpperCase().charCodeAt(0) - 64);
  const sequential = candidates.length >= 2 && values.every((value, index) => value !== null && (index === 0 || value === (values[index - 1] ?? 0) + 1));
  return { candidates, sequential };
}

function stripHeadingMarker(line: string): { marker: string | null; text: string } {
  const match = new RegExp(`^\\s*(${ROMAN_SOURCE}|[A-Z]|\\d{1,3})[.)]\\s*(.*)$`, "i").exec(line);
  return match ? { marker: match[1], text: match[2].trim() } : { marker: null, text: line.trim() };
}

function typeForHeading(text: string): { type: string; label: string } {
  for (const [pattern, type, label] of TYPE_RULES) if (pattern.test(text)) return { type, label };
  const label = text.replace(/\s*\(\s*\d+(?:\.\d+)?\s*(?:marks?)?\s*\)\s*$/i, "").replace(/[.:;]+$/, "").trim();
  return { type: label ? `custom:${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}` : "custom:unclassified", label: label || "Unclassified questions" };
}

function isCommonHeading(text: string): boolean {
  return TYPE_RULES.some(([pattern]) => pattern.test(text));
}

function questionTypeHeadings(lines: SourceLine[], allowRoman: boolean, allowAlpha: boolean) {
  const numeric = lines.flatMap((line, index) => {
    const match = /^\s*(\d{1,3})[.)]\s*(.+)$/.exec(line.text);
    return match ? [{ line, index, value: Number(match[1]), label: match[2] }] : [];
  });
  const customNumeric = new Set<number>();
  if (numeric.length >= 2 && numeric.every((item, index) => index === 0 || item.value === numeric[index - 1].value + 1)) {
    for (const item of numeric) {
      const next = numeric.find((candidate) => candidate.index > item.index);
      const body = lines.slice(item.index + 1, next?.index ?? lines.length).map((line) => line.text).join("\n");
      const hasNestedItems = /^\s*[\[(]?[a-z][).:\]]\s+/im.test(body) || /\d+\s*[×x]\s*\d+\s*=/i.test(body);
      const conciseName = item.label.length <= 90 && item.label.split(/\s+/).length <= 10 && !/[?!]\s*$/.test(item.label);
      if (isCommonHeading(item.label) || (hasNestedItems && conciseName && !/^(?:answer|attempt|choose|select)\s+any\b/i.test(item.label))) customNumeric.add(item.line.index);
    }
  }

  const candidates: { line: SourceLine; label: string; marker?: string }[] = [];
  for (const [index, line] of lines.entries()) {
    const heading = stripHeadingMarker(line.text);
    const isRoman = heading.marker ? romanValue(heading.marker) !== null : false;
    const isLetter = heading.marker ? /^[A-Z]$/i.test(heading.marker) : false;
    const isNumeric = heading.marker ? /^\d+$/.test(heading.marker) : false;
    const plausibleSingleRomanGroup = isRoman
      && /\b(?:write|fill|answer|attempt|choose|select|solve|complete|match|state|define|explain|identify|calculate|do)\b/i.test(heading.text);
    const nextContent = lines.slice(index + 1, index + 4).map((item) => item.text).join("\n");
    const hasNestedItems = /^\s*[\[(]?[a-z][).:\]]\s+/im.test(nextContent) || questionMarkers(nextContent).length > 0;
    const supportedAlphaHeading = isLetter && isCommonHeading(heading.text);
    const supportedCustomAlphaHeading = isLetter && heading.text.length <= 90 && hasNestedItems;
    if ((isRoman && (allowRoman || plausibleSingleRomanGroup)) || ((supportedAlphaHeading || supportedCustomAlphaHeading) && allowAlpha) || (isNumeric && (isCommonHeading(heading.text) || customNumeric.has(line.index)))) {
      if (heading.text) candidates.push({ line, label: heading.text, marker: heading.marker ?? undefined });
      continue;
    }
    if (!heading.marker && isCommonHeading(line.text)) {
      candidates.push({ line, label: line.text });
      continue;
    }
    const customHeading = line.text.length <= 90
      && line.text.split(/\s+/).length <= 10
      && !/[.!?;]\s*$/.test(line.text)
      && !/^\d+\s*[×x]\s*\d+\s*=/.test(line.text)
      && !/^(?:each question|marks?\s+each|question\s+marks?)\b/i.test(line.text)
      && !/^(?:\(\s*)?\d+(?:\.\d+)?\s*(?:marks?)?\s*\)?$|^\[\s*\d+(?:\.\d+)?\s*\]$/i.test(line.text)
      && !/^(?:answer|attempt|choose|select|do)\s+(?:all|any)\b/i.test(line.text)
      && (questionMarkers(nextContent).length > 0 || /\d+\s*[×x]\s*\d+\s*=/i.test(nextContent));
    if (!heading.marker && customHeading) candidates.push({ line, label: line.text });
  }
  return candidates;
}

function questionMarkers(text: string): number[] {
  const found: number[] = [];
  const marker = /(?:^|[\s•])([1-9]\d{0,2})[.)](?=\s|$)/g;
  for (const match of text.matchAll(marker)) found.push(Number(match[1]));
  return [...new Set(found)];
}

function segmentGroups(sectionLines: SourceLine[], sectionIndex: number, allowRoman: boolean, allowAlpha = false) {
  const candidates: Candidate[] = questionTypeHeadings(sectionLines, allowRoman, allowAlpha);

  if (candidates.length === 0 && sectionLines.some((line) => questionMarkers(line.text).length || /\d+\s*[×x]\s*\d+\s*=\s*\d+/i.test(line.text))) {
    const first = sectionLines.find((line) => questionMarkers(line.text).length || /\d+\s*[×x]\s*\d+\s*=\s*\d+/i.test(line.text))!;
    candidates.push({ line: first, label: "Unclassified questions" });
  }
  if (candidates.length === 0) return [];

  return candidates.map((candidate, candidateIndex): QuestionTypeDraft => {
    const start = sectionLines.findIndex((line) => line.index === candidate.line.index);
    const next = candidates[candidateIndex + 1];
    const end = next ? sectionLines.findIndex((line) => line.index === next.line.index) : sectionLines.length;
    const bodyLines = sectionLines.slice(Math.max(0, start), end < 0 ? sectionLines.length : end);
    const body = bodyLines.map((line) => line.text).join("\n");
    const visibleBody = bodyLines.map((line, index) => {
      if (index === 0 && candidate.marker) return stripHeadingMarker(line.text).text;
      return line.text;
    }).join("\n");
    const heading = stripHeadingMarker(candidate.label).text;
    const category = typeForHeading(heading);
    const choice = body.match(/(?:answer|attempt)\s+any\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)(?:\s+(?:questions?\s+)?(?:out\s+of|of)\s+(?:the\s+following\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty))?/i);
    const chooseAny = body.match(/(?:choose|select)\s+any\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)/i);
    const eitherChoice = body.match(/either\s+(?:question\s*)?(?:\([^)]*\)|[a-z0-9]+)\s+or\s+(?:question\s*)?(?:\([^)]*\)|[a-z0-9]+)/i);
    const rawChoice = choice?.[0] ?? chooseAny?.[0] ?? eitherChoice?.[0] ?? (/(?:\bOR\b|\beither\b)/i.test(body) ? body.match(/[^\n]*\b(?:OR|either)\b[^\n]*/i)?.[0] ?? null : null);
    const equation = /([1-9]\d{0,2})\s*[×x]\s*([1-9]\d{0,2})\s*=\s*([1-9]\d{0,4})/i.exec(body);
    const individualMarks = /each\s+question\s+(?:carries?|is worth)\s+(\d+(?:\.\d+)?)\s*marks?/i.exec(body)
      ?? /(\d+(?:\.\d+)?)\s*marks?\s+each\b/i.exec(body);
    const marksCueLine = bodyLines.slice(0, 3).find((line) => /^(?:\(\s*)?\d+(?:\.\d+)?\s*(?:marks?)?\s*\)?$|^\[\s*\d+(?:\.\d+)?\s*\]$/i.test(line.text));
    const marksCue = candidate.line.raw.match(/(?:\(\s*\d+(?:\.\d+)?\s*(?:marks?)?\s*\)|\[\s*\d+(?:\.\d+)?\s*\]|\b\d+(?:\.\d+)?\s+marks?\b)\s*$/i)?.[0]
      ?? marksCueLine?.raw.match(/(?:\(\s*\d+(?:\.\d+)?\s*(?:marks?)?\s*\)|\[\s*\d+(?:\.\d+)?\s*\]|\b\d+(?:\.\d+)?\s+marks?\b)/i)?.[0]
      ?? null;
    const numbers = questionMarkers(visibleBody);
    const rangeText = body.match(/questions?\s+(\d+)\s*(?:-|–|to)\s*(\d+)/i);
    const rangeCount = rangeText ? Math.max(0, Number(rangeText[2]) - Number(rangeText[1]) + 1) : null;
    let offeredValue: number | null = null;
    let offeredRaw: string | null = null;
    let offeredStatus: ExtractionStatus = STATUS.missing;
    if (choice?.[2]) {
      offeredValue = parseNumber(choice[2]); offeredRaw = choice[0]; offeredStatus = STATUS.detected;
    } else if (equation) {
      offeredValue = Number(equation[1]); offeredRaw = equation[0]; offeredStatus = STATUS.detected;
    } else if (rangeCount !== null) {
      offeredValue = rangeCount; offeredRaw = rangeText![0]; offeredStatus = STATUS.detected;
    } else if (numbers.length) {
      const sorted = [...numbers].sort((a, b) => a - b);
      offeredValue = sorted[0] === 1 ? sorted.at(-1)! : sorted.length;
      offeredRaw = numbers.join(", "); offeredStatus = STATUS.inferred;
    } else if (eitherChoice) {
      offeredValue = 2; offeredRaw = eitherChoice[0]; offeredStatus = STATUS.inferred;
    }

    let attemptValue: number | null = null;
    let attemptRaw: string | null = null;
    let attemptStatus: ExtractionStatus = STATUS.missing;
    if (choice) {
      attemptValue = parseNumber(choice[1]); attemptRaw = choice[0]; attemptStatus = attemptValue === null ? STATUS.review : STATUS.detected;
    } else if (chooseAny) {
      attemptValue = parseNumber(chooseAny[1]); attemptRaw = chooseAny[0]; attemptStatus = STATUS.detected;
    } else if (eitherChoice) {
      attemptValue = 1; attemptRaw = eitherChoice[0]; attemptStatus = STATUS.inferred;
    } else if (rawChoice) {
      attemptRaw = rawChoice; attemptStatus = STATUS.review;
    } else if (offeredValue !== null) {
      attemptValue = offeredValue; attemptRaw = offeredRaw; attemptStatus = STATUS.inferred;
    }

    const observedOffered = rangeCount ?? (numbers.length ? (() => {
      const ordered = [...numbers].sort((a, b) => a - b);
      return ordered[0] === 1 ? ordered.at(-1)! : ordered.length;
    })() : null);
    const offeredConflict = offeredValue !== null && observedOffered !== null && observedOffered > offeredValue;
    const attemptConflict = offeredValue !== null && attemptValue !== null && attemptValue > offeredValue;
    const alternateAttempt = attemptConflict ? attemptValue : undefined;
    if (attemptConflict) { attemptValue = null; attemptStatus = STATUS.review; }

    let marksValue: number | null = null;
    let marksRaw: string | null = null;
    let marksStatus: ExtractionStatus = STATUS.missing;
    if (equation) {
      marksValue = Number(equation[2]); marksRaw = equation[0]; marksStatus = STATUS.detected;
    } else if (individualMarks) {
      marksValue = Number(individualMarks[1]); marksRaw = individualMarks[0]; marksStatus = STATUS.detected;
    } else if (marksCue) {
      marksRaw = marksCue; marksStatus = STATUS.review;
    }

    const groupMarksValue = equation ? Number(equation[3]) : null;
    const groupMarksRaw = equation?.[0] ?? marksCue;
    const groupMarks = field(groupMarksValue, groupMarksRaw, equation ? STATUS.detected : marksCue ? STATUS.review : STATUS.missing);
    const missingCountDespiteRecognizableContent = offeredValue === null;
    const hasNumberGap = numbers.length > 1 && Math.max(...numbers) - Math.min(...numbers) + 1 > numbers.length;
    const needsReview = missingCountDespiteRecognizableContent || marksStatus === STATUS.review || attemptStatus === STATUS.review || hasNumberGap || offeredConflict;
    const reason = offeredConflict ? "The printed choice count conflicts with the visible numbered items. Review the offered count."
      : attemptConflict ? "The attempt instruction exceeds the number offered. Review the choice wording."
      : missingCountDespiteRecognizableContent ? "The number of questions offered could not be determined from the document."
      : marksStatus === STATUS.review ? "The printed marks cue may be a group total; marks per question were not inferred."
        : hasNumberGap ? "Question numbering has gaps; confirm that all items were detected." : null;
    const sourceQuote = candidate.line.raw;
    const sourceLineValid = sourceQuote.length > 0;
    const offerField = field(offeredValue, offeredRaw, offeredConflict ? STATUS.review : offeredStatus, offeredConflict ? observedOffered : undefined);
    const attemptField = field(attemptValue, attemptRaw, attemptStatus, alternateAttempt);
    const marksField = field(marksValue, marksRaw, marksStatus);
    const count = offerField.value;
    return {
      id: `extract-group-${sectionIndex + 1}-${candidateIndex + 1}`,
      type: category.type,
      label: category.label,
      count,
      attempt: attemptField.value,
      marksEach: marksField.value,
      extraction: {
        offered: offerField,
        attempt: attemptField,
        marksEach: marksField,
        groupMarks,
        sourceQuote: sourceLineValid ? sourceQuote : candidate.label,
        choiceWording: rawChoice,
        needsReview,
        reviewReason: reason,
      },
    };
  });
}

function headerFields(headerLines: SourceLine[], normalizedText: string, headerText: string) {
  const header = headerLines.map((line) => line.text).join("\n");
  const get = (pattern: RegExp) => pattern.exec(header)?.[1]?.trim() ?? "";
  const school = headerLines.find((line) => /\b(school|academy|college|institute)\b/i.test(line.text))?.text ?? "";
  const className = get(/\b(Class\s*(?:IV|I{1,3}|V|VI{0,3}|\d{1,2}))\b/i).replace(/^class/i, "Class");
  const subjectDetected = get(/\b(Mathematics|Maths|Physics|Chemistry|Biology|English|History|Geography|Science|Computer Science)\b/i);
  const subject = ["Mathematics", "Maths", "Physics", "Chemistry", "Biology", "English", "History", "Geography", "Science", "Computer Science"].find((item) => item.toLowerCase() === subjectDetected.toLowerCase()) ?? subjectDetected;
  const title = headerLines.find((line) => /\b(unit test|monthly test|mid[- ]?term|final exam|annual exam|assessment|examination|test)\b/i.test(line.text))?.text ?? "";
  const duration = get(/\b(?:time|duration)\s*[:\-]\s*([\w ]+?(?:hours?|hrs?|minutes?|mins?))\b/i)
    .replace(/\b(hours?|hrs?|minutes?|mins?)\b/i, (unit) => ({ hour: "Hour", hours: "Hours", hr: "Hr", hrs: "Hrs", minute: "Minute", minutes: "Minutes", min: "Min", mins: "Mins" })[unit.toLowerCase()] ?? unit);
  const maxMarks = get(/\b(?:maximum\s+marks?|max\.?\s*marks?|total\s+marks?)\s*[:\-]?\s*(\d{1,4}(?:\.\d+)?)\b/i);
  const year = get(/\b((?:19|20)\d{2}\s*[-–/]\s*(?:19|20)?\d{2})\b/i);
  const fields: TemplateExtractionMetadata["header"] = {};
  const add = (key: string, value: string, raw: string | null) => { fields[key] = { value: value || null, raw, status: value ? "detected" : "missing" }; };
  add("schoolName", school, school || null); add("testTitle", title, title || null); add("className", className, className || null);
  add("subject", subject, subject || null); add("examName", title, title || null); add("duration", duration, duration || null);
  add("academicYear", year, year || null);
  const maximumMarks = maxMarks ? Number(maxMarks) : null;
  fields.maximumMarks = { value: maximumMarks, raw: maxMarks || null, status: maximumMarks === null ? "missing" : "detected" };
  return {
    schoolName: school,
    testTitle: title,
    className,
    subject,
    examName: title,
    duration,
    academicYear: year,
    maximumMarks,
    fields,
    headerText,
  };
}

function explicitSections(lines: SourceLine[], sectionMarkers: ReturnType<typeof detectExplicitSections>, sequenceMarkers: ReturnType<typeof numberedSequence>["candidates"], allowRoman: boolean, allowAlpha: boolean): SectionDraft[] {
  return sectionMarkers.map((marker, index) => {
    const end = sectionMarkers[index + 1]?.index ?? lines.length;
    const content = lines.slice(marker.index + 1, end);
    const nestedRoman = sequenceMarkers.filter((item) => item.index > marker.index && item.index < end);
    let groups: QuestionTypeDraft[];
    if (nestedRoman.length) {
      groups = nestedRoman.flatMap((item, groupIndex) => {
        const groupEnd = nestedRoman[groupIndex + 1]?.index ?? end;
        const nestedLines = lines.filter((line) => line.index >= item.index && line.index < groupEnd);
        return segmentGroups(nestedLines, index, allowRoman, allowAlpha).map((group) => ({ ...group, label: group.label === "Unclassified questions" ? stripHeadingMarker(item.tail).text || group.label : group.label }));
      });
    } else {
      groups = segmentGroups(content, index, allowRoman, allowAlpha);
    }
    return {
      id: `extract-section-${index + 1}`,
      name: marker.label,
      questionTypes: groups,
      extraction: { marks: field(null, null, "missing"), sourceQuote: marker.raw, needsReview: groups.length === 0 },
    };
  });
}

export function parseTestPaperText(rawText: string, filename: string, pageCount = 1): ExtractedTemplateDraft {
  const normalizedText = normalizeTestPaperText(rawText);
  const lines = linesWithSource(rawText, normalizedText);
  const explicit = detectExplicitSections(lines);
  const roman = numberedSequence(lines, "roman");
  const alpha = numberedSequence(lines, "alpha");
  const useTopLevelSequence = explicit.length === 0 && (alpha.sequential || roman.sequential);
  const topSequence = alpha.sequential ? alpha : roman;
  let sections: SectionDraft[];

  if (explicit.length) {
    sections = explicitSections(lines, explicit, [
      ...(roman.sequential ? roman.candidates : []),
      ...(alpha.sequential ? alpha.candidates : []),
    ].sort((a, b) => a.index - b.index), roman.sequential, alpha.sequential);
  } else if (useTopLevelSequence) {
    sections = topSequence.candidates.map((marker, index) => {
      const end = topSequence.candidates[index + 1]?.index ?? lines.length;
      const content = lines.filter((line) => line.index >= marker.index && line.index < end);
      const heading = stripHeadingMarker(content[0]?.text ?? "").text;
      const groups = segmentGroups(content, index, roman.sequential, alpha.sequential);
      if (groups.length === 0 && heading) groups.push(...segmentGroups([{ ...(content[0] ?? lines[marker.index]), text: heading }], index, false, false));
      return { id: `extract-section-${index + 1}`, name: `Section ${marker.key.toUpperCase()}`, questionTypes: groups, extraction: { marks: field(null, null, "missing"), sourceQuote: marker.raw, needsReview: groups.length === 0 } };
    });
  } else {
    const groups = segmentGroups(lines, 0, roman.sequential, alpha.sequential);
    sections = [{ id: "extract-section-implicit", name: "Unsectioned", implicit: true, questionTypes: groups, extraction: { marks: field(null, null, "missing"), sourceQuote: null, needsReview: groups.length === 0 } }];
  }

  const firstStructureIndex = Math.min(
    explicit[0]?.index ?? Number.POSITIVE_INFINITY,
    roman.sequential ? roman.candidates[0]?.index ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY,
    alpha.sequential ? alpha.candidates[0]?.index ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY,
    lines.findIndex((line) => /^(?:section|part)\b/i.test(line.text) || isCommonHeading(line.text) || questionMarkers(line.text).length > 0) >= 0
      ? lines.findIndex((line) => /^(?:section|part)\b/i.test(line.text) || isCommonHeading(line.text) || questionMarkers(line.text).length > 0)
      : Number.POSITIVE_INFINITY,
  );
  const headerLines = Number.isFinite(firstStructureIndex) ? lines.slice(0, firstStructureIndex) : lines.slice(0, Math.min(8, lines.length));
  const rawHeaderText = headerLines.map((line) => line.raw).join("\n").trim();
  const heading = headerFields(headerLines, normalizedText, rawHeaderText);
  const warnings: string[] = [];
  if (!hasUsableExtractedText(rawText, pageCount)) warnings.push("Text could not be reliably extracted from this document.");
  if (sections.every((section) => section.questionTypes.length === 0)) warnings.push("Text extracted, but question structure needs review.");
  else if (sections.some((section) => section.questionTypes.some((group) => group.extraction?.needsReview))) warnings.push("Some question counts or marks need review.");
  const headerMissing = Object.values(heading.fields).some((item) => item.status === "missing");
  if (headerMissing) warnings.push("Some paper-heading details could not be detected. Review the extracted text and fields.");
  const totals = calculateExtractedMarks(sections);
  for (const [index, section] of sections.entries()) {
    const sectionMarks = totals.sectionMarks[index] ?? null;
    section.extraction = {
      marks: field(sectionMarks, sectionMarks === null ? null : String(sectionMarks), sectionMarks === null ? "needs_review" : "inferred"),
      sourceQuote: section.extraction?.sourceQuote ?? null,
      needsReview: section.extraction?.needsReview ?? false,
    };
  }
  const totalMarks = field(totals.totalMarks, totals.totalMarks === null ? null : String(totals.totalMarks), totals.totalMarks === null ? "needs_review" : "inferred");
  const extractionMetadata: TemplateExtractionMetadata = {
    status: sections.some((section) => section.questionTypes.length > 0) && !warnings.length ? "detected" : "needs_review",
    warnings,
    header: heading.fields,
    totalMarks,
  };

  return {
    name: filename.replace(/\.(pdf|docx)$/i, ""),
    schoolName: heading.schoolName,
    testTitle: heading.testTitle,
    className: heading.className,
    subject: heading.subject,
    examName: heading.examName,
    academicYear: heading.academicYear,
    duration: heading.duration,
    maximumMarks: heading.maximumMarks,
    rawHeaderText: heading.headerText,
    sections: sections.length ? sections : [{ id: "extract-section-implicit", name: "Unsectioned", implicit: true, questionTypes: [], extraction: { marks: field(null, null, "missing"), sourceQuote: null, needsReview: true } }],
    extractionMetadata,
    hasText: hasUsableExtractedText(rawText, pageCount),
    normalizedText,
  };
}
