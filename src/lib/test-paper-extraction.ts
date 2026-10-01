import type { SectionDraft, TemplateDraft } from "@/lib/test-templates";

function parseCount(value: string): number | null {
  const normalized = value.toLowerCase();
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };
  return /^\d+$/.test(normalized) ? Number(normalized) : words[normalized] ?? null;
}

export type ExtractedTemplateDraft = TemplateDraft & { hasText: boolean };

export function parseTestPaperText(text: string, filename: string): ExtractedTemplateDraft {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const sectionRegex = /^\s*(?:SECTION|PART)\s+([A-Z0-9IVX]+)\b\s*[:.-]?\s*(.*)$/i;
  const markers = lines.map((line, index) => ({ line, index, match: sectionRegex.exec(line) })).filter((item) => item.match);
  const headerLines = lines.slice(0, markers[0]?.index ?? Math.min(lines.length, 8));
  const headerText = headerLines.join("\n");
  const fullText = lines.join("\n");
  const getMatch = (patterns: RegExp[]) => {
    for (const pattern of patterns) { const match = fullText.match(pattern); if (match?.[1]) return match[1].trim(); }
    return "";
  };
  const className = getMatch([/\b(Class\s*(?:IV|I{1,3}|V|VI{0,3}|\d{1,2}))\b/i]).replace(/^class/i, "Class");
  const subjectRaw = getMatch([/\b(Mathematics|Maths|Physics|Chemistry|Biology|English|History|Geography|Science|Computer Science)\b/i]);
  const subject = ["Mathematics", "Maths", "Physics", "Chemistry", "Biology", "English", "History", "Geography", "Science", "Computer Science"].find((label) => label.toLowerCase() === subjectRaw.toLowerCase()) ?? "";
  const duration = getMatch([/\b(?:time|duration)\s*[:\-]\s*([\w ]+?(?:hours?|hrs?|minutes?|mins?))\b/i]);
  const maxMarksText = getMatch([/\b(?:maximum\s+marks?|max\.?\s*marks?|total\s+marks?)\s*[:\-]?\s*(\d{1,4})\b/i]);
  const academicYear = getMatch([/\b((?:19|20)\d{2}\s*[-–/]\s*(?:19|20)?\d{2})\b/]);
  const examName = headerLines.find((line) => /\b(unit test|monthly test|mid[- ]?term|final exam|annual exam|assessment|examination|test)\b/i.test(line)) ?? "";
  const schoolName = headerLines.find((line) => /\b(school|academy|college|institute)\b/i.test(line)) ?? "";
  const sections: SectionDraft[] = markers.map((marker, index) => {
    const end = markers[index + 1]?.index ?? lines.length;
    const sectionLines = [marker.line, ...lines.slice(marker.index + 1, end)];
    const body = sectionLines.join(" ");
    const categoryMatchers: [RegExp, string, string][] = [
      [/multiple choice|\bmcq\b|choose the correct/i, "mcq", "Multiple Choice Questions"],
      [/fill\s+in\s+(?:the\s+)?blanks?/i, "fill-in-the-blanks", "Fill in the Blanks"],
      [/true\s*\/?\s*false/i, "true-false", "True / False"],
      [/short answer|answer briefly/i, "short-answer", "Short Answer"],
      [/long answer|essay|detailed answer/i, "long-answer", "Long Answer"],
    ];
    const tags = categoryMatchers.flatMap(([pattern, type, label]) => {
      const found = pattern.exec(body);
      return found ? [{ index: found.index, type, label }] : [];
    }).sort((left, right) => left.index - right.index);
    const fallback: { type: string; label: string } = tags[0] ?? { type: "custom", label: marker.match?.[2]?.trim() || "Unclassified question type" };
    const attemptPattern = /(?:answer|attempt|do)\s+(?:any\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)(?:\s+(?:questions?\s+)?(?:out\s+of|of)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty))?/i;
    const equations = [...body.matchAll(/(\d{1,3})\s*[×x]\s*(\d{1,3})\s*=\s*(\d{1,5})/gi)];
    const questionTypes = equations.map((equation, equationIndex) => {
      const offset = equation.index ?? 0;
      const category = [...tags].reverse().find((tag) => tag.index <= offset) ?? fallback;
      const start = tags.filter((tag) => tag.index <= offset).at(-1)?.index ?? 0;
      const nextTag = tags.find((tag) => tag.index > start)?.index;
      const segment = body.slice(start, nextTag ?? body.length);
      const attemptMatch = segment.match(attemptPattern);
      const count = Number(equation[1]);
      return {
        id: `extract-type-${index + 1}-${equationIndex + 1}`, type: category.type, label: category.label,
        count, attempt: attemptMatch ? parseCount(attemptMatch[1]) : count, marksEach: Number(equation[2]),
      };
    });
    return {
      id: `extract-section-${index + 1}`, name: marker.match?.[1] ? `Section ${marker.match[1].toUpperCase()}` : `Section ${index + 1}`,
      questionTypes,
    };
  });
  return {
    name: filename.replace(/\.(pdf|docx)$/i, ""), schoolName, testTitle: examName, className, subject, examName,
    academicYear, duration, maximumMarks: maxMarksText ? Number(maxMarksText) : null, rawHeaderText: headerText,
    sections: sections.length ? sections : [{ id: "extract-section-a", name: "Section A", questionTypes: [] }],
    hasText: text.trim().length > 20,
  };
}
