import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { BUILTIN_TEMPLATES, calculateTemplateTotals } from "../src/lib/test-templates.ts";
import { hasUsableExtractedText, normalizeTestPaperText, parseTestPaperText } from "../src/lib/test-paper-extraction.ts";
import { enrichWithStructuredModel } from "../src/lib/test-paper-llm.ts";
import { allocateQuestionSlots, buildChunks, calculateAttemptedMarks, cleanMark, formatMark, retrieveRelevantChunks, validateGeneratedGroup, validateTemplateForGeneration } from "../src/lib/test-paper-generation.ts";
import { generateGroupQuestions } from "../src/lib/question-generation.ts";
import { createGeneratedPaperDocx } from "../src/lib/test-paper-docx.ts";
import { deflateRawSync } from "node:zlib";

test("advertised built-in marks and section totals match their structures", () => {
  for (const [advertised, expectedQuestions, expectedMarks] of [["25", 14, 25], ["40", 23, 40], ["50", 29, 50]]) {
    const template = BUILTIN_TEMPLATES.find(({ id }) => id === advertised);
    assert.ok(template, `${advertised} mark template exists`);
    const totals = calculateTemplateTotals(template.sections);
    assert.equal(totals.totalQuestions, expectedQuestions);
    assert.equal(totals.totalMarks, expectedMarks);
    assert.ok(totals.sections.every(({ totalMarks }) => Number.isInteger(totalMarks)));
    assert.equal(totals.sections.reduce((sum, section) => sum + section.totalMarks, 0), expectedMarks);
  }
});

test("internal choice calculates marks from attempt count, not printed count", () => {
  const result = calculateTemplateTotals([{ id: "s", name: "Section A", questionTypes: [{ id: "q", type: "short-answer", label: "Short Answer", count: 5, attempt: 3, marksEach: 2 }] }]);
  assert.equal(result.totalQuestions, 5);
  assert.equal(result.totalMarks, 6);
  assert.equal(result.sections[0].totalMarks, 6);
});

test("decimal marks calculate without floating point display artifacts", () => {
  const sections = [{ id: "decimal", name: "Decimals", questionTypes: [
    { id: "half", type: "mcq", label: "MCQ", count: 10, attempt: 10, marksEach: 0.5 },
    { id: "one-half", type: "short-answer", label: "Short", count: 5, attempt: 5, marksEach: 1.5 },
    { id: "two-half", type: "short-answer", label: "Long", count: 3, attempt: 3, marksEach: 2.5 },
  ] }];
  const totals = calculateTemplateTotals(sections);
  assert.equal(totals.totalMarks, 20);
  assert.deepEqual(totals.sections.map((section) => section.totalMarks), [20]);
  assert.equal(calculateAttemptedMarks([{ attempt: 10, marksEach: 0.5 }]), 5);
  assert.equal(calculateAttemptedMarks([{ attempt: 5, marksEach: 1.5 }]), 7.5);
  assert.equal(calculateAttemptedMarks([{ attempt: 3, marksEach: 2.5 }]), 7.5);
  assert.equal(formatMark(cleanMark(3 * 2.5)), "7.5");
});

test("generation template gating accepts decimal marks and rejects unknown counts or marks", () => {
  const known = [{ id: "s", name: "Section A", questionTypes: [{ id: "q", type: "short-answer", label: "Short", count: 5, attempt: null, marksEach: 1.5 }] }];
  assert.deepEqual(validateTemplateForGeneration(known), []); // attempt defaults to offered
  assert.match(validateTemplateForGeneration([{ ...known[0], questionTypes: [{ ...known[0].questionTypes[0], count: null }] }]).join(" "), /offered count/);
  assert.match(validateTemplateForGeneration([{ ...known[0], questionTypes: [{ ...known[0].questionTypes[0], marksEach: null }] }]).join(" "), /marks per question/);
});

