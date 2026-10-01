import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { BUILTIN_TEMPLATES, calculateTemplateTotals } from "../src/lib/test-templates.ts";
import { parseTestPaperText } from "../src/lib/test-paper-extraction.ts";

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

test("an uncertain attempt count keeps marks unknown", () => {
  const result = calculateTemplateTotals([{ id: "s", name: "Section A", questionTypes: [{ id: "q", type: "custom", label: "Essay", count: 4, attempt: null, marksEach: 5 }] }]);
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
  const stream = "BT /F1 12 Tf 72 720 Td (ABC SCHOOL) Tj ET";
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
  } finally { await parser.destroy(); }

  const docxPath = new URL("../node_modules/mammoth/test/test-data/utf8-bom.docx", import.meta.url);
  const docx = await mammoth.extractRawText({ buffer: await readFile(docxPath) });
  assert.ok(docx.value.length > 0);
});