test("resource allocation follows attempted slots, respects resource restrictions, and reports unreachable decimal targets", () => {
  const sections = [
    { id: "s", name: "Section A", questionTypes: [
      { id: "a", type: "mcq", label: "MCQ", count: 10, attempt: 10, marksEach: 0.5 },
      { id: "b", type: "short-answer", label: "Short", count: 5, attempt: 5, marksEach: 1.5 },
      { id: "c", type: "long-answer", label: "Long", count: 3, attempt: 3, marksEach: 2.5 },
    ] },
  ];
  const result = allocateQuestionSlots(sections, ["one", "two"], {
    one: { a: true, b: true, c: false }, two: { a: false, b: true, c: true },
  }, { one: 5, two: 15 });
  assert.equal(result.paperTotal, 20);
  assert.equal(result.slots.length, 18);
  assert.ok(result.slots.filter((slot) => slot.groupId === "a").every((slot) => slot.resourceId === "one"));
  assert.ok(result.slots.filter((slot) => slot.groupId === "c").every((slot) => slot.resourceId === "two"));
  assert.deepEqual(result.rows.map((row) => row.achievedMarks), [5, 15]);

  const internalChoice = [{ id: "s", name: "Section A", questionTypes: [{ id: "q", type: "short-answer", label: "Short", count: 5, attempt: 3, marksEach: 2 }] }];
  const choice = allocateQuestionSlots(internalChoice, ["a", "b"], { a: { q: true }, b: { q: true } }, { a: 3, b: 3 });
  assert.equal(choice.slots.length, 3);
  assert.equal(choice.paperTotal, 6);
  assert.ok(choice.warnings.length > 0);
  assert.throws(() => allocateQuestionSlots(internalChoice, ["a"], { a: { q: false } }, { a: 6 }), /allow at least one/);
  const restricted = [{ id: "s", name: "Section A", questionTypes: [
    { id: "q", type: "short-answer", label: "Short", count: 3, attempt: 3, marksEach: 2 },
    { id: "r", type: "long-answer", label: "Long", count: 1, attempt: 1, marksEach: 2 },
  ] }];
  assert.throws(() => allocateQuestionSlots(restricted, ["a", "b"], { a: { q: true, r: false }, b: { q: false, r: true } }, { a: 7, b: 1 }), /exceeds/);
});

test("chunking retains source identity and group validation rejects ungrounded and malformed questions", () => {
  const chunks = buildChunks([{ id: "source-1", name: "Chapter 1", text: "Chapter 1\nPhotosynthesis converts light energy into chemical energy in green plants. " + "It uses carbon dioxide and water. ".repeat(35) }], 260, 30);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.resourceId === "source-1" && chunk.resourceName === "Chapter 1" && chunk.text.length));
  const relevant = retrieveRelevantChunks([
    { id: "r:chunk:0", resourceId: "r", resourceName: "Book", heading: null, text: "Historical dates and ancient kingdoms." },
    { id: "r:chunk:1", resourceId: "r", resourceName: "Book", heading: "Plants", text: "Photosynthesis uses chlorophyll to capture light energy." },
  ], "photosynthesis chlorophyll", 1);
  assert.equal(relevant[0].id, "r:chunk:1");
  const group = { groupId: "mcq", sectionId: "s", type: "mcq", label: "MCQ", offered: 1, attempt: 1, marksEach: 0.5 };
  const valid = { id: "q", slotId: "slot", groupId: "mcq", sectionId: "s", type: "mcq", marksEach: 0.5, resourceId: "source-1", sourceChunkId: chunks[0].id, text: "What process converts light energy into chemical energy?", answer: "Photosynthesis", options: ["Photosynthesis", "Respiration", "Digestion", "Evaporation"], correctIndex: 0 };
  assert.deepEqual(validateGeneratedGroup([valid], 1, group, "source-1", chunks, []), []);
  assert.match(validateGeneratedGroup([{ ...valid, text: "Which process converts light energy into chemical energy in green plants?" }], 1, group, "source-1", chunks, ["Which process changes light energy into chemical energy in green plants?"]).join(" "), /closely resembles/);
  assert.match(validateGeneratedGroup([{ ...valid, sourceChunkId: "invented" }], 1, group, "source-1", chunks, []).join(" "), /missing source chunk/);
  assert.match(validateGeneratedGroup([{ ...valid, resourceId: "other" }], 1, group, "source-1", chunks, []).join(" "), /outside its assigned resource/);
  assert.match(validateGeneratedGroup([{ ...valid, options: ["one"] }], 1, group, "source-1", chunks, []).join(" "), /exactly four/);
});

test("question generation retries once after malformed structured output", async () => {
  const previousKey = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "test-only";
  let calls = 0;
  try {
    const fetcher = async (_url, options) => {
      calls += 1;
      const request = JSON.parse(options.body);
      assert.equal(request.response_format.type, "json_object");
      const content = calls === 1 ? "not JSON" : JSON.stringify({ questions: [{ text: "Which process makes plant food?", answer: "Photosynthesis", sourceChunkId: "r:chunk:0", options: ["Photosynthesis", "Respiration", "Digestion", "Evaporation"], correctIndex: 0 }] });
      return Response.json({ choices: [{ message: { content } }] });
    };
    const result = await generateGroupQuestions({
      group: { groupId: "q", sectionId: "s", type: "mcq", label: "MCQ", offered: 1, attempt: 1, marksEach: 0.5 },
      resourceId: "r", chunks: [{ id: "r:chunk:0", resourceId: "r", resourceName: "Chapter", heading: null, text: "Photosynthesis makes food in green plants." }],
      assignments: [{ slotId: "q:slot:1" }], existingTexts: [], fetcher,
    });
    assert.equal(calls, 2);
    assert.equal(result.retries, 1);
    assert.equal(result.questions[0].marksEach, 0.5);
    assert.equal(result.questions[0].slotId, "q:slot:1");
  } finally {
    if (previousKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previousKey;
  }
});

test("DOCX paper and answer key exports are readable and retain decimal marks", async () => {
  const docx = createGeneratedPaperDocx({
    title: "Science Test", totalMarks: 7.5,
    sections: [{ id: "s", name: "Section A", groups: [{ id: "g", type: "mcq", label: "MCQ", offered: 10, attempt: 8, marksEach: 0.5, questions: [{ id: "q", slotId: "slot", groupId: "g", sectionId: "s", type: "mcq", marksEach: 0.5, resourceId: "r", sourceChunkId: "r:chunk:0", text: "Which is a green plant pigment?", answer: "Chlorophyll", options: ["Chlorophyll", "Hemoglobin", "Keratin", "Melanin"], correctIndex: 0 }] }] }],
  }, true);
  assert.match(docx.fileName, /with-answer-key/);
  const output = await mammoth.extractRawText({ buffer: docx.buffer });
  assert.match(output.value, /Science Test/);
  assert.match(output.value, /0\.5 marks/);
  assert.match(output.value, /Total marks: 7\.5/);
  assert.match(output.value, /Answer Key/);
  assert.match(output.value, /Chlorophyll/);
});

test("an uncertain attempt count keeps marks unknown", () => {
  const result = calculateTemplateTotals([{ id: "s", name: "Section A", questionTypes: [{ id: "q", type: "custom", label: "Essay", count: 4, attempt: null, marksEach: 5, extraction: { offered: { value: 4, raw: null, status: "detected" }, attempt: { value: null, raw: "choose either", status: "needs_review" }, marksEach: { value: 5, raw: null, status: "detected" }, groupMarks: { value: null, raw: null, status: "missing" }, sourceQuote: "Essay", choiceWording: "choose either", needsReview: true } }] }]);
  assert.equal(result.totalQuestions, 4);
  assert.equal(result.totalMarks, null);
  assert.equal(result.sections[0].totalMarks, null);
});

test("paper extraction preserves readable heading fields and internal choice", () => {
  const extracted = parseTestPaperText(`ABC SCHOOL\nCLASS 10 - MATHEMATICS\nUNIT TEST 1\nTime: 1 Hour\nMaximum Marks: 25\n\nSECTION A\nMCQ\nAnswer all questions\n5 x 1 = 5\n\nSECTION B\nShort Answer\nAnswer any three out of five\n5 x 2 = 10`, "unit-test.pdf");
  assert.equal(extracted.schoolName, "ABC SCHOOL");
  assert.equal(extracted.className, "Class 10");
  assert.equal(extracted.subject, "Mathematics");
  assert.equal(extracted.examName, "UNIT TEST 1");
  assert.equal(extracted.duration, "1 Hour");
  assert.equal(extracted.maximumMarks, 25);
  assert.match(extracted.rawHeaderText, /ABC SCHOOL/);
  assert.equal(extracted.sections[1].questionTypes[0].count, 5);
  assert.equal(extracted.sections[1].questionTypes[0].attempt, 3);
  assert.equal(extracted.sections[1].questionTypes[0].marksEach, 2);
  assert.equal(calculateTemplateTotals(extracted.sections).totalMarks, 11);
});

test("paper extraction leaves missing header information empty and scanned text unsupported", () => {
  const extracted = parseTestPaperText("\u0000\u0001", "scan.pdf");
  assert.equal(extracted.schoolName, "");
  assert.equal(extracted.subject, "");
  assert.equal(extracted.maximumMarks, null);
  assert.equal(extracted.hasText, false);
});

test("one extracted section can contain multiple detected question types", () => {
  const extracted = parseTestPaperText("Paper\nSECTION A\nMultiple Choice Questions\n5 x 1 = 5\nShort Answer\n2 x 2 = 4", "paper.pdf");
  assert.equal(extracted.sections[0].questionTypes.length, 2);
  assert.deepEqual(extracted.sections[0].questionTypes.map(({ type }) => type), ["mcq", "short-answer"]);
  assert.equal(calculateTemplateTotals(extracted.sections).totalMarks, 9);
});

test("PDF and DOCX text extractors read document content", async () => {
  const stream = [
    "BT /F1 12 Tf 72 720 Td (ABC SCHOOL) Tj",
    "0 -18 Td (CLASS 10 - MATHEMATICS) Tj",
    "0 -18 Td (UNIT TEST 1) Tj",
    "0 -18 Td (TIME: 1 HOUR) Tj",
    "0 -18 Td (MAXIMUM MARKS: 25) Tj",
    "0 -36 Td (SECTION A) Tj",
    "0 -18 Td (MCQ) Tj",
    "0 -18 Td (Answer all questions) Tj",
    "0 -18 Td (5 x 1 = 5) Tj",
    "0 -36 Td (SECTION B) Tj",
    "0 -18 Td (Short Answer) Tj",
    "0 -18 Td (Answer any three out of five) Tj",
    "0 -18 Td (5 x 2 = 10) Tj ET",
  ].join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const parser = new PDFParse({ data: Buffer.from(pdf) });
  try {
    const parsed = await parser.getText();
    assert.match(parsed.text, /ABC SCHOOL/);
    const draft = parseTestPaperText(parsed.text, "realistic-unit-test.pdf");
    assert.equal(draft.schoolName, "ABC SCHOOL");
    assert.equal(draft.testTitle, "UNIT TEST 1");
    assert.equal(draft.className, "Class 10");
    assert.equal(draft.subject, "Mathematics");
    assert.equal(draft.duration, "1 Hour");
    assert.equal(draft.maximumMarks, 25);
    assert.match(draft.rawHeaderText, /MAXIMUM MARKS: 25/);
    assert.equal(draft.sections.length, 2);
    assert.equal(draft.sections[1].questionTypes[0].count, 5);
    assert.equal(draft.sections[1].questionTypes[0].attempt, 3);
    assert.equal(calculateTemplateTotals(draft.sections).totalMarks, 11);
  } finally { await parser.destroy(); }

  const docxPath = new URL("../node_modules/mammoth/test/test-data/single-paragraph.docx", import.meta.url);
  const docx = await mammoth.extractRawText({ buffer: await readFile(docxPath) });
  assert.match(docx.value, /Walking on imported air/);
  const docxDraft = parseTestPaperText(docx.value, "sample.docx");
  assert.equal(docxDraft.hasText, true);
  assert.equal(docxDraft.name, "sample");
});

function buildTextPdf(lines) {
  const escape = (line) => line.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  const content = lines.length
    ? "BT /F1 12 Tf 72 720 Td " + lines.map((line, index) => (index ? "0 -18 Td " : "") + "(" + escape(line) + ") Tj").join(" ") + " ET"
    : "BT /F1 12 Tf ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length " + Buffer.byteLength(content) + " >>\nstream\n" + content + "\nendstream",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += (index + 1) + " 0 obj\n" + objects[index] + "\nendobj\n";
  }
  const xref = Buffer.byteLength(pdf);
  pdf += "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n"
    + offsets.slice(1).map((offset) => String(offset).padStart(10, "0") + " 00000 n \n").join("")
    + "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";
  return Buffer.from(pdf);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(files) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, value] of Object.entries(files)) {
    const filename = Buffer.from(name);
    const data = Buffer.from(value);
    const compressed = deflateRawSync(data);
    const checksum = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(filename.length, 26);
    local.push(localHeader, filename, compressed);
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(filename.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, filename);
    offset += localHeader.length + filename.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralDirectory, end]);
}

function makeDocx(paragraphs, tables = []) {
  const escapeXml = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const para = (text, style = "") => "<w:p>" + (style ? "<w:pPr><w:pStyle w:val=\"" + style + "\"/></w:pPr>" : "")
    + "<w:r><w:t xml:space=\"preserve\">" + escapeXml(text) + "</w:t></w:r></w:p>";
  const tableXml = (rows) => "<w:tbl>" + rows.map((row) => "<w:tr>"
    + row.map((cell) => "<w:tc>" + para(cell) + "</w:tc>").join("") + "</w:tr>").join("") + "</w:tbl>";
  const body = paragraphs.map((item) => item && typeof item === "object" && !Array.isArray(item) && item.table
    ? tableXml(item.table) : Array.isArray(item) ? para(item[0], item[1]) : para(item)).join("")
    + tables.map((rows) => tableXml(rows)).join("");
  const document = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
    + "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body>" + body + "<w:sectPr/></w:body></w:document>";
  return makeZip({
    "[Content_Types].xml": "<?xml version=\"1.0\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>",
    "_rels/.rels": "<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>",
    "word/document.xml": document,
  });
}

const STRUCTURE_CASES = [
  { name: "exact Roman regression preserves unknowns", text: "I. Write the alphabet. (2)\n\nII. Fill in the blanks. (3)\n1. c__r 4. z__p\n2. f__x 5. c__t", sections: ["Section I", "Section II"], groups: [["Write the alphabet"], ["Fill in the Blanks"]], offered: [null, 5], marks: [null, null] },
  { name: "explicit sections contain their Roman question groups", text: "ABC SCHOOL\nCLASS 8 - ENGLISH\nUNIT TEST 1\nMaximum Marks: 10\nSECTION A\nI. Fill in the blanks\n1. one 2. two\nII. True or False\n1. true 2. false\nSECTION B\nIII. Answer the following\n4. item 5. item", sections: ["Section A", "Section B"], groups: [["Fill in the Blanks", "True / False"], ["Answer the Following"]], offered: [2, 2, 2] },
  { name: "alphabetic sections", text: "A.\nMCQ\n1. a 2. b\nB.\nShort Answer\n3. explain", sections: ["Section A", "Section B"], groups: [["Multiple Choice Questions"], ["Short Answer"]], offered: [2, 1] },
  { name: "internal choice", text: "SECTION A\nShort Answer\nAnswer any three out of five\n5 x 2 = 10", sections: ["Section A"], groups: [["Short Answer"]], offered: [5], attempts: [3], marks: [2] },
  { name: "marks each cue", text: "SECTION A\nFill in the blanks\n1. cat 2. dog\nEach question carries 1 mark", sections: ["Section A"], groups: [["Fill in the Blanks"]], offered: [2], marks: [1] },
  { name: "custom group and same-line numbering", text: "SECTION A\nVocabulary\n1. c__r 4. z__p 2. f__x 5. c__t", sections: ["Section A"], groups: [["Vocabulary"]], offered: [5] },
  { name: "numbering continues across sections", text: "SECTION A\nShort Answer\n1. a 2. b 3. c\nSECTION B\nShort Answer\n4. d 5. e", sections: ["Section A", "Section B"], groups: [["Short Answer"], ["Short Answer"]], offered: [3, 2] },
  { name: "numbering restarts across sections", text: "SECTION A\nShort Answer\n1. a 2. b 3. c\nSECTION B\nShort Answer\n1. d 2. e", sections: ["Section A", "Section B"], groups: [["Short Answer"], ["Short Answer"]], offered: [3, 2] },
  { name: "no invented section", text: "Fill in the blanks\n1. one 2. two", sections: ["Unsectioned"], groups: [["Fill in the Blanks"]], offered: [2] },
  { name: "lone C stays ambiguous", text: "C.\nMore content without questions", sections: ["Unsectioned"], groups: [[]], warning: "Text extracted, but question structure needs review." },
  { name: "ambiguous heading mark stays unresolved", text: "SECTION A\nI. Write the alphabet. (2)", sections: ["Section A"], groups: [["Write the alphabet"]], offered: [null], marks: [null] },
];

test("table-driven deterministic segmentation handles hierarchy and uncertain values", () => {
  for (const scenario of STRUCTURE_CASES) {
    const draft = parseTestPaperText(scenario.text, "table-case.docx");
    assert.deepEqual(draft.sections.map((section) => section.name), scenario.sections, scenario.name);
    assert.deepEqual(draft.sections.map((section) => section.questionTypes.map((group) => group.label)), scenario.groups, scenario.name);
    const groups = draft.sections.flatMap((section) => section.questionTypes);
    if (scenario.offered) assert.deepEqual(groups.map((group) => group.count), scenario.offered, scenario.name);
    if (scenario.attempts) assert.deepEqual(groups.map((group) => group.attempt), scenario.attempts, scenario.name);
    if (scenario.marks) assert.deepEqual(groups.map((group) => group.marksEach), scenario.marks, scenario.name);
    if (scenario.warning) assert.ok(draft.extractionMetadata.warnings.includes(scenario.warning), scenario.name);
    for (const group of groups) {
      assert.ok(group.extraction.sourceQuote.length > 0, scenario.name);
      assert.ok(scenario.text.includes(group.extraction.sourceQuote), scenario.name);
    }
  }
});

test("unknown counts and marks calculate to null, never zero", () => {
  const draft = parseTestPaperText("I. Write the alphabet. (2)", "uncertain.pdf");
  const totals = calculateTemplateTotals(draft.sections);
  assert.equal(draft.sections[0].questionTypes[0].count, null);
  assert.equal(draft.sections[0].questionTypes[0].marksEach, null);
  assert.equal(draft.sections[0].extraction.marks.value, null);
  assert.equal(draft.extractionMetadata.totalMarks.value, null);
  assert.equal(totals.totalQuestions, null);
  assert.equal(totals.totalMarks, null);
  assert.equal(totals.sections[0].totalMarks, null);
});

test("normalization strips repeated page furniture and joins wrapped continuation lines", () => {
  const raw = "ABC SCHOOL\nPage 1 of 2\nSECTION A\nFill in the\nblanks\n1. cat 2. dog\nFooter text\n\fABC SCHOOL\nPage 2 of 2\nSECTION B\nShort Answer\nFooter text";
  const normalized = normalizeTestPaperText(raw);
  assert.doesNotMatch(normalized, /Page 1|Page 2|Footer text/);
  assert.match(normalized, /Fill in the blanks/);
  assert.match(raw, /Footer text/);
  const draft = parseTestPaperText(raw, "wrapped.pdf", 2);
  assert.deepEqual(draft.sections.map((section) => section.name), ["Section A", "Section B"]);
  assert.equal(draft.sections[0].questionTypes[0].count, 2);
});

test("blank/image-only PDF is marked unreadable", async () => {
  const parser = new PDFParse({ data: buildTextPdf([]) });
  try {
    const result = await parser.getText();
    const draft = parseTestPaperText(result.text, "scan.pdf", result.total || 1);
    assert.equal(draft.hasText, false);
    assert.ok(draft.extractionMetadata.warnings.includes("Text could not be reliably extracted from this document."));
  } finally { await parser.destroy(); }
  assert.equal(hasUsableExtractedText("�\u0000\u0001\u001f".repeat(80), 1), false);
});

test("selectable-text PDF round-trip detects header, sections, groups, choice, and marks", async () => {
  const lines = ["ABC SCHOOL", "CLASS 10 - MATHEMATICS", "UNIT TEST 1", "TIME: 1 HOUR", "MAXIMUM MARKS: 25", "SECTION A", "MCQ", "5 x 1 = 5", "SECTION B", "Short Answer", "Answer any three out of five", "5 x 2 = 10"];
  const parser = new PDFParse({ data: buildTextPdf(lines) });
  try {
    const result = await parser.getText();
    const draft = parseTestPaperText(result.text, "multi-section.pdf", result.total || 1);
    assert.equal(draft.schoolName, "ABC SCHOOL");
    assert.equal(draft.className, "Class 10");
    assert.equal(draft.subject, "Mathematics");
    assert.equal(draft.testTitle, "UNIT TEST 1");
    assert.equal(draft.duration, "1 Hour");
    assert.equal(draft.maximumMarks, 25);
    assert.deepEqual(draft.sections.map((section) => section.name), ["Section A", "Section B"]);
    assert.deepEqual(draft.sections.map((section) => section.questionTypes.map((group) => group.label)), [["Multiple Choice Questions"], ["Short Answer"]]);
    assert.equal(draft.sections[1].questionTypes[0].attempt, 3);
    assert.ok(draft.rawHeaderText.includes("ABC SCHOOL"));
    assert.ok(draft.sections.flatMap((section) => section.questionTypes).every((group) => result.text.includes(group.extraction.sourceQuote)));
  } finally { await parser.destroy(); }
});

test("generated DOCX with headings, paragraphs, tables, and mixed groups extracts structure", async () => {
  const buffer = makeDocx([
    ["ABC ACADEMY", "Heading1"], "CLASS 8 - ENGLISH", ["MID TERM TEST", "Heading1"], "Duration: 2 Hours", "Maximum Marks: 20",
    ["SECTION A", "Heading1"], ["Fill in the blanks", "Heading2"], "Answer any 2 out of 4", "4 x 2 = 8",
    { table: [["1. c__r", "3. z__p"], ["2. f__x", "4. c__t"]] },
    ["SECTION B", "Heading1"], ["True or False", "Heading2"], "Each question carries 1 mark",
  ]);
  const result = await mammoth.extractRawText({ buffer });
  const draft = parseTestPaperText(result.value, "mixed.docx");
  assert.equal(draft.hasText, true);
  assert.equal(draft.schoolName, "ABC ACADEMY");
  assert.equal(draft.className, "Class 8");
  assert.equal(draft.subject, "English");
  assert.equal(draft.testTitle, "MID TERM TEST");
  assert.equal(draft.duration, "2 Hours");
  assert.equal(draft.maximumMarks, 20);
  assert.deepEqual(draft.sections.map((section) => section.name), ["Section A", "Section B"]);
  assert.deepEqual(draft.sections.map((section) => section.questionTypes.map((group) => group.label)), [["Fill in the Blanks"], ["True / False"]]);
  assert.equal(draft.sections[0].questionTypes[0].count, 4);
  assert.equal(draft.sections[0].questionTypes[0].attempt, 2);
  assert.equal(draft.sections[0].questionTypes[0].marksEach, 2);
  assert.equal(draft.sections[1].questionTypes[0].count, null);
  assert.equal(draft.sections[1].questionTypes[0].marksEach, 1);
  assert.ok(draft.sections.flatMap((section) => section.questionTypes).every((group) => result.value.includes(group.extraction.sourceQuote)));
});

test("DOCX ambiguity preserves group marks and numbered items", async () => {
  const result = await mammoth.extractRawText({ buffer: makeDocx([
    "I. Write the alphabet. (2)", "II. Fill in the blanks. (3)",
  ], [[["1. c__r", "4. z__p"], ["2. f__x", "5. c__t"]]]) });
  const draft = parseTestPaperText(result.value, "ambiguous.docx");
  const groups = draft.sections.flatMap((section) => section.questionTypes);
  assert.deepEqual(groups.map((group) => group.label), ["Write the alphabet", "Fill in the Blanks"]);
  assert.equal(groups[0].count, null);
  assert.equal(groups[0].marksEach, null);
  assert.equal(groups[1].count, 5);
  assert.equal(groups[1].marksEach, null);
  assert.equal(calculateTemplateTotals(draft.sections).totalMarks, null);
});

test("structured model conflicts and invalid source quotes retain deterministic extraction", async () => {
  const raw = "SECTION A\nMCQ\n5 x 1 = 5";
  const deterministic = parseTestPaperText(raw, "model-check.pdf");
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only";
  try {
    const body = { sections: [{ name: "Section A", implicit: false, groups: [{ label: "Different label", sourceQuote: "MCQ", offered: 4, attempt: 4, marksEach: 1, choiceWording: null }] }] };
    const fetcher = async (_url, options) => {
      assert.equal(JSON.parse(options.body).response_format.type, "json_schema");
      return Response.json({ choices: [{ message: { content: JSON.stringify(body) } }] });
    };
    const reviewed = await enrichWithStructuredModel(raw, deterministic.normalizedText, deterministic.sections, fetcher);
    const group = reviewed[0].questionTypes[0];
    assert.equal(group.count, 5);
    assert.equal(group.extraction.offered.value, 5);
    assert.equal(group.extraction.offered.status, "needs_review");
    assert.equal(group.extraction.offered.alternate, 4);
    assert.equal(group.extraction.alternateLabel, "Different label");
    assert.equal(group.extraction.needsReview, true);
    const invalidQuote = async () => Response.json({ choices: [{ message: { content: JSON.stringify({ sections: [{ ...body.sections[0], groups: [{ ...body.sections[0].groups[0], sourceQuote: "not in the document" }] }] }) } }] });
    assert.deepEqual(await enrichWithStructuredModel(raw, deterministic.normalizedText, deterministic.sections, invalidQuote), deterministic.sections);
    assert.deepEqual(await enrichWithStructuredModel(raw, deterministic.normalizedText, deterministic.sections, async () => { throw new Error("timeout"); }), deterministic.sections);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});
